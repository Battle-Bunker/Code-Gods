/**
 * ✌️ Two Pair's tiers (docs/layered-rules-design.md §5.4; measurements in docs/layered-rules-measurements/two-pair.md,
 * scripts/tier-sweep.ts and scripts/two-pair-exact.ts).
 *
 * The base is Two Pair as shipped: the 2×2 boxes are disjoint units scoring [two different pairs, one pair], so it has
 * an exact law and an exact sampler of boards given the base (src/tiers/hybrid.ts).
 *
 * The interactions tie the boxes to each other, which the base never does:
 *   - `links`: two boxes that share a border are linked when exactly one number is a pair in both (3 3 8 8 beside
 *     3 3 5 5). The four corner boxes form a ring of four possible links. A board of two numbers has no link at all
 *     (its boxes share both pairs), so the tier breaks the base's degenerate top instead of keeping it;
 *   - `linkSums`: each link whose eight numbers add up to x (the wide-ranged one: x folds with 72 − x on digits);
 *   - `linksVia`: each link whose shared number is y (every y is one class: relabel the digits);
 *   - `equalRoads`: equal numbers that touch side by side make a road; each road of exactly y cells (pairs lined up
 *     across box borders).
 * Which are dealt, and with which values, is decided by measurement; the ones never dealt stay so the sweep can
 * reproduce the numbers that rejected them.
 */
import type { GridSpec } from "../_util.ts";
import type { GridTiers, Interaction, TierValue } from "../tiers.ts";

const num = (v: TierValue, k: string): number => v[k] as number;

const LINK = "Two boxes that share a border are linked when exactly one number is a pair in both, like 3 3 8 8 beside 3 3 5 5.";

/** The shared helpers: a box's cells from its top-left cell, and the numbers it shows exactly twice. */
const BOX_TS = `
    const boxAt = (cell) => [cell, cell.right, cell.down, cell.down.right];
    const pairsIn = (box) => {
      const pairs = [];
      for (const cell of box) {
        const same = box.filter(other => other.value === cell.value).length;
        if (same === 2 && !pairs.includes(cell.value)) pairs.push(cell.value);
      }
      return pairs;
    };`;
const BOX_PY = `
    def box_at(cell):
        return [cell, cell.right, cell.down, cell.down.right]
    def pairs_in(box):
        numbers = [cell.value for cell in box]
        return set(n for n in numbers if numbers.count(n) == 2)`;

interface LinkKind {
  readonly label: Interaction["label"];
  readonly text: (v: TierValue, points: (n: number | string) => string) => string;
  readonly consts: Interaction["consts"];
  /** One more condition on a link, appended to the test (over mine, next / nxt, shared). */
  readonly ts: string;
  readonly py: string;
  readonly canonical?: Interaction["canonical"];
}
const linksOf = (id: string, fn: readonly [string, string], kind: LinkKind): Interaction => ({
  id, fn, label: kind.label,
  text: (v, _g, points) => `${LINK} ${kind.text(v, points)}`,
  consts: kind.consts, ...(kind.canonical ? { canonical: kind.canonical } : {}),
  ts: () => `${BOX_TS}
    let links = 0;
    for (const cell of grid.cells) {
      if (cell.row % 2 === 1 || cell.col % 2 === 1) continue;
      const mine = boxAt(cell);
      for (const corner of [cell.right.right, cell.down.down]) { // the box to the right, then the box below
        if (!corner) continue;
        const next = boxAt(corner);
        const shared = pairsIn(mine).filter(n => pairsIn(next).includes(n));
        if (shared.length === 1${kind.ts}) links += 1;
      }
    }
    return links;`,
  py: () => `${BOX_PY}
    links = 0
    for cell in grid.cells:
        if cell.row % 2 == 1 or cell.col % 2 == 1:
            continue
        mine = box_at(cell)
        for corner in [cell.right.right, cell.down.down]:  # the box to the right, then the box below
            if corner is None:
                continue
            nxt = box_at(corner)
            shared = pairs_in(mine) & pairs_in(nxt)
            if len(shared) == 1${kind.py}:
                links += 1
    return links`,
});

/** Every link. */
export const pairLinks = linksOf("links", ["linkedBoxes", "linked_boxes"], {
  label: () => "linked boxes",
  text: (_v, points) => `Each link scores ${points(1)}.`,
  consts: () => [], ts: "", py: "",
});
/** Links whose eight numbers add up to x. */
export const pairLinkSums = linksOf("linkSums", ["linkTotals", "link_totals"], {
  label: v => `linked boxes that add up to ${num(v, "x")}`,
  text: (v, points) => `Each link whose two boxes add up to ${num(v, "x")} together scores ${points(1)}.`,
  consts: v => [["LINK_TOTAL", num(v, "x")]],
  ts: " && [...mine, ...next].reduce((total, c) => total + c.value, 0) === LINK_TOTAL",
  py: " and sum(c.value for c in mine + nxt) == LINK_TOTAL",
  // Replacing every digit d by 9 − d keeps every pair and every link, and turns a total of x into 8·9 − x.
  canonical: (v, g) => ({ id: "linkSums", x: Math.min(num(v, "x"), 8 * g.vmax - num(v, "x")) }),
});
/** Links whose shared number is y. */
export const pairLinksVia = linksOf("linksVia", ["linksThrough", "links_through"], {
  label: v => `boxes linked by a pair of ${num(v, "y")}s`,
  text: (v, points) => `Each link whose shared number is ${num(v, "y")} scores ${points(1)}.`,
  consts: v => [["LINK_NUMBER", num(v, "y")]],
  ts: " && shared[0] === LINK_NUMBER",
  py: " and LINK_NUMBER in shared",
  // Swapping two digits everywhere keeps every pair and every link: all ys share one table.
  canonical: () => ({ id: "linksVia", y: 0 }),
});

/** Roads of equal numbers of exactly y cells, anywhere on the board. */
export const equalRoads: Interaction = {
  id: "equalRoads", fn: ["equalRoads", "equal_roads"],
  label: v => `roads of exactly ${num(v, "y")} equal numbers`,
  text: (v, _g, points) => `Equal numbers that touch side by side make a road. Each road of exactly ${num(v, "y")} cells scores ${points(1)}.`,
  consts: v => [["ROAD_LENGTH", num(v, "y")]],
  ts: () => `
    const roads = grid.regions((a, b) => a.value === b.value);
    let hits = 0;
    for (const road of roads) {
      if (road.length === ROAD_LENGTH) hits += 1;
    }
    return hits;`,
  py: () => `
    roads = grid.regions(lambda a, b: a.value == b.value)
    hits = 0
    for road in roads:
        if len(road) == ROAD_LENGTH:
            hits += 1
    return hits`,
};

export const PAIR_INTERACTIONS: readonly Interaction[] = [pairLinks, pairLinkSums, pairLinksVia, equalRoads];

/**
 * Dealt on 4×4 digits (docs/layered-rules-measurements/two-pair.md). At the base's top a link depends only on which two
 * numbers each box holds, so the link tiers' tops are exact counts (scripts/two-pair-exact.ts); the hybrid law through
 * the card agrees within a bit (scripts/tier-sweep.ts), and test/two-pair-tiers.test.ts re-runs the liveness check.
 *   - linkSums: every even x from 14 to 58 (12 tables: x ~ 72 − x) adds 15.4 to 17.1 bits. Odd totals are dead (a
 *     link's eight numbers are 4a + 2b + 2c); x = 8, 10, 12 (and 60, 62, 64) add 18.0 to 19.0, inside the band but too
 *     close to the cap for a sampled law to certify; x = 6 and 66 add 21.0.
 *   - linksVia: every y (one table) adds 9.96 bits.
 *   - equalRoads: y = 3 (four roads, 14.5 bits) and y = 5 (two roads, 16.5). y = 1 and y = 4 are topped by a two-number
 *     board (a checkerboard, stripes); y = 2 adds 3.4 bits; y = 6 adds 19.1 (too close to the cap); y = 7 and 8 allow
 *     one road only (a cliff, not a count).
 * Lab: plain links add 5.72 bits, just under the band.
 */
const PAIR_DEALT: readonly TierValue[] = [
  ...Array.from({ length: 23 }, (_, i) => ({ id: "linkSums", x: 14 + 2 * i })),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(y => ({ id: "linksVia", y })),
  { id: "equalRoads", y: 3 }, { id: "equalRoads", y: 5 },
];
const PAIR_LAB: readonly TierValue[] = [{ id: "links" }];

export const pairTiers: GridTiers<Record<string, never>> = {
  interactions: PAIR_INTERACTIONS,
  // The base's greedy ten-move level (scripts/tier-sweep.ts two_pair --gate): every box, on 400 of 400 starts.
  gate: g => (g.N / 2) ** 2,
  gateText: gate => `${gate} boxes with two different pairs`,
  dealt: g => (g.N === 4 && g.base === 10 ? PAIR_DEALT : []),
  lab: g => (g.N === 4 && g.base === 10 ? PAIR_LAB : []),
  base: (_p, g: GridSpec) => {
    const k = g.N / 2, units: number[][] = [];
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) {
        const at = 2 * r * g.N + 2 * c;
        units.push([at, at + 1, at + g.N, at + g.N + 1]);
      }
    }
    return {
      id: "two-pair-boxes@1", symbols: g.S, cells: g.N * g.N, arity: 2, units,
      score: box => {
        const sizes = [...new Set(box)].map(s => box.filter(x => x === s).length).sort().join(" ");
        return sizes === "2 2" ? [1, 0] : sizes === "1 1 2" || sizes === "1 3" ? [0, 1] : [0, 0];
      },
    };
  },
};
