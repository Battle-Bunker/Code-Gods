/**
 * What every panel renderer shares: its props, the empty state that names the next step, quiet section headings,
 * big numbers, and the object reference a click puts into the assistant's composer. One `--card` surface per pane:
 * nothing here draws a frame of its own.
 */
import { useMemo, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { PANELS, type PanelId, type PanelParams, type Phase } from "@workspace/player-client/panels";
import type { LiveObject } from "@/sdk";
import { composer } from "@/core/chat/composer";

export type PanelProps<K extends PanelId> = {
  paneId: string;
  /** Parsed with the panel's schema (invalid → defaults); null only for what-if, which has no defaults. */
  params: K extends "what-if" ? PanelParams<K> | null : PanelParams<K>;
  phase: Phase;
};
export type PanelView<K extends PanelId> = (props: PanelProps<K>) => ReactNode;

/** A panel's empty state: one plain sentence, optionally the one action that fixes it. */
export function PanelEmpty({ children, action, testId }: { children: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-start justify-center gap-3 text-sm text-muted-foreground" data-testid={testId}>
      <p className="max-w-[60ch]">{children}</p>
      {action}
    </div>
  );
}

/** A quiet heading inside a panel (not a card). */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between gap-2"><h3 className="label !text-[hsl(var(--foreground))]">{title}</h3>{aside && <span className="label">{aside}</span>}</header>
      {children}
    </section>
  );
}

export function BigNumber({ label, value, testId, tone }: { label: string; value: ReactNode; testId?: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <dd data-testid={testId} className={`font-mono text-[28px] leading-none tabular-nums ${tone === "good" ? "text-[hsl(var(--accent))]" : tone === "bad" ? "text-destructive" : ""}`}>{value}</dd>
      <dt className="label mt-1.5">{label}</dt>
    </div>
  );
}

/** A small text button (secondary actions inside a panel). */
export function TextButton({ children, onClick, disabled, testId, tone, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId?: string; tone?: "danger"; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} title={title}
      className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline ${tone === "danger" ? "text-destructive font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

/** The one primary action of a panel (the next step, Send, Summon): --primary is reserved for it. */
/** `busy`: a request is pending; a spinner, aria-busy, and no clicks (a double click sends nothing twice). */
export function PrimaryButton({ children, onClick, disabled, busy, testId, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; busy?: boolean; testId?: string; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={e => { if (busy) e.preventDefault(); else onClick?.(); }} disabled={disabled} aria-busy={busy || undefined} aria-disabled={busy || undefined} data-testid={testId}
      className={`inline-flex items-center justify-center gap-2 bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:pointer-events-none disabled:opacity-35 ${busy ? "cursor-progress opacity-80" : ""}`}>
      {busy && <Spinner aria-hidden className="size-3.5" />}
      {children}
    </button>
  );
}
export function GhostButton({ children, onClick, disabled, testId, type = "button", pressed }: { children: ReactNode; onClick?: () => void; disabled?: boolean; testId?: string; type?: "button" | "submit"; pressed?: boolean }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} aria-pressed={pressed}
      className={`inline-flex items-center justify-center gap-2 border px-3 py-1.5 text-[13px] font-semibold disabled:pointer-events-none disabled:opacity-35 ${pressed ? "border-secondary bg-secondary text-secondary-foreground" : "border-[hsl(var(--input))] text-foreground"}`}>
      {children}
    </button>
  );
}

/** "#3" for every object: its rank by payoff, the same number in every panel and in the chat. */
export function useObjectRanks(objects: readonly LiveObject[]) {
  return useMemo(() => new Map([...objects].sort((a, b) => b.payoff - a.payoff).map((o, i) => [o.id, i + 1])), [objects]);
}
/** Clicking an object puts a reference into the assistant's composer: point, then ask. */
export const referObject = (rank: number | undefined) => { if (rank) composer.fill(`object #${rank}`); };

const PHASE_WORD: Record<Phase, string> = { lobby: "in the lobby", planning: "during planning", running: "while the world runs", paused: "while it is paused", ended: "after the game" };
/** Where a panel has data, in words ("while the world runs, while it is paused"). */
export const phasesText = (panelId: PanelId) => PANELS[panelId].phases.map(p => PHASE_WORD[p]).join(", ").replace(/, ([^,]*)$/, " or $1");

/** A panel opened outside its phases: say when it fills, and the next step now. */
export function outOfPhase(panelId: PanelId, phase: Phase): string {
  const when = `${PANELS[panelId].title} shows data ${phasesText(panelId)}.`;
  const next: Record<Phase, string> = {
    lobby: "The game hasn't started: the owner starts it from the room.",
    planning: "Planning is on: write your first agent before the world starts.",
    running: "The world is running now.",
    paused: "The world is paused: a good moment to negotiate in public chat.",
    ended: "This game is over: see how it went in How the game went.",
  };
  return `${when} ${next[phase]}`;
}

export const fmt = (v: number) => (Number.isInteger(v) ? String(v) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** The room's preparing state (rooms.get `preparing`), as panels show it. */
export type PreparingInfo = { ready: number; total: number; instance: string; estimateSeconds: number; dealerNote?: string; error?: string; pieces?: { done: number; total: number } };
/** "The game is preparing its rule tables, 12 of 18 ready…": the next game's first start on a shape new to this server. */
export function PreparingNote({ preparing: p }: { preparing: PreparingInfo }) {
  return (
    <div className="space-y-1 border-l-2 border-[hsl(var(--accent))] pl-3 text-sm" data-testid="note-preparing" aria-live="polite">
      {p.error
        ? <p className="text-destructive" role="alert">Preparing the game failed: {p.error}</p>
        : <p>The game is preparing its rule tables, <span data-testid="text-preparing-count">{p.ready} of {p.total}</span> ready{p.pieces && <> ({p.pieces.done} of {p.pieces.total} parts computed)</>}. It is the first game on {p.instance} on this server (about {p.estimateSeconds} s); it starts by itself, with planning time after.</p>}
      {p.dealerNote && <p className="text-xs text-muted-foreground">{p.dealerNote}.</p>}
    </div>
  );
}
