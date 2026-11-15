/**
 * Which grid families must not be seated together (the coordinator's call, following owner decision 39; grids.md
 * §6.5). The PMI matrix of the dealt rules (lib/v2-valuation pmi-cli.ts) splits the families by digit size: the
 * families in one cluster align strongly (their joint rarity is far below the sum of their bits), and the two digit
 * clusters are strongly anti-aligned with each other (PMI below about −2 bits).
 *
 * Fairness between seats comes first (the coordinator's call 19, correcting call (c)): a big-digit rule seated against a
 * small-digit rule scored 2–4× less than its partners with starters, so that pair is forbidden. Also forbidden: one family
 * twice (they share their main part), Magic Eighteen with Magic Accountant (the same main part on rows of 18), and the
 * blocked pairs. Two families of one cluster are allowed but avoided: among the deals without a forbidden pair, the
 * dealer takes one with the fewest aligned pairs.
 */
export const GRID_CLUSTERS: readonly (readonly string[])[] = [
  // Big or varied digits (Magic Accountant on rows of 18 is the same main part as Magic Eighteen).
  ["magic-eighteen", "opposite-nines", "strangers", "magic-accountant"],
  // Small or equal digits.
  ["mirrormancer", "two-pair", "spread-of-three", "leapfrog"],
  // Monotone runs.
  ["uphill", "staircase", "mountain-climb"],
];

/**
 * Pairs from different clusters that are blocked all the same: annealing on today's pool reached both exact tops of
 * Opposite Nines and Staircase at once (37 and 38 bits), an optimum found (the coordinator's call).
 */
export const GRID_BLOCKED_PAIRS: readonly (readonly [string, string])[] = [["opposite-nines", "staircase"]];

/** Clusters that must not meet at a table (strongly anti-aligned): big digits against small digits. */
export const GRID_ANTI_ALIGNED: readonly (readonly [number, number])[] = [[0, 1]];

const clusterOf = (f: string) => GRID_CLUSTERS.findIndex(c => c.includes(f));
const isPair = (pairs: readonly (readonly [string, string])[], a: string, b: string) => pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const SAME_MAIN: readonly (readonly [string, string])[] = [["magic-eighteen", "magic-accountant"]];

/** Whether two seated grid families must not meet: one family twice, the same main part, anti-aligned clusters, or a blocked pair. */
export function gridClash(a: string, b: string): boolean {
  if (a === b || isPair(SAME_MAIN, a, b) || isPair(GRID_BLOCKED_PAIRS, a, b)) return true;
  const ca = clusterOf(a), cb = clusterOf(b);
  return ca >= 0 && cb >= 0 && GRID_ANTI_ALIGNED.some(([x, y]) => (x === ca && y === cb) || (x === cb && y === ca));
}
/** Whether two different seated grid families of one cluster align (allowed, but the dealer avoids it). */
export const gridAligned = (a: string, b: string): boolean => !gridClash(a, b) && clusterOf(a) >= 0 && clusterOf(a) === clusterOf(b);

const pairsOf = (families: readonly string[], test: (a: string, b: string) => boolean): string[] => {
  const out: string[] = [];
  for (let i = 0; i < families.length; i++) for (let j = i + 1; j < families.length; j++) if (test(families[i]!, families[j]!)) out.push(`${families[i]} × ${families[j]}`);
  return out;
};
/** The forbidden pairs among seated families, as "a × b" (each pair once, in seat order). */
export const gridClashes = (families: readonly string[]): string[] => pairsOf(families, gridClash);
/** The aligned (allowed but avoided) pairs among seated families. */
export const gridAlignedPairs = (families: readonly string[]): string[] => pairsOf(families, gridAligned);
/** A table's seating cost: forbidden pairs first, then aligned ones (lower is better; 0 is a perfect table). */
export const gridSeatingCost = (families: readonly string[]): number => 1000 * gridClashes(families).length + gridAlignedPairs(families).length;
