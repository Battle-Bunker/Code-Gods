/**
 * Mirrormancer's tiers (docs/layered-rules-design.md §5.2; measurements in docs/layered-rules-measurements/mirror-tiers.md).
 *
 * The base is today's Mirrormancer: its rows (or columns) are disjoint units scoring [is a mirror, matching pairs], so
 * it has an exact law and an exact sampler of boards given the base (src/tiers/hybrid.ts).
 *
 * The owner's two ideas, in the nearest forms that are alive on this base:
 *   - "more ys are in exactly 2 symmetries" → `holding`: each different mirror holding exactly two ys;
 *   - "more mirrored subsets (the [2, 3] in [2, 3, 3, 2]) add up to x" → `halves`: each different mirror whose half
 *     adds up to x with two different numbers.
 * "Different" is what keeps them alive: without it `7337/3773/3773/7337` (two digits) tops both.
 *
 * The code reads `lines`, the base's own list of the lines that can be mirrors (rows or columns): the tiered card
 * names it (strategy.ts `mirrorProgram`), the base card does not need to.
 */
import type { GridSpec } from "../_util.ts";
import type { GridTiers, Interaction, TierValue } from "../tiers.ts";
import { MAX_UNIT_FILLINGS } from "../../../tiers/hybrid.ts";

export type MirrorP = { axis: "LR" | "TB" };

/** The gate on 4×4: three of the four lines are mirrors (the measurement file says how it was chosen). */
export const MIRROR_GATE = 3;

const num = (v: TierValue, k: string): number => v[k] as number;
const ONCE = "Mirrors that read the same count only once.";

/** "Each mirror holding exactly two ys": the live cousin of "y in exactly two symmetries". */
export const mirrorsHolding: Interaction = {
  id: "holding", fn: ["mirrorsHolding", "mirrors_holding"],
  label: v => `different mirrors holding exactly two ${num(v, "y")}s`,
  text: (v, _g, points) => `Each mirror that holds exactly two ${num(v, "y")}s scores ${points(1)}. ${ONCE}`,
  consts: v => [["TWICE", num(v, "y")]],
  ts: () => `
    const found = [];
    for (const line of lines) {
      const numbers = line.map(cell => cell.value);
      const read = numbers.join(" ");
      if (read !== [...numbers].reverse().join(" ")) continue; // not a mirror
      const held = numbers.filter(n => n === TWICE).length;
      if (held === 2 && !found.includes(read)) found.push(read);
    }
    return found.length;`,
  py: () => `
    found = set()
    for line in lines:
        numbers = [cell.value for cell in line]
        if numbers != numbers[::-1]:
            continue  # not a mirror
        if numbers.count(TWICE) == 2:
            found.add(tuple(numbers))
    return len(found)`,
  // Relabelling the digits keeps every mirror and turns "two ys" into "two 0s": every y has the same law.
  canonical: () => ({ id: "holding", y: 0 }),
};

/** The whole a line's half and its mirror image make when every number is as big as it can be: 18 on digits. */
const halvesWhole = (g: GridSpec) => Math.floor(g.N / 2) * (g.vmin + g.vmax);

/** "The half of a mirror adds up to x", with two different numbers so no uniform line counts. */
export const mirrorHalves: Interaction = {
  id: "halves", fn: ["mirrorHalves", "mirror_halves"],
  label: v => `different mirrors whose half adds up to ${num(v, "x")}`,
  text: (v, _g, points) => `Fold each mirror in half, like the 2 3 of 2 3 3 2. Each mirror whose half adds up to ${num(v, "x")} `
    + `with two different numbers scores ${points(1)}. ${ONCE}`,
  consts: v => [["HALF_TOTAL", num(v, "x")]],
  ts: () => `
    const found = [];
    for (const line of lines) {
      const numbers = line.map(cell => cell.value);
      const read = numbers.join(" ");
      if (read !== [...numbers].reverse().join(" ")) continue; // not a mirror
      const half = numbers.slice(0, Math.floor(numbers.length / 2));
      let total = 0;
      for (const n of half) total += n;
      const different = half.some(n => n !== half[0]);
      if (total === HALF_TOTAL && different && !found.includes(read)) found.push(read);
    }
    return found.length;`,
  py: () => `
    found = set()
    for line in lines:
        numbers = [cell.value for cell in line]
        if numbers != numbers[::-1]:
            continue  # not a mirror
        half = numbers[:len(numbers) // 2]
        if sum(half) == HALF_TOTAL and len(set(half)) > 1:
            found.add(tuple(numbers))
    return len(found)`,
  // Replacing every digit d by 9 − d keeps every mirror and turns a half of x into a half of 18 − x.
  canonical: (v, g) => ({ id: "halves", x: Math.min(num(v, "x"), halvesWhole(g) - num(v, "x")) }),
};

/**
 * Dealt on 4×4 digits (each passed the liveness check there; test/mirror-tiers.test.ts re-runs it): every y (one
 * table), and x = 7..11 (three tables: 7 ~ 11, 8 ~ 10, 9). At the base's top the four lines are independent mirrors,
 * so a tier's top is exact: n different mirrors qualify, and n·(n−1)·(n−2)·(n−3) of the 10⁸ top boards hold four of
 * them. n = 18 for holding (10.4 bits), 10 for x = 9 (14.3), 8 for x = 7, 8, 10, 11 (15.9). Not dealt: x = 5, 6, 12, 13
 * (n = 6: 18.1 bits, inside the band, but the sampled law reads it anywhere from 16 to 21, so it cannot be certified),
 * x = 3, 4, 14, 15 (n = 4: 22 bits, above the cap) and x ≤ 2, x ≥ 16 (n = 2: a two-digit board tops them).
 */
const MIRROR_DEALT: readonly TierValue[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(y => ({ id: "holding", y })),
  ...[7, 8, 9, 10, 11].map(x => ({ id: "halves", x })),
];

export const mirrorTiers: GridTiers<MirrorP> = {
  interactions: [mirrorsHolding, mirrorHalves],
  gate: () => MIRROR_GATE,
  gateText: gate => `${gate} mirrors`,
  dealt: g => (g.N === 4 && g.base === 10 ? MIRROR_DEALT : []),
  // One unit per line; none where a line has too many fillings to list (6 cells of digits).
  base: (p, g) => (g.S ** g.N > MAX_UNIT_FILLINGS ? null : {
    id: "mirrormancer-lines@1", symbols: g.S, cells: g.N * g.N, arity: 2,
    units: Array.from({ length: g.N }, (_, i) => Array.from({ length: g.N }, (_, j) => (p.axis === "LR" ? i * g.N + j : j * g.N + i))),
    score: line => {
      const half = Math.floor(line.length / 2);
      let matches = 0;
      for (let i = 0; i < half; i++) if (g.value[line[i]] === g.value[line[line.length - 1 - i]]) matches += 1;
      return [matches === half ? 1 : 0, matches];
    },
  }),
};
