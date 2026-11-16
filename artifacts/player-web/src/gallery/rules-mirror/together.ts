/**
 * The mirror's second view (docs/engine-v2/interaction-census.md): two or three rules on one line, and a small map of the
 * lines near it where all of them do well together. Pure.
 *
 * The map's measure is the census's, on a small window: each rule ranks the window's lines by its own score (main part,
 * then its dealt layers), a line's standing for a rule is the share of the window it beats or ties, and a line's joint
 * standing is the weakest of the rules' standings. It is not the game's worth (no value files exist for undealt rules,
 * and the window is not the law): it says where the rules agree, near this line.
 */
import { evaluateSite, Qn, q, rng, type Q, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, type LineState } from "@workspace/v2-linear";

export interface TogetherRule { readonly family: RuleFamily<LineState, unknown>; readonly params: unknown; readonly tieBreaker: TieBreaker }
export interface MapCell { readonly m: Q; readonly c: Q; readonly standing: readonly number[]; readonly joint: number }
export interface TogetherMap { readonly ms: readonly Q[]; readonly cs: readonly Q[]; readonly cells: readonly MapCell[]; readonly best: readonly MapCell[] }

/** A rule's score as numbers, best compared first (−Infinity for a missing part, so a line it cannot score ranks last). */
export function scoreVector(r: TogetherRule, s: LineState): number[] {
  const depth = 1 + (r.tieBreaker ? r.tieBreaker.split(">").length : 0);
  let sc: readonly (Q | null)[] | null = null;
  try { sc = evaluateSite(lineType, r.family, r.params, s, lineQ, 0, r.tieBreaker).score as never; } catch { sc = null; }
  return Array.from({ length: depth }, (_, i) => (sc && sc[i] ? Qn.toNumber(sc[i]!) : -Infinity));
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1; return 0; };

/**
 * The window around (m, c): `half` steps either side, gradient in steps of `dm` and y-intercept in steps of `dc`. Each
 * cell's standing per rule (the share of the window at or below its score) and the weakest of them; `best` are the
 * cells whose joint standing is at least `top`, best first (local peaks only: no better neighbour).
 */
export function togetherMap(rules: readonly TogetherRule[], m: Q, c: Q, o: { half?: number; dm?: Q; dc?: Q; top?: number } = {}): TogetherMap {
  const half = o.half ?? 8, dm = o.dm ?? q(1, 2), dc = o.dc ?? q(1), top = o.top ?? 0.85;
  const ms = Array.from({ length: 2 * half + 1 }, (_, i) => Qn.add(m, Qn.mul(dm, q(i - half))));
  const cs = Array.from({ length: 2 * half + 1 }, (_, j) => Qn.add(c, Qn.mul(dc, q(j - half))));
  const vecs = rules.map(r => ms.flatMap(mm => cs.map(cc => scoreVector(r, { lines: [fromMC(mm, cc)] }))));
  const n = ms.length * cs.length;
  const standing = vecs.map(v => {
    const order = v.map((x, k) => [x, k] as const).sort((a, b) => cmp(a[0], b[0]));
    const out = new Array<number>(n);
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && cmp(order[j + 1]![0], order[i]![0]) === 0) j++; for (let t = i; t <= j; t++) out[order[t]![1]] = (j + 1) / n; i = j + 1; }
    return out;
  });
  const cells: MapCell[] = [];
  for (let i = 0; i < ms.length; i++) for (let j = 0; j < cs.length; j++) {
    const k = i * cs.length + j, st = standing.map(s => s[k]!);
    cells.push({ m: ms[i]!, c: cs[j]!, standing: st, joint: Math.min(...st) });
  }
  const at = (i: number, j: number) => cells[i * cs.length + j];
  const best = cells.filter((x, k) => {
    if (x.joint < top) return false;
    const i = Math.floor(k / cs.length), j = k % cs.length;
    return [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].every(([a, b]) => { const y = at(a!, b!); return !y || a! < 0 || b! < 0 || a! >= ms.length || b! >= cs.length || y.joint <= x.joint; });
  }).sort((a, b) => b.joint - a.joint);
  return { ms, cs, cells, best };
}

/** Rules drawn from the families given: a parameter set from each family's space (else its listed sets) and a chain. */
export function drawRules(families: readonly RuleFamily<LineState, unknown>[], count: number, seed: string): TogetherRule[] {
  const r = rng(seed), out: TogetherRule[] = [];
  const pool = [...families];
  while (out.length < count && pool.length) {
    const family = pool.splice(r.below(pool.length), 1)[0]!;
    const listed = family.dealable(lineQ);
    const params = family.space ? family.space.draw(r) : listed[r.below(listed.length)];
    if (params === undefined) continue;
    const chains = family.chains ?? (family.valuation === "tree" ? [family.tieBreakers.map(t => t.id).join(">")] : family.tieBreakers.map(t => t.id));
    out.push({ family, params, tieBreaker: chains.length ? chains[r.below(chains.length)]! : null });
  }
  return out;
}
