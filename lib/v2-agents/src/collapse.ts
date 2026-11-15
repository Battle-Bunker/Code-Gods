/**
 * The standing collapse check's thresholds and verdicts (docs/engine-v2/landscape-analysis.md §4), kept apart from the
 * measuring (scripts/collapse-check.ts) so they can be read and tested on their own. The thresholds are starting points
 * for the owner to set. Analysis only: nothing here changes game behaviour.
 */

/** Single-rule ramps (information since 14 November; was test 1): a rule ramps when its top lies at the window's edge, grows from W to 2W, and its tail tracks read length. */
export const RAMP = Object.freeze({
  /** The top is "at the edge" when reaching it costs more than this share of the window's energy. */
  edgeShare: 0.9,
  /** The top grows by more than this from W to 2W. */
  growth: 0.1,
  /** Tail (states worth at least tailBits) correlation of bits with read length above this. */
  corr: 0.9,
  tailBits: 10,
});
/**
 * Test 1 (since 14 November 2026, owner decision 30: unbounded hills are wanted; collapse is prevented by adversaries
 * and diversity of goals): no direction along which a basic strategy raises several seated rules' bits together
 * without an adversary at the table. A direction is one call repeated (`repeats` times; a single call is its first
 * step). Along it, from a start state, rules "rise together" when at least two seated rules gain at least `rise` bits by
 * the midpoint of the repeats and gain more by the end; an adversary is another seated rule whose bits fall by at least
 * `adversary` × the smaller of those gains. A table fails when some direction raises rules together without an
 * adversary from at least `starts` of the start states. Single-rule ramps (RAMP) are reported as information.
 */
export const TOGETHER = Object.freeze({ repeats: 8, rise: 2, adversary: 0.5, starts: 0.25 });
/** Along one path from one start: did ≥ 2 rules rise together, and did another fall comparably (an adversary)? */
export function riseTogether(start: readonly number[], mid: readonly number[], end: readonly number[]): { together: boolean; adversary: boolean } {
  const gainMid = mid.map((x, i) => x - start[i]!), gainEnd = end.map((x, i) => x - start[i]!);
  const rising = start.map((_, i) => i).filter(i => gainMid[i]! >= TOGETHER.rise && gainEnd[i]! > gainMid[i]!);
  if (rising.length < 2) return { together: false, adversary: false };
  const least = Math.min(...rising.map(i => gainEnd[i]!));
  const adversary = start.some((_, i) => !rising.includes(i) && -gainEnd[i]! >= TOGETHER.adversary * least);
  return { together: true, adversary };
}
/** A table fails test 1 when a direction raises rules together, unopposed, from at least TOGETHER.starts of the starts. */
export const togetherFails = (unopposedStarts: number, starts: number): boolean => starts > 0 && unopposedStarts >= TOGETHER.starts * starts;

/**
 * Test 2, no cheap optimum: searches of B evaluations with full rule knowledge, against the best state known (theirs and a
 * reference search's). One search is a coin toss near any threshold (two-line-systems.md §10: the verdict flipped
 * between runs), so the statistic is a hit rate (the coordinator, 15 Nov): a table is cheap when at least `hitShare` of
 * `searches` independent searches reach `reach` of the best known; the variant fails when more than `tablesShare` of its
 * tables are cheap.
 */
export const CHEAP = Object.freeze({
  /** B, one search's evaluations. */
  evals: 100_000,
  /** Independent searches per table. */
  searches: 12,
  /** A search hits when it reaches this share of the best known. */
  reach: 0.95,
  /** The table is cheap when at least this share of its searches hit. */
  hitShare: 0.5,
  /** The variant fails when more than this share of its tables are cheap. */
  tablesShare: 0.25,
});
/** Test 3, no single answer: the best N distinct states keep less than `keep` of N × the best, or are not one closed form. */
export const SINGLE = Object.freeze({ n: 24, keep: 0.7 });
/** Test 4, no convergence in play (over the last `window` seconds of a game). */
/**
 * Test 4, dynamics (thresholds set by the coordinator, 14 November 2026). Idle acts by plain starters are information,
 * not failure. The variant fails when any of these holds:
 *   (a) in the last `lastSeconds` of play, fewer than `movingPerMinute` of the objects change a minute under the plain
 *       starters;
 *   (b) a climber that also uses the representation shortcuts (stretch, pivot, mirror, fractional amounts) finds no
 *       improving move on more than `frozenShare` of the objects at the end;
 *   (c) the table's gains from play stop rising before the midpoint for every climber: after it they add no more than
 *       `stallShare` of the game's gains.
 */
export const DYNAMICS = Object.freeze({ lastSeconds: 60, movingPerMinute: 0.25, frozenShare: 0.5, stallShare: 0.02 });
/**
 * Test 5, disclosure: median probes until the others' rules are identified must exceed `floor`, with the others' sums
 * blurred as the server blurs them (`sigma` bits of keyed Gaussian noise per state; convex/v2/disclose.ts, #608).
 */
export const DISCLOSE = Object.freeze({ floor: 200, sigma: 8 });

export const rampFails = (m: { topCostShare: number; growth: number; corr: number }): boolean =>
  m.topCostShare > RAMP.edgeShare && m.growth > RAMP.growth && m.corr > RAMP.corr;
/** Whether a table is cheap: `hits` of `searches` searches reached CHEAP.reach of the best known. */
export const tableCheap = (hits: number, searches: number): boolean => hits >= CHEAP.hitShare * searches;
export const cheapFails = (failedTables: number, tables: number): boolean => tables > 0 && failedTables > CHEAP.tablesShare * tables;
export const singleFails = (m: { keep: number; closedForm: boolean }): boolean => m.keep >= SINGLE.keep && m.closedForm;
/** Has the table stopped gaining? Gains after the midpoint are at most stallShare of the whole game's. */
export const stalled = (m: { gainedByMid: number; gainedByEnd: number }): boolean =>
  m.gainedByEnd - m.gainedByMid <= DYNAMICS.stallShare * Math.max(Math.abs(m.gainedByEnd), 1);
/** Which of (a), (b), (c) fail; the test fails when any does. */
export function dynamicsFailures(m: { movingPerMinute: number; frozenShare: number; stalledEvery: boolean }): string[] {
  const out: string[] = [];
  if (m.movingPerMinute < DYNAMICS.movingPerMinute) out.push("a");
  if (m.frozenShare > DYNAMICS.frozenShare) out.push("b");
  if (m.stalledEvery) out.push("c");
  return out;
}
export const discloseFails = (medianProbes: number): boolean => !(medianProbes > DISCLOSE.floor);

/**
 * Do the best states all lie in one short closed form, one coordinate sieve? Here: there is a free coordinate, and every
 * other coordinate takes at most `classes` absolute values over the states (line-z's "m = ±1 or ±2, c a prime"; a
 * grid's "this board, one cell free, the rest each one of two digits").
 */
export function oneClosedForm(states: readonly (readonly number[])[], classes = 2): boolean {
  if (states.length < 2) return true;
  const dims = states[0]!.length;
  for (let free = 0; free < dims; free++) {
    let ok = true;
    for (let d = 0; d < dims && ok; d++) if (d !== free && new Set(states.map(s => Math.abs(s[d]!))).size > classes) ok = false;
    if (ok) return true;
  }
  return false;
}

export type Verdict = "PASS" | "FAIL" | "skip";
/** The final line: how many tests failed over every variant × β row. */
export function failureCount(rows: readonly { readonly verdicts: Readonly<Record<string, Verdict>> }[]): number {
  return rows.reduce((t, r) => t + Object.values(r.verdicts).filter(v => v === "FAIL").length, 0);
}
