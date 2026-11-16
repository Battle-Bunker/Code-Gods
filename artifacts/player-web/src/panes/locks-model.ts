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
  if (!o.amount) return { ok: false, text: "Pick an amount." };
  // Taking more than the lock holds takes all of it (the server clips a drain to what is left).
  const all = o.amount < 0 && -o.amount >= o.lockEnergy, a = all ? o.lockEnergy : Math.abs(o.amount);
  if (a > o.myEnergy) return { ok: false, text: `You have ${num(o.myEnergy)} energy.` };
  const keep = num(o.myEnergy - a);
  return o.amount > 0
    ? { ok: true, text: `Add ${num(a)} energy: you keep ${keep}, the lock holds ${num(o.lockEnergy + a)}.` }
    : all ? { ok: true, text: `Take all ${num(a)} energy away: it costs you ${num(a)} (you keep ${keep}), and the lock ends.` }
    : { ok: true, text: `Take ${num(a)} energy away: it costs you ${num(a)} (you keep ${keep}), the lock holds ${num(o.lockEnergy - a)}.` };
}

/**
 * Costly signalling (the owner, 16 November): what went into a lock and how much of it was the viewer's, so a player can
 * tell whether the others put in more than they did. Only totals: who put in the rest is not shown while the game runs.
 */
export function shareLine(l: { added: number; taken: number; mine: { added: number; taken: number } }): string {
  const e = (x: number) => (Number.isInteger(x) ? String(x) : num(x));
  const others = l.added - l.mine.added;
  const head = l.mine.added <= 0 ? `${e(l.added)} energy went in, none of it yours`
    : others <= 1e-9 ? `${e(l.added)} energy went in, all of it yours`
    : `${e(l.added)} energy went in, ${e(l.mine.added)} of it yours: the others put in ${e(others)}`;
  return `${head}${l.taken > 0 ? `; ${e(l.taken)} was taken out` : ""}.`;
}
