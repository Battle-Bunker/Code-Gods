/**
 * The agent tool registry's executors (docs/surface-architecture.md §4). Definitions (names, permissions,
 * zod schemas) live in lib/player-client/src/tools.ts; this file maps each name to
 * `run(ctx: ActionCtx, principal, args)`. Executors run inside Convex as the human behind the principal and
 * call only the internal twins (`…As`) of the existing projections and commands: they never read game tables,
 * so disclosure and permission rules are exactly the human's own.
 *
 * Every surface uses `runTool`: POST /mcp (agent/mcp.ts), the CLI through MCP, and the in-client assistant
 * in-process. Adding a tool: its definition in tools.ts, its executor in EXECUTORS (the `satisfies` below fails
 * the typecheck until both exist). A new group (e.g. stored panels) is one spread into EXECUTORS.
 */
import { ConvexError } from "convex/values";
import {
  DEFAULT_WAIT_MS, UNTRUSTED_NOTICE, buildEnvelope, envelopeNeedsGame, findTool, isCommandTool, mayUse, type CommandToolName, type ToolInput, type ToolName, type ToolResult,
} from "@workspace/player-client/tools";
import { rulesText } from "@workspace/player-client/rules";
import { defaultPanelParams, panelCatalog } from "@workspace/player-client/panels";
import { findSkill, skillBody, type SkillRead } from "@workspace/player-client/skills";
import { envelopeSchema, type CommandResult, type Envelope } from "@workspace/player-client";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { envelopeHash } from "../game/commands";
import { fail } from "../lib/errors";
import type { Principal } from "../lib/rooms";
import type { eventsFor, historyFor as gameHistoryFor, myUtilityFor, observationFor, trajectoriesFor } from "../player";
import type { chatFor, historyFor as roomHistoryFor, roomFor } from "../rooms";
import type { CurrentLayout, LayoutChange } from "../layout";
import type { RunOutcome } from "../code/execute";
import type { RunDetail } from "../code/runs";
import { bound } from "./bound";
import { pollDelay } from "./rules";
import type { Who } from "./store";

// Explicit result types break Convex's api ⇄ module type cycle (this module calls `internal`).
type R<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;
type Observation = R<typeof observationFor>;
type RoomState = R<typeof roomFor>;
type Job = { status: "running" | "failed"; error: { code: string; message: string } | null } | null;
type ReceiptStatus =
  | { status: "received"; commandId: string; receipt: CommandResult }
  | { status: "pending"; commandId: string; message: string }
  | { status: "failed"; commandId: string; error: { code: string; message: string }; message: string }
  | { status: "not_found"; commandId: string; message: string };

type Page = { data: unknown; nextCursor?: number | string | null };
type Exec<N extends ToolName> = (ctx: ActionCtx, p: { principal: Principal; who: Who }, args: ToolInput<N>) => Promise<Page>;
type Executors = { [N in ToolName]: Exec<N> };

const OBSERVATION_CAPS = { agents: 20, sourceChars: 4096, transformations: 50, chat: 20 };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const observe = async (ctx: ActionCtx, principal: Principal, roomId: string): Promise<Observation> =>
  ctx.runQuery(internal.player.observationAs, { principal, roomId });
const gameOf = async (ctx: ActionCtx, principal: Principal, roomId: string): Promise<{ gameId?: string; language?: "python" | "typescript" }> => {
  const o = await observe(ctx, principal, roomId);
  return { gameId: o.gameId, language: o.language };
};

/** The stored outcome of a command: its receipt, a pending or failed background run, or nothing. */
async function receiptStatus(ctx: ActionCtx, principal: Principal, who: Who, commandId: string): Promise<ReceiptStatus> {
  const receipt: CommandResult | null = await ctx.runQuery(internal.receipts.getAs, { principal, roomId: who.roomId, commandId });
  if (receipt) return { status: "received", commandId, receipt };
  const job: Job = await ctx.runQuery(internal.agent.store.jobFor, { roomId: who.roomId, subject: who.subject, commandId });
  if (job?.status === "running") return { status: "pending", commandId, message: "Still running; call get_receipt again shortly." };
  if (job?.status === "failed") {
    return { status: "failed", commandId, error: job.error ?? { code: "UNAVAILABLE", message: "Failed" },
      message: "Not applied. Resend the identical call (same commandId) to retry." };
  }
  return { status: "not_found", commandId, message: "The engine has no receipt for this command ID: it never received it." };
}

/**
 * A command tool. Summon and validate examine the agent in the sandbox (seconds), so they run as a scheduled
 * action that finishes even if this call stops waiting after `waitMs`; the rest run inline.
 */
async function command(ctx: ActionCtx, p: { principal: Principal; who: Who }, name: CommandToolName, args: Record<string, unknown>): Promise<Page> {
  const { principal, who } = p;
  // The observation (a full projection) is read only when the envelope needs the current game or its language.
  const game = envelopeNeedsGame(name, args) ? await gameOf(ctx, principal, who.roomId) : {};
  let envelope: Envelope;
  try { envelope = buildEnvelope(name, args, game); } catch (error) { return fail("CONFLICT", (error as Error).message); }
  if (name !== "validate_agent" && name !== "summon_agent") {
    const receipt: CommandResult = await ctx.runAction(internal.commands.submitAs, { principal, roomId: who.roomId, envelope });
    return { data: { status: "received", commandId: envelope.commandId, receipt } };
  }
  // Refusals (no act grant, a reused commandId with different content) answer now; a repeat answers from its receipt.
  const prepared: { prior: { hash: string; result: CommandResult } | null } =
    await ctx.runQuery(internal.game.commands.prepare, { roomId: who.roomId, principal, envelope });
  if (prepared.prior) {
    // Hash the parsed envelope, as the engine does (zod fixes the key order).
    if (prepared.prior.hash !== envelopeHash(envelopeSchema.parse(envelope))) fail("CONFLICT", "Command ID was reused with different content");
    return { data: { status: "received", commandId: envelope.commandId, receipt: prepared.prior.result } };
  }
  const job = { roomId: who.roomId, subject: who.subject, commandId: envelope.commandId };
  const { started }: { started: boolean } = await ctx.runMutation(internal.agent.store.startJob, { credentialId: who.credentialId, ...job });
  if (started) await ctx.scheduler.runAfter(0, internal.agent.node.runCommand, { principal, roomId: who.roomId, subject: who.subject, envelope });
  const deadline = Date.now() + Number(args.waitMs ?? DEFAULT_WAIT_MS);
  for (let attempt = 0; ; attempt++) {
    const status = await receiptStatus(ctx, principal, who, envelope.commandId);
    if (status.status !== "pending" && status.status !== "not_found") return { data: status };
    const left = deadline - Date.now();
    if (left <= 0) {
      return { data: { status: "pending", commandId: envelope.commandId, message: "Still running. Call get_receipt with this commandId to get the result." } };
    }
    await sleep(Math.min(pollDelay(attempt), left));
  }
}

const owner = (action: "settings" | "start" | "resume" | "endGame" | "addAi" | "removeAi") =>
  async (ctx: ActionCtx, { principal, who }: { principal: Principal; who: Who }, args: { requestId: string } & Record<string, unknown>): Promise<Page> => {
    const { requestId, ...rest } = args;
    const result: unknown = await ctx.runAction(internal.owner.commandAs, { principal, roomId: who.roomId, action, requestId, ...rest });
    return { data: { requestId, result } };
  };

/** Game setups (convex/setups.ts): one shared, owned collection, whichever room the credential is bound to. */
const SETUP_EXECUTORS = {
  list_setups: async (ctx, { principal }, { query, limit }) => {
    const rows: { name: string; ownerName: string; summary: string; system: boolean; mine: boolean }[] = await ctx.runQuery(internal.setups.listAs, { principal });
    const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const found = rows.filter(r => {
      const text = `${r.name} ${r.ownerName} ${r.system ? "system" : ""} ${r.mine ? "you mine" : ""} ${r.summary}`.toLowerCase();
      return words.every(w => text.includes(w));
    });
    return { data: { setups: found.slice(0, limit ?? 100), total: found.length } };
  },
  get_setup: async (ctx, { principal }, args) => ({ data: await ctx.runQuery(internal.setups.getAs, { principal, ...args }) }),
  save_setup: async (ctx, { principal }, args) => ({ data: await ctx.runAction(internal.setups.saveAs, { principal, ...args }) }),
  duplicate_setup: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.setups.duplicateAs, { principal, ...args }) }),
  delete_setup: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.setups.removeAs, { principal, ...args }) }),
} satisfies Pick<Executors, "list_setups" | "get_setup" | "save_setup" | "duplicate_setup" | "delete_setup">;

/** Stored panels (convex/panels.ts): the human's own panels, whichever room the credential is bound to. */
const PANEL_EXECUTORS = {
  list_panels: async (ctx, { principal }) => ({ data: await ctx.runQuery(internal.panels.listAs, { principal }) }),
  get_panel: async (ctx, { principal }, args) => ({ data: await ctx.runQuery(internal.panels.codeAs, { principal, ...args }) }),
  save_panel: async (ctx, { principal }, args) => ({ data: await ctx.runAction(internal.panels.saveAs, { principal, ...args }) }),
  rollback_panel: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.panels.rollbackAs, { principal, ...args }) }),
  delete_panel: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.panels.removeAs, { principal, ...args }) }),
} satisfies Pick<Executors, "list_panels" | "get_panel" | "save_panel" | "rollback_panel" | "delete_panel">;

/**
 * The dock layout (convex/layout.ts): the panes the player sees. Each operation is one read-modify-write mutation on
 * the human's row for the credential's room, so an assistant's change lands on the latest layout.
 */
type PanelMeta = { slug: string; title: string; enabled: boolean; placement: string; size: string };
const LAYOUT_EXECUTORS = {
  get_layout: async (ctx, { principal }) => {
    const current: CurrentLayout = await ctx.runQuery(internal.layout.currentAs, { principal });
    const stored: PanelMeta[] = await ctx.runQuery(internal.panels.listAs, { principal });
    const panels = panelCatalog().map(entry => ({ ...entry, defaults: defaultPanelParams(entry.id) }));
    return { data: { ...current, panels, storedPanels: stored.filter(p => p.enabled).map(p => ({ slug: p.slug, title: p.title, placement: p.placement, size: p.size })) } };
  },
  open_panel: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.layout.openPanelAs, { principal, ...args }) satisfies LayoutChange }),
  set_panel_params: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.layout.setPanelParamsAs, { principal, ...args }) satisfies LayoutChange }),
  move_pane: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.layout.movePaneAs, { principal, ...args }) satisfies LayoutChange }),
  close_pane: async (ctx, { principal }, args) => ({ data: await ctx.runMutation(internal.layout.closePaneAs, { principal, ...args }) satisfies LayoutChange }),
} satisfies Pick<Executors, "get_layout" | "open_panel" | "set_panel_params" | "move_pane" | "close_pane">;

/**
 * Code runs (convex/code; docs/assistant/code-execution.md): analytics scripts over datasets the engine resolves as the
 * human, in the room the credential is bound to. Reads only. The analytics-code skill (load_skill) has the guidance.
 */
const CODE_EXECUTORS = {
  run_code: async (ctx, { principal, who }, { language, source, script, load, saveAs, datasets, params, title, cpuSeconds }) => {
    const outcome: RunOutcome = await ctx.runAction(internal.code.execute.runAs, {
      principal, roomId: who.roomId, datasetsJson: JSON.stringify(datasets),
      ...(language ? { language } : {}), ...(source !== undefined ? { source } : {}), ...(script !== undefined ? { script } : {}),
      ...(load ? { load } : {}), ...(saveAs !== undefined ? { saveAs } : {}),
      ...(params ? { paramsJson: JSON.stringify(params) } : {}), ...(title ? { title } : {}), ...(cpuSeconds ? { cpuMs: Math.round(cpuSeconds * 1000) } : {}),
    });
    return { data: outcome };
  },
  get_code_run: async (ctx, { principal, who }, { runId, part, offset, length }) => {
    const run: RunDetail | null = await ctx.runQuery(internal.code.runs.getAs, { principal, roomId: who.roomId, runId });
    if (!run) return fail("NOT_FOUND", "No such code run of yours in this room");
    const { resultJson, output, source, fullUrl: _, ...summary } = run;
    if (!part) return { data: { ...summary, resultPreview: (resultJson ?? "").slice(0, 1000), outputPreview: (output ?? "").slice(0, 500) } };
    let text = part === "source" ? source : part === "result" ? resultJson ?? "" : output ?? "";
    // The row holds a prefix of a clipped run; the whole is read from file storage only for a slice past it.
    if (part !== "source" && run.clipped && offset + length > text.length) {
      const full: { result: string; output: string } | null = await ctx.runAction(internal.code.execute.fullText, { principal, roomId: who.roomId, runId });
      if (full) text = part === "result" ? full.result : full.output;
    }
    const slice = text.slice(offset, offset + length);
    const next = offset + slice.length;
    return { data: { runId, part, offset, text: slice, totalChars: text.length, nextOffset: next < text.length ? next : null } };
  },
  list_code_runs: async (ctx, { principal, who }, { limit }) => ({ data: await ctx.runQuery(internal.code.runs.listAs, { principal, roomId: who.roomId, limit }) }),
  list_code_objects: async (ctx, { principal }, { prefix, limit }) => ({ data: await ctx.runQuery(internal.code.objects.listAs, { principal, ...(prefix ? { prefix } : {}), limit }) }),
} satisfies Pick<Executors, "run_code" | "get_code_run" | "list_code_runs" | "list_code_objects">;

export const EXECUTORS: Executors = {
  ...SETUP_EXECUTORS,
  ...PANEL_EXECUTORS,
  ...LAYOUT_EXECUTORS,
  ...CODE_EXECUTORS,
  // ----- read -----
  whoami: async (_ctx, { who }) => ({ data: who }),
  get_rules: async (ctx, { principal, who }) => {
    const room: RoomState = await ctx.runQuery(internal.rooms.getAs, { principal, room: who.roomId });
    return { data: { rules: rulesText(room.settings as unknown as Record<string, unknown>), settings: room.settings, objectInstance: room.objectInstance,
      activeGame: room.activeGame, preparing: room.preparing,
      note: "Settings are the room's next game; a running game keeps the settings it started with (get_my_utility). `preparing`: the next game is computing its rule tables (first game on this shape on this server) and starts by itself when they are ready." } };
  },
  get_observation: async (ctx, { principal, who }, { objectsLimit, objectsCursor }) => {
    const o = await observe(ctx, principal, who.roomId);
    const C = OBSERVATION_CAPS;
    const end = objectsCursor + objectsLimit;
    return {
      data: { ...o, objectCount: o.objects.length, objects: o.objects.slice(objectsCursor, end),
        agentCount: o.agents.length, agents: o.agents.slice(0, C.agents).map(a => ({ ...a, source: a.source.slice(0, C.sourceChars) })),
        transformations: o.transformations.slice(-C.transformations), chat: o.chat.slice(-C.chat), caps: C },
      nextCursor: end < o.objects.length ? end : null,
    };
  },
  get_events: async (ctx, { principal, who }, args) => {
    const r: R<typeof eventsFor> = await ctx.runQuery(internal.player.eventsAs, { principal, roomId: who.roomId, ...args });
    return { data: r, nextCursor: r.events.length ? r.nextCursor : null };
  },
  get_trajectories: async (ctx, { principal, who }, args) => {
    const r: R<typeof trajectoriesFor> = await ctx.runQuery(internal.player.trajectoriesAs, { principal, roomId: who.roomId, ...args });
    return { data: r, nextCursor: r.nextCursor < r.latestCursor ? r.nextCursor : null };
  },
  list_games: async (ctx, { principal, who }, { cursor, limit }) => {
    const games: R<typeof roomHistoryFor> = await ctx.runQuery(internal.rooms.historyAs, { principal, room: who.roomId });
    return { data: { games: games.slice(cursor, cursor + limit), total: games.length }, nextCursor: cursor + limit < games.length ? cursor + limit : null };
  },
  get_game_history: async (ctx, { principal, who }, args) => {
    const r: R<typeof gameHistoryFor> = await ctx.runQuery(internal.player.historyAs, { principal, roomId: who.roomId, ...args });
    return { data: r, nextCursor: r.nextCursor < r.latestCursor ? r.nextCursor : null };
  },
  get_my_utility: async (ctx, { principal, who }) => {
    const mine: R<typeof myUtilityFor> = await ctx.runQuery(internal.player.myUtilityAs, { principal, roomId: who.roomId });
    return { data: mine };
  },
  evaluate_value: async (ctx, { principal, who }, { value }) => {
    const scored: unknown = await ctx.runAction(internal.agent.node.evaluate, { principal, roomId: who.roomId, value });
    return { data: scored };
  },
  get_chat: async (ctx, { principal, who }, { cursor, limit }) => {
    const { messages, nextCursor }: { messages: R<typeof chatFor>; nextCursor: string | null } =
      await ctx.runQuery(internal.rooms.chatHistoryAs, { principal, roomId: who.roomId, cursor, limit });
    return { data: { messages }, nextCursor };
  },
  get_receipt: async (ctx, { principal, who }, { commandId }) => ({ data: await receiptStatus(ctx, principal, who, commandId) }),
  // A skill's guidance with the live parts it reads, through the same executors as the human (a failed read is left
  // out; the body says which tool to call instead).
  load_skill: async (ctx, p, { name }) => {
    const reads = findSkill(name)?.reads ?? [];
    const read = async (part: SkillRead) => {
      if (!reads.includes(part)) return undefined;
      try {
        const page = part === "rules" ? await EXECUTORS.get_rules(ctx, p, {})
          : part === "observation" ? await EXECUTORS.get_observation(ctx, p, { objectsLimit: 1, objectsCursor: 0 })
          : await EXECUTORS.get_layout(ctx, p, {});
        return page.data;
      } catch { return undefined; }
    };
    const [rules, observation, layout] = await Promise.all([read("rules"), read("observation"), read("layout")]);
    return { data: { name, body: skillBody(name, { rules, observation, layout }) } };
  },
  // ----- act -----
  validate_agent: (ctx, p, args) => command(ctx, p, "validate_agent", args),
  summon_agent: (ctx, p, args) => command(ctx, p, "summon_agent", args),
  destroy_agent: (ctx, p, args) => command(ctx, p, "destroy_agent", args),
  set_ready: (ctx, p, args) => command(ctx, p, "set_ready", args),
  send_chat: (ctx, p, args) => command(ctx, p, "send_chat", args),
  pause_game: (ctx, p, args) => command(ctx, p, "pause_game", args),
  wake_engine: async (ctx, { principal }) => {
    const woke: unknown = await ctx.runMutation(internal.activity.touchAs, { principal });
    return { data: woke };
  },
  // ----- owner -----
  get_room_state: async (ctx, { principal, who }) => {
    const room: RoomState = await ctx.runQuery(internal.rooms.getAs, { principal, room: who.roomId, requireOwner: true });
    return { data: room };
  },
  get_ai_catalog: async (ctx, { principal }) => {
    const catalog: unknown = await ctx.runQuery(internal.aiTemplates.catalogAs, { principal });
    return { data: catalog };
  },
  update_settings: owner("settings"),
  start_game: owner("start"),
  resume_game: owner("resume"),
  end_game: owner("endGame"),
  add_ai: owner("addAi"),
  remove_ai: owner("removeAi"),
};


/**
 * Run one tool as `principal`: the grant must allow it (read < act < owner), the arguments must parse, and the
 * result is bounded and wrapped as untrusted game data. `who` skips the principal lookup when the caller has
 * just resolved it. Throws ConvexError {code, message} on refusal.
 */
export async function runTool(ctx: ActionCtx, principal: Principal, name: string, rawArgs: unknown, who?: Who): Promise<ToolResult> {
  const definition = findTool(name);
  if (!definition) return fail("NOT_FOUND", `Unknown tool: ${name}`);
  const resolved: Who | null = who ?? await ctx.runQuery(internal.agent.store.principalInfo, { credentialId: principal.credentialId });
  if (!resolved) return fail("UNAUTHENTICATED", "This connection was revoked or has expired; reconnect");
  if (!mayUse(resolved.permission, definition)) {
    return fail("FORBIDDEN", definition.permission === "owner" ? "This tool needs an owner grant approved by the room owner" : "This tool needs an act grant; this one is read-only");
  }
  const parsed = definition.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return fail("BAD_REQUEST", `Invalid arguments: ${parsed.error.issues.slice(0, 5).map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`.slice(0, 500));
  }
  const exec = EXECUTORS[name as ToolName] as Exec<ToolName>;
  const page = await exec(ctx, { principal, who: resolved }, parsed.data as never);
  // A paged result is never trimmed (its cursor would then skip what was cut): ask for a smaller page instead.
  const { value, truncated } = bound(page.data);
  if (truncated && page.nextCursor !== undefined) return fail("BAD_REQUEST", "Result too large: request a smaller page (a lower limit)");
  return { untrusted: true, notice: UNTRUSTED_NOTICE, data: value, ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}), ...(truncated ? { truncated } : {}) };
}

/** A ConvexError's {code, message}, or a generic internal error (details stay in the deployment log). */
export function toolError(error: unknown): { code: string; message: string } {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown; message?: unknown } | string;
    if (typeof data === "string") return { code: "ERROR", message: data };
    return { code: String(data?.code ?? "ERROR"), message: String(data?.message ?? "Refused") };
  }
  return { code: "INTERNAL", message: "The tool failed unexpectedly" };
}
export { isCommandTool };
