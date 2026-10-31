/**
 * Pure UI state of the assistant drawer (no React, no Convex): the timeline of a thread, the optimistic user message,
 * the confirmation-card state machine, the allowance meter and tool-chip views. Unit-tested in
 * test/assistant-state.test.ts.
 */
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
export function withPending(timeline: TimelineItem[], pending: string | null): TimelineItem[] {
  if (!pending) return timeline;
  const lastUser = [...timeline].reverse().find(i => i.kind === "user");
  if (lastUser?.kind === "user" && lastUser.text === pending.trim()) return timeline;
  return [...timeline, { kind: "user", key: "pending", text: pending.trim(), pending: true }];
}

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

export type ChipTone = "ok" | "error" | "muted" | "busy" | "ask";
export function chipView(call: CallRow): { label: string; tone: ChipTone; detail: string } {
  const tone: ChipTone = call.status === "ok" ? "ok" : call.status === "error" ? "error" : call.status === "denied" ? "muted"
    : call.status === "awaiting_confirmation" ? "ask" : "busy";
  return { label: call.tool.replace(/_/g, " "), tone, detail: call.summary };
}

export function prettyArgs(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 2); } catch { return json; }
}

export const TURN_ACTIVE = ["running", "awaiting_confirmation", "cancelling"];
