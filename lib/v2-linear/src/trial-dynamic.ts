/**
 * The scoring trial's DYNAMIC mode (docs/engine-v2/scoring-trial.md, "Dynamic energy"; the owner, 16 November, late).
 * Comparison only. The owner: "energy of an object is the expected energy cost of reaching a state at least this good
 * from a random object of the same 'size' ... we can still make the sampling from size neighbourhoods calibrated to the
 * representations used by the rule being evaluated"; "every rule defines its own intelligent search heuristics to be
 * randomly sampled"; fresh randomness each time ("we can calculate energies again as a natural noise function").
 *
 *   energy(s, F) = mean over K starts x of min(direct(x → s), floor(x), heuristics(x))
 *
 * - A family F: a continuous utility u of the line's readings, the readings it `reads` (the gradient m, the
 *   y-intercept c), and its `searches`: heuristics that propose target readings for a start (parameterised by the
 *   family's drawn parameters). No tables, no levels, no lift.
 * - Start: a random line whose read numbers each have the same size as s's (by default the magnitude: a whole number
 *   whose log2 is uniform in [log2|v|, log2|v| + 0.5); see SizeBy for the bits option), the others from the law. Never
 *   below s, so that a start needs no climb in size to match s (a start below would add the price of climbing, which
 *   the measure subtracts out).
 * - direct (the ceiling): the cheapest solved move, or pair of moves (tilt then shift, shift then tilt), onto s itself.
 * - floor (shared by all families): every single move with a solved amount putting one reading on s's value of it
 *   (either sign): tilt, shift, cross.shift, area.shift, stretch by the exact ratio; the shortcuts (the four mirrors,
 *   stretch by 2, 3, 1/2, 1/3, −1); and each shortcut followed by one such solved move. A route counts when the line it
 *   reaches has u ≥ u(s).
 * - heuristics: each proposes targets (values for the readings it names); a target is reached by the solved moves onto
 *   each named reading (one, or two in either order); and after each shortcut, the targets proposed from where it lands. Every proposal is tried, so adding a heuristic can only lower the
 *   energy for the same starts (built; tested). Heuristics draw from their own random stream.
 * - Price: the log trial's friction (TRIAL_LOG: the game's fee for the call, floored by the friction distance).
 * Nothing is computed at import time.
 */
import { Qn, q, rng as makeRng, type Q, type Rng } from "@workspace/v2-core";
import { isVertical, fromMC, type Line } from "./line.ts";
import { allMutators } from "./mutators.ts";
import { lineQ } from "./type.ts";
import { callPrice, isPrimeN, TRIAL_LOG } from "./trial.ts";
import { drawLine } from "./trial-rarity.ts";

// ------------------------------------------------------------------ readings, families

export interface Readings { readonly m: number; readonly c: number; readonly X: number | null; readonly area: number | null }
const mq = (l: Line): Q => q(-l.a, l.b), cq = (l: Line): Q => q(-l.c, l.b);
export function readings(l: Line): Readings | null {
  if (isVertical(l)) return null;
  const m = Qn.toNumber(mq(l)), c = Qn.toNumber(cq(l));
  return { m, c, X: m === 0 ? null : -c / m, area: m === 0 || c === 0 ? null : -(c * c) / (2 * m) };
}
/** A target: values for some of the readings. */
export interface DynamicTarget { readonly m?: number; readonly c?: number }
/** A search heuristic: target proposals for a start, given the utility to reach. */
export type Heuristic = (start: Readings, uStar: number, r: Rng) => readonly DynamicTarget[];
export interface DynamicFamily {
  readonly id: string;
  readonly label: string;
  /** The readings u depends on; a start matches s's size on these and takes the others from the law. */
  readonly reads: readonly ("m" | "c")[];
  u(r: Readings): number;
  readonly searches: readonly { readonly id: string; readonly propose: Heuristic }[];
}

const closestTo = (x: number, xs: readonly number[], k: number) => [...xs].sort((a, b) => Math.abs(a - x) - Math.abs(b - x)).slice(0, k);
const signed = (v: number, like: number) => (like < 0 ? -v : v);
/** Prime factors with repeats; past 1e9 only those below 1000 are found and the rest counts as one (a cost bound). */
function factorCount(n: number): Map<number, number> {
  const out = new Map<number, number>();
  let x = Math.abs(Math.round(n));
  const lim = x > 1e9 ? 1000 : Math.sqrt(x);
  for (let p = 2; p <= lim && x > 1; p++) while (x % p === 0) { out.set(p, (out.get(p) ?? 0) + 1); x /= p; }
  if (x > 1) out.set(x, (out.get(x) ?? 0) + 1);
  return out;
}
const omega = (n: number) => [...factorCount(n).values()].reduce((a, b) => a + b, 0);
const gcdN = (a: number, b: number): number => (b === 0 ? a : gcdN(b, a % b));

/** Whole n ≥ 1 with ok(n), nearest x: the first at or below and the first above (at most `reach` steps each way). */
function nearestWith(x: number, ok: (n: number) => boolean, reach = 2000): number[] {
  const f = Math.max(1, Math.floor(Math.abs(x))), out: number[] = [];
  for (let n = f, i = 0; n >= 1 && i < reach; n--, i++) if (ok(n)) { out.push(n); break; }
  for (let n = f + 1, i = 0; i < reach; n++, i++) if (ok(n)) { out.push(n); break; }
  return out;
}

/** Primes with the suffix on |m|: log2 of the nearest such prime, less the square root of the distance to it. */
export function primeGradientFamily(suffix: string): DynamicFamily {
  const mod = 10 ** suffix.length, end = Number(suffix);
  // Past 1e12 nothing counts as a prime (a bound on the cost of a reading; far off every state measured).
  const ok = (n: number) => n % mod === end && n < 1e12 && isPrimeN(n);
  const near = (x: number) => closestTo(Math.abs(x), nearestWith(x, ok), 1)[0] ?? 11;
  const u = (r: Readings) => { const p = near(r.m); return Math.log2(p) - Math.sqrt(Math.abs(Math.abs(r.m) - p)); };
  return {
    id: `prime-gradient-${suffix}`, label: `|m| near a prime ending in ${suffix} (log2 p − √distance)`, reads: ["m"], u,
    searches: [{
      // The qualifying primes (log2 p ≥ u*) nearest the start's gradient, either side.
      id: "nearest-qualifying-prime", propose: (x, uStar) => {
        const lo = Math.max(Math.abs(x.m), 2 ** uStar);
        return nearestWith(lo, n => ok(n) && Math.log2(n) >= uStar - 1e-12).map(p => ({ m: signed(p, x.m) }));
      },
    }],
  };
}
/** Numbers made only of the given primes, on |c|: Ω of the nearest, less the square root of the distance. */
export function smoothFamily(primes: readonly number[]): DynamicFamily {
  const list = (top: number) => { const out: number[] = []; const walk = (n: number, i: number) => { if (i === primes.length) { if (n > 1) out.push(n); return; } for (let x = n; x <= top; x *= primes[i]!) walk(x, i + 1); }; walk(1, 0); return out.sort((a, b) => a - b); };
  const u = (r: Readings) => { const c = Math.abs(r.c), s = closestTo(c, list(2 * c + 64), 1)[0]!; return omega(s) - Math.sqrt(Math.abs(c - s)); };
  return {
    id: `smooth-${primes.join("-")}`, label: `|c| near a number made of ${primes.join(" and ")} (Ω − √distance)`, reads: ["c"], u,
    searches: [{
      id: "nearest-smooth-with-enough-factors", propose: (x, uStar) => {
        const c = Math.abs(x.c), good = list(Math.max(64, 8 * c)).filter(s => omega(s) >= uStar - 1e-12);
        return closestTo(c, good, 3).map(s => ({ c: signed(s, x.c) }));
      },
    }],
  };
}
/**
 * The owner's example: "length of nearest multiple of k to y intercept minus sqrt of distance to that multiple of k all
 * times (number of k factors minus other factors)". Length read as log2 |n| (my choice: continuous).
 */
export function ownerFamily(k: number): DynamicFamily {
  const exact = (n: number) => { const f = factorCount(n), kk = f.get(k) ?? 0; return Math.log2(Math.abs(n)) * (kk - (omega(n) - kk)); };
  const u = (r: Readings) => {
    const n = k * Math.round(r.c / k) || k * (Math.sign(r.c) || 1), f = factorCount(n), kk = f.get(k) ?? 0;
    return (Math.log2(Math.abs(n)) - Math.sqrt(Math.abs(r.c - n))) * (kk - (omega(n) - kk));
  };
  return {
    id: `owner-k${k}`, label: `(log2|n| − √|c − n|) × (${k}s in n − other factors), n the nearest multiple of ${k} to c`, reads: ["c"], u,
    searches: [{
      // n = k^a × b for small b: the candidates with the most k's for their size, landed on exactly.
      id: "powers-of-k-times-small", propose: (x, uStar) => {
        const c = Math.max(k, Math.abs(x.c)), cands: number[] = [];
        for (let p = k; p <= 64 * c; p *= k) for (let b = 1; b <= 16; b++) cands.push(p * b);
        return closestTo(c, cands.filter(n => exact(n) >= uStar - 1e-12), 3).map(n => ({ c: signed(n, x.c) }));
      },
    }],
  };
}
/** Bigger is better: |c| itself. No heuristic: the floor is its search. */
export const biggerFamily: DynamicFamily = { id: "bigger-c", label: "|c|, bigger is better", reads: ["c"], u: r => Math.abs(r.c), searches: [] };
/** A tied conjunction: the prime-gradient utility AND log2 gcd(p + 1, ⌊|c|⌋), taken as their minimum. */
export function tiedFamily(suffix: string): DynamicFamily {
  const pg = primeGradientFamily(suffix), mod = 10 ** suffix.length, end = Number(suffix);
  const ok = (n: number) => n % mod === end && n < 1e12 && isPrimeN(n);
  const pOf = (x: number) => closestTo(Math.abs(x), nearestWith(x, ok), 1)[0] ?? 11;
  const u = (r: Readings) => { const p = pOf(r.m), n = Math.floor(Math.abs(r.c)); return Math.min(Math.log2(p) - Math.sqrt(Math.abs(Math.abs(r.m) - p)), Math.log2(n >= 1 ? gcdN(p + 1, n) : 1)); };
  return {
    id: `tied-gcd-${suffix}`, label: `min(prime-gradient utility, log2 gcd(p + 1, ⌊|c|⌋)), p the gradient's prime ending in ${suffix}`, reads: ["m", "c"], u,
    searches: [{
      // A qualifying prime near the gradient, then the multiples of its smallest big-enough divisor of p + 1 either side of c.
      id: "prime-then-shared-factor", propose: (x, uStar, r) => {
        const out: DynamicTarget[] = [], need = Math.ceil(2 ** uStar - 1e-9), c = Math.abs(x.c);
        for (const t of pg.searches[0]!.propose(x, uStar, r)) {
          const p = Math.abs(t.m!);
          for (let d = need; d <= p + 1; d++) if ((p + 1) % d === 0) { for (const n of [Math.floor(c / d) * d, Math.ceil(c / d) * d]) if (n >= 1) out.push({ m: t.m, c: signed(n, x.c) }); break; }
        }
        return out;
      },
    }],
  };
}
/**
 * The owner's precision example (16 Nov): "sqrt of size of nearest power of k minus distance to that power cubed" on
 * |c|: √(log2 P) − |c − P|³ (size read as log2 P, my choice), P the nearest power of k.
 */
export function powerCubedFamily(k: number): DynamicFamily {
  const powers = (top: number) => { const out: number[] = []; for (let p = k; p <= top; p *= k) out.push(p); return out; };
  const near = (c: number) => closestTo(c, powers(Math.max(k, 2 * c + k)), 1)[0]!;
  const u = (r: Readings) => { const c = Math.abs(r.c), P = near(c); return Math.sqrt(Math.log2(P)) - Math.abs(c - P) ** 3; };
  return {
    id: `power-cubed-${k}`, label: `√(log2 P) − |c − P|³, P the nearest power of ${k}`, reads: ["c"], u,
    searches: [{ id: "nearest-big-enough-power", propose: (x, uStar) => closestTo(Math.abs(x.c), powers(Math.max(k, 8 * Math.abs(x.c))).filter(P => Math.sqrt(Math.log2(P)) >= uStar - 1e-12), 2).map(P => ({ c: signed(P, x.c) })) }],
  };
}
/** The same shape on primes with a suffix, on |m|: √(log2 p) − |m − p|³. */
export function primeCubedFamily(suffix: string): DynamicFamily {
  const mod = 10 ** suffix.length, end = Number(suffix), ok = (n: number) => n % mod === end && n < 1e12 && isPrimeN(n);
  const u = (r: Readings) => { const m = Math.abs(r.m), p = closestTo(m, nearestWith(m, ok), 1)[0] ?? 7; return Math.sqrt(Math.log2(p)) - Math.abs(m - p) ** 3; };
  return {
    id: `prime-cubed-${suffix}`, label: `√(log2 p) − |m − p|³, p the nearest prime ending in ${suffix}`, reads: ["m"], u,
    searches: [{ id: "nearest-qualifying-prime", propose: (x, uStar) => nearestWith(Math.max(Math.abs(x.m), 2 ** (uStar * uStar)), n => ok(n) && Math.sqrt(Math.log2(n)) >= uStar - 1e-12).map(p => ({ m: signed(p, x.m) })) }],
  };
}
export const dynamicExamples: readonly DynamicFamily[] = [biggerFamily, primeGradientFamily("1"), smoothFamily([3, 7]), ownerFamily(3), tiedFamily("1")];

// ------------------------------------------------------------------ moves and prices

const BY_ID = new Map(allMutators.map(m => [m.id, m]));
interface Mv { readonly id: string; readonly args: Readonly<Record<string, unknown>> }
function applyMv(mv: Mv, l: Line): Line | null {
  const r = BY_ID.get(mv.id)!.apply({ lines: [l] }, 0, mv.args as never, lineQ);
  return "invalid" in r || isVertical(r.lines[0]!) ? null : r.lines[0]!;
}
const priceOf = (mv: Mv, a: Line, b: Line) => callPrice(mv.id, mv.args, a, b, TRIAL_LOG)?.friction ?? Infinity;
/** A number as a fraction: exact when whole, else the nearest with a bottom up to 64. */
export function toQ(v: number): Q | null {
  if (!Number.isFinite(v)) return null;
  if (Number.isInteger(v) && Math.abs(v) < 2 ** 53) return q(BigInt(v));
  let best = q(Math.round(v)), err = Math.abs(Math.round(v) - v);
  for (let d = 2; d <= 64; d++) { const n = Math.round(v * d), e = Math.abs(n / d - v); if (e < err) { best = q(n, d); err = e; } }
  return best;
}
/** The solved single moves putting the gradient (on "m") or the y-intercept (on "c") on v: [price, line, move]. */
function solved(l: Line, on: "m" | "c", v: Q): [number, Line, string][] {
  const cur = on === "m" ? mq(l) : cq(l);
  if (Qn.eq(cur, v)) return [[0, l, ""]];
  const out: [number, Line, string][] = [], k = Qn.sub(v, cur);
  const push = (mv: Mv) => { const u = applyMv(mv, l); if (u && Qn.eq(on === "m" ? mq(u) : cq(u), v)) out.push([priceOf(mv, l, u), u, mv.id]); };
  if (on === "m") push({ id: "si.tilt", args: { k } });
  else { push({ id: "si.shift", args: { k } }); if (!Qn.isZero(mq(l))) push({ id: "cross.shift", args: { k: Qn.div(Qn.neg(k), mq(l)) } }); }
  if (!Qn.isZero(cur) && !Qn.isZero(v)) push({ id: "mach.stretch", args: { f: Qn.div(v, cur) } });
  return out;
}
/** The cheapest route of solved moves onto a target (one reading: one move; two: two moves in either order). */
function toTarget(x: Line, t: { m?: Q; c?: Q }, ok: (l: Line) => boolean): number {
  let best = Infinity;
  const ons = (["m", "c"] as const).filter(k => t[k] !== undefined);
  const orders: (readonly ("m" | "c")[])[] = ons.length === 2 ? [["m", "c"], ["c", "m"]] : [ons];
  for (const order of orders) {
    let frontier: [number, Line][] = [[0, x]];
    for (const on of order) frontier = frontier.flatMap(([p, l]) => solved(l, on, t[on]!).map(([p2, u]) => [p + p2, u] as [number, Line]));
    for (const [p, l] of frontier) if (p < best && ok(l)) best = p;
  }
  return best;
}
const SHORTCUTS: Mv[] = [
  ...["x", "y", "origin", "diagonal"].map(axis => ({ id: "cart.mirror", args: { axis } })),
  ...[q(2), q(3), q(1, 2), q(1, 3), q(-1)].map(f => ({ id: "mach.stretch", args: { f } })),
];
/** The generic floor's single moves: solved amounts onto s's readings (either sign), and the shortcuts. */
function floorMoves(x: Line, s: Line): [number, Line, string][] {
  const out: [number, Line, string][] = [], m = mq(s), c = cq(s);
  for (const on of ["m", "c"] as const) for (const v of on === "m" ? [m, Qn.neg(m)] : [c, Qn.neg(c)]) for (const step of solved(x, on, v)) if (step[0] > 0) out.push(step);
  const mx = mq(x), cx = cq(x), one = (mv: Mv) => { const l = applyMv(mv, x); if (l) out.push([priceOf(mv, x, l), l, mv.id]); };
  if (!Qn.isZero(mx) && !Qn.isZero(m)) {
    // s's crossing and area, by the moves that keep the gradient.
    const X = Qn.div(Qn.neg(c), m), Xx = Qn.div(Qn.neg(cx), mx);
    for (const v of [X, Qn.neg(X)]) if (!Qn.eq(v, Xx)) one({ id: "cross.shift", args: { k: Qn.sub(v, Xx) } });
    if (!Qn.isZero(c) && !Qn.isZero(cx)) {
      const A = Qn.div(Qn.neg(Qn.mul(c, c)), Qn.mul(q(2), m)), Ax = Qn.div(Qn.neg(Qn.mul(cx, cx)), Qn.mul(q(2), mx));
      if (!Qn.eq(A, Ax)) one({ id: "area.shift", args: { k: Qn.sub(A, Ax) } });
    }
  }
  for (const mv of SHORTCUTS) one(mv);
  // A shortcut, then a solved move onto one of s's readings (the pattern the deeper search found, #1157).
  for (const mv of SHORTCUTS) {
    const l1 = applyMv(mv, x);
    if (!l1) continue;
    const p1 = priceOf(mv, x, l1);
    for (const on of ["m", "c"] as const) for (const v of on === "m" ? [m, Qn.neg(m)] : [c, Qn.neg(c)]) for (const [p2, l2, id] of solved(l1, on, v)) if (p2 > 0) out.push([p1 + p2, l2, `${mv.id}+${id}`]);
  }
  return out;
}
const shortcutsFrom = (x: Line): [number, Line][] => SHORTCUTS.flatMap(mv => { const l = applyMv(mv, x); return l ? [[priceOf(mv, x, l), l] as [number, Line]] : []; });
/** The ceiling: the direct route onto s itself. */
const directTo = (x: Line, s: Line) => toTarget(x, { m: mq(s), c: cq(s) }, l => l.a === s.a && l.b === s.b && l.c === s.c);

// ------------------------------------------------------------------ starts of the same size

/** Bits of a fraction: of its top plus of its bottom. */
export const sizeOf = (v: Q): number => Math.log2(Number(Qn.abs(v).n) + 1) + Math.log2(Number(v.d));
/** A fraction of the same size as v: a bottom of the same bit length; the top's size uniform in [S, S + band) bits. */
function sameSize(v: Q, band: number, r: Rng, by: SizeBy): Q {
  if (by === "magnitude") {
    // Magnitude only: a whole number whose log2 is uniform in [log2|v|, log2|v| + band).
    const L = Math.log2(Math.max(1, Qn.toNumber(Qn.abs(v)))), n = Math.max(1, Math.round(2 ** (L + band * r.unit())));
    return q(r.bit() ? n : -n);
  }
  const dBits = Math.floor(Math.log2(Number(v.d))), d = dBits === 0 ? 1 : 2 ** dBits + r.below(2 ** dBits);
  const S = Math.log2(Number(Qn.abs(v).n) + 1), n = Math.max(1, Math.round(2 ** (S + band * r.unit()) - 1));
  return q(r.bit() ? n : -n, d);
}
/** A start for s under F: the read numbers of s's size, the others from the law. */
/**
 * How a start's size is matched: "magnitude" (the default: log2 of the number's size; whole starts) or "bits" (bits of
 * the top plus bits of the bottom). Seen in a narrow test (scoring-trial.md, "Dynamic energy"): under "bits" a state a
 * little off target with a fraction (m = p + 1/4) scored about three times its on-target neighbour, because its starts
 * are fractions too and tidying them costs; a player could raise a score by adding bottom bits. Magnitude removes it.
 */
export type SizeBy = "bits" | "magnitude";
export function startLike(s: Line, F: DynamicFamily, band: number, r: Rng, by: SizeBy = "magnitude"): Line {
  const d = drawLine(r), lawM = q(d.m.p, d.m.q), lawC = q(d.c.p, d.c.q);
  return fromMC(F.reads.includes("m") ? sameSize(mq(s), band, r, by) : lawM, F.reads.includes("c") ? sameSize(cq(s), band, r, by) : lawC);
}

// ------------------------------------------------------------------ the energy

export interface DynamicOpts {
  readonly K?: number;
  /** The band of start sizes above s's, in bits (0.5). */
  readonly band?: number;
  /** Use the family's heuristics (true) or the generic floor alone (false). */
  readonly heuristics?: boolean;
  /** Extra heuristics beside the family's (for trials and tests). */
  readonly extra?: DynamicFamily["searches"];
  /** Fixed randomness, for tests and comparisons on the same starts; fresh by default. */
  readonly seed?: string;
  /** How a start's size is matched (magnitude by default). */
  readonly sizeBy?: SizeBy;
}
export interface Sample { readonly from: Line; readonly direct: number; readonly floor: number; readonly heuristic: number; readonly cost: number }
export interface DynamicEnergy { readonly energy: number; readonly u: number; readonly evals: number; readonly samples: readonly Sample[] }

let fresh = 0;
/** energy(s, F): the mean over K same-size starts of min(direct, floor, heuristics). */
export function dynamicEnergy(s: Line, F: DynamicFamily, o: DynamicOpts = {}): DynamicEnergy {
  const K = o.K ?? 30, band = o.band ?? 0.5, seed = o.seed ?? `fresh:${Date.now()}:${fresh++}:${Math.random()}`;
  const starts = makeRng("dynamic-starts", seed), hr = makeRng("dynamic-heuristics", seed);
  const rs = readings(s);
  if (!rs) return { energy: NaN, u: NaN, evals: 0, samples: [] };
  let evals = 1;
  const uStar = F.u(rs), ok = (l: Line) => { const r = readings(l); evals++; return r !== null && F.u(r) >= uStar - 1e-9; };
  const hs = [...(o.heuristics === false ? [] : F.searches), ...(o.extra ?? [])], samples: Sample[] = [];
  for (let i = 0; i < K; i++) {
    const x = startLike(s, F, band, starts, o.sizeBy), rx = readings(x)!;
    if (ok(x)) { samples.push({ from: x, direct: 0, floor: 0, heuristic: 0, cost: 0 }); continue; }
    const direct = directTo(x, s), floor = floorMoves(x, s).reduce((b, [p, l]) => (p < b && ok(l) ? p : b), Infinity);
    let heuristic = Infinity;
    for (const h of hs) for (const t of h.propose(rx, uStar, hr)) {
      const m = t.m === undefined ? undefined : toQ(t.m), c = t.c === undefined ? undefined : toQ(t.c);
      if (m === null || c === null) continue;
      heuristic = Math.min(heuristic, toTarget(x, { ...(m ? { m } : {}), ...(c ? { c } : {}) }, ok));
    }
    // A shortcut first, then the solved moves onto the targets the heuristics propose from where it lands (generic).
    for (const [p1, l1] of shortcutsFrom(x)) {
      const r1 = readings(l1);
      if (!r1 || p1 >= heuristic) continue;
      for (const h of hs) for (const t of h.propose(r1, uStar, hr)) {
        const m = t.m === undefined ? undefined : toQ(t.m), c = t.c === undefined ? undefined : toQ(t.c);
        if (m === null || c === null) continue;
        heuristic = Math.min(heuristic, p1 + toTarget(l1, { ...(m ? { m } : {}), ...(c ? { c } : {}) }, ok));
      }
    }
    samples.push({ from: x, direct, floor, heuristic, cost: Math.min(direct, floor, heuristic) });
  }
  return { energy: samples.reduce((a, b) => a + b.cost, 0) / K, u: uStar, evals, samples };
}

// ------------------------------------------------------------------ a deeper search, for the overvaluation hunt

/**
 * A beam search of up to `depth` moves from x: each step tries the floor's moves and the solved moves onto the
 * family's heuristic targets read from the line it starts on, keeping the `beam` best by utility. Used only to look for
 * starts the estimate overvalues.
 */
export function deepSearch(x: Line, s: Line, F: DynamicFamily, depth = 4, beam = 6): { cost: number; route: string[] } {
  const uStar = F.u(readings(s)!), hr = makeRng("deep", `${x.a},${x.b},${x.c}`);
  let best = { cost: Infinity, route: [] as string[] };
  let frontier: { l: Line; cost: number; route: string[]; u: number }[] = [{ l: x, cost: 0, route: [], u: -Infinity }];
  for (let d = 0; d < depth && frontier.length; d++) {
    const kids: typeof frontier = [];
    for (const node of frontier) {
      const rn = readings(node.l);
      if (!rn) continue;
      const steps = floorMoves(node.l, s);
      for (const h of F.searches) for (const t of h.propose(rn, uStar, hr)) for (const on of ["m", "c"] as const) {
        const v = t[on] === undefined ? null : toQ(t[on]!);
        if (v) for (const st of solved(node.l, on, v)) if (st[0] > 0) steps.push(st);
      }
      for (const [p, l, id] of steps) {
        const r = readings(l);
        if (!r) continue;
        const cost = node.cost + p, uu = F.u(r);
        if (cost >= best.cost) continue;
        if (uu >= uStar - 1e-9) { best = { cost, route: [...node.route, id] }; continue; }
        kids.push({ l, cost, route: [...node.route, id], u: uu });
      }
    }
    frontier = kids.sort((a, b) => b.u - a.u || a.cost - b.cost).slice(0, beam);
  }
  return best;
}
