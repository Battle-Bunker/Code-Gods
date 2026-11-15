/**
 * Parameter drift on the rule card (the coordinator's trials 18 and 20; W3 #723, #745): each seat's rule gets new
 * numbers at its own times (staggered round the table, none in a fixed game's last 90 s: v2-core `nextDriftAt`). The
 * card counts down to the seat's next redraw and, just after one, says what changed and what it means, in words a
 * 12-year-old reads. Pure, so it is unit tested.
 */
import { clock } from "../core/words.ts";

/** What a redraw means, in a 12-year-old's words (playtest round 16). */
export const DRIFT_MEANS = "Your points are now counted by the new rule, so they may drop for a while; your agents now climb toward it.";

/** How long a just-changed rule is called out before it is simply your rule. */
export const DRIFT_NOTICE_SECONDS = 30;

/**
 * "Your rule may get new numbers in 1:23.", or null when no redraw is left (`nextAt` null), there is no world time, or
 * the rule has only one set of numbers it could be dealt (`choices`). "May": a redraw can land on the same numbers.
 * `timeScale`: game seconds per wall second (W3 #729): the countdown is in wall seconds.
 */
export function driftWords(nextAt: number | null, worldNow: number | null, choices: number, timeScale = 1): string | null {
  if (nextAt == null || worldNow == null || choices < 2) return null;
  const left = (nextAt - worldNow) / (timeScale || 1);
  return `Your rule may get new numbers in ${clock(Math.max(1, Math.ceil(left)))}.`;
}

const numeric = (x: unknown): string | null =>
  typeof x === "number" ? String(x) : typeof x === "string" && /^-?\d+(\/\d+|\.\d+)?$/.test(x) ? x : null;

/** The one number that moved between two parameter sets ("−37" → "37"), or null when it is not exactly one. */
export function targetChange(before: unknown, after: unknown): { from: string; to: string } | null {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return null;
  const b = before as Record<string, unknown>, a = after as Record<string, unknown>;
  const moved = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (moved.length !== 1) return null;
  const from = numeric(b[moved[0]!]), to = numeric(a[moved[0]!]);
  return from && to ? { from: from.replace(/^-/, "−"), to: to.replace(/^-/, "−") } : null;
}

/** Just after a change: what happened (the target's old and new value when known), what it means, the new rule. */
export function driftNotice(rule: { drifts: number; driftedAt: number | null; card: string }, worldNow: number | null,
  change: { from: string; to: string } | null, timeScale = 1): string | null {
  if (!rule.drifts || rule.driftedAt == null || worldNow == null) return null;
  const ago = (worldNow - rule.driftedAt) / (timeScale || 1);   // wall seconds
  if (ago < 0 || ago > DRIFT_NOTICE_SECONDS) return null;
  const what = change ? `Your rule's target changed from ${change.from} to ${change.to}` : "Your rule's numbers just changed";
  return `${what} (${Math.round(ago)} s ago). ${DRIFT_MEANS} Your rule now: ${rule.card}`;
}

/** How many sets of numbers a redraw could deal this rule: none for a ladder family, which keeps its own (W3 #799). */
export const redrawChoices = (row: { keepsParams?: boolean }, dealable: number): number => (row.keepsParams ? 0 : dealable);
