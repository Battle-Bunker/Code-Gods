/**
 * The scoring trial's DYNAMIC mode (docs/engine-v2/scoring-trial.md, "Dynamic energy"; the owner, 16 November, late):
 * "for a given state we calculate the utility for current player and then sample heuristic defined paths with some
 * randomness from random states in its neighbourhood and estimate the expected cost of reaching a state with at least
 * that utility from this neighbourhood. The ceiling cost will be the average best single mutation move from a random
 * neighbour to the actual currently being evaluated state". No tables, no levels, no lift. Comparison only.
 *
 *   energy(s, u) = mean over K neighbours x of min(cap(x), search(x → any y with u(y) ≥ u(s)))
 *
 * - Utility: any function of the line's readings (gradient m, y-intercept c, x-crossing X, signed area); continuous
 *   (the owner: "utility to be able to be a continuous quantity"), so conjunctions are just functions (min, product).
 *   A utility may offer hints: reading values it would like (its nearest targets), the "solved amounts where solvable".
 * - Neighbour: s after a short random walk of menu moves (line-q's full menu), arguments drawn from each move's own
 *   code (scale-free), so no representation is privileged and the scorer need not know which readings u reads.
 * - cap(x): the walk's own price, which is the price of walking back (a move and its inverse share a fee, built for
 *   the additions and mirrors; the friction distance is symmetric).
 * - search: a beam search of up to `depth` moves, each from a candidate set read off the line it starts from: the
 *   solved move putting one reading on s's value of it (either sign) or on a hinted value (tilt, shift, cross.shift,
 *   area.shift, stretch by the exact ratio), plus shortcuts (the four mirrors, stretches by 2, 3, 1/2, 1/3, −1). Kept per
 *   step: the `beam` best by utility; then `restarts` greedy chains picking at random among the five best.
 * - Price: the log trial's friction (TRIAL_LOG: the game's fee for the call, floored by the friction distance).
 * - Seeded by hash(state, utility, seed): the same state always scores the same.
 * Nothing is computed at import time.
 */
import { Qn, q, rng as makeRng, type Q, type Rng } from "@workspace/v2-core";
import { encodeLine, isVertical, type Line } from "./line.ts";
import { allMutators } from "./mutators.ts";
import { lineQ } from "./type.ts";
import { callPrice, isPrimeN, TRIAL_LOG } from "./trial.ts";

// ------------------------------------------------------------------ readings and utilities

export interface Readings { readonly m: number; readonly c: number; readonly X: number | null; readonly area: number | null }
const mq = (l: Line): Q => q(-l.a, l.b), cq = (l: Line): Q => q(-l.c, l.b);
export function readings(l: Line): Readings | null {
  if (isVertical(l)) return null;
  const m = Qn.toNumber(mq(l)), c = Qn.toNumber(cq(l));
  return { m, c, X: m === 0 ? null : -c / m, area: m === 0 || c === 0 ? null : -(c * c) / (2 * m) };
}
/** Reading values a utility would like the line to take (its nearest targets). */
export interface Hints { readonly m?: readonly number[]; readonly c?: readonly number[]; readonly X?: readonly number[] }
export interface DynamicUtility {
  readonly id: string;
  readonly label: string;
  u(r: Readings): number;
  hints?(r: Readings): Hints;
}

/** The nearest whole numbers n ≥ 1 below-or-at and above x with ok(n) (searching at most `reach` steps each way). */
function nearestWith(x: number, ok: (n: number) => boolean, reach = 2000): { below: number | null; above: number | null } {
  const f = Math.max(1, Math.floor(Math.abs(x)));
  let below: number | null = null, above: number | null = null;
  for (let n = f, i = 0; n >= 1 && i < reach; n--, i++) if (ok(n)) { below = n; break; }
  for (let n = f + 1, i = 0; i < reach; n++, i++) if (ok(n)) { above = n; break; }
  return { below, above };
}
const closer = (x: number, a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.abs(x - a) <= Math.abs(x - b) ? a : b);
const both = (xs: (number | null)[]) => xs.filter((v): v is number => v !== null).flatMap(v => [v, -v]);
/** Prime factors counted with repeats; past 1e9 only the factors below 1000 are found and the rest counts as one. */
function factorCount(n: number): Map<number, number> {
  const out = new Map<number, number>();
  let x = Math.abs(Math.round(n));
  const lim = x > 1e9 ? 1000 : Math.sqrt(x);
  for (let p = 2; p <= lim && x > 1; p++) while (x % p === 0) { out.set(p, (out.get(p) ?? 0) + 1); x /= p; }
  if (x > 1) out.set(x, (out.get(x) ?? 0) + 1);
  return out;
}
const omega = (n: number) => [...factorCount(n).values()].reduce((a, b) => a + b, 0);

/** Primes ending in 1 on |m|: log2 of the nearest one, less the square root of the distance to it. */
/** Past 1e12 nothing counts as a prime (a bound on the cost of a reading; such lines are far off the climbs measured). */
const primeOk = (n: number) => n % 10 === 1 && n < 1e12 && isPrimeN(n);
function primeNear(x: number) { const { below, above } = nearestWith(x, primeOk); return { p: closer(Math.abs(x), below, above) ?? 11, below, above }; }
export const primeGradientU: DynamicUtility = {
  id: "prime-gradient", label: "|m| near a prime ending in 1 (log2 p − √distance)",
  u: r => { const { p } = primeNear(r.m); return Math.log2(p) - Math.sqrt(Math.abs(Math.abs(r.m) - p)); },
  hints: r => { const { below, above } = primeNear(r.m), next = above === null ? null : nearestWith(above + 1, primeOk).above; return { m: both([below, above, next]) }; },
};
/** Numbers made of 3s and 7s on |c|: Ω of the nearest one, less the square root of the distance. */
function smoothNear(x: number): { s: number; list: number[] } {
  const top = 2 * Math.abs(x) + 64, list: number[] = [];
  for (let a = 1; a <= top; a *= 3) for (let b = a; b <= top; b *= 7) if (b >= 3) list.push(b);
  list.sort((a, b) => a - b);
  const s = list.reduce((best, v) => (Math.abs(v - Math.abs(x)) < Math.abs(best - Math.abs(x)) ? v : best), list[0]!);
  return { s, list };
}
export const smoothInterceptU: DynamicUtility = {
  id: "smooth-intercept", label: "|c| near a number made of 3s and 7s (Ω − √distance)",
  u: r => { const { s } = smoothNear(r.c); return omega(s) - Math.sqrt(Math.abs(Math.abs(r.c) - s)); },
  hints: r => { const { s, list } = smoothNear(r.c), i = list.indexOf(s); return { c: both([s, list[i + 1] ?? null, list[i - 1] ?? null]) }; },
};
/**
 * The owner's example, k = 3: "length of nearest multiple of k to y intercept minus sqrt of distance to that multiple of
 * k all times (number of k factors minus other factors)". Length read as log2 |n| (my choice: continuous).
 */
export const ownerU: DynamicUtility = {
  id: "owner-k3", label: "(log2|n| − √|c − n|) × (3s in n − other factors), n the nearest multiple of 3 to c",
  u: r => {
    const n = 3 * Math.round(r.c / 3) || 3 * (Math.sign(r.c) || 1), f = factorCount(n), k = f.get(3) ?? 0, others = omega(n) - k;
    return (Math.log2(Math.abs(n)) - Math.sqrt(Math.abs(r.c - n))) * (k - others);
  },
  hints: r => {
    const n = 3 * Math.round(r.c / 3) || 3, j = Math.max(1, Math.round(Math.log(Math.max(3, Math.abs(r.c))) / Math.log(3)));
    return { c: both([n, n + 3, n - 3, 3 ** (j - 1), 3 ** j, 3 ** (j + 1)]) };
  },
};
/** Bigger is better: |c| itself. */
export const biggerU: DynamicUtility = { id: "bigger-c", label: "|c|, bigger is better", u: r => Math.abs(r.c) };
const gcdN = (a: number, b: number): number => (b === 0 ? a : gcdN(b, a % b));
/** A tied conjunction: the prime-gradient utility AND log2 gcd(p + 1, ⌊|c|⌋), taken as their minimum. */
export const tiedU: DynamicUtility = {
  id: "tied-gcd", label: "min(prime-gradient utility, log2 gcd(p + 1, ⌊|c|⌋)), p the gradient's prime",
  u: r => { const { p } = primeNear(r.m), n = Math.floor(Math.abs(r.c)); return Math.min(Math.log2(p) - Math.sqrt(Math.abs(Math.abs(r.m) - p)), Math.log2(n >= 1 ? gcdN(p + 1, n) : 1)); },
  hints: r => {
    const { p } = primeNear(r.m), divisors: number[] = [];
    for (let d = 2; d <= p + 1; d++) if ((p + 1) % d === 0) divisors.push(d);
    const c = Math.abs(r.c), cs = divisors.slice(-4).flatMap(d => [Math.max(d, Math.floor(c / d) * d), Math.ceil(c / d) * d]);
    return { m: primeGradientU.hints!(r).m, c: both(cs) };
  },
};
export const dynamicExamples: readonly DynamicUtility[] = [biggerU, primeGradientU, smoothInterceptU, ownerU, tiedU];

// ------------------------------------------------------------------ moves and prices

const BY_ID = new Map(allMutators.map(m => [m.id, m]));
type Mv = { readonly id: string; readonly args: Readonly<Record<string, unknown>> };
function applyMv(mv: Mv, l: Line): Line | null {
  const r = BY_ID.get(mv.id)!.apply({ lines: [l] }, 0, mv.args as never, lineQ);
  return "invalid" in r || isVertical(r.lines[0]!) ? null : r.lines[0]!;
}
const priceOf = (mv: Mv, a: Line, b: Line) => callPrice(mv.id, mv.args, a, b, TRIAL_LOG)?.friction ?? Infinity;
/** A number as a fraction: exact when whole, else the nearest with a bottom up to 64. */
function toQ(v: number): Q | null {
  if (!Number.isFinite(v)) return null;
  if (Number.isInteger(v) && Math.abs(v) < 2 ** 53) return q(BigInt(v));
  let best = q(Math.round(v)), err = Math.abs(Math.round(v) - v);
  for (let d = 2; d <= 64; d++) { const n = Math.round(v * d), e = Math.abs(n / d - v); if (e < err) { best = q(n, d); err = e; } }
  return best;
}
const SHORTCUTS: Mv[] = [
  ...["x", "y", "origin", "diagonal"].map(axis => ({ id: "cart.mirror", args: { axis } })),
  ...[q(2), q(3), q(1, 2), q(1, 3), q(-1)].map(f => ({ id: "mach.stretch", args: { f } })),
];
/** Target readings: s's own (exact, either sign) and the utility's hints at x. */
export interface Aims { m: Q[]; c: Q[]; X: Q[]; area: Q[] }
export function anchorsOf(s: Line): Aims {
  const m = mq(s), c = cq(s), sign = (v: Q) => [v, Qn.neg(v)];
  return { m: sign(m), c: sign(c), X: Qn.isZero(m) ? [] : sign(Qn.div(Qn.neg(c), m)), area: Qn.isZero(m) || Qn.isZero(c) ? [] : [Qn.div(Qn.neg(Qn.mul(c, c)), Qn.mul(q(2), m))] };
}
function candidates(x: Line, anchors: Aims, U: DynamicUtility, r: Readings): Mv[] {
  const h = U.hints?.(r) ?? {}, conv = (vs: readonly number[] | undefined) => (vs ?? []).map(toQ).filter((v): v is Q => v !== null);
  const m = mq(x), c = cq(x), out: Mv[] = [...SHORTCUTS];
  const ms = [...anchors.m, ...conv(h.m)], cs = [...anchors.c, ...conv(h.c)], Xs = [...anchors.X, ...conv(h.X)];
  for (const v of ms) if (!Qn.eq(v, m)) { out.push({ id: "si.tilt", args: { k: Qn.sub(v, m) } }); if (!Qn.isZero(m) && !Qn.isZero(v)) out.push({ id: "mach.stretch", args: { f: Qn.div(v, m) } }); }
  for (const v of cs) if (!Qn.eq(v, c)) {
    out.push({ id: "si.shift", args: { k: Qn.sub(v, c) } });
    if (!Qn.isZero(m)) out.push({ id: "cross.shift", args: { k: Qn.div(Qn.sub(c, v), m) } });
    if (!Qn.isZero(c) && !Qn.isZero(v)) out.push({ id: "mach.stretch", args: { f: Qn.div(v, c) } });
  }
  if (!Qn.isZero(m)) {
    const X = Qn.div(Qn.neg(c), m);
    for (const v of Xs) if (!Qn.eq(v, X)) { out.push({ id: "cross.shift", args: { k: Qn.sub(v, X) } }); if (!Qn.isZero(v) && !Qn.isZero(c)) out.push({ id: "si.tilt", args: { k: Qn.sub(Qn.div(Qn.neg(c), v), m) } }); }
    if (!Qn.isZero(c)) { const A = Qn.div(Qn.neg(Qn.mul(c, c)), Qn.mul(q(2), m)); for (const v of anchors.area) if (!Qn.eq(v, A)) out.push({ id: "area.shift", args: { k: Qn.sub(v, A) } }); }
  }
  return out.filter(mv => !(mv.id === "mach.stretch" && Qn.eq(mv.args.f as Q, q(1))));
}

// ------------------------------------------------------------------ the search and the energy

export interface SearchOpts { readonly depth: number; readonly beam: number; readonly restarts: number }
export const REFERENCE: SearchOpts = { depth: 3, beam: 3, restarts: 2 };
export const DEEP: SearchOpts = { depth: 5, beam: 8, restarts: 6 };
export interface Found { readonly cost: number; readonly route: readonly string[] }
interface Node { line: Line; cost: number; route: string[]; u: number; mv?: Mv; parent?: Node }

/** The cheapest route the search finds from x to a line with u ≥ uStar (cost Infinity if none). */
export function searchFrom(x: Line, U: DynamicUtility, uStar: number, anchors: Aims, o: SearchOpts, r: Rng, stats: { evals: number }): Found {
  let best: Found = { cost: Infinity, route: [] };
  const rx = readings(x);
  if (!rx) return best;
  stats.evals++;
  if (U.u(rx) >= uStar - 1e-9) return { cost: 0, route: [] };
  const run = (pick: (kids: Node[]) => Node[]) => {
    let frontier: Node[] = [{ line: x, cost: 0, route: [], u: -Infinity }];
    for (let d = 0; d < o.depth && frontier.length; d++) {
      const kids: Node[] = [];
      for (const node of frontier) {
        const rn = readings(node.line);
        if (!rn) continue;
        for (const mv of candidates(node.line, anchors, U, rn)) {
          const y = applyMv(mv, node.line), ry = y && readings(y);
          if (!y || !ry) continue;
          stats.evals++;
          const uy = U.u(ry);
          if (uy >= uStar - 1e-9) { const c = node.cost + priceOf(mv, node.line, y); if (c < best.cost) best = { cost: c, route: [...node.route, mv.id] }; continue; }
          if (d + 1 < o.depth) kids.push({ line: y, cost: node.cost, route: [...node.route, mv.id], u: uy, mv, parent: node });
        }
      }
      // Price only the kept children (the step's price is the last route entry's move).
      frontier = pick(kids).map(k => ({ ...k, cost: k.parent!.cost + priceOf(k.mv!, k.parent!.line, k.line) })).filter(k => k.cost < best.cost);
    }
  };
  const byU = (kids: Node[]) => [...kids].sort((a, b) => b.u - a.u);
  run(kids => byU(kids).slice(0, o.beam));
  for (let i = 0; i < o.restarts; i++) run(kids => { const top = byU(kids).slice(0, 5); return top.length ? [top[r.below(top.length)]!] : []; });
  return best;
}

/** A short random walk of menu moves with arguments from each move's own code; its price is the cap. */
export function walkFrom(s: Line, steps: number, r: Rng): { line: Line; cost: number } {
  let line = s, cost = 0;
  for (let i = 0; i < steps; i++) {
    for (let t = 0; t < 30; t++) {
      const id = lineQ.mutators[r.below(lineQ.mutators.length)]!, m = BY_ID.get(id)!, a = m.args(lineQ).sample(r);
      if (!a) continue;
      const res = m.apply({ lines: [line] }, 0, a, lineQ);
      if ("invalid" in res || isVertical(res.lines[0]!)) continue;
      const p = priceOf({ id, args: a }, line, res.lines[0]!);
      if (!Number.isFinite(p)) continue;
      cost += p; line = res.lines[0]!;
      break;
    }
  }
  return { line, cost };
}

export interface DynamicOpts { readonly K?: number; readonly walk?: number; readonly search?: SearchOpts; readonly seed?: string }
export interface DynamicEnergy {
  readonly energy: number; readonly u: number; readonly evals: number;
  /** Mean cap (the walk's price) and the share of neighbours where the search beat it. */
  readonly cap: number; readonly beat: number;
  readonly samples: readonly { readonly cap: number; readonly found: Found; readonly from: Line }[];
}
/** energy(s, u): the mean over K neighbours of min(cap, the search's price to u ≥ u(s)). */
export function dynamicEnergy(s: Line, U: DynamicUtility, o: DynamicOpts = {}): DynamicEnergy {
  const K = o.K ?? 30, walk = o.walk ?? 3, search = o.search ?? REFERENCE, r = makeRng("dynamic", encodeLine(s), U.id, o.seed ?? "");
  const rs = readings(s), stats = { evals: 1 };
  if (!rs) return { energy: NaN, u: NaN, evals: 0, cap: NaN, beat: 0, samples: [] };
  const uStar = U.u(rs), anchors = anchorsOf(s), samples: { cap: number; found: Found; from: Line }[] = [];
  let sum = 0, capSum = 0, beat = 0;
  for (let i = 0; i < K; i++) {
    const w = walkFrom(s, walk, r), found = searchFrom(w.line, U, uStar, anchors, search, r, stats);
    sum += Math.min(w.cost, found.cost); capSum += w.cost; if (found.cost < w.cost) beat++;
    samples.push({ cap: w.cost, found, from: w.line });
  }
  return { energy: sum / K, u: uStar, evals: stats.evals, cap: capSum / K, beat: beat / K, samples };
}
