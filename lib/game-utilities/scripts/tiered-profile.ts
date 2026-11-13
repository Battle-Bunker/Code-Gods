/**
 * The tiered difficulty profile of the REAL tiered families (docs/layered-rules-design.md §5–§8): every family with
 * `UtilityFamily.tiered` on Grid(4,base10,mono), read through its own card evaluator and its real table (the shipped
 * one when fresh, else built here: the hybrid law for gated and plain draws, the sampling estimator for unlocked ones).
 * No per-family code: a family is picked up as soon as it declares `tiered`.
 *
 *   pnpm --filter @workspace/game-utilities tiered [options]
 *   (= node --experimental-strip-types lib/game-utilities/scripts/tiered-profile.ts [options];
 *    also `pnpm --filter @workspace/game-utilities layered --real [options]`)
 *
 *   --families a,b        only these families
 *   --interactions a,b    profile only these interactions (to split a long run over processes)
 *   --check               every dealt and Lab value's shipped table against the reference law at the base's top
 *   --values "a;b"        with --check: only these values, e.g. "sameRoads(y=2);sameRoads(y=3)"
 *   --top-sample N       boards of a sampled reference (Kings and Subjects; default 2,000,000; 0: none)
 *   --build-time          one fresh build per family: the base and the first dealt value of each interaction
 *   --compare-value V     with --compare: only this value, e.g. "lines(x=18)"
 *   --compose gated|plain|unlock|uncapped   which tiered draws to profile (default gated)
 *   --depth 1|2           tiers per draw (default 1)
 *   --limit N             at most N values per interaction (evenly spread through the dealt list)
 *   --pair-limit N        synergy and games for at most N values per interaction (default 2)
 *   --budget default|quick
 *   --no-pairs / --no-games / --no-exact / --no-profile
 *   --games N             games per variant and policy (default 40)
 *   --compare             the composition comparison (gated, plain, unlock) on the family's `compare` values
 *   --sweep "lines:x=0..36;squares:x=0..36"   liveness of every value of a tier param, dealt or not
 *   --json FILE / --markdown FILE
 *
 * What is exact and what is sampled: the base's law is exact (convolution over its disjoint units); the tier's law
 * given the base is multilevel splitting (the hybrid law, src/tiers/hybrid.ts); climbs, synergy and games are seeded
 * searches. Where a family registers an exact enumeration of the boards that max its base (EXACT_TOP below), the
 * hybrid's P(tier ≥ i | base at its top) is compared with it, in bits, at every tier level.
 */
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { instantiate, objectType, type GridValue, type Instantiation } from "@workspace/game-types";
import {
  DEFAULT_BUDGET, QUICK_BUDGET, familyParams, familyRule, greedy, measurePair, measureRule, space, starts,
  type Budget, type Context, type PairReport, type Rule, type RuleReport, type Space,
} from "./rule-difficulty-lib.ts";
import { buildTable } from "./estimator.ts";
import { games, type GameReport } from "./layered-profile.ts";
import { FAMILIES, applicable, assertOrdinal, context, evaluator, family } from "../src/catalog.ts";
import { analyticFor, priorMeanBits, surprisal, tableFor, type CalibrationTable } from "../src/calibration.ts";
import { shippedTables } from "../src/calibration-data.ts";
import { baseParams, tiersOf } from "../src/families/grid/tiers.ts";
import { liveness, mulberry32, type HybridLaw, type Liveness } from "../src/tiers/hybrid.ts";
import { courtScore, courtSquares } from "../src/families/grid/layered/royal_court.ts";
import type { Ordinal, Params, TierParams } from "../src/types.ts";

// ------------------------------------------------------------------------------------------------
// pure parts (test/tiered-profile.test.ts)
// ------------------------------------------------------------------------------------------------

export type Composition = "gated" | "plain" | "unlock";
/** Where the tier sits in a tiered draw's ordinal: gated and plain `[...base, tier]`, unlock `[min(base[0], gate), tier, ...base]`. */
export interface TierLayout { readonly compose: Composition; readonly gate: number; readonly at: number; readonly arity: number; readonly baseArity: number }

export function tierLayout(ordinalLength: number, baseArity: number, tiers: readonly Pick<TierParams, "gate" | "compose">[]): TierLayout {
  const unlock = tiers[0]?.compose === "unlock", gate = tiers[0]?.gate ?? 0;
  const arity = ordinalLength - baseArity - (unlock ? 1 : 0);
  if (arity < 1) throw new Error(`an ordinal of ${ordinalLength} components holds no tier over a base of ${baseArity}`);
  return { compose: unlock ? "unlock" : gate > 0 ? "gated" : "plain", gate, at: unlock ? 1 : baseArity, arity, baseArity };
}
/** The same board's ordinal with its tier at 0: the floor of the tier's headroom. */
export function tierFloor(o: readonly number[], l: TierLayout): number[] {
  const out = [...o];
  for (let i = 0; i < l.arity; i++) out[l.at + i] = 0;
  return out;
}
export const tierOf = (o: readonly number[], l: TierLayout): number[] => o.slice(l.at, l.at + l.arity);
/** The base's ordinal read off a gated or plain tiered ordinal. */
export const basePart = (o: readonly number[], l: TierLayout): number[] => (l.compose === "unlock" ? o.slice(1 + l.arity) : o.slice(0, l.baseArity));

/**
 * The share of the tier's headroom a board holds: from the bits of the same board with its tier at 0 (`floor`) to the
 * rule's top. 1 when there is no headroom left (the floor is the top), never below 0 or above 1.
 */
export function headroomShare(bits: number, floor: number, top: number): number {
  return top - floor > 1e-6 ? Math.min(1, Math.max(0, (bits - floor) / (top - floor))) : 1;
}

const cmp = (a: readonly number[], b: readonly number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

/**
 * P(tier ≥ i | base at its top) read off a gated or plain table's levels (`[ordinal, log2 G]` or `[ordinal, bits]`):
 * the levels whose base part is the top base ordinal, relative to the first of them. `sign` is −1 for log2 G levels
 * (the analytic's) and +1 for bits (a table's).
 */
export function topTierOf(levels: readonly (readonly [Ordinal, number])[], baseArity: number, sign: 1 | -1 = -1): [number[], number][] {
  const tup = (o: Ordinal) => (typeof o === "number" ? [o] : [...o]);
  const top = tup(levels[levels.length - 1][0]).slice(0, baseArity);
  const at = levels.filter(([o]) => cmp(tup(o).slice(0, baseArity), top) === 0);
  return at.map(([o, l]) => [tup(o).slice(baseArity), 2 ** (-sign * (l - at[0][1]))]);
}

/** An exact law of the tier on the boards that max the base. */
export interface ExactTop {
  /** Boards that max the base (all enumerated). */
  readonly boards: number;
  /** `[tier, P(tier ≥ this | base at its top)]`, increasing, only the values that occur. */
  readonly survival: readonly (readonly [number, number])[];
  readonly how: string;
  /** Only for a sampled (not exact) law: `[tier, boards of the sample with tier ≥ this]`. */
  readonly hits?: readonly (readonly [number, number])[];
}
/** A tally of whole-number tiers over an enumeration of the top set (the generic route for a small top set). */
export function exactTopFromBoards(boards: Iterable<Uint8Array>, tier: (board: Uint8Array) => number, how = "enumerated through the tier function"): ExactTop {
  const counts = new Map<number, number>();
  let n = 0;
  for (const b of boards) { const t = tier(b); counts.set(t, (counts.get(t) ?? 0) + 1); n++; }
  return { boards: n, survival: survivalOf([...counts], n), how };
}
function survivalOf(counts: readonly (readonly [number, number])[], n: number): [number, number][] {
  const sorted = counts.filter(([, c]) => c > 0).sort((a, b) => a[0] - b[0]);
  let above = 0;
  const out: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) { above += sorted[i][1]; out.unshift([sorted[i][0], above / n]); }
  return out;
}

/**
 * Opposite Nines on 4×4 digits, natively: the 10⁸ boards on which all 8 half-turn pairs add up to 9 (the first 8 cells
 * free, cell 15 − i forced to 9 − cell i). For every total x at once, the number of boards with exactly h units adding
 * up to x, for the 10 lines (rows, columns, long diagonals) or the 9 overlapping 2×2 squares. `counts[x * 11 + h]`.
 */
export function ninesTopCounts(kind: "lines" | "squares"): Float64Array {
  const counts = new Float64Array(37 * 11), seen = new Int32Array(37);
  // A row of four digits by index 0..9999, most significant first.
  const d = new Uint8Array(40000);
  for (let i = 0; i < 10000; i++) { d[4 * i] = Math.floor(i / 1000); d[4 * i + 1] = Math.floor(i / 100) % 10; d[4 * i + 2] = Math.floor(i / 10) % 10; d[4 * i + 3] = i % 10; }
  const sums = new Uint8Array(10);
  const n = kind === "lines" ? 10 : 9;
  for (let a = 0; a < 10000; a++) {
    const a0 = d[4 * a], a1 = d[4 * a + 1], a2 = d[4 * a + 2], a3 = d[4 * a + 3];
    for (let b = 0; b < 10000; b++) {
      const b0 = d[4 * b], b1 = d[4 * b + 1], b2 = d[4 * b + 2], b3 = d[4 * b + 3];
      // Rows 2 and 3 are forced: row 2 = 9 − (b3 b2 b1 b0), row 3 = 9 − (a3 a2 a1 a0).
      const c0 = 9 - b3, c1 = 9 - b2, c2 = 9 - b1, c3 = 9 - b0, e0 = 9 - a3, e1 = 9 - a2, e2 = 9 - a1, e3 = 9 - a0;
      if (kind === "lines") {
        sums[0] = a0 + a1 + a2 + a3; sums[1] = b0 + b1 + b2 + b3; sums[2] = c0 + c1 + c2 + c3; sums[3] = e0 + e1 + e2 + e3;
        sums[4] = a0 + b0 + c0 + e0; sums[5] = a1 + b1 + c1 + e1; sums[6] = a2 + b2 + c2 + e2; sums[7] = a3 + b3 + c3 + e3;
        sums[8] = a0 + b1 + c2 + e3; sums[9] = a3 + b2 + c1 + e0;
      } else {
        sums[0] = a0 + a1 + b0 + b1; sums[1] = a1 + a2 + b1 + b2; sums[2] = a2 + a3 + b2 + b3;
        sums[3] = b0 + b1 + c0 + c1; sums[4] = b1 + b2 + c1 + c2; sums[5] = b2 + b3 + c2 + c3;
        sums[6] = c0 + c1 + e0 + e1; sums[7] = c1 + c2 + e1 + e2; sums[8] = c2 + c3 + e2 + e3;
      }
      for (let k = 0; k < n; k++) seen[sums[k]]++;
      for (let k = 0; k < n; k++) { const s = sums[k], h = seen[s]; if (h) { counts[s * 11 + h]++; seen[s] = 0; } }
    }
  }
  // Boards with no unit at x: the rest.
  for (let x = 0; x <= 36; x++) { let some = 0; for (let h = 1; h <= 10; h++) some += counts[x * 11 + h]; counts[x * 11] = 1e8 - some; }
  return counts;
}
const ninesCache = new Map<string, Float64Array>();
/** Exact P(tier ≥ i | all 8 pairs add up to 9) for "lines add up to x" or "2×2 squares add up to x" (10⁸ boards). */
export function ninesExactTop(kind: "lines" | "squares", x: number): ExactTop {
  let counts = ninesCache.get(kind);
  if (!counts) ninesCache.set(kind, counts = ninesTopCounts(kind));
  const row = Array.from({ length: 11 }, (_, h) => [h, counts![x * 11 + h]] as const);
  return { boards: 1e8, survival: survivalOf(row, 1e8), how: "native enumeration of the 10⁸ boards with all 8 pairs at 9" };
}

/**
 * Mirrormancer at its top on 4×4 digits, in closed form: the four lines are independent uniform mirrors `abba` (100 of
 * them), `n` of which qualify for the tier, and the tier counts the different qualifying mirrors among the four. The
 * number of the `total^lines` top boards with exactly k different qualifying mirrors is
 * Σ_j C(lines, j) · (total − n)^(lines − j) · C(n, k) · (surjections of j lines onto k mirrors).
 */
export function mirrorExactTop(n: number, total = 100, lines = 4): ExactTop {
  const C = (a: number, b: number) => { if (b < 0 || b > a) return 0; let r = 1; for (let i = 0; i < b; i++) r = r * (a - i) / (i + 1); return r; };
  const onto = (j: number, k: number) => { let r = 0; for (let i = 0; i <= k; i++) r += (-1) ** i * C(k, i) * (k - i) ** j; return r; };
  const counts: [number, number][] = [];
  for (let k = 0; k <= Math.min(lines, n); k++) {
    let c = 0;
    for (let j = k; j <= lines; j++) c += C(lines, j) * (total - n) ** (lines - j) * C(n, k) * onto(j, k);
    counts.push([k, Math.round(c)]);
  }
  const boards = total ** lines;
  return { boards, survival: survivalOf(counts, boards), how: `closed form: ${n} of the ${total} mirrors qualify, ${lines} independent lines (all ${boards.toExponential(0)} top boards)` };
}
/** How many of the 100 mirrors `abba` qualify for a Mirrormancer tier on 4×4 digits (null: not one of its two). */
export function mirrorQualifying(id: string, v: Record<string, unknown>): number | null {
  if (id !== "holding" && id !== "halves") return null;
  let n = 0;
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
    if (id === "holding" ? [a, b, b, a].filter(d => d === v.y).length === 2 : a + b === v.x && a !== b) n++;
  }
  return n;
}

/**
 * ✌️ Two Pair at its top on 4×4 digits, exactly. Every box holds two different pairs, so a box is a choice of two
 * numbers out of ten (45 of them) and one of the 6 arrangements of `aabb`; the arrangements cancel for the link tiers,
 * which read only *which* two numbers each box holds. The four corner boxes make a ring, so the whole law is a count
 * over the 45⁴ choices: how many of the ring's four borders are links, how many link through one number (which is the
 * same count for every y, since relabelling digits is a symmetry), and how many link with each total x.
 *
 * `equalRoads` is not here: it reads arrangements inside the boxes and roads across them, which do not cancel.
 */
export function twoPairTopCounts(): { boards: number; links: number[]; via: number[]; sums: Map<number, number[]> } {
  const sets: [number, number][] = [];
  for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) sets.push([a, b]);
  const n = sets.length;
  // shared[i][j]: the one number sets i and j share, or −1 (none, or both: a link shares exactly one).
  const shared = sets.map(x => sets.map(y => { const c = x.filter(d => y.includes(d)); return c.length === 1 ? c[0] : -1; }));
  const total = sets.map(([a, b]) => 2 * (a + b));
  const links = new Array<number>(5).fill(0), via = new Array<number>(5).fill(0), sums = new Map<number, number[]>();
  for (let x = 0; x <= 72; x++) sums.set(x, new Array<number>(5).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) for (let l = 0; l < n; l++) {
    const ring: [number, number][] = [[i, j], [j, k], [k, l], [l, i]];
    let all = 0, v = 0;
    const hit = new Map<number, number>();
    for (const [a, b] of ring) {
      if (shared[a][b] < 0) continue;
      all++;
      if (shared[a][b] === 0) v++;   // y = 0; every other y has the same count
      const t = total[a] + total[b];
      hit.set(t, (hit.get(t) ?? 0) + 1);
    }
    links[all]++; via[v]++;
    for (const [t, c] of hit) sums.get(t)![c]++;
  }
  // `hit` holds only the totals that occurred, so fill in each total's "no link adds up to it" count.
  const boards = n ** 4;
  for (const h of sums.values()) h[0] = boards - h.slice(1).reduce((a, b) => a + b, 0);
  return { boards, links, via, sums };
}
let twoPairCache: ReturnType<typeof twoPairTopCounts> | null = null;
/** Exact P(tier ≥ i | all four boxes hold two different pairs) for one of Two Pair's three link tiers. */
export function twoPairExactTop(id: string, value: number): ExactTop | null {
  const c = twoPairCache ??= twoPairTopCounts();
  const counts = id === "links" ? c.links : id === "linksVia" ? c.via : id === "linkSums" ? c.sums.get(value) : undefined;
  if (!counts) return null;
  const how = `exact count over the 45⁴ = ${c.boards.toLocaleString("en")} choices of four number pairs at the top`;
  return { boards: c.boards, survival: survivalOf(counts.map((n, h) => [h, n] as const), c.boards), how };
}

/**
 * Kings and Subjects at its top (four courts, no gap) has no product form for its tiers (they read kings and roads
 * across boxes), and the top set is too large to enumerate. An independent check instead: `n` boards drawn uniformly
 * at the top (each corner box an independent uniform court), the tier read through the card. Unbiased, not exact:
 * `hits` at each level say how far to trust it.
 */
export function courtTopSample(tier: (board: Uint8Array) => number, n: number, seed = 1): ExactTop {
  const courts: number[][] = [];
  for (let i = 0; i < 10000; i++) {
    const v = [Math.floor(i / 1000), Math.floor(i / 100) % 10, Math.floor(i / 10) % 10, i % 10], s = courtScore(v, 20).score;
    if (s[0] === 1 && s[1] === 0) courts.push(v);
  }
  const boxes = courtSquares(4, "corners").map(({ r, c }) => [4 * r + c, 4 * r + c + 1, 4 * r + 4 + c, 4 * r + 5 + c]);
  const rand = mulberry32(seed), counts = new Map<number, number>(), board = new Uint8Array(16);
  for (let k = 0; k < n; k++) {
    for (const cells of boxes) { const f = courts[Math.floor(rand() * courts.length)]; for (let i = 0; i < 4; i++) board[cells[i]] = f[i]; }
    const t = tier(board);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => a[0] - b[0]);
  let above = 0;
  const hits: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) { above += sorted[i][1]; hits.unshift([sorted[i][0], above]); }
  return { boards: n, survival: survivalOf(sorted, n), hits, how: `sampled, not exact: ${n.toExponential(0)} uniform boards with four courts (${courts.length} courts a box, ${(courts.length ** 4).toExponential(1)} top boards), independent of the hybrid law` };
}
/**
 * ↙️ Crosswise Threes at its top on 4×4 digits. Its top set is every board whose 6 fold pairs are 3 apart and whose 4
 * fold-line cells are anything: 14⁶ · 10⁴ ≈ 7.5 · 10¹⁰ boards, too many to enumerate and with no product form for a
 * tier that reads lines across the fold. An independent check instead: `n` boards drawn uniformly at the top — each
 * pair one of its 14 fillings ((a, a+3) and (a+3, a) for a = 0…6), each free cell a uniform digit — and for every
 * total x at once, how many of them have exactly h of the 10 lines adding up to x (`counts[x * 37 ... ]`, as
 * `ninesTopCounts` does for Opposite Nines). One pass serves every dealt value, which is what makes 2 · 10⁷ boards
 * affordable; the line sums are read off the board rather than through the card, so `threesCheckCard` compares the two
 * on the first boards of the sample before the count is trusted.
 */
export function threesTopCounts(n: number, seed = 1, check?: (board: Uint8Array, h: Uint8Array) => void): { lines: Float64Array; squares: Float64Array } {
  // The fold takes (r, c) to (3 − c, 3 − r); the pairs are the cells with r + c < 3, the fold line r + c = 3.
  const pairs: [number, number][] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; r + c < 3; c++) pairs.push([4 * r + c, 4 * (3 - c) + (3 - r)]);
  const free = [3, 6, 9, 12];
  const fillings: [number, number][] = [];
  for (let a = 0; a + 3 <= 9; a++) { fillings.push([a, a + 3]); fillings.push([a + 3, a]); }
  // The 10 lines as cell indices: four rows, four columns, the ↘ and the ↙ diagonal.
  const lines: number[][] = [];
  for (let r = 0; r < 4; r++) lines.push([0, 1, 2, 3].map(c => 4 * r + c));
  for (let c = 0; c < 4; c++) lines.push([0, 1, 2, 3].map(r => 4 * r + c));
  lines.push([0, 5, 10, 15]); lines.push([3, 6, 9, 12]);
  // And the 9 overlapping 2×2 squares, for the Lab's other interaction.
  const squares: number[][] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) squares.push([4 * r + c, 4 * r + c + 1, 4 * r + 4 + c, 4 * r + 5 + c]);
  const rand = mulberry32(seed), board = new Uint8Array(16), h = new Uint8Array(37), q = new Uint8Array(37);
  const counts = new Float64Array(37 * 11), squareCounts = new Float64Array(37 * 11);
  for (let k = 0; k < n; k++) {
    for (const [i, j] of pairs) { const f = fillings[Math.floor(rand() * fillings.length)]; board[i] = f[0]; board[j] = f[1]; }
    for (const i of free) board[i] = Math.floor(rand() * 10);
    h.fill(0); q.fill(0);
    for (const line of lines) h[board[line[0]] + board[line[1]] + board[line[2]] + board[line[3]]]++;
    for (const sq of squares) q[board[sq[0]] + board[sq[1]] + board[sq[2]] + board[sq[3]]]++;
    if (check && k < 200) check(board, h);
    for (let x = 0; x <= 36; x++) { counts[x * 11 + h[x]]++; squareCounts[x * 11 + q[x]]++; }
  }
  return { lines: counts, squares: squareCounts };
}
const threesCache = new Map<string, ReturnType<typeof threesTopCounts>>();
/** Sampled P(tier ≥ i | all 6 fold pairs 3 apart) for "lines add up to x" or "2×2 squares add up to x" on 4×4 digits. */
export function threesTopSample(kind: "lines" | "squares", x: number, n: number, seed = 1, check?: (board: Uint8Array, h: Uint8Array) => void): ExactTop {
  const key = `${n}:${seed}`;
  let counts = threesCache.get(key);
  if (!counts) threesCache.set(key, counts = threesTopCounts(n, seed, check));
  const of = counts[kind];
  const row = Array.from({ length: 11 }, (_, h) => [h, of[x * 11 + h]] as const);
  let above = 0;
  const hits: [number, number][] = [];
  for (let i = 10; i >= 0; i--) { above += row[i][1]; if (row[i][1] > 0) hits.unshift([i, above]); }
  return {
    boards: n, survival: survivalOf(row, n), hits,
    how: `sampled, not exact: ${n.toExponential(0)} uniform boards with all 6 pairs 3 apart (14 fillings a pair, 10 digits each free cell), every total x in one pass`,
  };
}

/** Boards per draw for `courtTopSample` (`--top-sample N`; 0 turns the check off). */
export const TOP_SAMPLE = { n: 2_000_000 };
const digits4 = (inst: Instantiation) => inst.key.replace(/,[a-z]+\)$/, ")") === "Grid(4,base10)";

/**
 * The exact tier law at the base's top, by family: the hook for a family whose top set is small enough to enumerate
 * (natively, or with `exactTopFromBoards`). Returns null for draws it does not cover.
 */
export const EXACT_TOP: Record<string, (params: Params, inst: Instantiation) => ExactTop | null> = {
  opposite_nines: (p, inst) => {
    const t = tiersOf(p);
    if (inst.key.replace(/,[a-z]+\)$/, ")") !== "Grid(4,base10)" || t.length !== 1 || t[0].compose === "unlock") return null;
    const x = t[0].x as number;
    if ((t[0].id !== "lines" && t[0].id !== "squares") || !Number.isInteger(x) || x < 0 || x > 36) return null;
    return ninesExactTop(t[0].id, x);
  },
  mirrormancer: (p, inst) => {
    const t = tiersOf(p);
    if (!digits4(inst) || t.length !== 1 || t[0].compose === "unlock") return null;
    const n = mirrorQualifying(t[0].id, t[0] as unknown as Record<string, unknown>);
    return n === null ? null : mirrorExactTop(n);
  },
  // Not exact: an independent uniform sample of the top (see courtTopSample).
  kings_and_subjects: (p, inst) => {
    const t = tiersOf(p);
    if (!digits4(inst) || t.length !== 1 || t[0].compose === "unlock" || (p as { squares?: string }).squares !== "corners" || !TOP_SAMPLE.n) return null;
    const ev = evaluator({ familyId: "kings_and_subjects", params: p }, inst), codec = objectType(inst.objectType).codec(inst), col = new Uint8Array(16);
    let first = true;
    return courtTopSample(board => {
      const o = tup(ev(codec.encode({ size: 4, sym: board, col } as GridValue)));
      if (first) { first = false; if (o[0] !== 4 || o[1] !== 0) throw new Error(`kings_and_subjects: a sampled top board scores ${o}`); }
      return o[o.length - 1];
    }, TOP_SAMPLE.n);
  },
  two_pair: (p, inst) => {
    const t = tiersOf(p);
    if (!digits4(inst) || t.length !== 1 || t[0].compose === "unlock") return null;
    // linkSums folds with 72 − x; the enumeration keys every total, so take the value as dealt.
    return twoPairExactTop(t[0].id as string, (t[0].x ?? t[0].y ?? 0) as number);
  },
  // Not exact: an independent uniform sample of the top (see threesTopSample), with the card checked against it.
  crosswise_threes: (p, inst) => {
    const t = tiersOf(p);
    const kind = t[0].id === "lines" ? "lines" : t[0].id === "squares" ? "squares" : null;
    if (!digits4(inst) || t.length !== 1 || !kind || t[0].compose === "unlock" || !TOP_SAMPLE.n) return null;
    const x = t[0].x as number;
    if (!Number.isInteger(x) || x < 0 || x > 36) return null;
    const ev = evaluator({ familyId: "crosswise_threes", params: p }, inst), codec = objectType(inst.objectType).codec(inst), col = new Uint8Array(16);
    // The sample's first boards go through the card too: the base must be at its top and, for a lines draw, the card's
    // own count of lines at x must be the one counted off the board.
    return threesTopSample(kind, x, TOP_SAMPLE.n, 1, (board, h) => {
      const o = tup(ev(codec.encode({ size: 4, sym: board, col } as GridValue)));
      if (o[0] !== 6 || o[1] !== 0) throw new Error(`crosswise_threes: a sampled top board scores ${o}`);
      if (kind === "lines" && o[o.length - 1] !== h[x]) throw new Error(`crosswise_threes: the card reads ${o[o.length - 1]} lines at ${x}, the count ${h[x]}`);
    });
  },
};

export interface TierError { tier: number; hybrid: number | null; exact: number; error: number | null }
/** |hybrid − exact| in bits of −log2 P(tier ≥ i | top) at every tier level the exact law has (null: the hybrid never saw it). */
export function calibrationError(hybrid: readonly (readonly [readonly number[], number])[], exact: ExactTop): TierError[] {
  return exact.survival.map(([tier, p]) => {
    const h = hybrid.find(([v]) => v.length === 1 && v[0] === tier);
    const e = -Math.log2(p), hb = h ? -Math.log2(h[1]) : null;
    return { tier, hybrid: hb, exact: e, error: hb === null ? null : Math.abs(hb - e) };
  });
}

// ------------------------------------------------------------------------------------------------
// real rules and their tables
// ------------------------------------------------------------------------------------------------

export interface RealRule {
  rule: Rule;
  familyId: string;
  params: Params;
  table: CalibrationTable;
  /** "shipped" (fresh in data/calibration) or "built" here. */
  from: "shipped" | "built";
  /** "hybrid", "exact", "approx" (analytic kinds) or "sampled" (the Monte Carlo + splitting estimator). */
  kind: string;
  /** Seconds to build the table here (measured even when the shipped one is used), NaN when not timed. */
  seconds: number;
}

const mean = (a: readonly number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const tup = (o: Ordinal): number[] => (typeof o === "number" ? [o] : [...o]);
const label = (p: Params) => {
  const t = tiersOf(p);
  if (!t.length) return "base";
  const how = t[0].compose ?? (t[0].gate === 0 ? "plain" : "gated");
  return t.map(({ id, gate: _g, compose: _c, ...v }) => `${id}(${Object.entries(v).map(([k, x]) => `${k}=${x}`).join(",")})`).join("+") + (how === "gated" ? "" : `@${how}`);
};

/** A family draw as a rule over its real table. `time`: build the table here even when a fresh one is shipped, for its seconds. */
export function realRule(familyId: string, params: Params, inst: Instantiation, opts: { time?: boolean } = {}): RealRule {
  const f = family(familyId), ctx = context(inst), codec = objectType(inst.objectType).codec(inst);
  const canon = f.canonical(params, ctx);
  const ev = evaluator({ familyId, params: canon }, inst), shape = f.shape(ctx, canon);
  const score = (g: GridValue) => assertOrdinal(shape, ev(codec.encode(g)));
  const shipped = tableFor(shippedTables(inst.key), { familyId, params: canon }, inst);
  let table = shipped, seconds = NaN;
  if (!shipped || opts.time) {
    const b = buildTable(familyId, canon, inst);
    seconds = b.seconds; table ??= b.table;
  }
  const budget = table!.estimator.budget, kind = typeof budget === "string" ? budget.split(":")[0] : "sampled";
  let topBits = table!.levels[table!.levels.length - 1][1];
  // A hybrid draw's exemplar is the best board of its law, so this is where the law is first computed: time it here.
  const t0 = performance.now();
  try {
    const top = f.top?.(canon, ctx) ?? (f.exemplar ? ev(f.exemplar(canon, ctx)) : undefined);
    if (top !== undefined) topBits = Math.max(topBits, surprisal(table!, top));
  } catch { /* no closed-form top here */ }
  if (Number.isNaN(seconds) && kind === "hybrid") seconds = (performance.now() - t0) / 1000;
  const rule: Rule = {
    id: `${familyId}.${label(canon)}`, source: f.card.typescript(canon, ctx), score, calibration: shipped ? "shipped" : "calibrated", topBits,
    bits: o => Math.min(rule.topBits, surprisal(table!, o)),
  };
  return { rule, familyId, params: canon, table: table!, from: shipped ? "shipped" : "built", kind, seconds };
}

// ------------------------------------------------------------------------------------------------
// the profile of one tiered draw against its base
// ------------------------------------------------------------------------------------------------

export interface TierColumns {
  layout: TierLayout;
  addedTop: number;
  /** Base-only one-cell greedy to its end (it climbs the base draw's ordinal): bits on this rule's table, on the base's own table, and the difference. */
  baseAgent: number;
  baseAgentOwn: number;
  baseAgentLoss: number;
  /** The share of the tier's headroom those ends hold by accident. */
  accidental: number;
  /** Tier-aware one-cell greedy to its end: bits and headroom share. */
  tierAgent: number;
  tierShare: number;
}

export function tierColumns(full: RealRule, base: RealRule, sp: Space, b: Budget): TierColumns {
  const S = starts(sp, b.starts), ctx = context(sp.inst), f = family(full.familyId);
  const baseShape = f.shape(ctx, base.params), baseArity = baseShape.kind === "tuple" ? baseShape.arity : 1;
  const baseEnds = S.map(g => greedy(base.rule, sp, g, b.longSteps).boards.at(-1)!);
  const fullEnds = S.map(g => greedy(full.rule, sp, g, b.longSteps).boards.at(-1)!);
  const layout = tierLayout(tup(full.rule.score(S[0])).length, baseArity, tiersOf(full.params));
  const top = full.rule.topBits;
  const bitsOf = (g: GridValue) => full.rule.bits(full.rule.score(g));
  const share = (g: GridValue) => { const o = tup(full.rule.score(g)); return headroomShare(full.rule.bits(o), full.rule.bits(tierFloor(o, layout)), top); };
  const baseAgent = mean(baseEnds.map(bitsOf)), baseAgentOwn = mean(baseEnds.map(g => base.rule.bits(base.rule.score(g))));
  return {
    layout, addedTop: top - base.rule.topBits, baseAgent, baseAgentOwn, baseAgentLoss: baseAgentOwn - baseAgent,
    accidental: mean(baseEnds.map(share)), tierAgent: mean(fullEnds.map(bitsOf)), tierShare: mean(fullEnds.map(share)),
  };
}

export interface LiveReport extends Liveness { seconds: number; levels: number; topTier: [number[], number][] }

/**
 * Liveness of a gated or plain tiered draw (src/tiers/hybrid.ts `liveness`, the check `tierLiveness` runs), from the
 * hybrid analytic the family itself declares: no tier spec needed, so any tiered family is covered. Null for a draw
 * without a hybrid law (unlocked, or a base without disjoint units).
 */
export function liveOf(familyId: string, params: Params, inst: Instantiation, band?: { min: number; max: number }): LiveReport | null {
  const f = family(familyId), ctx = context(inst), canon = f.canonical(params, ctx);
  const a = analyticFor(familyId, canon, inst);
  if (!a || a.kind !== "hybrid") return null;
  const t0 = performance.now(), levels = a.levels as readonly (readonly [number[], number])[], seconds = (performance.now() - t0) / 1000;
  const baseShape = f.shape(ctx, baseParams(canon)), baseArity = baseShape.kind === "tuple" ? baseShape.arity : 1;
  const topTier = topTierOf(levels, baseArity);
  const arity = topTier[0][0].length, N = Math.sqrt(space(inst, "symbol").cells), S = space(inst, "symbol").S;
  const ev = evaluator({ familyId, params: canon }, inst), codec = objectType(inst.objectType).codec(inst);
  const law = { levels, topTier: topTier.map(([v, p]) => [arity === 1 ? v[0] : v, p] as const) } as unknown as HybridLaw;
  const live = liveness(law, N, S, board => tup(ev(codec.encode({ size: N, sym: board, col: new Uint8Array(board.length) } as GridValue))), band);
  return { ...live, seconds, levels: levels.length, topTier };
}

export interface VariantReport {
  id: string; family: string; params: Params; interaction?: string;
  report: RuleReport;
  table: { from: string; kind: string; seconds: number; levels: number; priorMean: number };
  tier?: TierColumns;
  live?: LiveReport | null;
  exact?: { how: string; boards: number; rows: TierError[]; maxError: number; missed: number } | null;
}

function exactOf(familyId: string, params: Params, inst: Instantiation, live: LiveReport | null | undefined): VariantReport["exact"] {
  const hook = EXACT_TOP[familyId];
  if (!hook || !live) return null;
  const e = hook(params, inst);
  if (!e) return null;
  const rows = calibrationError(live.topTier, e), errs = rows.filter(r => r.error !== null).map(r => r.error!);
  return { how: e.how, boards: e.boards, rows, maxError: errs.length ? Math.max(...errs) : NaN, missed: rows.filter(r => r.error === null).length };
}

export function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/).filter(s => /[\p{L}\p{N}]/u.test(s)).length;
}

// ------------------------------------------------------------------------------------------------
// command line
// ------------------------------------------------------------------------------------------------

const BEGINNER_EIGHT = ["mirrormancer", "magic_eighteen", "opposite_nines", "two_pair", "spread_three", "strangers", "leapfrog", "crosswise_threes"];
const spread = <T>(xs: readonly T[], n: number): T[] => (xs.length <= n ? [...xs] : Array.from({ length: n }, (_, k) => xs[n === 1 ? xs.length - 1 : Math.round(k * (xs.length - 1) / (n - 1))]));
const key = (p: unknown) => JSON.stringify(p);

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const flag = (name: string) => argv.includes(`--${name}`);
  const opt = (name: string) => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; };
  const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "mono" }), ctx = context(inst);
  const sp = space(inst, "symbol"), budget = opt("budget") === "quick" ? QUICK_BUDGET : DEFAULT_BUDGET, dctx: Context = { sp, budget };
  const log = (s: string) => process.stderr.write(s + "\n");
  const only = opt("families")?.split(","), compose = (opt("compose") ?? "gated") as "gated" | "plain" | "unlock" | "uncapped";
  const depth = Number(opt("depth") ?? 1), limit = Number(opt("limit") ?? Infinity), pairLimit = Number(opt("pair-limit") ?? 2);
  const fams = FAMILIES.filter(f => f.tiered && f.objectType === inst.objectType && applicable(f, inst).ok && (!only || only.includes(f.id)));
  if (!fams.length) throw new Error("no family with tiers here");

  const draws = (f: (typeof FAMILIES)[number], c: typeof compose, d = depth) => {
    const seen = new Set<string>(), out: Params[] = [];
    for (const p of f.tiered!(ctx, d, c)) { const canon = f.canonical(p, ctx); if (!seen.has(key(canon))) { seen.add(key(canon)); out.push(canon); } }
    return out;
  };
  const byInteraction = (ps: readonly Params[]) => {
    const groups = new Map<string, Params[]>();
    for (const p of ps) { const id = `${key(baseParams(p))}|${tiersOf(p).map(t => t.id).join("+")}`; groups.set(id, [...(groups.get(id) ?? []), p]); }
    return [...groups.values()];
  };

  const variants: VariantReport[] = [], rules = new Map<string, RealRule>(), pairs: PairReport[] = [], gameReports: GameReport[] = [];
  const baseOf = new Map<string, RealRule>();
  const measure = (r: RealRule, base?: RealRule): VariantReport => {
    const report = measureRule(r.rule, dctx);
    const v: VariantReport = {
      id: r.rule.id, family: r.familyId, params: r.params, interaction: tiersOf(r.params).map(t => t.id).join("+") || undefined, report,
      table: { from: r.from, kind: r.kind, seconds: r.seconds, levels: r.table.levels.length, priorMean: priorMeanBits(r.table) },
    };
    if (base) {
      v.tier = tierColumns(r, base, sp, budget);
      v.live = liveOf(r.familyId, r.params, inst);
      if (v.live && Number.isNaN(v.table.seconds)) v.table.seconds = v.live.seconds;
      if (!flag("no-exact")) v.exact = exactOf(r.familyId, r.params, inst, v.live);
    }
    log(`${v.id}: top ${report.topBits.toFixed(1)} DIFF ${report.difficulty.toFixed(1)} K ${report.entangle.toFixed(1)} rate4 ${report.rate4.toFixed(2)} (${r.from} ${r.kind})`);
    return v;
  };
  const baseRule = (familyId: string, p: Params) => {
    const k = `${familyId}|${key(baseParams(p))}`;
    let b = baseOf.get(k);
    if (!b) { baseOf.set(k, b = realRule(familyId, baseParams(p), inst, { time: true })); rules.set(b.rule.id, b); variants.push(measure(b)); }
    return b;
  };

  const chosen: { r: RealRule; base: RealRule; paired: boolean }[] = [];
  if (!flag("no-profile")) for (const f of fams) for (const group of byInteraction(draws(f, compose))) {
    if (opt("interactions") && !opt("interactions")!.split(",").includes(tiersOf(group[0])[0].id)) continue;
    const picked = spread(group, limit), paired = new Set(spread(picked, pairLimit).map(key));
    for (const p of picked) {
      const base = baseRule(f.id, p), r = realRule(f.id, p, inst);
      rules.set(r.rule.id, r); variants.push(measure(r, base)); chosen.push({ r, base, paired: paired.has(key(p)) });
    }
  }

  let beginner: Rule[] = [];
  if (chosen.length && (!flag("no-pairs") || !flag("no-games"))) {
    beginner = BEGINNER_EIGHT.filter(id => FAMILIES.some(f => f.id === id) && applicable(family(id), inst).ok)
      .map(id => familyRule(id, familyParams(id, inst, 1)[0], inst));
    for (const b of beginner) measureRule(b, dctx);
    log(`beginner eight: ${beginner.map(b => b.id).join(", ")}`);
  }
  if (!flag("no-pairs")) {
    const done = new Set<string>();
    for (const { r, base, paired } of chosen) for (const x of paired ? [base, r] : []) {
      if (done.has(x.rule.id)) continue;
      done.add(x.rule.id);
      for (const b of beginner) pairs.push(measurePair(x.rule, b, dctx));
      log(`pairs ${x.rule.id}`);
    }
  }
  if (!flag("no-games")) for (const { r, base, paired } of chosen) if (paired) {
    gameReports.push(games(r.rule, base.rule, beginner, sp, Number(opt("games") ?? 40)));
    log(`games ${r.rule.id}`);
  }

  // The composition comparison: the family's compare values under gated, plain and unlock.
  const comparison: CompareRow[] = [];
  if (flag("compare")) for (const f of fams) {
    const same = (a: Params, b: Params) => key(tiersOf(a).map(({ gate: _g, compose: _c, ...v }) => v)) === key(tiersOf(b).map(({ gate: _g, compose: _c, ...v }) => v)) && key(baseParams(a)) === key(baseParams(b));
    const gated = draws(f, "uncapped", 1), unlock = draws(f, "unlock", 1);
    for (const plain of draws(f, "plain", 1)) {
      if (opt("compare-value") && label(plain).replace("@plain", "") !== opt("compare-value")) continue;
      const base = baseRule(f.id, plain), S = starts(sp, budget.starts);
      const baseEnds = S.map(g => greedy(base.rule, sp, g, budget.longSteps).boards.at(-1)!);
      const own = mean(baseEnds.map(g => base.rule.bits(base.rule.score(g))));
      const baseReport = variants.find(v => v.id === base.rule.id)!;
      comparison.push({ value: label(plain).replace("@plain", ""), compose: "base", id: base.rule.id, rate4: baseReport.report.rate4, priorMean: baseReport.table.priorMean,
        top: baseReport.report.topBits, difficulty: baseReport.report.difficulty, tierAgent: NaN, baseAgent: own, baseAgentOwn: own, loss: 0,
        chars: base.rule.source.length, sentences: sentenceCount(f.summary(base.params, ctx)), source: `${base.from} ${base.kind}`, seconds: base.seconds, levels: base.table.levels.length });
      for (const [how, p] of [["gated", gated.find(g => same(g, plain))], ["plain", plain], ["unlock", unlock.find(u => same(u, plain))]] as const) {
        if (!p) continue;
        const r = realRule(f.id, p, inst, { time: true }), report = measureRule(r.rule, dctx), t = tierColumns(r, base, sp, budget);
        comparison.push({ value: label(plain).replace("@plain", ""), compose: how, id: r.rule.id, rate4: report.rate4, priorMean: priorMeanBits(r.table), top: report.topBits,
          difficulty: report.difficulty, tierAgent: t.tierAgent, baseAgent: t.baseAgent, baseAgentOwn: t.baseAgentOwn, loss: t.baseAgentLoss,
          chars: r.rule.source.length, sentences: sentenceCount(f.summary(r.params, ctx)), source: `${r.from} ${r.kind}`, seconds: r.seconds, levels: r.table.levels.length });
        log(`compare ${r.rule.id}: top ${report.topBits.toFixed(1)} rate4 ${report.rate4.toFixed(2)} loss ${t.baseAgentLoss.toFixed(1)}`);
      }
    }
  }

  // The liveness sweep: every value of a tier param, dealt or not.
  const sweep: SweepRow[] = [];
  for (const part of (opt("sweep") ?? "").split(";").filter(Boolean)) {
    const m = /^(\w+):(\w+)=(-?\d+)\.\.(-?\d+)$/.exec(part.trim());
    if (!m) throw new Error(`--sweep wants "interaction:param=lo..hi", got ${part}`);
    const [, id, param, lo, hi] = m;
    for (const f of fams) {
      const dealt = draws(f, "gated", 1), lab = draws(f, "uncapped", 1).filter(p => !dealt.some(d => key(d) === key(p)));
      const template = dealt.find(p => tiersOf(p)[0].id === id);
      if (!template) continue;
      const seen = new Map<string, number[]>();
      for (let x = Number(lo); x <= Number(hi); x++) {
        const p = f.canonical({ ...template, tiers: [{ ...tiersOf(template)[0], [param]: x }] }, ctx), k = key(p);
        if (seen.has(k)) { seen.get(k)!.push(x); continue; }
        seen.set(k, [x]);
      }
      for (const [k, xs] of seen) {
        const p = JSON.parse(k) as Params;
        const status = dealt.some(d => key(d) === k) ? "dealt" : lab.some(d => key(d) === k) ? "lab" : "not dealt";
        let live: LiveReport | null = null, error = "";
        try { live = liveOf(f.id, p, inst); } catch (e) { error = String((e as Error).message ?? e); }
        const exact = live && !flag("no-exact") ? exactOf(f.id, p, inst, live) : null;
        const baseTop = live ? -(analyticFor(f.id, f.canonical(baseParams(p), ctx), inst)?.levels.at(-1)?.[1] ?? NaN) : NaN;
        sweep.push({ family: f.id, interaction: id, param, values: xs, status, live, error, exactMax: exact ? exact.maxError : NaN, exactMissed: exact ? exact.missed : 0,
          exactAdded: exact ? exact.rows[exact.rows.length - 1].exact : NaN, exactTop: exact ? exact.rows[exact.rows.length - 1].tier : NaN, baseTop });
        log(`sweep ${f.id} ${id} ${param}=${xs.join("~")}: ${status} ${live ? `${live.tierMin}–${live.tierTop} +${live.addedBits.toFixed(1)} ${live.problems.join("; ")}` : error}`);
      }
    }
  }

  // The shipped tables against the exact (or independently sampled) law at the base's top: every dealt and Lab value.
  const checks: CheckRow[] = [];
  if (opt("top-sample") !== undefined) TOP_SAMPLE.n = Number(opt("top-sample"));
  if (flag("check")) for (const f of fams) {
    const dealt = draws(f, "gated", 1), all = [...dealt, ...draws(f, "uncapped", 1).filter(p => !dealt.some(d => key(d) === key(p)))];
    for (const p of all) {
      if (opt("values") && !opt("values")!.split(";").includes(label(p))) continue;
      const baseShape = f.shape(ctx, baseParams(p)), baseArity = baseShape.kind === "tuple" ? baseShape.arity : 1;
      const shipped = tableFor(shippedTables(inst.key), { familyId: f.id, params: p }, inst);
      const baseTable = tableFor(shippedTables(inst.key), { familyId: f.id, params: f.canonical(baseParams(p), ctx) }, inst);
      const topTier = shipped ? topTierOf(shipped.levels as unknown as [Ordinal, number][], baseArity, 1) : liveOf(f.id, p, inst)?.topTier;
      if (!topTier) continue;
      const e = EXACT_TOP[f.id]?.(p, inst) ?? null, rows = e ? calibrationError(topTier, e) : [];
      // A sampled reference is only trusted where it has at least 100 boards.
      const trusted = rows.filter(r => r.error !== null && (!e?.hits || (e.hits.find(([t]) => t === r.tier)?.[1] ?? 0) >= 100));
      const last = topTier[topTier.length - 1];
      checks.push({
        id: `${f.id}.${label(p)}`, family: f.id, interaction: tiersOf(p)[0].id, status: dealt.includes(p) ? "dealt" : "lab", source: shipped ? "shipped table" : "law computed here",
        levels: shipped?.levels.length ?? NaN, top: shipped ? shipped.levels[shipped.levels.length - 1][1] : NaN, baseTop: baseTable ? baseTable.levels[baseTable.levels.length - 1][1] : NaN,
        tierTop: last[0], added: -Math.log2(last[1]), how: e?.how ?? "", sampled: !!e?.hits, rows: rows.map(r => ({ ...r, hits: e?.hits?.find(([t]) => t === r.tier)?.[1] })),
        maxError: trusted.length ? Math.max(...trusted.map(r => r.error!)) : NaN, missed: rows.filter(r => r.error === null).length,
        refTop: e ? e.survival[e.survival.length - 1][0] : NaN, refAdded: e ? -Math.log2(e.survival[e.survival.length - 1][1]) : NaN,
      });
      const c = checks[checks.length - 1];
      log(`check ${c.id}: ${c.status} +${c.added.toFixed(2)} (reference +${c.refAdded.toFixed(2)}) max error ${c.maxError.toFixed(2)}`);
    }
  }

  // One fresh build per family and kind of draw: the base, and the first dealt value of each interaction.
  const builds: BuildRow[] = [];
  if (flag("build-time")) for (const f of fams) {
    const firsts = byInteraction(draws(f, "gated", 1)).map(g => g[0]);
    for (const p of [f.canonical(baseParams(firsts[0]), ctx), ...firsts]) {
      const b = buildTable(f.id, p, inst), budgetOf = b.table.estimator.budget;
      builds.push({ id: `${f.id}.${label(p)}`, kind: typeof budgetOf === "string" ? budgetOf : "sampled", levels: b.table.levels.length, seconds: b.seconds });
      log(`build ${f.id}.${label(p)}: ${b.seconds.toFixed(1)} s, ${b.table.levels.length} levels`);
    }
  }

  const md = markdown({ variants, pairs, gameReports, beginner: beginner.map(b => b.id), comparison, sweep, checks, builds, compose, budget: budget === QUICK_BUDGET ? "quick" : "default" });
  console.log(md);
  if (opt("markdown")) writeFileSync(opt("markdown")!, md);
  if (opt("json")) writeFileSync(opt("json")!, JSON.stringify({ instance: inst.key, compose, variants, pairs, games: gameReports, comparison, sweep, checks, builds },
    (_, v) => (v === Infinity ? "inf" : typeof v === "number" && Number.isNaN(v) ? null : v), 2) + "\n");
}

interface CompareRow {
  value: string; compose: string; id: string; rate4: number; priorMean: number; top: number; difficulty: number; tierAgent: number;
  baseAgent: number; baseAgentOwn: number; loss: number; chars: number; sentences: number; source: string; seconds: number; levels: number;
}
interface SweepRow {
  family: string; interaction: string; param: string; values: number[]; status: string; live: LiveReport | null; error: string;
  exactMax: number; exactMissed: number; exactAdded: number; exactTop: number; baseTop: number;
}

interface CheckRow {
  id: string; family: string; interaction: string; status: string; source: string; levels: number; top: number; baseTop: number; tierTop: number[]; added: number;
  how: string; sampled: boolean; rows: (TierError & { hits?: number })[]; maxError: number; missed: number; refTop: number; refAdded: number;
}
interface BuildRow { id: string; kind: string; levels: number; seconds: number }

const f = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "–" : Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "∞" : "–");

export function markdown(r: { variants: VariantReport[]; pairs: PairReport[]; gameReports: GameReport[]; beginner: string[]; comparison: CompareRow[]; sweep: SweepRow[]; checks?: CheckRow[]; builds?: BuildRow[]; compose: string; budget: string }): string {
  const out: string[] = [];
  const tiered = r.variants.filter(v => v.tier);
  if (r.variants.length) {
    out.push(`### Profile (${r.compose} draws, ${r.budget} budget)`, "",
      "| variant | table | levels | build s | top | +top | prior mean | rate4 | g10 | g20 | trap | gap | esc2 | K | **DIFF** | base agent | accidental | tier agent | tier share |",
      "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|",
      ...r.variants.map(v => {
        const q = v.report, t = v.tier;
        return `| ${v.id} | ${v.table.from} ${v.table.kind} | ${v.table.levels} | ${f(v.table.seconds)} | ${f(q.topBits)} | ${t ? f(t.addedTop) : ""} | ${f(v.table.priorMean, 2)} | ${f(q.rate4, 2)} | ${f(q.greedy10)} | ${f(q.greedy20)} | ${f(q.trap, 2)} | ${f(q.gap, 2)} | ${f(q.escape2, 2)} | ${f(q.entangle)} | **${f(q.difficulty)}** | ${t ? f(t.baseAgent) : ""} | ${t ? f(t.accidental, 2) : ""} | ${t ? f(t.tierAgent) : ""} | ${t ? f(t.tierShare, 2) : ""} |`;
      }), "");
  }
  if (tiered.some(v => v.live)) {
    out.push("### Liveness at the base's top (hybrid law)", "",
      "| variant | tier min | tier top | share at top | added bits | degenerate boards | problems |", "|---|--:|--:|--:|--:|---|---|",
      ...tiered.filter(v => v.live).map(v => `| ${v.id} | ${key(v.live!.tierMin)} | ${key(v.live!.tierTop)} | ${v.live!.shareAtTop.toExponential(2)} | ${f(v.live!.addedBits)} | ${v.live!.degenerate.length ? `${v.live!.degenerate.length} (${v.live!.degenerate[0]})` : "none"} | ${v.live!.problems.join("; ") || "alive"} |`), "");
  }
  if (tiered.some(v => v.exact)) {
    out.push("### Calibration error against the exact law at the base's top", "",
      "Bits of P(tier ≥ i | base at its top): hybrid / exact, at every tier level the exact law has (– : the hybrid never saw the level).", "",
      "| variant | boards | levels: tier hybrid/exact | max error (bits) | levels missed |", "|---|--:|---|--:|--:|",
      ...tiered.filter(v => v.exact).map(v => `| ${v.id} | ${v.exact!.boards.toExponential(0)} | ${v.exact!.rows.map(x => `${x.tier}: ${f(x.hybrid, 2)}/${f(x.exact, 2)}`).join(", ")} | ${f(v.exact!.maxError, 2)} | ${v.exact!.missed} |`), "");
  }
  if (r.pairs.length) {
    out.push(`### Synergy SYN (ceiling) with the beginner eight`, "",
      `| variant | ${r.beginner.join(" | ")} | mean SYN |`, `|---|${r.beginner.map(() => "--:").join("|")}|--:|`);
    for (const a of [...new Set(r.pairs.map(p => p.a))]) {
      const row = r.beginner.map(b => r.pairs.find(p => p.a === a && p.b === b)!);
      out.push(`| ${a} | ${row.map(p => `${f(p.difficulty, 0)} (${f(p.ceiling, 2)})`).join(" | ")} | ${f(mean(row.map(p => p.difficulty)))} |`);
    }
    out.push("");
  }
  if (r.gameReports.length) out.push("### Three-player games", "",
    "Seat 0 is dealt the variant, the other two seats a random pair of the beginner eight; same seeds, seat 0 playing the base only or the whole rule.", "",
    "| variant | games | win (base play) | win (tier play) | bits (base play) | bits (tier play) | payoff ratio |", "|---|--:|--:|--:|--:|--:|--:|",
    ...r.gameReports.map(g => `| ${g.id} | ${g.games} | ${f(g.winBase, 2)} | ${f(g.winTier, 2)} | ${f(g.ownBase)} | ${f(g.ownTier)} | ${f(g.payRatio, 2)} |`), "");
  if (r.comparison.length) out.push("### Composition comparison", "",
    "| value | composition | rate4 | prior mean | top | DIFF | tier agent @48 | base-only @48 on this table | base-only @48 on the base table | base-only loses | card chars | summary sentences | table | levels | build s |",
    "|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|--:|--:|",
    ...r.comparison.map(c => `| ${c.value} | ${c.compose} | ${f(c.rate4, 2)} | ${f(c.priorMean, 2)} | ${f(c.top)} | ${f(c.difficulty)} | ${f(c.tierAgent)} | ${f(c.baseAgent)} | ${f(c.baseAgentOwn)} | ${f(c.loss)} | ${c.chars} | ${c.sentences} | ${c.source} | ${c.levels} | ${f(c.seconds)} |`), "");
  if (r.sweep.length) out.push("### Liveness sweep", "",
    "| family | interaction | value(s) | status | tier min–top | share at top | added bits (hybrid) | added bits (exact) | tier top (exact) | max error (bits) | hybrid s | problems |",
    "|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|---|",
    ...r.sweep.map(s => `| ${s.family} | ${s.interaction} | ${s.param} = ${s.values.join(", ")} | ${s.status} | ${s.live ? `${key(s.live.tierMin)}–${key(s.live.tierTop)}` : "–"} | ${s.live ? s.live.shareAtTop.toExponential(2) : "–"} | ${s.live ? f(s.live.addedBits) : "–"} | ${f(s.exactAdded)} | ${f(s.exactTop, 0)} | ${f(s.exactMax, 2)}${s.exactMissed ? ` (${s.exactMissed} missed)` : ""} | ${s.live ? f(s.live.seconds) : "–"} | ${s.live ? s.live.problems.join("; ") || "alive" : s.error} |`), "");
  if (r.checks?.length) out.push("### Shipped tables against the reference law at the base's top", "",
    "Bits of P(tier ≥ i | base at its top): table / reference at every tier level of the reference (a sampled reference shows its boards at that level in brackets; its max error counts only levels with at least 100 boards).", "",
    "| variant | status | table levels | table top | tier top | added bits (table) | added bits (reference) | levels: tier table/reference | max error (bits) | levels missed | reference |",
    "|---|---|--:|--:|--:|--:|--:|---|--:|--:|---|",
    ...r.checks.map(c => `| ${c.id} | ${c.status} | ${f(c.levels, 0)} | ${f(c.top, 2)} | ${key(c.tierTop)} | ${f(c.added, 2)} | ${f(c.refAdded, 2)}${c.sampled ? ` at ${c.refTop}` : ""} | ${c.rows.map(x => `${x.tier}: ${f(x.hybrid, 2)}/${f(x.exact, 2)}${x.hits === undefined ? "" : ` [${x.hits}]`}`).join(", ")} | ${f(c.maxError, 2)} | ${c.missed} | ${c.how} |`), "");
  if (r.builds?.length) out.push("### One fresh build", "", "| draw | estimator | levels | seconds |", "|---|---|--:|--:|",
    ...r.builds.map(b => `| ${b.id} | ${b.kind} | ${b.levels} | ${f(b.seconds)} |`), "");
  return out.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
