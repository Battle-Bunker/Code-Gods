/**
 * Which line rules must not be seated together (the coordinator's call, 15 Nov, on Prime Landing's trial; the grids'
 * rule is lib/v2-grid seating.ts). Two seated rules that reward the same number in the same direction, with nothing in
 * tension, are the 14 November failure (two rules raised by one move).
 *
 * Prime Landing and Whole Crossing read the same number, where the line crosses the x-axis. Whole Crossing wants it on
 * 5^j × t with t leaving r when divided by 5 (level j, the higher the better); Prime Landing (ending k, side s) wants it
 * to round to s·p for a prime p ending in k, so on Prime Landing's rungs X ≡ s·k (mod 5), on Whole Crossing's ground
 * level when r ≡ s·k. Then every rung of the one holds the other's ground level and climbing it keeps it there: an
 * aligned pair, forbidden. When r ≢ s·k a rung is off Whole Crossing's ladder; and its levels above 0 (multiples of
 * 5) are never Prime Landing's rungs, so the two climbs pull the landing apart.
 *
 * Ruler and Pythagorean Area (each dealt a prime ending k) read one number on a 45° line: y = ±x + c is c/√2 from (0, 0),
 * so its distance² is c²/2, the area of the triangle it cuts off the axes. With one ending every such line on the one's
 * rung is on the other's, and a shift climbs both: an aligned pair, forbidden. With two endings the number rounds down to
 * one prime only, so on those lines each excludes the other.
 *
 * Square Area with one ending, rounded down and rounded to the nearest: every exact square (y = −2x + 2r has area r²) is a rung of
 * both, and a shift climbs both: an aligned pair, forbidden.
 */
/** A seated rule as the seating rule reads it: its family and, where known, its dealt parameters. */
export interface SeatedRule { readonly family: string; readonly params?: unknown }

const mod5 = (x: number) => ((x % 5) + 5) % 5;
/** Whether a Prime Landing rule and a Whole Crossing rule reward the same landings (see the header). */
function landingAligned(landing: unknown, crossing: unknown): boolean {
  const l = landing as { ends?: number; side?: number } | undefined, c = crossing as { q?: number; r?: number } | undefined;
  if (l?.ends === undefined || c?.r === undefined || c.q !== 5) return false;
  return mod5((l.side ?? 1) * l.ends) === mod5(c.r);
}

/** Whether a Ruler rule and a Pythagorean Area rule have one ending (see the header). */
function sameEnding(x: unknown, y: unknown): boolean {
  const e = (r: unknown) => (r as { ends?: number } | undefined)?.ends;
  return e(x) !== undefined && e(x) === e(y);
}

/** Whether two seated line rules are a forbidden pair. */
export function lineClash(a: SeatedRule, b: SeatedRule): boolean {
  if (a.family === "prime-landing" && b.family === "whole-crossing") return landingAligned(a.params, b.params);
  if (b.family === "prime-landing" && a.family === "whole-crossing") return landingAligned(b.params, a.params);
  const pair = new Set([a.family, b.family]);
  if (pair.has("ruler") && pair.has("pythagorean-area") && a.family !== b.family) return sameEnding(a.params, b.params);
  if (a.family === "square-area" && b.family === "square-area") {
    const x = a.params as { ends?: number; round?: string } | undefined, y = b.params as { ends?: number; round?: string } | undefined;
    return x?.ends !== undefined && x.ends === y?.ends && (x.round ?? "down") !== (y?.round ?? "down");
  }
  return false;
}

const say = (r: SeatedRule) => `${r.family} ${JSON.stringify(r.params ?? {})}`;
/** The forbidden pairs among seated line rules, each said once ("a + b"). */
export function lineClashes(rules: readonly SeatedRule[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
    if (lineClash(rules[i]!, rules[j]!)) out.push(`${say(rules[i]!)} + ${say(rules[j]!)}`);
  }
  return out;
}
/** A table's seating cost: 1000 per forbidden pair (the grids' scale; lines have no aligned-but-allowed pairs yet). */
export const lineSeatingCost = (rules: readonly SeatedRule[]): number => 1000 * lineClashes(rules).length;
