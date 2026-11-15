/**
 * Which grid families must not be seated together (the coordinator's call, following owner decision 39; grids.md
 * §6.5). The PMI matrix of the dealt rules (lib/v2-valuation pmi-cli.ts) splits the families by digit size: the
 * families in one cluster align strongly (their joint rarity is far below the sum of their bits), so a table seats at
 * most one family from each. Two rules of one family share their main part, the strongest alignment of all, so a
 * family clashes with itself too.
 */
export const GRID_CLUSTERS: readonly (readonly string[])[] = [
  // Big or varied digits (Magic Accountant on rows of 18 is the same main part as Magic Eighteen).
  ["magic-eighteen", "opposite-nines", "strangers", "magic-accountant"],
  // Small or equal digits.
  ["mirrormancer", "two-pair", "spread-of-three", "leapfrog"],
  // Monotone runs.
  ["uphill", "staircase", "mountain-climb"],
];

/** Whether two seated grid families clash: the same family twice, or two of one cluster. */
export const gridClash = (a: string, b: string): boolean => a === b || GRID_CLUSTERS.some(c => c.includes(a) && c.includes(b));

/** The clashing pairs among seated families, as "a × b" (each pair once, in seat order). */
export function gridClashes(families: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < families.length; i++) for (let j = i + 1; j < families.length; j++) if (gridClash(families[i]!, families[j]!)) out.push(`${families[i]} × ${families[j]}`);
  return out;
}
