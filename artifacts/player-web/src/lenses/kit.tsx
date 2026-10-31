/**
 * What every lens renderer shares: its props, the empty state that names the next step, quiet section headings,
 * big numbers, and the object reference a click puts into the assistant's composer. One `--card` surface per pane:
 * nothing here draws a frame of its own.
 */
import { useMemo, type ReactNode } from "react";
import { LENSES, type LensId, type LensParams, type Phase } from "@workspace/player-client/lenses";
import type { LiveObject } from "@/sdk";
import { composer } from "@/core/chat/composer";

export type LensProps<K extends LensId> = {
  paneId: string;
  /** Parsed with the lens's schema (invalid → defaults); null only for what-if, which has no defaults. */
  params: K extends "what-if" ? LensParams<K> | null : LensParams<K>;
  phase: Phase;
};
export type LensView<K extends LensId> = (props: LensProps<K>) => ReactNode;

/** A lens's empty state: one plain sentence, optionally the one action that fixes it. */
export function LensEmpty({ children, action, testId }: { children: ReactNode; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-start justify-center gap-3 text-sm text-muted-foreground" data-testid={testId}>
      <p className="max-w-[60ch]">{children}</p>
      {action}
    </div>
  );
}

/** A quiet heading inside a lens (not a card). */
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

/** A small text button (secondary actions inside a lens). */
export function TextButton({ children, onClick, disabled, testId, tone, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; testId?: string; tone?: "danger"; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} title={title}
      className={`text-xs underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline ${tone === "danger" ? "text-destructive font-semibold" : "text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

/** The one primary action of a lens (the next step, Send, Summon): --primary is reserved for it. */
export function PrimaryButton({ children, onClick, disabled, testId, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; testId?: string; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId}
      className="inline-flex items-center justify-center gap-2 bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground disabled:pointer-events-none disabled:opacity-35">
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

/** "#3" for every object: its rank by payoff, the same number in every lens and in the chat. */
export function useObjectRanks(objects: readonly LiveObject[]) {
  return useMemo(() => new Map([...objects].sort((a, b) => b.payoff - a.payoff).map((o, i) => [o.id, i + 1])), [objects]);
}
/** Clicking an object puts a reference into the assistant's composer: point, then ask. */
export const referObject = (rank: number | undefined) => { if (rank) composer.fill(`object #${rank}`); };

const PHASE_WORD: Record<Phase, string> = { lobby: "in the lobby", planning: "during planning", running: "while the world runs", paused: "while it is paused", ended: "after the game" };
/** Where a lens has data, in words ("while the world runs, while it is paused"). */
export const phasesText = (lensId: LensId) => LENSES[lensId].phases.map(p => PHASE_WORD[p]).join(", ").replace(/, ([^,]*)$/, " or $1");

/** A lens opened outside its phases: say when it fills, and the next step now. */
export function outOfPhase(lensId: LensId, phase: Phase): string {
  const when = `${LENSES[lensId].title} shows data ${phasesText(lensId)}.`;
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
