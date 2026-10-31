/**
 * Pure rules of the in-client assistant (docs/surface-architecture.md §6), shared by the turn loop and the unit
 * tests (test/unit/assistant.test.ts): no Convex imports.
 */
import { LAYOUT_TOOLS, OWNER_TOOLS, findTool, isCommandTool, toolJsonSchemas, toolsFor } from "@workspace/player-client/tools";
import type { ChatAssistantBlock, ChatMessage, ChatToolResult } from "@workspace/ai-player";
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
  /** Output ceiling per model step (thinking included), and how long a summon/validate tool call waits for its receipt. */
  maxOutputTokens: 8192,
  /** A step's stored model blocks (assistantMessages.contentJson; at most 3 bytes a character keeps the document under 1 MiB); larger ones are replayed without thinking. */
  contentChars: 200_000,
  /** Tool calls run per model step, and layout (dock) tools among them; more are answered with an error. */
  callsPerStep: 16,
  layoutCallsPerStep: 2,
  waitMs: 60_000,
  /** Model context: the thread's history is cut (oldest first) to this many characters. */
  historyChars: 60_000,
  historyMessages: 60,
} as const;

export type TurnStatus = "running" | "awaiting_confirmation" | "cancelling" | "done" | "failed" | "cancelled" | "budget_exhausted";
export const ACTIVE: readonly TurnStatus[] = ["running", "awaiting_confirmation", "cancelling"];
export const isActive = (status: TurnStatus) => ACTIVE.includes(status);

const OWNER = new Set<string>(OWNER_TOOLS.map(t => t.name));
const LAYOUT = new Set<string>(LAYOUT_TOOLS.filter(t => !t.annotations.readOnlyHint).map(t => t.name));
const ALWAYS_CONFIRM = new Set(["send_chat", "pause_game", "destroy_agent", "delete_panel", "delete_setup"]);
/** A layout tool that changes the player's screen (get_layout only reads it). */
export const isLayoutChange = (tool: string) => LAYOUT.has(tool);

/**
 * Does this call wait for the player's confirmation card? Public chat, pauses, destroying an agent, panel and setup deletion
 * and every owner tool always do. A summon does unless the player set "auto-approve summons up to N bits" (N > 0) and
 * this turn already validated the same source at a cost of at most N. Layout (dock) tools never do: a view change
 * touches no game state and is reversible; the chat chip names it.
 */
export function needsConfirmation(tool: string, _args: Record<string, unknown>, ctx: { autoApproveSummonBits?: number; validatedCost?: number }): boolean {
  if (OWNER.has(tool) || ALWAYS_CONFIRM.has(tool)) return true;
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

export type ModelTool = { name: string; description: string; inputSchema: Record<string, unknown> };
let schemas: ReturnType<typeof toolJsonSchemas> | undefined;
const ENGINE_IDS = ["commandId", "requestId"];

/** The registry's tools a grant may use, as model tool definitions; the ids the engine derives are removed. */
export function modelTools(permission: "read" | "act" | "owner"): ModelTool[] {
  schemas ??= toolJsonSchemas();
  return toolsFor(permission).map(t => {
    const { $schema: _, ...schema } = schemas![t.name].input as Record<string, unknown> & { properties?: Record<string, unknown>; required?: string[] };
    const properties = Object.fromEntries(Object.entries((schema.properties ?? {}) as Record<string, unknown>).filter(([k]) => !ENGINE_IDS.includes(k)));
    const required = ((schema.required ?? []) as string[]).filter(k => !ENGINE_IDS.includes(k));
    return { name: t.name, description: `${t.title}. ${t.description}`, inputSchema: { ...schema, properties, ...(required.length ? { required } : { required: undefined }) } };
  }).map(t => ({ ...t, inputSchema: JSON.parse(JSON.stringify(t.inputSchema)) as Record<string, unknown> }));
}

/**
 * Stored argument sizes: 8 KB, except agent sources (validate/summon, up to 16 KiB of source) and stored panels
 * (save_panel, up to 64 KB of TSX), which carry their full code.
 */
export function argsLimit(tool: string): number {
  if (tool === "save_panel") return 70_000;
  if (tool === "validate_agent" || tool === "summon_agent") return 20_000;
  // A forge draft (open_panel forge {source}) is an agent source too.
  if (tool === "open_panel" || tool === "set_panel_params") return 20_000;
  return LIMITS.argsChars;
}

/** A tool result's one-line activity-chip summary (shown to the thread's human only; never logged). */
export function summarize(tool: string, result: { data: unknown }): string {
  const data = (result.data ?? {}) as { status?: string; message?: string; receipt?: { accepted?: boolean; message?: string }; ok?: boolean; version?: number; diagnostics?: unknown[]; requestId?: string; summary?: string; reused?: boolean; paneId?: string };
  const line = (text: string) => text.length > 200 ? `${text.slice(0, 199)}…` : text;
  if (isCommandTool(tool)) {
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
  if (OWNER.has(tool) && data.requestId) return "Done";
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

function storedBlocks(json: string | null | undefined): ChatAssistantBlock[] | null {
  if (!json) return null;
  try { const blocks = JSON.parse(json) as unknown; return Array.isArray(blocks) ? blocks as ChatAssistantBlock[] : null; } catch { return null; }
}

/**
 * The thread as model messages. Rules (Claude 5 thinking blocks are valid only while everything before them is
 * byte-identical, so the history must be append-only within a turn):
 *   - the current turn: the user's message after its briefing, then each step's own blocks verbatim (thinking and the
 *     model's raw tool input) and its tool results;
 *   - earlier turns: the same without thinking (a leading run of thinking may be dropped) and without briefings;
 *   - earlier turns are cut whole, oldest first, by their own size only, so the cut never moves during a turn;
 *   - every tool use gets a result (an error when its call never finished).
 * Rows from before stored blocks existed are rebuilt from their text and calls.
 */
export function buildHistory(rows: HistoryRow[], calls: HistoryCall[], current: { turnId: string; briefing?: string | null }, maxChars: number = LIMITS.historyChars): ChatMessage[] {
  const byMessage = new Map<string, HistoryCall[]>();
  for (const c of calls) byMessage.set(c.messageId, [...(byMessage.get(c.messageId) ?? []), c]);
  const groups: { turnId: string; messages: ChatMessage[] }[] = [];
  for (const m of rows) {
    const isCurrent = m.turnId === current.turnId;
    if (m.role === "user") {
      const content = isCurrent && current.briefing ? [{ type: "text" as const, text: current.briefing }, { type: "text" as const, text: m.text }] : m.text;
      groups.push({ turnId: m.turnId, messages: [{ role: "user", content }] });
      continue;
    }
    const group = groups.at(-1);
    if (!group || group.turnId !== m.turnId) continue; // the window starts inside an older turn
    const used = (byMessage.get(m.id) ?? []).sort((a, b) => a.index - b.index);
    let content = storedBlocks(m.contentJson);
    if (content) { if (!isCurrent) content = content.filter(b => b.type !== "thinking"); }
    else {
      const finished = used.filter(c => FINISHED.includes(c.status));
      content = [...(m.text ? [{ type: "text" as const, text: m.text }] : []),
        ...finished.map(c => ({ type: "tool_use" as const, id: c.callId, name: c.tool, input: parseObject(c.argsJson) }))];
    }
    if (!content.length) continue;
    group.messages.push({ role: "assistant", content });
    const results: ChatToolResult[] = content.flatMap(b => {
      if (b.type !== "tool_use") return [];
      const c = used.find(x => x.callId === b.id && FINISHED.includes(x.status));
      return [{ type: "tool_result" as const, toolUseId: b.id, content: c ? c.resultJson ?? "{}" : NOT_RUN, ...(c?.status === "ok" ? {} : { isError: true }) }];
    });
    if (results.length) group.messages.push({ role: "user", content: results });
  }
  const older = groups.filter(g => g.turnId !== current.turnId);
  const now = groups.filter(g => g.turnId === current.turnId);
  const size = (g: { messages: ChatMessage[] }) => JSON.stringify(g.messages).length;
  let total = older.reduce((s, g) => s + size(g), 0);
  while (older.length && total > maxChars) total -= size(older.shift()!);
  return [...older, ...now].flatMap(g => g.messages);
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

/** JSON of `value` in at most `max` characters: arrays trimmed from the end first, then long strings cut. */
export function clipJson(value: unknown, max: number): string {
  const json = JSON.stringify(value) ?? "null";
  if (json.length <= max) return json;
  for (let strings = max; strings >= 16; strings = Math.floor(strings / 2)) {
    try {
      const { value: trimmed } = bound(cutStrings(value, strings), max - 32);
      const out = JSON.stringify({ ...(trimmed as object), truncated: true });
      if (out.length <= max) return out;
    } catch { /* cut strings further */ }
  }
  return JSON.stringify({ truncated: true, preview: json.slice(0, Math.max(0, max - 64)) }).slice(0, max);
}
