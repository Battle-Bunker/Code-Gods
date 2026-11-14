/**
 * The standing collapse check's thresholds and verdicts (docs/engine-v2/landscape-analysis.md §4), kept apart from the
 * measuring (scripts/collapse-check.ts) so they can be read and tested on their own. The thresholds are starting points
 * for the owner to set. Analysis only: nothing here changes game behaviour.
 */

/** Test 1, no ramp: a rule fails when its top lies at the window's edge, grows from W to 2W, and its tail tracks read length. */
export const RAMP = Object.freeze({
  /** The top is "at the edge" when reaching it costs more than this share of the window's energy. */
  edgeShare: 0.9,
  /** The top grows by more than this from W to 2W. */
  growth: 0.1,
  /** Tail (states worth at least tailBits) correlation of bits with read length above this. */
  corr: 0.9,
  tailBits: 10,
});
/** Test 2, no cheap optimum: a B-evaluation search with full rule knowledge against a reference search. */
export const CHEAP = Object.freeze({
  /** B, the searcher's evaluations. */
  evals: 100_000,
  /** The table fails when the B-search reaches this share of the reference. */
  reach: 0.95,
  /** The variant fails when more than this share of its tables fail. */
  tablesShare: 0.25,
});
/** Test 3, no single answer: the best N distinct states keep less than `keep` of N × the best, or are not one closed form. */
export const SINGLE = Object.freeze({ n: 24, keep: 0.7 });
/** Test 4, no convergence in play (over the last `window` seconds of a game). */
export const CONVERGE = Object.freeze({ window: 100, familyShare: 0.5, movingPerMinute: 0.1 });
/** Test 5, disclosure: median probes until the others' rules are identified must exceed this floor. */
export const DISCLOSE = Object.freeze({ floor: 200 });

export const rampFails = (m: { topCostShare: number; growth: number; corr: number }): boolean =>
  m.topCostShare > RAMP.edgeShare && m.growth > RAMP.growth && m.corr > RAMP.corr;
export const tableCheap = (searched: number, reference: number): boolean => reference <= 0 || searched >= CHEAP.reach * reference;
export const cheapFails = (failedTables: number, tables: number): boolean => tables > 0 && failedTables > CHEAP.tablesShare * tables;
export const singleFails = (m: { keep: number; closedForm: boolean }): boolean => m.keep >= SINGLE.keep && m.closedForm;
export const convergeFails = (m: { familyShare: number; movingPerMinute: number }): boolean =>
  m.familyShare > CONVERGE.familyShare || m.movingPerMinute < CONVERGE.movingPerMinute;
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
