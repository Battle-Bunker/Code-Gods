/**
 * Pure UI state of the assistant pane (no React, no Convex): the timeline of a thread, the optimistic user message,
 * one step line per model step, the confirmation-card state machine and its plain sentence, the allowance meter and
 * tool-chip views. Unit-tested in test/assistant-state.test.ts.
 */
import { PANELS, isPanelId } from "@workspace/player-client/panels";
import type { ToolName } from "@workspace/player-client/tools";

export type MessageRow = { _id: string; turnId: string; seq: number; role: "user" | "assistant"; text: string; status: "streaming" | "done" | "error" | "cancelled" };
export type CallStatus = "pending" | "awaiting_confirmation" | "running" | "ok" | "error" | "denied";
export type CallRow = {
  _id: string; turnId: string; messageId: string; index: number; tool: string; status: CallStatus;
  argsJson: string; summary: string; resultJson: string | null; confirmDeadline?: number | null;
};
export type TimelineItem =
  | { kind: "user"; key: string; text: string; pending?: boolean }
  | { kind: "assistant"; key: string; text: string; status: MessageRow["status"] }
  | { kind: "call"; key: string; call: CallRow };

/** Messages in seq order; after each assistant step its tool calls in call order. Empty finished step texts are hidden. */
export function buildTimeline(messages: readonly MessageRow[], calls: readonly CallRow[]): TimelineItem[] {
  const byMessage = new Map<string, CallRow[]>();
  for (const c of calls) byMessage.set(c.messageId, [...(byMessage.get(c.messageId) ?? []), c]);
  const out: TimelineItem[] = [];
  for (const m of [...messages].sort((a, b) => a.seq - b.seq)) {
    if (m.role === "user") { out.push({ kind: "user", key: m._id, text: m.text }); continue; }
    if (m.text || m.status === "streaming") out.push({ kind: "assistant", key: m._id, text: m.text, status: m.status });
    for (const c of (byMessage.get(m._id) ?? []).sort((a, b) => a.index - b.index)) out.push({ kind: "call", key: c._id, call: c });
  }
  return out;
}

/** The user's just-sent message, shown until the server's copy arrives (the newest user message has the same text). */
export function withPending(timeline: TimelineItem[], pending: string | null, usersBefore?: number): TimelineItem[] {
  if (!pending) return timeline;
  const users = timeline.filter(i => i.kind === "user");
  // Known how many user messages there were when it was sent: shown until one more arrives (the same text twice too).
  if (usersBefore !== undefined) return users.length > usersBefore ? timeline : [...timeline, { kind: "user", key: "pending", text: pending.trim(), pending: true }];
  const lastUser = users.at(-1);
  if (lastUser?.kind === "user" && lastUser.text === pending.trim()) return timeline;
  return [...timeline, { kind: "user", key: "pending", text: pending.trim(), pending: true }];
}
/** User messages in a timeline (what withPending counts against). */
export const userCount = (timeline: readonly TimelineItem[]) => timeline.filter(i => i.kind === "user" && !i.pending).length;

// ---------------------------------------------------------------------------------------------
// Confirmation cards
// ---------------------------------------------------------------------------------------------

export type Decision = "approve" | "deny";
export type CardState =
  | { phase: "idle" }
  | { phase: "submitting"; decision: Decision }
  | { phase: "sent"; decision: Decision }
  | { phase: "error"; decision: Decision; message: string }
  | { phase: "settled"; status: CallStatus };
export type CardEvent =
  | { type: "submit"; decision: Decision }
  | { type: "sent" }
  | { type: "failed"; message: string }
  | { type: "server"; status: CallStatus };
export const initialCard: CardState = { phase: "idle" };

/** One decision at a time; the card settles once the server's call is no longer awaiting confirmation. */
export function cardReducer(state: CardState, event: CardEvent): CardState {
  switch (event.type) {
    case "submit": return state.phase === "idle" || state.phase === "error" ? { phase: "submitting", decision: event.decision } : state;
    case "sent": return state.phase === "submitting" ? { phase: "sent", decision: state.decision } : state;
    case "failed": return state.phase === "submitting" ? { phase: "error", decision: state.decision, message: event.message } : state;
    case "server": return event.status === "awaiting_confirmation" ? state : { phase: "settled", status: event.status };
  }
}

// ---------------------------------------------------------------------------------------------
// Meter and chips
// ---------------------------------------------------------------------------------------------

const n = (x: number) => x.toLocaleString("en-US");
export function allowanceMeter(used: number, limit: number) {
  if (limit <= 0) return { fraction: 0, label: "off", exhausted: false, off: true };
  return { fraction: Math.min(1, used / limit), label: `${n(used)} / ${n(limit)} tokens`, exhausted: used >= limit, off: false };
}

/** The composer's top-edge meter: silent below 80 % of the allowance, then one sentence. */
export function allowanceNote(used: number, limit: number): string | null {
  if (limit <= 0) return null;
  if (used >= limit) return "Allowance used up for this game · do it yourself from the command palette";
  const left = 1 - used / limit;
  return left <= 0.2 ? `${Math.max(0, Math.round(left * 100))} % of this game's assistant allowance left` : null;
}

export type ChipTone = "ok" | "error" | "muted" | "busy" | "ask";
export function chipView(call: CallRow): { label: string; tone: ChipTone; detail: string } {
  const tone: ChipTone = call.status === "ok" ? "ok" : call.status === "error" ? "error" : call.status === "denied" ? "muted"
    : call.status === "awaiting_confirmation" ? "ask" : "busy";
  return { label: call.tool.replace(/_/g, " "), tone, detail: call.summary };
}

// ---------------------------------------------------------------------------------------------
// Step lines: one per model step, in human verbs
// ---------------------------------------------------------------------------------------------

/** [past, present, imperative] per tool: "tested agent code" · "testing agent code…" · "you declined: test agent code". */
export const STEP_VERBS = {
  whoami: ["looked up who you are", "looking up who you are", "look up who you are"],
  get_rules: ["read the rules", "reading the rules", "read the rules"],
  get_observation: ["looked at the game", "looking at the game", "look at the game"],
  get_events: ["read the event log", "reading the event log", "read the event log"],
  get_trajectories: ["looked at your points over time", "looking at your points over time", "look at your points over time"],
  list_games: ["listed past games", "listing past games", "list past games"],
  get_game_history: ["replayed a past game", "replaying a past game", "replay a past game"],
  get_my_utility: ["read your secret goal", "reading your secret goal", "read your secret goal"],
  evaluate_value: ["tried a what-if", "trying a what-if", "try a what-if"],
  get_chat: ["read the public chat", "reading the public chat", "read the public chat"],
  get_receipt: ["checked a command", "checking a command", "check a command"],
  validate_agent: ["tested agent code", "testing agent code", "test agent code"],
  summon_agent: ["summoned an agent", "summoning an agent", "summon an agent"],
  destroy_agent: ["destroyed an agent", "destroying an agent", "destroy an agent"],
  set_ready: ["marked you ready", "marking you ready", "mark you ready"],
  send_chat: ["posted to everyone", "posting to everyone", "post to everyone"],
  pause_game: ["used your pause", "using your pause", "use your pause"],
  wake_engine: ["woke the game", "waking the game", "wake the game"],
  get_room_state: ["read the room", "reading the room", "read the room"],
  get_ai_catalog: ["listed AI players", "listing AI players", "list AI players"],
  update_settings: ["changed the next game's setup", "changing the next game's setup", "change the next game's setup"],
  start_game: ["started the game", "starting the game", "start the game"],
  resume_game: ["resumed the game", "resuming the game", "resume the game"],
  end_game: ["ended the game", "ending the game", "end the game"],
  add_ai: ["added an AI player", "adding an AI player", "add an AI player"],
  remove_ai: ["removed an AI player", "removing an AI player", "remove an AI player"],
  list_panels: ["listed your panels", "listing your panels", "list your panels"],
  get_panel: ["read a panel's source", "reading a panel's source", "read a panel's source"],
  save_panel: ["saved a panel", "saving a panel", "save a panel"],
  rollback_panel: ["rolled back a panel", "rolling back a panel", "roll back a panel"],
  delete_panel: ["deleted a panel", "deleting a panel", "delete a panel"],
  list_setups: ["listed the game setups", "listing the game setups", "list the game setups"],
  get_setup: ["read a game setup", "reading a game setup", "read a game setup"],
  save_setup: ["saved a game setup", "saving a game setup", "save a game setup"],
  duplicate_setup: ["copied a game setup", "copying a game setup", "copy a game setup"],
  delete_setup: ["deleted a game setup", "deleting a game setup", "delete a game setup"],
  get_layout: ["looked at your screen", "looking at your screen", "look at your screen"],
  open_panel: ["showed a panel", "showing a panel", "show a panel"],
  set_panel_params: ["adjusted a panel", "adjusting a panel", "adjust a panel"],
  move_pane: ["moved a pane", "moving a pane", "move a pane"],
  close_pane: ["closed a pane", "closing a pane", "close a pane"],
  load_skill: ["loaded a skill", "loading a skill", "load a skill"],
} as const satisfies Record<ToolName, readonly [string, string, string]>;

function argsOf(call: CallRow): Record<string, unknown> {
  try { const value = JSON.parse(call.argsJson) as unknown; return value && typeof value === "object" ? value as Record<string, unknown> : {}; } catch { return {}; }
}
function verbs(call: CallRow): readonly [string, string, string] {
  if (call.tool === "open_panel") {
    const panelId = argsOf(call).panelId;
    if (isPanelId(panelId)) { const title = PANELS[panelId].title; return [`showed ${title}`, `showing ${title}`, `show ${title}`]; }
  }
  const known = (STEP_VERBS as Record<string, readonly [string, string, string]>)[call.tool];
  if (known) return known;
  const name = call.tool.replace(/_/g, " ");
  return [`ran ${name}`, `running ${name}`, `run ${name}`];
}

export type StepTone = "ok" | "error" | "muted" | "busy" | "ask";
/** One model step's tool calls as one line: "looked at the game · tested agent code · showed Agent code". */
export function stepView(calls: readonly CallRow[]): { text: string; tone: StepTone; open: boolean } {
  const ordered = [...calls].sort((a, b) => a.index - b.index);
  const parts: string[] = [];
  for (const call of ordered) {
    const [past, present, imperative] = verbs(call);
    const part = call.status === "ok" ? past : call.status === "denied" ? `you declined: ${imperative}`
      : call.status === "awaiting_confirmation" ? `waiting for you: ${imperative}` : call.status === "error" ? `couldn't ${imperative}` : `${present}…`;
    if (!parts.includes(part)) parts.push(part);
  }
  const shown = parts.length > 3 ? [...parts.slice(0, 3), `+${parts.length - 3}`] : parts;
  const has = (status: CallStatus) => ordered.some(c => c.status === status);
  const tone: StepTone = has("awaiting_confirmation") ? "ask" : has("running") || has("pending") ? "busy" : has("error") ? "error"
    : ordered.length > 0 && ordered.every(c => c.status === "denied") ? "muted" : "ok";
  // An error leaves the line open, so the player sees what failed.
  return { text: shown.join(" · "), tone, open: tone === "error" };
}

export type ChatItem =
  | Exclude<TimelineItem, { kind: "call" }>
  | { kind: "step"; key: string; calls: CallRow[] };
/** The timeline with each step's consecutive tool calls folded into one step line. */
export function withSteps(timeline: readonly TimelineItem[]): ChatItem[] {
  const out: ChatItem[] = [];
  for (const item of timeline) {
    if (item.kind !== "call") { out.push(item); continue; }
    const last = out.at(-1);
    if (last?.kind === "step" && last.calls[0].messageId === item.call.messageId) last.calls.push(item.call);
    else out.push({ kind: "step", key: `step-${item.call.messageId}`, calls: [item.call] });
  }
  return out;
}

const quote = (text: unknown, max = 160) => {
  const t = typeof text === "string" ? text.trim() : "";
  return `"${t.length > max ? `${t.slice(0, max - 1)}…` : t}"`;
};
const bitsText = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

/** The confirmation card's first line: what will happen, in plain words, before any JSON. */
export function confirmSentence(call: CallRow, ctx: { energy?: number; pauseSeconds?: number } = {}): string {
  const args = argsOf(call);
  switch (call.tool) {
    case "send_chat": return `Post to everyone: ${quote(args.text)}`;
    case "summon_agent": return ctx.energy !== undefined ? `Summon this agent: it pays from your ${bitsText(ctx.energy)} bits of energy` : "Summon this agent: it pays from your energy";
    case "pause_game": return ctx.pauseSeconds ? `Use your one pause: it stops the world for everyone for ${ctx.pauseSeconds} s` : "Use your one pause: it stops the world for everyone";
    case "destroy_agent": return typeof args.agentId === "string" ? `Destroy your agent ${args.agentId.slice(0, 12)} (free, cannot be undone)` : "Destroy one of your agents (free, cannot be undone)";
    case "delete_panel": return `Delete your panel ${quote(args.slug, 64)} and all its versions`;
    case "start_game": return "Start the game for everyone in the room";
    case "end_game": return "End the game now for everyone";
    case "resume_game": return "Resume the game";
    case "add_ai": return `Seat the AI player ${quote(args.aiAgentId, 64)} (it spends the room's AI budget)`;
    case "remove_ai": return "Remove an AI player from the room";
    case "delete_setup": return "Delete one of your game setups (rooms keep their settings)";
    case "update_settings": return typeof args.setupId === "string" ? "Put the next game on one of the game setups"
      : "Change the room's setup (yours is edited; anyone else's is copied as yours first)";
    default: return `Let your assistant ${verbs(call)[2]}`;
  }
}

export function prettyArgs(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json; }
}

export const TURN_ACTIVE = ["running", "awaiting_confirmation", "cancelling"];
