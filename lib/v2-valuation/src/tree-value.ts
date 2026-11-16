/**
 * Tree values for tuple rules (design-principles.md principle 3b; the owner chose "level plus closeness", 16 Nov:
 * "something more like a tree structure in exploring score space"). For a score (u0, u1, u2, …) — the nearest target,
 * how close (stored as minus the distance), a third part against that target —
 *
 *   bits = −log2 P(U0 ≥ u0) − log2 P(U1 ≥ u1 | U0 = u0) − log2 P(U2 ≥ u2 | U0 = u0, U1 ≥ u1),
 *
 * the chain rule down the tree, so the product of the three is at least the law's mass of {U0 = u0, U1 ≥ u1, U2 ≥ u2},
 * which holds the state: bits ≤ the state's code length.
 *
 * Estimated from the same importance-weighted law draws as the lexicographic values (value.ts sampledDraws):
 * - the level, P(U0 ≥ u0): weighted tail mass over distinct u0 values;
 * - a cell for each u0 value with at least MIN_CELL draws: closeness knots (the weighted share of the cell at least
 *   this close), and for the third, one table per closeness bucket (the cell's draws at least as close as the bucket's
 *   edge). A u0 value with fewer draws reads the measured cell nearest below it (`borrowed` in the lookup's parts).
 * - nothing beyond the best measured u0: the level term stops growing there (no extrapolation).
 */
import { Qn, type Q, type Score } from "@workspace/v2-core";

export const MIN_CELL = 200;
/** Closeness buckets for the third: draws at least as close as these quantiles of the cell (1 = all of it). */
const BUCKETS = [0.02, 0.1, 0.3, 1];

interface Knot { readonly u: number; readonly bits: number }
interface Cell { readonly u0: number; readonly n: number; readonly close: readonly Knot[]; readonly third: readonly { readonly edge: number; readonly knots: readonly Knot[] }[] }
/**
 * `inner`: the most bits each part below the level may add (the coordinator's call, 16 Nov, on the spec lead's and the
 * rule design session's measurements: an exact hit was worth 4 to 14 bits of closeness, most of the score, so a climb
 * stopped at the first exact hit; capped, the level carries the score and the climb goes on). Capping only lowers bits,
 * so bits ≤ the state's code length still holds.
 */
export interface TreeValue { readonly levels: readonly Knot[]; readonly cells: readonly Cell[]; readonly depth: number; readonly inner?: number }
/** The default bound on each inner part, in bits. */
export const TREE_INNER_BITS = 2;

const num = (x: Q | null | undefined): number => (x === null || x === undefined ? -Infinity : Qn.toNumber(x));

/** Knots of −log2 P(V ≥ v) over weighted values (best last), thinned to at most `max`. */
function tailKnots(vs: readonly { v: number; w: number }[], max = 60): Knot[] {
  const s = vs.slice().sort((a, b) => a.v - b.v), W = s.reduce((t, x) => t + x.w, 0);
  const out: Knot[] = [];
  let above = W;
  for (let i = 0; i < s.length; ) {
    const v = s[i]!.v;
    out.push({ u: v, bits: -Math.log2(Math.max(above, 1e-300) / W) });
    while (i < s.length && s[i]!.v === v) above -= s[i++]!.w;
  }
  if (out.length <= max) return out;
  // Thin by bits, not by count: keep a knot when its bits rose by at least the step since the last kept one.
  const step = 0.02, kept: Knot[] = [out[0]!];
  for (const k of out.slice(1)) if (k.bits - kept[kept.length - 1]!.bits >= step) kept.push(k);
  return kept;
}
/** The bits of v on knots (the last knot at most v; 0 below the first). */
function at(ks: readonly Knot[], v: number): number {
  let a = 0, b = ks.length;
  while (a < b) { const h = (a + b) >> 1; if (ks[h]!.u <= v) a = h + 1; else b = h; }
  return a === 0 ? 0 : ks[a - 1]!.bits;
}

export function buildTree(draws: readonly { u: Score; w: number }[], inner: number = TREE_INNER_BITS): TreeValue {
  const ok = draws.filter(d => d.u !== null && d.u[0] !== null) as { u: NonNullable<Score>; w: number }[];
  const depth = ok.reduce((m, d) => Math.max(m, d.u.length), 1);
  const levels = tailKnots(ok.map(d => ({ v: num(d.u[0]), w: d.w })), 400);
  const groups = new Map<number, { u: NonNullable<Score>; w: number }[]>();
  for (const d of ok) { const k = num(d.u[0]); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(d); }
  const cells: Cell[] = [];
  for (const [u0, g] of [...groups].sort((a, b) => a[0] - b[0])) {
    if (g.length < MIN_CELL) continue;
    // A cell resolves at most log2(its draws) bits: a rarer closeness than one draw in the cell is not measured.
    const cap = (ks: Knot[]) => ks.map(k => ({ u: k.u, bits: Math.min(k.bits, Math.log2(g.length)) }));
    const close = cap(tailKnots(g.map(d => ({ v: num(d.u[1]), w: d.w }))));
    const third: Cell["third"][number][] = [];
    if (depth >= 3) {
      const byClose = g.slice().sort((a, b) => num(b.u[1]) - num(a.u[1]));
      for (const q of BUCKETS) {
        const n = Math.max(1, Math.ceil(q * byClose.length)), edge = num(byClose[n - 1]!.u[1]);
        const sub = byClose.filter(d => num(d.u[1]) >= edge);
        third.push({ edge, knots: tailKnots(sub.map(d => ({ v: num(d.u[2]), w: d.w }))).map(k => ({ u: k.u, bits: Math.min(k.bits, Math.log2(sub.length)) })) });
      }
    }
    cells.push({ u0, n: g.length, close, third });
  }
  return { levels, cells, depth, inner };
}

export interface TreeLookup { bits: number; parts: number[]; borrowed: boolean }
export function treeLookup(t: TreeValue): (u: Score) => TreeLookup {
  return (u: Score) => {
    if (u === null || u[0] === null) return { bits: 0, parts: [0], borrowed: false };
    const u0 = num(u[0]), b0 = at(t.levels, u0);
    // The cell for u0, or the measured one nearest below it.
    let cell: Cell | undefined, a = 0, b = t.cells.length;
    while (a < b) { const h = (a + b) >> 1; if (t.cells[h]!.u0 <= u0) a = h + 1; else b = h; }
    cell = a > 0 ? t.cells[a - 1] : undefined;
    if (!cell) return { bits: b0, parts: [b0], borrowed: false };
    const cap = t.inner ?? Infinity, u1 = num(u[1]), b1 = Math.min(cap, u.length > 1 ? at(cell.close, u1) : 0);
    let b2 = 0;
    if (u.length > 2 && cell.third.length) {
      // The tightest bucket whose edge this closeness reaches (at least as close as its edge).
      const bucket = cell.third.find(x => u1 >= x.edge) ?? cell.third[cell.third.length - 1]!;
      b2 = Math.min(cap, at(bucket.knots, num(u[2])));
    }
    return { bits: b0 + b1 + b2, parts: [b0, b1, b2].slice(0, u.length), borrowed: cell.u0 !== u0 };
  };
}
