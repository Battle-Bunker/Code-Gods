/**
 * Families written for the dynamic energy measure (the owner, 16 Nov; docs/engine-v2/energy.md): each is a utility u of
 * the line y = mx + c, the readings it `reads`, and its own search heuristics. No tables, levels or tie-breakers:
 * precision is the utility's job ("If utility were sqrt of size of nearest power of k minus distance to that power
 * cubed then it really pays to be closer to the target power").
 *
 * The pool pulls in different directions on shared anchors (CLAUDE.md, decision 30). On the y-intercept c: Power Hug and
 * Multiples (bigger) against Unit Fraction (smaller) and Fine Bottom (fractions). On the gradient m: Prime Hug (bigger)
 * against Prime Sliver (smaller) and Next-door Bottom (fractions). On the x-crossing −c/m: Crossing Sliver (towards 0)
 * against Square Triangle (the area |c·X|/2 big). On a, b, c: Stepping Coefficients (big, in steps) against everything
 * that wants a small or simple gradient or intercept. Circle Kiss ties c to m (c² = R²(1 + m²)) and wants fine tilts.
 *
 * Every utility is cheap (a few thousand steps at most) and treats numbers past 10^10 as beyond its reach (NaN, the
 * worst), a bound on the cost of a reading.
 */
import { gcd, q, Qn, ref, rng, type DynamicRule, type ElementValue, type ParamSpace, type Q, type Rng, type RuleFamily } from "@workspace/v2-core";
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
  /** The lens its energy's starts are drawn in (energy.ts lensOfReads): "m"/"c" gradient and y-intercept, "X" the x- and
   * y-intercepts, "gen" a, b and c, "area" the gradient and signed area. */
  readonly reads: readonly ("m" | "c" | "X" | "gen" | "area")[];
  /** The utility of y = mx + c; NaN is the worst. */
  u(m: Q, c: Q, p: P): number;
  /** Where u is read, for the views' focus mark: a representation and its element. */
  readonly focus: readonly [rep: string, el: string];
  readonly space: ParamSpace<P>;
  readonly peers: readonly P[];
  /** Whether its good states include lines with a whole gradient and y-intercept (dealt on the whole-number boards). */
  readonly whole?: boolean;
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
    // The rule's candidates (energy.ts): the targets its searches propose, each a line one turn away.
    candidates: (st, uStar, p) => {
      const x = mc(st), r = rng("line-candidates");   // fixed per call, so a seeded estimate repeats
      return x ? s.searches.flatMap(h => h.propose(x[0], x[1], uStar, p, r).map(t => ({ lines: [fromMC(t.m ?? x[0], t.c ?? x[1])] }))) : [];
    },
  };
  return {
    id: s.id, title: s.title, card: p => s.card(p), params: [],
    dealable: v => ((v.params as { domain?: string } | undefined)?.domain === "Z" && !s.whole ? [] : s.peers), depends: [...new Set(["si", s.focus[0]])],
    main: { id: "utility", title: s.goal, rep: s.focus[0], sense: "max", sentence: p => s.card(p) },
    tieBreakers: [], keepsParams: true, space: s.space, dynamic,
    evaluate(ctx, p) {
      const mRef = ref("si", "m"), cRef = ref("si", "c"), mv = num(ctx.read(mRef)), cv = num(ctx.read(cRef));
      const at = ref(s.focus[0], s.focus[1]);
      if (s.focus[0] !== "si") ctx.read(at);
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
  id: "power-hug", whole: true, title: "Power Hug", goal: "the y-intercept right on a power of k", reads: ["c"], focus: ["si", "c"], ...ph,
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
  id: "prime-hug", whole: true, title: "Prime Hug", goal: "the gradient right on a prime with the dealt last digits", reads: ["m"], focus: ["si", "m"],
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
  id: "multiples", whole: true, title: "Multiples", goal: "the y-intercept near a multiple of k made of many k's", reads: ["c"], focus: ["si", "c"], ...mk,
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
  id: "fine-bottom", title: "Fine Bottom", goal: "the y-intercept a fraction whose bottom is made of k's", reads: ["c"], focus: ["si", "c"], ...fb,
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
  id: "next-door-bottom", title: "Next-door Bottom", goal: "the gradient's bottom dividing its top plus t", reads: ["m"], focus: ["si", "m"], ...nd,
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
  id: "unit-fraction", title: "Unit Fraction", goal: "the y-intercept one over a big whole number", reads: ["c"], focus: ["si", "c"],
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
  id: "prime-sliver", title: "Prime Sliver", goal: "the gradient one over a big prime with the dealt last digits", reads: ["m"], focus: ["si", "m"],
  space: suffixSpace, peers: [{ suffix: "3" }, { suffix: "9" }],
  card: ({ suffix }) => `The gradient (ignoring its sign) should be exactly one over a prime whose last digits are ${suffix}: a very gentle slope. The bigger the prime, the better (its binary digits); being off costs four times how far p × gradient is from 1.`,
  u: (m, _c, { suffix }) => psU(abs(toNum(m)), suffix),
  searches: [{ id: "big-enough-primes", propose: (m, _c, uStar, { suffix }) => {
    const need = Math.max(2, 2 ** uStar), step = 10 ** suffix.length, ok = primeWith(suffix);
    for (let n = suffixFloor(suffix)(need) + step, i = 0; i < 2000; n += step, i++) if (n >= need && ok(n)) return [{ m: q(Qn.sign(m) < 0 ? -1n : 1n, BigInt(n)) }];
    return [];
  } }],
});

// ------------------------------------------------------------------ 9. Crossing Sliver (against size), on the x-crossing

/** The x-crossing −c/m of y = mx + c (null for a flat line). */
const crossing = (m: Q, c: Q): Q | null => (Qn.isZero(m) ? null : Qn.div(Qn.neg(c), m));
export const crossingSliver = dynamicLine<{ suffix: string }>({
  id: "crossing-sliver", title: "Crossing Sliver", goal: "the line crossing the x-axis at one over a big whole number", reads: ["X"], focus: ["crossing", "x0"],
  space: endSpace, peers: [{ suffix: "7" }, { suffix: "11" }],
  card: ({ suffix }) => `The line should cross the x-axis (ignoring the sign) at exactly one over a whole number ending in ${suffix} (1/${suffix}, 1/${Number(suffix) + 10 ** suffix.length}, …): very close to (0, 0). The closer, the better (the binary digits of the whole number); being off costs four times how far n × crossing is from 1.`,
  u: (m, c, { suffix }) => { const X = crossing(m, c); return X === null ? NaN : ufU(abs(toNum(X)), suffix); },
  searches: [{ id: "small-enough-crossings", propose: (m, c, uStar, { suffix }) => {
    const step = 10 ** suffix.length, e = Number(suffix) % step, need = Math.max(1, Math.ceil(2 ** uStar - 1e-9));
    const first = need + ((e - need) % step + step) % step, out: LineTarget[] = [];
    for (const n of [first, first + step]) {
      if (n <= 0 || n >= LIMIT) continue;
      const X = q(1n, BigInt(n));
      if (!Qn.isZero(m)) out.push({ c: Qn.neg(Qn.mul(m, X)) }, { c: Qn.mul(m, X) });   // keep the gradient
      if (!Qn.isZero(c)) out.push({ m: Qn.neg(Qn.div(c, X)) });                          // keep the y-intercept
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 10. Stepping Coefficients, on a, b, c

/** a, b, c of ax + by + c = 0 in lowest whole numbers, b > 0 (y = mx + c is −m·x + y − c = 0). */
function abcOf(m: Q, c: Q): [bigint, bigint, bigint] {
  const L = m.d * c.d / gcd(m.d, c.d), a = -m.n * (L / m.d), b = L, cc = -c.n * (L / c.d), g = gcd(gcd(a < 0n ? -a : a, b), cc < 0n ? -cc : cc);
  return [a / g, b / g, cc / g];
}
const babs = (x: bigint) => (x < 0n ? -x : x);
const stepU = (a: bigint, b: bigint, c: bigint, d: number) => {
  const top = [a, b, c].reduce((t, x) => (babs(x) > t ? babs(x) : t), 0n);
  if (top >= BigInt(LIMIT)) return NaN;
  return log2(Number(top)) - 2 * (abs(Number(b - a) - d) + abs(Number(c - b) - d));
};
const stepSpace: ParamSpace<{ k: number }> = {
  size: 60, hint: "d, a whole number from −30 to 30, not 0",
  draw: r => { const k = 1 + r.below(30); return { k: r.bit() ? k : -k }; },
  parse(text) { const k = Number(text.trim().replace(/^d\s*=\s*/, "")); return Number.isInteger(k) && k !== 0 && abs(k) <= 30 ? { k } : { invalid: "a whole number from −30 to 30, not 0" }; },
  label: p => String(p.k),
};
export const steppingCoefficients = dynamicLine<{ k: number }>({
  id: "stepping-coefficients", title: "Stepping Coefficients", goal: "a, b, c going up in equal steps of d", reads: ["gen"], focus: ["gen", "b"],
  space: stepSpace, peers: [{ k: 3 }, { k: -5 }],
  card: ({ k }) => `Write the line as a·x + b·y + c = 0 with whole numbers that share no factor (b positive). The three numbers should go up in steps of ${k}: b = a + ${k} and c = b + ${k}. Bigger numbers score more (the binary digits of the biggest of a, b, c); every unit a step is off costs 2.`,
  u(m, c, { k }) { const [a, b, cc] = abcOf(m, c); return stepU(a, b, cc, k); },
  searches: [{ id: "big-enough-steps", propose: (m, c, uStar, { k }) => {
    // a, a + d, a + 2d with gcd(a, d) = 1 (so they share no factor) and b = a + d > 0, the biggest at least 2^u*.
    const [a0] = abcOf(m, c), need = Math.ceil(2 ** Math.max(0, uStar) - 1e-9) + 2 * abs(k), out: LineTarget[] = [];
    for (const base of [Number(babs(a0)), need]) for (const sign of [1, -1]) {
      for (let a = sign * Math.max(1, base), i = 0; i < 40 && out.length < 4 && abs(a) < LIMIT; a += sign, i++) {
        const b = a + k, cc = b + k;
        if (b <= 0 || Number(gcd(BigInt(abs(a)), BigInt(abs(k)))) !== 1 || stepU(BigInt(a), BigInt(b), BigInt(cc), k) < uStar - 1e-9) continue;
        out.push({ m: q(BigInt(-a), BigInt(b)), c: q(BigInt(-cc), BigInt(b)) });
        break;
      }
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 11. Circle Kiss, on m and c

const kissU = (m: Q, c: Q, R: number) => {
  const p = Number(Qn.abs(m).n), qq = Number(m.d), h2 = p * p + qq * qq;
  if (h2 >= LIMIT * LIMIT || abs(toNum(c)) >= LIMIT) return NaN;
  const cn = toNum(c), dist2 = (cn * cn) / (1 + toNum(m) ** 2);
  return 0.5 * log2(h2) - 4 * abs(dist2 - R * R);
};
const kr = intRange(1, 60, "R, a whole number from 1 to 60", [5, 12]);
export const circleKiss = dynamicLine<{ k: number }>({
  id: "circle-kiss", title: "Circle Kiss", goal: "the line just touching the circle of radius R round (0, 0)", reads: ["m", "c"], focus: ["norm", "dist2"], ...kr,
  card: ({ k }) => `The line should just touch the circle of radius ${k} around (0, 0), at exactly one point. Write the gradient as top/bottom in lowest terms: the bigger top² + bottom², the better (half its binary digits); missing costs four times how far the squared distance from (0, 0) to the line is from ${k * k}.`,
  u: (m, c, { k }) => kissU(m, c, k),
  searches: [{ id: "pythagorean-tilts", propose: (m, c, uStar, { k }) => {
    // Tilts p/q with p² + q² = h² and h ≥ 2^u*, nearest the start's gradient; c = ±k·h/q touches exactly.
    const T = tilts(), need = 2 ** Math.max(0, uStar), x = abs(toNum(m)), out: LineTarget[] = [];
    let lo = 0, hi = T.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (T[mid]![0] < x) lo = mid + 1; else hi = mid; }
    const sm = Qn.sign(m) < 0 ? -1n : 1n, sc = Qn.sign(c) < 0 ? -1n : 1n;
    for (let d = 0; d < 4000 && out.length < 3 && (lo - d >= 0 || lo + d < T.length); d++) for (const i of d === 0 ? [lo] : [lo - d, lo + d]) {
      const t = T[i];
      if (!t || t[3] < need || out.length >= 3) continue;
      out.push({ m: q(sm * BigInt(t[1]), BigInt(t[2])), c: q(sc * BigInt(k * t[3]), BigInt(t[2])) });
    }
    return out;
  } }],
});
/** The Pythagorean tilts p/q (both orders of each primitive triple with u < 400), by value: [p/q, p, q, h]. Built on first use. */
let TILTS: [number, number, number, number][] | null = null;
function tilts(): [number, number, number, number][] {
  if (TILTS) return TILTS;
  const out: [number, number, number, number][] = [];
  for (let u = 2; u < 400; u++) for (let v = 1; v < u; v++) {
    if ((u - v) % 2 === 0 || Number(gcd(BigInt(u), BigInt(v))) !== 1) continue;
    const A = u * u - v * v, B = 2 * u * v, h = u * u + v * v;
    out.push([A / B, A, B, h], [B / A, B, A, h]);
  }
  return (TILTS = out.sort((a, b) => a[0] - b[0]));
}

// ------------------------------------------------------------------ 12. Square Triangle, on the triangle's area

const sqTriU = (m: Q, c: Q, k: number) => {
  if (Qn.isZero(m) || Qn.isZero(c)) return NaN;
  const area = toNum(Qn.mul(c, c)) / (2 * abs(toNum(m)));
  if (area >= LIMIT) return NaN;
  const n = Math.max(k, k * Math.round(Math.sqrt(area) / k));
  return log2(n) - 2 * Math.sqrt(abs(area - n * n));
};
const st = intRange(2, 30, "k, a whole number from 2 to 30", [3, 7]);
export const squareTriangle = dynamicLine<{ k: number }>({
  id: "square-triangle", whole: true, title: "Square Triangle", goal: "the triangle under the line with the area of a square of side a multiple of k", reads: ["m", "area"], focus: ["tri", "area"], ...st,
  card: ({ k }) => `The line and the two axes make a triangle. Its area should be exactly a square number n × n, where n is a multiple of ${k} (${k * k}, ${4 * k * k}, ${9 * k * k}, …). A bigger n scores more (its binary digits); missing costs twice the square root of how far the area is from n × n.`,
  u: (m, c, { k }) => sqTriU(m, c, k),
  searches: [{ id: "square-areas", propose: (m, c, uStar, { k }) => {
    // Keep the y-intercept and set the gradient to c²/(2n²) (its sign kept): the area is then exactly n².
    if (Qn.isZero(c)) return [];
    const need = Math.max(k, Math.ceil(2 ** Math.max(0, uStar) / k - 1e-9) * k);
    const near = Math.max(k, k * Math.round(Math.sqrt(Qn.isZero(m) ? 0 : toNum(Qn.mul(c, c)) / (2 * abs(toNum(m)))) / k));
    const sm = Qn.sign(m) < 0 ? -1n : 1n;
    return [...new Set([need, Math.max(need, near), Math.max(need, near + k)])].filter(n => n * n < LIMIT)
      .map(n => ({ m: Qn.mul(q(sm), Qn.div(Qn.mul(c, c), q(BigInt(2 * n * n)))) }));
  } }],
});

/** The families dealt with the dynamic measure: four that want small or fine numbers against six that want big ones. */
export const dynamicFamilies = [powerHug, primeHug, multiples, fineBottom, nextDoorBottom, unitFraction, primeSliver, crossingSliver, steppingCoefficients, circleKiss, squareTriangle] as const;
