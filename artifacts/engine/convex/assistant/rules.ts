/**
 * Pure rules of the in-client assistant (docs/surface-architecture.md §6), shared by the turn loop and the unit
 * tests (test/unit/assistant.test.ts): no Convex imports.
 */
import { CORE_TOOLS, LAYOUT_TOOLS, OWNER_TOOLS, findTool, isCommandTool, toolJsonSchemas, toolsFor } from "@workspace/player-client/tools";
import { SKILL_LIMITS, findSkill } from "@workspace/player-client/skills";
import { LOAD_TOOLS, loadedToolNames, type ChatAssistantBlock, type ChatMessage, type ChatToolResult } from "@workspace/ai-player/chat";
import { bound } from "../agent/bound.ts";

export const LIMITS = {
  /** Model steps per turn, and a turn's wall-clock deadline. */
  maxSteps: 12,
  turnMs: 10 * 60_000,
  /** A confirmation card waits this long before the call counts as denied. */
  confirmMs: 2 * 60_000,
  /** Stored sizes (bytes of UTF-16 text; Convex documents stay small). A message holds a whole model context echo. */
  textChars: 32 * 1024,
  argsChars: 8 * 1024,
  resultChars: 8 * 1024,
  userTextChars: 4000,
  /** Streaming flushes: about every 250 ms or 400 characters. */
  flushMs: 250,
  flushChars: 400,
  /**
   * Output ceiling per model step (thinking included): `outputTokens` by default (it bounds the step's reservation, not
   * its bill), `maxOutputTokens` once a step was cut or a tool that writes code is loaded (outputCeiling).
   */
  outputTokens: 2048,
  maxOutputTokens: 8192,
  /** At most this many tools per load_tools call. */
  loadTools: 16,
  /** A step's stored model blocks (assistantMessages.contentJson; at most 3 bytes a character keeps the document under 1 MiB); larger ones are replayed without thinking. */
  contentChars: 200_000,
  /** Tool calls run per model step, and layout (dock) tools among them; more are answered with an error. */
  callsPerStep: 16,
  layoutCallsPerStep: 2,
  waitMs: 60_000,
  /** Model context: the thread's history is cut (oldest first) to this many characters. */
  historyChars: 60_000,
  historyMessages: 60,
  /**
   * The same tool with the same arguments and the same result as the call just before it: the first repeat is answered
   * with an engine note; at the `repeatStop`-th repeat in a row the next model step becomes the turn's last (the model
   * is going round in circles), so it answers the player instead of calling again.
   */
  repeatStop: 2,
} as const;

export type TurnStatus = "running" | "awaiting_confirmation" | "cancelling" | "done" | "failed" | "cancelled" | "budget_exhausted";
export const ACTIVE: readonly TurnStatus[] = ["running", "awaiting_confirmation", "cancelling"];
export const isActive = (status: TurnStatus) => ACTIVE.includes(status);

const OWNER = new Set<string>(OWNER_TOOLS.map(t => t.name));
/** The owner's actions (not their reads: get_room_state and get_ai_catalog change nothing). */
const OWNER_ACTIONS = new Set<string>(OWNER_TOOLS.filter(t => !t.annotations.readOnlyHint).map(t => t.name));
const LAYOUT = new Set<string>(LAYOUT_TOOLS.filter(t => !t.annotations.readOnlyHint).map(t => t.name));
const ALWAYS_CONFIRM = new Set(["send_chat", "pause_game", "destroy_agent", "delete_panel", "delete_setup"]);
/** A layout tool that changes the player's screen (get_layout only reads it). */
export const isLayoutChange = (tool: string) => LAYOUT.has(tool);

/**
 * Does this call wait for the player's confirmation card? Public chat, pauses, destroying an agent, panel and setup deletion
 * and every owner action (not the owner's reads) always do. A summon does unless the player set "auto-approve summons up to N bits" (N > 0) and
 * this turn already validated the same source at a cost of at most N. Layout (dock) tools never do: a view change
 * touches no game state and is reversible; the chat chip names it.
 */
export function needsConfirmation(tool: string, _args: Record<string, unknown>, ctx: { autoApproveSummonBits?: number; validatedCost?: number }): boolean {
  if (OWNER_ACTIONS.has(tool) || ALWAYS_CONFIRM.has(tool)) return true;
  if (tool !== "summon_agent") return false;
  const limit = ctx.autoApproveSummonBits ?? 0;
  return !(limit > 0 && ctx.validatedCost !== undefined && ctx.validatedCost <= limit);
}

// ---------------------------------------------------------------------------------------------
// Deterministic ids (RFC 9562 UUIDv5)
// ---------------------------------------------------------------------------------------------

/** The namespace of assistant command ids. */
export const COMMAND_NAMESPACE = "5c0d3a6e-9b1f-4c2a-8e7d-2f6b1a9c4d30";
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const parseUuid = (uuid: string) => Uint8Array.from(uuid.replace(/-/g, "").match(/../g)!.map(h => parseInt(h, 16)));

export function uuidv5(name: string, namespace: string, sha1: (bytes: Uint8Array) => Uint8Array): string {
  const ns = parseUuid(namespace);
  const text = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + text.length);
  input.set(ns); input.set(text, ns.length);
  const h = sha1(input).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const s = hex(h);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
/** The command (or owner request) id of one tool call: derived from the turn and the call, never chosen by the model. */
export const commandIdFor = (turnId: string, callId: string, sha1: (bytes: Uint8Array) => Uint8Array) =>
  uuidv5(`${turnId.length}:${turnId}:${callId}`, COMMAND_NAMESPACE, sha1);

/** The arguments a call runs with: the derived id in place of any the model gave; summon/validate waits capped. */
/**
 * Why the n-th call of a step (after `prior` calls) may not run: more than callsPerStep calls, or a third layout
 * tool in one step (the anti-flap rule). Null when it may.
 */
export function callLimitProblem(tool: string, prior: readonly string[]): string | null {
  if (prior.length >= LIMITS.callsPerStep) return `At most ${LIMITS.callsPerStep} tool calls run per step; repeat this one in the next step`;
  if (LAYOUT.has(tool) && prior.filter(t => LAYOUT.has(t)).length >= LIMITS.layoutCallsPerStep) {
    return `At most ${LIMITS.layoutCallsPerStep} layout changes per step: the player's screen should settle before you change it again`;
  }
  return null;
}

const takesRequestId = (tool: string) => "requestId" in ((findTool(tool)?.input as { shape?: Record<string, unknown> } | undefined)?.shape ?? {});

export function prepareArgs(tool: string, args: Record<string, unknown>, id: string): Record<string, unknown> {
  if (isCommandTool(tool)) {
    const out: Record<string, unknown> = { ...args, commandId: id };
    if (tool === "validate_agent" || tool === "summon_agent") out.waitMs = Math.min(Number(args.waitMs ?? LIMITS.waitMs) || LIMITS.waitMs, LIMITS.waitMs);
    return out;
  }
  // Only owner tools that take a request id (the read-only ones, get_room_state and get_ai_catalog, reject extras).
  if (OWNER.has(tool) && takesRequestId(tool)) return { ...args, requestId: id };
  return args;
}

// ---------------------------------------------------------------------------------------------
// Tools offered to the model
// ---------------------------------------------------------------------------------------------

export type ModelTool = { name: string; description: string; inputSchema: Record<string, unknown>; deferred?: boolean };
let schemas: ReturnType<typeof toolJsonSchemas> | undefined;
const ENGINE_IDS = ["commandId", "requestId"];
const CORE = new Set<string>(CORE_TOOLS);
type Permission = "read" | "act" | "owner";

/** The index tools a grant may load: every tool it may use beyond the core set. */
export const loadableTools = (permission: Permission) => toolsFor(permission).filter(t => !CORE.has(t.name)).map(t => t.name);

/** The engine's tool loader (not a registry tool: it changes the model's context, not the game). */
function loadToolsDefinition(permission: Permission): ModelTool {
  return {
    name: LOAD_TOOLS,
    description: "Load the full definitions of tools from the INDEX by name; call them from your next step on. Load every tool the task needs in one call.",
    inputSchema: { type: "object", additionalProperties: false, required: ["names"], properties: {
      names: { type: "array", minItems: 1, maxItems: LIMITS.loadTools, uniqueItems: true, items: { type: "string", enum: loadableTools(permission) } },
    } },
  };
}

/**
 * What the model is offered at every step of every turn (a stable list, so it stays in the prompt cache): the tool
 * loader, then the registry's tools a grant may use, all but the core set deferred (in context only once loaded);
 * the ids the engine derives are removed.
 */
export function modelTools(permission: Permission): ModelTool[] {
  schemas ??= toolJsonSchemas();
  const registry = toolsFor(permission).map(t => {
    const { $schema: _, ...schema } = schemas![t.name].input as Record<string, unknown> & { properties?: Record<string, unknown>; required?: string[] };
    const properties = Object.fromEntries(Object.entries((schema.properties ?? {}) as Record<string, unknown>).filter(([k]) => !ENGINE_IDS.includes(k)));
    const required = ((schema.required ?? []) as string[]).filter(k => !ENGINE_IDS.includes(k));
    return { name: t.name, description: `${t.title}. ${t.description}`, inputSchema: { ...schema, properties, ...(required.length ? { required } : { required: undefined }) },
      ...(CORE.has(t.name) ? {} : { deferred: true }) };
  }).map(t => ({ ...t, inputSchema: JSON.parse(JSON.stringify(t.inputSchema)) as Record<string, unknown> }));
  return [loadToolsDefinition(permission), ...registry];
}

/**
 * A load_tools call's outcome: the tools it loads (the history turns them into tool references), or an error naming
 * what may be loaded. Core tools are already loaded and are skipped.
 */
export function loadTools(permission: Permission, args: Record<string, unknown>): { status: "ok" | "error"; summary: string; resultJson: string } {
  const names = Array.isArray(args.names) ? args.names.filter((n): n is string => typeof n === "string") : [];
  const loadable = loadableTools(permission);
  const unknown = names.filter(n => !loadable.includes(n) && !CORE.has(n));
  if (!names.length || unknown.length || names.length > LIMITS.loadTools) {
    const message = !names.length ? "Give the names of the tools to load (names: [...])"
      : unknown.length ? `Not in this grant's index: ${unknown.join(", ")}. Loadable: ${loadable.join(", ")}.`
      : `At most ${LIMITS.loadTools} tools per call`;
    return { status: "error", summary: "Nothing loaded", resultJson: JSON.stringify({ error: { code: "BAD_REQUEST", message } }) };
  }
  const loaded = [...new Set(names.filter(n => !CORE.has(n)))];
  return { status: "ok", summary: loaded.length ? `Loaded ${loaded.join(", ")}` : "Already loaded",
    resultJson: JSON.stringify({ loaded, note: loaded.length ? "Loaded: call them from your next step on." : "These tools are always loaded." }) };
}

/** Tools whose arguments carry code or whole documents: a step that may call them gets the full output ceiling. */
const WRITES_CODE = new Set(["validate_agent", "summon_agent", "save_panel", "save_setup"]);
/**
 * A step's output ceiling: the thread's raised one after a cut, the full one once a code-writing tool the grant may
 * use (one of `tools`) is loaded, else the default.
 */
export function outputCeiling(turnCeiling: number | undefined, messages: ChatMessage[], tools: readonly { name: string }[]): number {
  if (turnCeiling) return Math.min(turnCeiling, LIMITS.maxOutputTokens);
  const offered = new Set(tools.map(t => t.name));
  return loadedToolNames(messages).some(n => WRITES_CODE.has(n) && offered.has(n)) ? LIMITS.maxOutputTokens : LIMITS.outputTokens;
}

/**
 * Stored argument sizes: 8 KB, except agent sources (validate/summon, up to 16 KiB of source) and stored panels
 * (save_panel, up to 64 KB of TSX), which carry their full code.
 */
export function argsLimit(tool: string): number {
  if (tool === "save_panel") return 70_000;
  if (tool === "run_code") return 72_000;
  if (tool === "validate_agent" || tool === "summon_agent") return 20_000;
  // A forge draft (open_panel forge {source}) is an agent source too.
  if (tool === "open_panel" || tool === "set_panel_params") return 20_000;
  return LIMITS.argsChars;
}

/**
 * A tool result's stored (and model-visible) size. Documentation the model must read whole gets room: a skill body
 * (up to SKILL_LIMITS.body characters, JSON-escaped) and the rules with the helper reference. Cutting the
 * writing-agents skill at 8 KB once dropped every helper signature and the player's utility, and the model guessed.
 */
export function resultLimit(tool: string): number {
  // Escaping at most doubles a body (every character a newline or a quote), plus the envelope.
  if (tool === "load_skill") return 2 * SKILL_LIMITS.body + 1_000;
  if (tool === "get_rules") return 16_000;
  return LIMITS.resultChars;
}

/**
 * A stored result with the engine's note in front (the model reads it first), after a TRUNCATED notice (the prompt
 * says a cut result's first field is TRUNCATED); notes accumulate.
 */
export function withEngineNote(resultJson: string, note: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(resultJson); } catch { parsed = resultJson; }
  const body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : { value: parsed };
  const { TRUNCATED, ENGINE_NOTE: earlier, ...rest } = body;
  return JSON.stringify({ ...(TRUNCATED !== undefined ? { TRUNCATED } : {}), ENGINE_NOTE: typeof earlier === "string" ? `${earlier} ${note}` : note, ...rest });
}

/** The engine notes (not from the player or a tool). */
export const ENGINE_NOTES = {
  repeat: (tool: string, times: number) => `Engine note: you just called ${tool} with these exact arguments ${times === 1 ? "once" : `${times} times`} in a row and got this same result. Repeating it will not change anything: use what you have, try something different, or answer the player.`,
  repeatStop: "Engine note: you are going round in circles, so the engine ends this turn after your next step. Do not call tools: tell the player where you got stuck (what you tried, the result, the error) and what you suggest.",
  lastStep: "Engine note: your next step is the last of this turn. Do not call tools: answer the player now in text: what you did, what you found (with the numbers), and what you suggest next.",
} as const;

/** The arguments the engine derives (prepareArgs), per tool: a command's id and wait, an owner request's id. */
const derivedOf = (tool: string): string[] => isCommandTool(tool) ? ["commandId", "waitMs"] : OWNER.has(tool) && takesRequestId(tool) ? ["requestId"] : [];
/**
 * A result as compared for repeats: without the engine's note, and without what changes with the clock alone: a
 * validation receipt's energy and affordability (god energy grows every second) and the assessment built on them.
 */
function stableResult(json: string | null | undefined): unknown {
  const { ENGINE_NOTE: _, ...result } = parseObject(json ?? "{}");
  const data = result.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  const { assessment: _a, ...d } = data as Record<string, unknown>;
  const receipt = d.receipt as { validation?: Record<string, unknown> } | undefined;
  if (receipt?.validation) {
    const { energy: _e, affordable: _f, ...validation } = receipt.validation;
    d.receipt = { ...receipt, validation };
  }
  return { ...result, data: d };
}
/** A still-running command (pending): polling it again is the engine's advice, never a repeat. */
const pendingResult = (json: string | null | undefined) => (parseObject(json ?? "{}").data as { status?: unknown } | undefined)?.status === "pending";
/** A call's identity for repeat detection: the tool, its arguments without the ids the engine derives, its result without them. */
function repeatKey(call: { tool: string; argsJson: string; resultJson?: string | null }): string {
  const args = parseObject(call.argsJson);
  const derived = derivedOf(call.tool);
  const ids = derived.map(k => args[k]).filter((v): v is string => typeof v === "string" && v.length > 0);
  let result = JSON.stringify(stableResult(call.resultJson));
  for (const id of ids) result = result.split(id).join("");
  return JSON.stringify([call.tool, Object.entries(args).filter(([k]) => !derived.includes(k)).sort(([a], [b]) => a.localeCompare(b)), result]);
}
/**
 * How many calls in a row, just before this one (`earlier`, oldest first), were this same successful call with this
 * same result. Any other call in between ends the run: re-reading unchanged state between other work is not a loop.
 */
export function repeatsOf(earlier: readonly { tool: string; argsJson: string; status: string; resultJson?: string | null }[], call: { tool: string; argsJson: string; resultJson?: string | null }): number {
  if (pendingResult(call.resultJson)) return 0;
  const key = repeatKey(call);
  let n = 0;
  for (let i = earlier.length - 1; i >= 0 && earlier[i].status === "ok" && repeatKey(earlier[i]) === key; i--) n++;
  return n;
}

/** A tool result's one-line activity-chip summary (shown to the thread's human only; never logged). */
export function summarize(tool: string, result: { data: unknown }): string {
  const data = (result.data ?? {}) as { status?: string; message?: string; receipt?: { accepted?: boolean; message?: string }; assessment?: { summary?: string }; ok?: boolean; version?: number; diagnostics?: unknown[]; requestId?: string; summary?: string; reused?: boolean; paneId?: string };
  const line = (text: string) => text.length > 200 ? `${text.slice(0, 199)}…` : text;
  if (isCommandTool(tool)) {
    if (data.status === "received" && data.assessment?.summary) return line(data.assessment.summary);
    if (data.status === "received") return line(`${data.receipt?.accepted ? "Accepted" : "Rejected"}: ${data.receipt?.message ?? ""}`.trim());
    if (data.status === "pending") return line(`Pending: ${data.message ?? ""}`);
    return line(`${data.status === "failed" ? "Failed" : "Not found"}: ${data.message ?? ""}`);
  }
  if (tool === "save_panel") {
    return data.ok ? `Saved version ${data.version}` : `Not saved: ${data.diagnostics?.length ?? 0} diagnostic${data.diagnostics?.length === 1 ? "" : "s"}`;
  }
  if (LAYOUT.has(tool)) {
    if (tool === "close_pane") return line(`Closed pane ${data.paneId ?? ""}`.trim());
    if (tool === "move_pane") return line(`Moved ${data.summary ?? "a pane"}`);
    return line(`${data.reused ? "Updated" : "Showed"} ${data.summary ?? "a pane"}`);
  }
  if (tool === "load_skill") return line(`Read the ${String((data as { name?: unknown }).name ?? "")} skill`);
  if (OWNER.has(tool) && data.requestId) return "Done";
  if (tool === "run_code") {
    const run = data as { status?: string; cpuMs?: number; error?: { code?: string; message?: string } };
    return run.status === "ok" ? `Ran in ${((run.cpuMs ?? 0) / 1000).toFixed(1)} s` : line(`${run.error?.code ?? "Error"}: ${run.error?.message ?? "the script failed"}`);
  }
  if (findTool(tool)?.annotations.readOnlyHint) return "Read";
  return "Done";
}

// ---------------------------------------------------------------------------------------------
// The model's history
// ---------------------------------------------------------------------------------------------

/** A stored message, oldest first. `contentJson` holds the model's own blocks (thinking included) for one step. */
export type HistoryRow = { id: string; turnId: string; role: "user" | "assistant"; text: string; contentJson?: string | null };
export type HistoryCall = { messageId: string; callId: string; index: number; tool: string; argsJson: string; status: string; resultJson?: string | null };
const FINISHED = ["ok", "error", "denied"];
const NOT_RUN = JSON.stringify({ error: { code: "NOT_RUN", message: "This call did not run." } });
const parseObject = (json: string): Record<string, unknown> => { try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; } };

/** The tools a stored load_tools result loaded. */
function loadedOf(json: string | null | undefined): string[] {
  const loaded = parseObject(json ?? "{}").loaded;
  return Array.isArray(loaded) ? loaded.filter((n): n is string => typeof n === "string") : [];
}

function storedBlocks(json: string | null | undefined): ChatAssistantBlock[] | null {
  if (!json) return null;
  try { const blocks = JSON.parse(json) as unknown; return Array.isArray(blocks) ? blocks as ChatAssistantBlock[] : null; } catch { return null; }
}

/** How an earlier turn ended, for its note: its status, or why a "done" or "failed" turn stopped short. */
export type TurnEnding = TurnStatus | "step_limit" | "deadline" | "repeating";
export const turnEnding = (status: TurnStatus, errorCode?: string | null): TurnEnding =>
  errorCode === "STEP_LIMIT" ? "step_limit" : errorCode === "DEADLINE" ? "deadline" : errorCode === "REPEATING" ? "repeating" : status;

/**
 * The note closing an earlier turn that ended before its answer, so the model neither takes the player's message as
 * answered nor answers it unasked. Keyed by how the turn ended; a finished ("done") turn gets none.
 */
export const UNANSWERED_NOTES: Partial<Record<TurnEnding, string>> = {
  budget_exhausted: "Engine note (not from the player): the turn above stopped before you answered it, because the player's assistant allowance ran out. The player's message above is UNANSWERED. If their next message does not make it moot, say in one short sentence that it was not answered and offer to answer it now.",
  step_limit: "Engine note (not from the player): the turn above stopped at the step limit, possibly before you finished. If the player's next message does not make it moot, say briefly where you stopped.",
  repeating: "Engine note (not from the player): the engine stopped the turn above because you repeated the same tool call with the same result. Do not repeat it; if the player's next message does not make it moot, say briefly where you got stuck.",
  deadline: "Engine note (not from the player): the turn above ran past its time limit before you finished. Treat the player's message above as unanswered unless their next message makes it moot.",
  failed: "Engine note (not from the player): the turn above failed before you finished answering it (a provider or tool error). Treat the player's message above as unanswered unless their next message makes it moot.",
  cancelled: "Engine note (not from the player): the player stopped the turn above before you finished. Do not resume it unless they ask.",
};

/** The note in front of messages the player queued while the turn worked, delivered after a step's tool results. */
export const QUEUED_NOTE = "Engine note (not from the player): the player sent the message(s) below while you were working; they arrive after the tool results above. Read them before you continue, and change course if they ask you to.";

/**
 * The thread as model messages. Rules (Claude 5 thinking blocks are valid only while everything before them is
 * byte-identical, and the provider's prompt cache is a prefix match, so the history is append-only, across turns too):
 *   - every turn: the user's message after that turn's briefing, then each step's own blocks verbatim (thinking and
 *     the model's raw tool input) and its tool results, exactly as its own steps sent them (so a new turn reads the
 *     earlier ones from the prompt cache instead of rewriting them);
 *   - earlier turns are cut whole, oldest first, by their own size only, so the cut never moves during a turn;
 *   - every tool use gets a result (an error when its call never finished);
 *   - an earlier turn that ended without its answer (allowance, failure, cancellation) closes with UNANSWERED_NOTES;
 *   - a later user row of the same turn (a queued message, delivered at a step boundary) joins the user message of
 *     the step's tool results, after them and QUEUED_NOTE, so the next step sees it in the same turn.
 * Rows from before stored blocks existed are rebuilt from their text and calls.
 */
type HistoryContext = { turnId: string; briefings?: Record<string, string | null | undefined>; endings?: Record<string, TurnEnding> };
export function buildHistory(rows: HistoryRow[], calls: HistoryCall[], current: HistoryContext, maxChars: number = LIMITS.historyChars): ChatMessage[] {
  const groups = historyGroups(rows, calls, current);
  const older = groups.filter(g => g.turnId !== current.turnId);
  const now = groups.filter(g => g.turnId === current.turnId);
  let total = older.reduce((s, g) => s + groupSize(g), 0);
  while (older.length && total > maxChars) total -= groupSize(older.shift()!);
  return [...older, ...now].flatMap(g => g.messages);
}

const groupSize = (g: { messages: ChatMessage[] }) => JSON.stringify(g.messages).length;

/** Each turn's model messages, in order (buildHistory without the cut). */
function historyGroups(rows: HistoryRow[], calls: HistoryCall[], current: HistoryContext): { turnId: string; messages: ChatMessage[] }[] {
  const byMessage = new Map<string, HistoryCall[]>();
  for (const c of calls) byMessage.set(c.messageId, [...(byMessage.get(c.messageId) ?? []), c]);
  const groups: { turnId: string; messages: ChatMessage[] }[] = [];
  for (const m of rows) {
    if (m.role === "user") {
      const open = groups.at(-1);
      if (open && open.turnId === m.turnId) {
        // A message the player queued while this turn worked, delivered at a step boundary: it joins the user
        // message that carries the step's tool results (after them; the API requires results first), or follows the
        // turn's prompt when it was delivered with it.
        const last = open.messages.at(-1)!;
        const text = { type: "text" as const, text: m.text };
        if (last.role === "user") {
          const blocks = typeof last.content === "string" ? [{ type: "text" as const, text: last.content }] : last.content;
          const afterResults = blocks.at(-1)?.type === "tool_result";
          last.content = [...blocks, ...(afterResults ? [{ type: "text" as const, text: QUEUED_NOTE }] : []), text];
        } else open.messages.push({ role: "user", content: [{ type: "text", text: QUEUED_NOTE }, text] });
        continue;
      }
      const briefing = current.briefings?.[m.turnId];
      const content = briefing ? [{ type: "text" as const, text: briefing }, { type: "text" as const, text: m.text }] : m.text;
      groups.push({ turnId: m.turnId, messages: [{ role: "user", content }] });
      continue;
    }
    const group = groups.at(-1);
    if (!group || group.turnId !== m.turnId) continue; // the window starts inside an older turn
    const used = (byMessage.get(m.id) ?? []).sort((a, b) => a.index - b.index);
    let content = storedBlocks(m.contentJson);
    if (!content) {
      const finished = used.filter(c => FINISHED.includes(c.status));
      content = [...(m.text ? [{ type: "text" as const, text: m.text }] : []),
        ...finished.map(c => ({ type: "tool_use" as const, id: c.callId, name: c.tool, input: parseObject(c.argsJson) }))];
    }
    if (!content.length) continue;
    group.messages.push({ role: "assistant", content });
    const results: ChatToolResult[] = content.flatMap(b => {
      if (b.type !== "tool_use") return [];
      const c = used.find(x => x.callId === b.id && FINISHED.includes(x.status));
      const references = c?.status === "ok" && c.tool === LOAD_TOOLS ? loadedOf(c.resultJson) : [];
      const skillTools = c?.status === "ok" && c.tool === "load_skill" ? findSkill(String(parseObject(c.argsJson).name))?.tools ?? [] : [];
      return [{ type: "tool_result" as const, toolUseId: b.id, content: c ? c.resultJson ?? "{}" : NOT_RUN, ...(c?.status === "ok" ? {} : { isError: true }),
        ...(references.length ? { toolReferences: references } : {}), ...(skillTools.length ? { loadsTools: [...skillTools] } : {}) }];
    });
    if (results.length) group.messages.push({ role: "user", content: results });
  }
  for (const g of groups) {
    const note = g.turnId !== current.turnId ? UNANSWERED_NOTES[current.endings?.[g.turnId] ?? "done"] : undefined;
    if (note) g.messages.push({ role: "user", content: [{ type: "text", text: note }] });
  }
  return groups;
}

/** Earlier turns as the history window sees them: each turn's first message seq, model-message JSON size and count. */
export function turnSizes(rows: (HistoryRow & { seq: number })[], calls: HistoryCall[], current: HistoryContext): { seq: number; chars: number; messages: number }[] {
  const firstSeq = new Map<string, number>();
  for (const r of rows) if (r.role === "user" && !firstSeq.has(r.turnId)) firstSeq.set(r.turnId, r.seq);
  return historyGroups(rows, calls, current).filter(g => g.turnId !== current.turnId && firstSeq.has(g.turnId))
    .map(g => ({ seq: firstSeq.get(g.turnId)!, chars: groupSize(g), messages: g.messages.length }));
}

/**
 * Where a new turn's history window starts (the first message seq of the earliest earlier turn it replays). A window
 * that moves every turn would change the history's first message, and so miss the prompt cache, on every turn of a
 * long thread. So the start stays the previous turn's while the earlier turns from it fit the limits; once they
 * outgrow them, whole turns are dropped until at most half the limits are left, which then holds for several turns.
 * Infinity: no earlier turn is replayed.
 */
export function historyStart(earlier: { seq: number; chars: number; messages: number }[], previous: number,
  limits: { chars: number; messages: number } = { chars: LIMITS.historyChars, messages: LIMITS.historyMessages }): number {
  const kept = earlier.filter(t => t.seq >= previous);
  const sum = (k: "chars" | "messages") => kept.reduce((s, t) => s + t[k], 0);
  if (sum("chars") <= limits.chars && sum("messages") <= limits.messages) return previous;
  while (kept.length && (sum("chars") > limits.chars / 2 || sum("messages") > limits.messages / 2)) kept.shift();
  return kept[0]?.seq ?? Infinity;
}

// ---------------------------------------------------------------------------------------------
// Bounded JSON
// ---------------------------------------------------------------------------------------------

/** Cut every string longer than `max` characters (recursively), marking the cut. */
function cutStrings(value: unknown, max: number): unknown {
  if (typeof value === "string") return value.length > max ? `${value.slice(0, max)}… [cut]` : value;
  if (Array.isArray(value)) return value.map(v => cutStrings(v, max));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cutStrings(v, max)]));
  return value;
}

/** The arrays `trimmed` holds fewer items of than `original`, as "path: kept of total" (first few). */
function trimmedArrays(original: unknown, trimmed: unknown, path = "", out: string[] = []): string[] {
  if (Array.isArray(original) && Array.isArray(trimmed)) {
    if (trimmed.length < original.length) out.push(`${path || "the result"} shows ${trimmed.length} of ${original.length} items`);
    trimmed.forEach((t, i) => trimmedArrays(original[i], t, `${path}[${i}]`, out));
  } else if (original && trimmed && typeof original === "object" && typeof trimmed === "object") {
    for (const [k, t] of Object.entries(trimmed)) trimmedArrays((original as Record<string, unknown>)[k], t, path ? `${path}.${k}` : k, out);
  }
  return out;
}
const TRUNCATED_ADVICE = "Counts and totals from this result are NOT complete: never state them as such (use the result's own count fields, such as objectCount), and call again with a smaller limit or a filter for the rest.";

/**
 * JSON of `value` in at most `max` characters: arrays trimmed from the end first, then long strings cut. A clipped
 * result starts with a TRUNCATED field saying what was cut (an array's kept and total items), so the model reads it
 * before the data; `truncated: true` stays at the end for programs. Stored arguments (`notice: false`) get no notice.
 */
export function clipJson(value: unknown, max: number, { notice: withNotice = true }: { notice?: boolean } = {}): string {
  const json = JSON.stringify(value) ?? "null";
  if (json.length <= max) return json;
  const original = JSON.parse(json) as unknown;
  for (let strings = max; strings >= 16; strings = Math.floor(strings / 2)) {
    const notice = (cut: string[]) => `TRUNCATED to fit ${max} characters: ${[...cut.slice(0, 3), ...(strings < max ? ["long strings are cut"] : [])].join("; ") || "parts are cut"}. ${TRUNCATED_ADVICE}`;
    // The notice's length depends on what was cut: shrink the data's room by any overflow and try again.
    let room = max - 32 - notice([]).length;
    for (let attempt = 0; attempt < 3 && room > 0; attempt++) {
      try {
        const { value: trimmed } = bound(cutStrings(value, strings), room);
        const { TRUNCATED: _, ...body } = (trimmed && typeof trimmed === "object" && !Array.isArray(trimmed) ? trimmed : { value: trimmed }) as Record<string, unknown>;
        const out = JSON.stringify({ ...(withNotice ? { TRUNCATED: notice(trimmedArrays(original, trimmed)) } : {}), ...body, truncated: true });
        if (out.length <= max) return out;
        room -= out.length - max + 16;
      } catch { break; /* cut strings further */ }
    }
  }
  const head = `TRUNCATED: only the first characters of the result's JSON are shown, as a string. ${TRUNCATED_ADVICE}`;
  return JSON.stringify({ ...(withNotice ? { TRUNCATED: head } : {}), preview: json.slice(0, Math.max(0, max - head.length - 64)), truncated: true }).slice(0, max);
}
