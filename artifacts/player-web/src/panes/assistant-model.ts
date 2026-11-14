/**
 * The assistant pane's words and shapes, pure so they are unit tested (test/assistant-model.test.ts): a tool call's
 * chip in the affordance directory's own words (the tool name is the affordance id with "." → "_"), the allowance as
 * a share used, a turn's status as a short sentence, and the transcript's newest-first pages as turns, oldest first.
 */
import { affordanceForTool } from "@workspace/v2-affordances";

export type Mode = "autopilot" | "onRequest" | "readOnly";
export type Grant = "read" | "act" | "owner";
export type TurnStatus = "running" | "cancelling" | "done" | "failed" | "cancelled" | "budget";

export const MODE_OPTIONS: readonly { id: Mode; label: string; detail: string }[] = [
  { id: "onRequest", label: "When I ask", detail: "It acts only when you ask it to." },
  { id: "autopilot", label: "Autopilot", detail: "It plays for you on its own while the game runs." },
  { id: "readOnly", label: "Just answers", detail: "It answers questions and never changes anything." },
];

export const GRANT_OPTIONS: readonly { id: Grant; label: string; detail: string }[] = [
  { id: "read", label: "Look only", detail: "It can look at the game but not change it." },
  { id: "act", label: "Act for me", detail: "It can do what you can do in the game." },
  { id: "owner", label: "Owner too", detail: "It can also change the room, as its owner can." },
];

export interface Call { tool: string; ok: boolean; summary: string }
/** A chip: the operation's title; a failed call adds the reason. */
export function chipView(call: Call): { label: string; tone: "ok" | "error"; detail: string | null } {
  const label = affordanceForTool(call.tool)?.title ?? call.tool.replace(/_/g, " ");
  return call.ok ? { label, tone: "ok", detail: null } : { label, tone: "error", detail: call.summary || null };
}

export interface Allowance { tokens: number; usd: number; usedTokens: number; usedUsd: number }
/** The share of this game's allowance used (the larger of tokens and money), in words; `low` from 80%. */
export function allowanceWords(a: Allowance): { used: number; text: string; low: boolean; out: boolean } {
  const share = (used: number, limit: number) => (limit > 0 ? used / limit : 1);
  const used = Math.min(1, Math.max(share(a.usedTokens, a.tokens), share(a.usedUsd, a.usd), 0));
  if (used >= 1) return { used: 1, text: "This game's assistant allowance is used up. You can still do everything yourself.", low: true, out: true };
  const pct = Math.floor(used * 100);
  const text = used === 0 ? "None of this game's assistant allowance used yet."
    : pct < 1 ? "Less than 1% of this game's assistant allowance used."
      : `${pct}% of this game's assistant allowance used.`;
  return { used, text, low: used >= 0.8, out: false };
}

export const isBusy = (status: TurnStatus | undefined): boolean => status === "running" || status === "cancelling";

/** What the latest turn is doing, or how it ended when that needs saying; null for a finished turn. */
export function turnWords(turn: { status: TurnStatus; error: string | null } | null | undefined): string | null {
  switch (turn?.status) {
    case "running": return "Working on it…";
    case "cancelling": return "Stopping…";
    case "cancelled": return "Stopped.";
    case "failed": return turn.error ? `Something went wrong: ${turn.error}` : "Something went wrong. Try again.";
    case "budget": return "It ran out of this game's allowance before it finished.";
    default: return null;
  }
}

export interface Message { seq: number; role: "user" | "assistant"; text: string; autopilot: boolean; turnId: string }
export interface TurnGroup<M extends Message = Message> { turnId: string; autopilot: boolean; messages: M[] }
/** Newest-first pages as turns, oldest first (the newest at the bottom); a turn started by the autopilot is marked. */
export function timeline<M extends Message>(newestFirst: readonly M[]): TurnGroup<M>[] {
  const out: TurnGroup<M>[] = [];
  for (const m of [...newestFirst].sort((a, b) => a.seq - b.seq)) {
    const last = out.at(-1);
    if (last && last.turnId === m.turnId) last.messages.push(m);
    else out.push({ turnId: m.turnId, autopilot: m.role === "user" && m.autopilot, messages: [m] });
  }
  return out;
}
