/**
 * Parameter drift on the rule card (the coordinator's trial call 18, W3 #723): every `driftSeconds` of world time each
 * seat's rule gets new numbers. The card counts down to the next change and, just after one, says so with the new
 * rule, in words a 12-year-old reads. Pure, so it is unit tested.
 */
import { clock } from "../core/words.ts";

/** Why the numbers changed and what it means, in a 12-year-old's words (playtest round 16). */
export const DRIFT_WHY = "Rules get new numbers now and then, so the best ones keep changing: your points now count by your new rule.";

/** How long a just-changed rule is called out before it is simply your rule. */
export const DRIFT_NOTICE_SECONDS = 30;

/**
 * "Your rule may get new numbers in 1:23.", or null when the room has no drift, there is no world time, or the rule has
 * only one set of numbers it could be dealt (`choices`: its family's dealable parameter sets). "May": a redraw can land
 * on the same numbers, and the server draws only among calibrated ones.
 */
/**
 * `timeScale`: game seconds per wall second (W3 #729): the countdown is in wall seconds. `endsAt`: the world second a
 * fixed-length game ends (null when the end is hidden): no countdown to a chance that comes at or after it.
 */
export function driftWords(driftSeconds: number, worldNow: number | null, choices: number, timeScale = 1, endsAt: number | null = null): string | null {
  if (!(driftSeconds > 0) || worldNow == null || choices < 2) return null;
  const left = driftSeconds - (worldNow % driftSeconds);
  if (endsAt != null && worldNow + left >= endsAt) return null;
  return `Your rule may get new numbers in ${clock(Math.max(1, Math.ceil(left / (timeScale || 1))))}.`;
}

/** Just after a change: "Your rule's numbers just changed (5 s ago). Your rule now: …"; null otherwise. */
export function driftNotice(rule: { drifts: number; driftedAt: number | null; card: string }, worldNow: number | null, timeScale = 1): string | null {
  if (!rule.drifts || rule.driftedAt == null || worldNow == null) return null;
  const ago = (worldNow - rule.driftedAt) / (timeScale || 1);   // wall seconds
  if (ago < 0 || ago > DRIFT_NOTICE_SECONDS) return null;
  return `Your rule's numbers just changed (${Math.round(ago)} s ago). ${DRIFT_WHY} Your rule now: ${rule.card}`;
}
