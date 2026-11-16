/**
 * The dynamic measure's example families from the scoring trial (docs/engine-v2/scoring-trial.md, "Dynamic energy"),
 * written on a line's readings: the owner's examples (the k-multiple product, the power-cubed precision shape) and the
 * trial's prime, smooth and tied ones. Undealt; the estimator is the engine's (energy.ts), which these adapt to.
 */
import { lineQ } from "./type.ts";
import { isPrimeN } from "./trial.ts";
import { fromMC, type Line } from "./line.ts";
import { cq, estimateLine, mq, readings, toQ, type LineEstimateOpts, type LineRule, type LineSample, type Readings } from "./energy.ts";
import type { Rng } from "@workspace/v2-core";

export { readings, toQ, type Readings };

// ------------------------------------------------------------------ families

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

// ------------------------------------------------------------------ the energy (the engine's estimator, energy.ts)

export interface DynamicOpts extends LineEstimateOpts {
  /** Extra heuristics beside the family's (for trials and tests). */
  readonly extra?: DynamicFamily["searches"];
}
export interface DynamicEnergy { readonly energy: number; readonly u: number; readonly samples: readonly LineSample[] }
/** A trial family as the engine's estimator takes it. */
export function asLineRule(F: DynamicFamily, extra: DynamicFamily["searches"] = []): LineRule {
  return {
    u: l => { const r = readings(l); return r ? F.u(r) : NaN; }, reads: F.reads,
    propose: (x, uStar, r) => {
      const rx = readings(x);
      if (!rx) return [];
      return [...F.searches, ...extra].flatMap(h => h.propose(rx, uStar, r)).flatMap(t => {
        const m = t.m === undefined ? mq(x) : toQ(t.m), c = t.c === undefined ? cq(x) : toQ(t.c);
        return m && c ? [fromMC(m, c)] : [];
      });
    },
  };
}
/** energy(s, F) on line-q (energy.ts estimateLine), K = 30 unless given. */
export function dynamicEnergy(s: Line, F: DynamicFamily, o: DynamicOpts = {}): DynamicEnergy {
  return estimateLine(s, asLineRule(F, o.extra), lineQ, { K: 30, ...o });
}
