/**
 * The locks' words (docs/engine-v2/locks.md; the owner, 16 November): a lock is a predicate program on one object,
 * funded with energy that drains in proportion to the program's complexity. Pure; no React.
 */
import { num } from "../core/words.ts";

const TITLE_MAX = 60;

/** A lock's one-line description: the author's name for it, else its program's first comment. */
export function lockTitle(l: { title?: string | null; language: string; source: string }): string {
  const named = l.title?.trim();
  if (named) return named.slice(0, TITLE_MAX);
  const mark = l.language === "python" ? "#" : "//";
  for (const raw of l.source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(mark)) {
      const t = line.slice(mark.length).trim();
      if (t) return t.slice(0, TITLE_MAX);
      continue;
    }
    break;
  }
  return "a lock with no description";
}

/** Roughly how long a lock lasts at its drain (energy a second). */
export function lastsText(energy: number, drainPerSecond: number): string {
  if (energy <= 0) return "drained";
  if (drainPerSecond <= 0) return "does not drain";
  const s = energy / drainPerSecond;
  if (s < 10) return "a few seconds";
  if (s < 60) return `about ${Math.round(s)} seconds`;
  const m = Math.round(s / 60);
  return `about ${m} minute${m === 1 ? "" : "s"}`;
}

/** The warning shown while a move is being composed, before any press. */
export function breakLine(broken: readonly { title: string; removeCost: number }[]): string | null {
  if (!broken.length) return null;
  const cost = broken.reduce((a, b) => a + b.removeCost, 0);
  if (broken.length === 1) return `This change breaks the lock “${broken[0]!.title}”: removing it costs ${num(cost)} energy.`;
  return `This change breaks ${broken.length} locks (${broken.map(b => `“${b.title}”`).join(", ")}): removing them costs ${num(cost)} energy.`;
}

/** Adding (amount > 0) or taking away (amount < 0) energy from a lock, priced before the press. Both are paid. */
export function fundLine(o: { amount: number; lockEnergy: number; myEnergy: number }): { ok: boolean; text: string } {
  const a = Math.abs(o.amount);
  if (!a) return { ok: false, text: "Pick an amount." };
  if (o.amount < 0 && a > o.lockEnergy) return { ok: false, text: `The lock holds ${num(o.lockEnergy)} energy.` };
  if (a > o.myEnergy) return { ok: false, text: `You have ${num(o.myEnergy)} energy.` };
  const keep = num(o.myEnergy - a);
  return o.amount > 0
    ? { ok: true, text: `Add ${num(a)} energy: you keep ${keep}, the lock holds ${num(o.lockEnergy + a)}.` }
    : { ok: true, text: `Take ${num(a)} energy away: it costs you ${num(a)} (you keep ${keep}), the lock holds ${num(o.lockEnergy - a)}.` };
}
