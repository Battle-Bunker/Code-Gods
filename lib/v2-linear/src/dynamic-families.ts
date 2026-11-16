/**
 * Families written for the dynamic energy measure (the owner, 16 Nov; docs/engine-v2/energy.md): each is a utility u of
 * the line y = mx + c, the readings it `reads`, and its own search heuristics. No tables, levels or tie-breakers:
 * precision is the utility's job ("If utility were sqrt of size of nearest power of k minus distance to that power
 * cubed then it really pays to be closer to the target power").
 *
 * The pool pulls in different directions on shared anchors (CLAUDE.md, decision 30): on the y-intercept c, Power Hug,
 * Smooth Hug and Multiples (bigger) against Unit Fraction (smaller) and Fine Bottom (fractions); on the gradient m,
 * Prime Hug (bigger) against Prime Sliver (smaller) and Next-door Bottom (fractions).
 *
 * Every utility is cheap (a few thousand steps at most) and treats numbers past 10^10 as beyond its reach (NaN, the
 * worst), a bound on the cost of a reading.
 */
import { gcd, q, Qn, ref, type DynamicRule, type ElementValue, type ParamSpace, type Q, type Rng, type RuleFamily } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { drawSuffix, isSuffix } from "./numbers.ts";
import { fromMC } from "./line.ts";

const LIMIT = 1e10;
/** Primality of a whole number below LIMIT (trial division: at most 10^5 steps). */
function isPrimeN(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
}
const num = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
const abs = Math.abs, log2 = Math.log2, cube = (d: number) => abs(d) * abs(d) * abs(d);

/** A target for a start: new values for the readings it names (the rest stay the start's). */
export interface LineTarget { readonly m?: Q; readonly c?: Q }
export interface DynamicLineSpec<P> {
  readonly id: string;
  readonly title: string;
  /** The goal card, in a 12-year-old's words. */
  card(p: P): string;
  /** The main part's title, short. */
  readonly goal: string;
  readonly reads: readonly ("m" | "c")[];
  /** The utility of y = mx + c; NaN is the worst. */
  u(m: Q, c: Q, p: P): number;
  /** Where u is read, for the views' focus mark. */
  readonly focus: "m" | "c";
  readonly space: ParamSpace<P>;
  readonly peers: readonly P[];
  readonly searches: readonly { readonly id: string; propose(m: Q, c: Q, uStar: number, p: P, r: Rng): readonly LineTarget[] }[];
}

/** A line rule family from a dynamic spec: its evaluate records u as the main term; `dynamic` carries it to the estimator. */
export function dynamicLine<P>(s: DynamicLineSpec<P>): RuleFamily<LineState, P> {
  const mc = (st: LineState): [Q, Q] | null => {
    const l = st.lines[0]!;
    return l.b === 0n ? null : [q(-l.a, l.b), q(-l.c, l.b)];
  };
  const dynamic: DynamicRule<LineState, P> = {
    reads: s.reads,
    u: (st, p) => { const x = mc(st); return x ? s.u(x[0], x[1], p) : NaN; },
    searches: s.searches.map(h => ({
      id: h.id,
      propose: (st, uStar, p, r) => {
        const x = mc(st);
        return x ? h.propose(x[0], x[1], uStar, p, r).map(t => ({ lines: [fromMC(t.m ?? x[0], t.c ?? x[1])] })) : [];
      },
    })),
  };
  return {
    id: s.id, title: s.title, card: p => s.card(p), params: [], dealable: () => s.peers, depends: ["si"],
    main: { id: "utility", title: s.goal, rep: "si", sense: "max", sentence: p => s.card(p) },
    tieBreakers: [], keepsParams: true, space: s.space, dynamic,
    evaluate(ctx, p) {
      const mRef = ref("si", "m"), cRef = ref("si", "c"), mv = num(ctx.read(mRef)), cv = num(ctx.read(cRef));
      const at = s.focus === "m" ? mRef : cRef;
      const u = mv === null || cv === null ? NaN : s.u(mv, cv, p);
      ctx.term("utility", s.goal, Number.isFinite(u) ? q(BigInt(Math.round(u * 1e6)), 1000000n) : { undefined: mv === null ? "a vertical line has no gradient" : "too far from anything this rule can reach" }, [at]);
      ctx.mark({ kind: "focus", ref: at });
    },
  };
}

// ------------------------------------------------------------------ number helpers (floats, below LIMIT)

const toNum = (v: Q): number => Qn.toNumber(v);
/** The nearest whole n ≥ 1 to x with ok(n), within `reach` steps of `step` each way (ties: the lower). */
function nearest(x: number, ok: (n: number) => boolean, from: (x: number) => number = Math.floor, step = 1, reach = 4000): number | null {
  let f = from(x);
  while (f < 1) f += step;   // the first candidate at or above 1, keeping the step's alignment
  let lo: number | null = null, hi: number | null = null;
  for (let n = f, i = 0; n >= 1 && i < reach; n -= step, i++) if (ok(n)) { lo = n; break; }
  for (let n = f + step, i = 0; i < reach; n += step, i++) if (ok(n)) { hi = n; break; }
  if (lo === null) return hi;
  if (hi === null) return lo;
  return x - lo <= hi - x ? lo : hi;
}
/** The whole numbers ≥ 1 with ok, from x upward and downward, nearest first (at most k). */
function around(x: number, ok: (n: number) => boolean, k: number, reach = 4000): number[] {
  const out: number[] = [];
  for (let n = Math.max(1, Math.ceil(x)), i = 0; i < reach && out.length < k; n++, i++) if (ok(n)) out.push(n);
  for (let n = Math.max(1, Math.ceil(x) - 1), i = 0; n >= 1 && i < reach && out.length < 2 * k; n--, i++) if (ok(n)) out.push(n);
  return out;
}
/** The numbers ending in the suffix, nearest x: start from the first at or below. */
const suffixFloor = (suffix: string) => (x: number) => { const mod = 10 ** suffix.length, e = Number(suffix); return Math.floor((x - e) / mod) * mod + e; };
const primeWith = (suffix: string) => (n: number) => n < LIMIT && n % 10 ** suffix.length === Number(suffix) && isPrimeN(n);
/** Prime factors with repeats (n < LIMIT). */
function factors(n: number): number[] {
  const out: number[] = [];
  let x = abs(Math.round(n));
  for (let p = 2; p * p <= x; p++) while (x % p === 0) { out.push(p); x /= p; }
  if (x > 1) out.push(x);
  return out;
}
const signedQ = (v: number, like: Q) => q(BigInt(Qn.sign(like) < 0 ? -v : v));
const intRange = (lo: number, hi: number, hint: string, peers: number[]): { space: ParamSpace<{ k: number }>; peers: { k: number }[] } => ({
  peers: peers.map(k => ({ k })),
  space: {
    size: hi - lo + 1, hint,
    draw: r => ({ k: lo + r.below(hi - lo + 1) }),
    parse(text) { const k = Number(text.trim().replace(/^k\s*=\s*/, "")); return Number.isInteger(k) && k >= lo && k <= hi ? { k } : { invalid: `a whole number from ${lo} to ${hi}` }; },
    label: p => String(p.k),
  },
});
const suffixSpace: ParamSpace<{ suffix: string }> = {
  size: 4 + 40 + 400, hint: "the prime's last digits: 1 to 3 digits ending in 1, 3, 7 or 9 (e.g. 13 or 007)",
  draw: r => ({ suffix: drawSuffix(r) }),
  parse(text) { const s = text.trim().replace(/^suffix\s*=\s*/, ""); return isSuffix(s) ? { suffix: s } : { invalid: "1 to 3 digits, the last one 1, 3, 7 or 9" }; },
  label: p => p.suffix,
};

// ------------------------------------------------------------------ 1. Power Hug (the owner's precision example), on c

/** The powers of k from k up to top. */
const powers = (k: number, top: number) => { const out: number[] = []; for (let p = k; p <= top; p *= k) out.push(p); return out; };
const nearestPower = (k: number, x: number) => powers(k, Math.max(k, 2 * x + k)).reduce((b, p) => (abs(p - x) < abs(b - x) ? p : b), k);
const ph = intRange(2, 40, "k, a whole number from 2 to 40", [3, 5]);
export const powerHug = dynamicLine<{ k: number }>({
  id: "power-hug", title: "Power Hug", goal: "the y-intercept right on a power of k", reads: ["c"], focus: "c", ...ph,
  card: ({ k }) => `The y-intercept (ignoring its sign) should sit exactly on a power of ${k}: ${k}, ${k ** 2}, ${k ** 3}, … A bigger power scores a little more (the square root of its number of binary digits), and every bit off costs a lot: the distance, cubed.`,
  u(_m, c, { k }) { const x = abs(toNum(c)); if (x >= LIMIT) return NaN; const P = nearestPower(k, x); return Math.sqrt(log2(P)) - cube(x - P); },
  searches: [{ id: "big-enough-powers", propose: (_m, c, uStar, { k }) => {
    const x = abs(toNum(c)), ok = powers(k, Math.min(LIMIT, Math.max(k, 8 * x))).filter(P => Math.sqrt(log2(P)) >= uStar - 1e-9);
    return ok.sort((a, b) => abs(a - x) - abs(b - x)).slice(0, 2).map(P => ({ c: signedQ(P, c) }));
  } }],
});

// ------------------------------------------------------------------ 2. Prime Hug, on m

const primeHugU = (x: number, suffix: string) => {
  if (x >= LIMIT) return NaN;
  const p = nearest(x, primeWith(suffix), suffixFloor(suffix), 10 ** suffix.length, 2000);
  return p === null ? NaN : Math.sqrt(log2(p)) - cube(x - p);
};
export const primeHug = dynamicLine<{ suffix: string }>({
  id: "prime-hug", title: "Prime Hug", goal: "the gradient right on a prime with the dealt last digits", reads: ["m"], focus: "m",
  space: suffixSpace, peers: [{ suffix: "1" }, { suffix: "7" }],
  card: ({ suffix }) => `The gradient (ignoring its sign) should sit exactly on a prime number whose last digits are ${suffix}. A bigger prime scores a little more; every bit off costs a lot: the distance, cubed.`,
  u: (m, _c, { suffix }) => primeHugU(abs(toNum(m)), suffix),
  searches: [{ id: "big-enough-primes", propose: (m, _c, uStar, { suffix }) => {
    const need = 2 ** (Math.max(0, uStar) ** 2), x = Math.max(abs(toNum(m)), need);
    const step = 10 ** suffix.length, ok = primeWith(suffix), out: LineTarget[] = [];
    for (let n = suffixFloor(suffix)(x) + step, i = 0; i < 2000; n += step, i++) if (ok(n)) { out.push({ m: signedQ(n, m) }); break; }
    for (let n = suffixFloor(suffix)(x), i = 0; n >= need && i < 2000; n -= step, i++) if (ok(n)) { out.push({ m: signedQ(n, m) }); break; }
    return out;
  } }],
});

// ------------------------------------------------------------------ 3. Smooth Hug, on c

const SMOOTH_SETS: readonly (readonly number[])[] = (() => {
  const ps = [2, 3, 5, 7, 11, 13], out: number[][] = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { out.push([ps[i]!, ps[j]!]); for (let k = j + 1; k < ps.length; k++) out.push([ps[i]!, ps[j]!, ps[k]!]); }
  return out;
})();
/** The numbers > 1 made only of the primes, up to top. */
function smooth(primes: readonly number[], top: number): number[] {
  const out: number[] = [];
  const walk = (n: number, i: number) => { if (i === primes.length) { if (n > 1) out.push(n); return; } for (let x = n; x <= top; x *= primes[i]!) walk(x, i + 1); };
  walk(1, 0);
  return out;
}
export const smoothHug = dynamicLine<{ primes: readonly number[] }>({
  id: "smooth-hug", title: "Smooth Hug", goal: "the y-intercept right on a number made only of the dealt primes", reads: ["c"], focus: "c",
  peers: [{ primes: [2, 3] }, { primes: [5, 7, 11] }],
  space: {
    size: SMOOTH_SETS.length, hint: "two or three of the primes 2, 3, 5, 7, 11, 13 (e.g. 3 7)",
    draw: r => ({ primes: SMOOTH_SETS[r.below(SMOOTH_SETS.length)]! }),
    parse(text) { const ps = text.trim().split(/[\s,]+/).map(Number).sort((a, b) => a - b), hit = SMOOTH_SETS.find(s => s.join() === ps.join()); return hit ? { primes: hit } : { invalid: "two or three of 2, 3, 5, 7, 11, 13" }; },
    label: p => p.primes.join(" "),
  },
  card: ({ primes }) => `The y-intercept (ignoring its sign) should sit exactly on a number you get by multiplying only ${primes.join(", ")} together (like ${smooth(primes, 400).sort((a, b) => a - b).slice(0, 5).join(", ")}, …). More factors score more (the square root of how many); every bit off costs a lot: the distance, cubed.`,
  u(_m, c, { primes }) {
    const x = abs(toNum(c));
    if (x >= LIMIT) return NaN;
    const n = smooth(primes, 2 * x + 64).reduce((b, s) => (abs(s - x) < abs(b - x) ? s : b));
    return Math.sqrt(factors(n).length) - cube(x - n);
  },
  searches: [{ id: "enough-factors", propose: (_m, c, uStar, { primes }) => {
    const x = abs(toNum(c)), ok = smooth(primes, Math.min(LIMIT, Math.max(64, 8 * x))).filter(n => Math.sqrt(factors(n).length) >= uStar - 1e-9);
    return ok.sort((a, b) => abs(a - x) - abs(b - x)).slice(0, 3).map(n => ({ c: signedQ(n, c) }));
  } }],
});

// ------------------------------------------------------------------ 4. Multiples (the owner's example), on c

const mk = intRange(2, 12, "k, a whole number from 2 to 12", [2, 3]);
/** The owner: "length of nearest multiple of k to y intercept minus sqrt of distance to that multiple of k all times (number of k factors minus other factors)"; length as log2. */
const multiplesU = (x: number, k: number) => {
  if (abs(x) >= LIMIT) return NaN;
  const n = k * Math.round(x / k) || k * (Math.sign(x) || 1);
  let kk = 0, rest = abs(n);
  while (rest % k === 0) { rest /= k; kk++; }
  return (log2(abs(n)) - Math.sqrt(abs(x - n))) * (kk - factors(rest).length);
};
export const multiples = dynamicLine<{ k: number }>({
  id: "multiples", title: "Multiples", goal: "the y-intercept near a multiple of k made of many k's", reads: ["c"], focus: "c", ...mk,
  card: ({ k }) => `Take the multiple of ${k} nearest the y-intercept. Count how many times ${k} divides it, take away how many prime factors are left over, and multiply by its size (in binary digits) less the square root of how far the y-intercept is from it. Bigger is better.`,
  u: (_m, c, { k }) => multiplesU(toNum(c), k),
  searches: [{ id: "powers-of-k-times-small", propose: (_m, c, uStar, { k }) => {
    const x = Math.max(k, abs(toNum(c))), cands: number[] = [];
    for (let p = k; p <= Math.min(LIMIT, 64 * x); p *= k) for (let b = 1; b <= 16; b++) cands.push(p * b);
    return cands.filter(n => multiplesU(n, k) >= uStar - 1e-9).sort((a, b) => abs(a - x) - abs(b - x)).slice(0, 3).map(n => ({ c: signedQ(n, c) }));
  } }],
});

// ------------------------------------------------------------------ 5. Fine Bottom (fraction-native), on c

/** The part of n made of k (n, k whole). */
const kPart = (n: bigint, k: bigint) => { let p = 1n; while (n % k === 0n) { n /= k; p *= k; } return p; };
const fb = intRange(2, 9, "k, a whole number from 2 to 9", [2, 3]);
export const fineBottom = dynamicLine<{ k: number }>({
  id: "fine-bottom", title: "Fine Bottom", goal: "the y-intercept a fraction whose bottom is made of k's", reads: ["c"], focus: "c", ...fb,
  card: ({ k }) => `Write the y-intercept as a fraction in lowest terms. Its bottom number should be made of ${k}'s: each binary digit of the ${k}'s part scores one, each binary digit of anything else in the bottom costs two.`,
  u(_m, c, { k }) { const d = c.d, kp = kPart(d, BigInt(k)); return log2(Number(kp)) - 2 * log2(Number(d / kp)); },
  searches: [{ id: "round-to-k-power", propose: (_m, c, uStar, { k }) => {
    // The y-intercept rounded to a bottom of k^j (j just enough), top nudged off multiples of k.
    const j0 = Math.max(1, Math.ceil(uStar / log2(k) - 1e-9)), out: LineTarget[] = [];
    for (const j of [j0, j0 + 1]) {
      const d = BigInt(k) ** BigInt(j), x = toNum(c);
      if (abs(x) * Number(d) > LIMIT) continue;
      let n = BigInt(Math.round(x * Number(d)));
      for (const t of [n, n + 1n, n - 1n]) if (t % BigInt(k) !== 0n) { n = t; out.push({ c: q(n, d) }); break; }
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 6. Next-door Bottom (fraction-native), on m

const nd = intRange(1, 9, "t, a whole number from 1 to 9", [1, 2]);
export const nextDoorBottom = dynamicLine<{ k: number }>({
  id: "next-door-bottom", title: "Next-door Bottom", goal: "the gradient's bottom dividing its top plus t", reads: ["m"], focus: "m", ...nd,
  card: ({ k }) => `Write the gradient as a fraction top/bottom in lowest terms (ignore its sign). The bottom should divide the top plus ${k}: each binary digit of the part of the bottom that does scores one, each binary digit of the part that does not costs one.`,
  u(m, _c, { k }) {
    const a = Qn.abs(m).n, d = m.d, g = gcd(a + BigInt(k), d);
    return log2(Number(g)) - log2(Number(d / g));
  },
  searches: [{ id: "bottoms-that-divide", propose: (m, _c, uStar, { k }) => {
    // A bottom d ≥ 2^u* sharing nothing with t, and the top a ≡ −t (mod d) nearest m·d.
    const out: LineTarget[] = [], x = abs(toNum(m));
    for (let d = Math.max(2, Math.ceil(2 ** uStar - 1e-9)), i = 0; out.length < 3 && i < 64 && x * d < LIMIT; d++, i++) {
      if (Number(gcd(BigInt(d), BigInt(k))) !== 1) continue;
      const want = Math.round(x * d), a = want - (((want + k) % d) + d) % d;
      for (const t of [a, a + d]) if (t > 0) out.push({ m: q(BigInt(Qn.sign(m) < 0 ? -t : t), BigInt(d)) });
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 7. Unit Fraction (against size), on c

const ufU = (x: number, suffix: string) => {
  if (x === 0 || x < 1 / LIMIT) return NaN;
  const n = nearest(1 / x, n => n % 10 ** suffix.length === Number(suffix) % 10 ** suffix.length, suffixFloor(suffix), 10 ** suffix.length, 4);
  return n === null ? NaN : log2(n) - 4 * abs(n * x - 1);
};
const endSpace: ParamSpace<{ suffix: string }> = {
  size: 99, hint: "the whole number's last digits: 1 or 2 digits, not 0 alone (e.g. 3 or 25)",
  draw: r => ({ suffix: String(1 + r.below(99)) }),
  parse(text) { const s = text.trim(); return /^[0-9]{1,2}$/.test(s) && Number(s) > 0 ? { suffix: s } : { invalid: "1 or 2 digits, not 0" }; },
  label: p => p.suffix,
};
export const unitFraction = dynamicLine<{ suffix: string }>({
  id: "unit-fraction", title: "Unit Fraction", goal: "the y-intercept one over a big whole number", reads: ["c"], focus: "c",
  space: endSpace, peers: [{ suffix: "3" }, { suffix: "8" }],
  card: ({ suffix }) => `The y-intercept (ignoring its sign) should be exactly one over a whole number ending in ${suffix} (1/${suffix}, 1/${Number(suffix) + 10 ** suffix.length}, …). The smaller the fraction, the better (the binary digits of the whole number); being off costs four times how far n × y-intercept is from 1.`,
  u: (_m, c, { suffix }) => ufU(abs(toNum(c)), suffix),
  searches: [{ id: "small-enough-units", propose: (_m, c, uStar, { suffix }) => {
    const step = 10 ** suffix.length, e = Number(suffix) % step, need = Math.max(1, Math.ceil(2 ** uStar - 1e-9));
    const first = need + ((e - need) % step + step) % step;
    return [first, first + step].filter(n => n > 0 && n < LIMIT).map(n => ({ c: q(Qn.sign(c) < 0 ? -1n : 1n, BigInt(n)) }));
  } }],
});

// ------------------------------------------------------------------ 8. Prime Sliver (against size), on m

const psU = (x: number, suffix: string) => {
  if (x === 0 || x < 1 / LIMIT) return NaN;
  const p = nearest(1 / x, primeWith(suffix), suffixFloor(suffix), 10 ** suffix.length, 2000);
  return p === null ? NaN : log2(p) - 4 * abs(p * x - 1);
};
export const primeSliver = dynamicLine<{ suffix: string }>({
  id: "prime-sliver", title: "Prime Sliver", goal: "the gradient one over a big prime with the dealt last digits", reads: ["m"], focus: "m",
  space: suffixSpace, peers: [{ suffix: "3" }, { suffix: "9" }],
  card: ({ suffix }) => `The gradient (ignoring its sign) should be exactly one over a prime whose last digits are ${suffix}: a very gentle slope. The bigger the prime, the better (its binary digits); being off costs four times how far p × gradient is from 1.`,
  u: (m, _c, { suffix }) => psU(abs(toNum(m)), suffix),
  searches: [{ id: "big-enough-primes", propose: (m, _c, uStar, { suffix }) => {
    const need = Math.max(2, 2 ** uStar), step = 10 ** suffix.length, ok = primeWith(suffix);
    for (let n = suffixFloor(suffix)(need) + step, i = 0; i < 2000; n += step, i++) if (n >= need && ok(n)) return [{ m: q(Qn.sign(m) < 0 ? -1n : 1n, BigInt(n)) }];
    return [];
  } }],
});

/** The families dealt with the dynamic measure. */
export const dynamicFamilies = [powerHug, primeHug, smoothHug, multiples, fineBottom, nextDoorBottom, unitFraction, primeSliver] as const;
