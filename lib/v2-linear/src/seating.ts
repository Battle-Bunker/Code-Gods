/**
 * Which line rules must not be seated together (the coordinator's call, 15 Nov, on Prime Landing's trial; the grids'
 * rule is lib/v2-grid seating.ts). Two seated rules that reward the same number in the same direction, with nothing in
 * tension, are the 14 November failure (two rules raised by one move).
 *
 * Prime Landing and Whole Crossing read the same number, where the line crosses the x-axis. Whole Crossing wants it
 * near a whole number leaving r when divided by 5; Prime Landing (ending k, side s) wants it to round to s·p for a prime
 * p ending in k, so on Prime Landing's rungs X ≡ s·k (mod 5). When r ≡ s·k (mod 5), every rung of the one is exact for
 * the other and climbing it keeps the other exact: an aligned pair, forbidden. When r ≢ s·k they pull the landing
 * apart (a rung is never exact for Whole Crossing), which is the tension the pool wants.
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

/** Whether two seated line rules are a forbidden pair. */
export function lineClash(a: SeatedRule, b: SeatedRule): boolean {
  if (a.family === "prime-landing" && b.family === "whole-crossing") return landingAligned(a.params, b.params);
  if (b.family === "prime-landing" && a.family === "whole-crossing") return landingAligned(b.params, a.params);
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
