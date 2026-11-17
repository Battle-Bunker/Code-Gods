/**
 * Line rules from the two rule brainstorms (17 Nov). Eight are dealt since the coordinator's trial of 17 Nov (dealt.ts):
 * Bearing, Golden Path, Ring, Archimedes, Hensel, Whole Stair, Corner, Long Run. Prime Palette, Kin and Shared Secret are
 * still candidates, NOT dealt (candidateFamilies). Built from the shortlist of the two
 * brainstorms (docs/engine-v2/redesign/rules-arithmetic.md and rules-geometry.md on the claude/rules-* branches). Each is
 * one pure real utility of the line, with candidates for the estimator and a card. They appear only in the rules mirror's
 * "Candidate rules (not dealt)" group; measurements are in docs/engine-v2/energy.md ("Candidate rules").
 *
 * Approach rules (aim at an irrational target, score digits of agreement): Bearing, Golden Path, Ring, Archimedes.
 * Exactness rules (exact solutions at every height): Hensel, Whole Stair, Corner, Prime Palette, Long Run, Kin, Shared
 * Secret. Nothing is computed at import time.
 */
import { gcd, q, Qn, type ParamSpace, type Q, type RuleFamily } from "@workspace/v2-core";
import type { LineState } from "./line.ts";
import { isqrt } from "./numbers.ts";
import { continuedFraction, dynamicLine, fromContinued, lensNeighbours, searchMeter, searchTick, type LineTarget } from "./dynamic-families.ts";

const log2 = Math.log2, abs = Math.abs;
const babs = (x: bigint) => (x < 0n ? -x : x);
/** The binary length of n > 0 (hex digits are four times cheaper to write than binary ones). */
const bitLength = (n: bigint): number => { const h = n.toString(16); return (h.length - 1) * 4 + (32 - Math.clz32(parseInt(h[0]!, 16))); };
const log2Big = (n: bigint): number => { n = babs(n); if (n === 0n) return -Infinity; const L = bitLength(n); return L <= 52 ? log2(Number(n)) : log2(Number(n >> BigInt(L - 52))) + (L - 52); };
const toNum = (v: Q) => Qn.toNumber(v);
/** Floats carry about 52 bits: an approach utility is capped there. */
const sign = (v: Q) => (v.n < 0n ? -1n : 1n);

/** A parameter space over a fixed list, typed back by its label. */
function listSpace<P>(items: readonly P[], label: (p: P) => string, hint: string): ParamSpace<P> {
  return {
    size: items.length, hint,
    draw: r => items[r.below(items.length)]!,
    parse(text) { const t = text.trim(); return items.find(p => label(p) === t) ?? { invalid: hint }; },
    label,
  };
}
const isSquare = (n: number) => Number.isInteger(Math.sqrt(n));
/** The convergents p/q of [a0; a1, …]. */
function convergents(as: readonly bigint[]): Q[] {
  const out: Q[] = [];
  let [p0, q0, p1, q1] = [1n, 0n, as[0]!, 1n];
  out.push(q(p1, q1));
  for (let i = 1; i < as.length; i++) { [p0, q0, p1, q1] = [p1, q1, as[i]! * p1 + p0, as[i]! * q1 + q0]; out.push(q(p1, q1)); }
  return out;
}

// ------------------------------------------------------------------ 1. Bearing (approach): the gradient at tan φ

const DEGREES = Array.from({ length: 89 }, (_, i) => i + 1).filter(d => d !== 45);
/**
 * tan(deg°) in fixed point, ⌊tan·2^P⌉ as a bigint, to P bits (whole-number arithmetic: Machin's π, Taylor series for sine
 * and cosine with 32 guard bits). Memoised by angle and precision.
 */
const TAN = new Map<string, bigint>();
function arctanInv(x: bigint, one: bigint): bigint {   // atan(1/x)·one
  let term = one / x, sum = term, k = 1n, sign = -1n;
  const x2 = x * x;
  while (term !== 0n) { term /= x2; const t = term / (2n * k + 1n); sum += sign * t; sign = -sign; k++; }
  return sum;
}
export function tanFixed(deg: number, P: number): bigint {
  const key = `${deg}:${P}`, hit = TAN.get(key);
  if (hit !== undefined) return hit;
  const G = BigInt(P + 32), one = 1n << G;
  const pi = 4n * (4n * arctanInv(5n, one) - arctanInv(239n, one));
  const x = (pi * BigInt(deg)) / 180n, x2 = (x * x) >> G;
  let sin = 0n, cos = 0n, term = x, n = 1n;
  while (term !== 0n) { sin += term; term = -((term * x2) >> G) / ((n + 1n) * (n + 2n)); n += 2n; }
  term = one; n = 0n;
  while (term !== 0n) { cos += term; term = -((term * x2) >> G) / ((n + 1n) * (n + 2n)); n += 2n; }
  const t = ((sin << BigInt(P)) + cos / 2n) / cos;
  TAN.set(key, t);
  return t;
}
/**
 * Bearing's utility, exact at any size: −log2 |m − tan φ|. tan φ is irrational for every dealt angle and algebraic, so
 * |m − tan φ| is far above 2^−(2·bits(bottom) + 64) (Roth): tan to that precision decides it.
 */
export function bearingU(m: Q, deg: number): number {
  if (!searchTick()) return -Infinity;
  const P = 2 * m.d.toString(2).length + babs(m.n).toString(2).length + 64, T = tanFixed(deg, P);
  const num = babs((m.n << BigInt(P)) - T * m.d);   // |m − tan|·bottom·2^P
  return P + log2Big(m.d) - log2Big(num === 0n ? 1n : num);
}
export const bearing = dynamicLine<{ deg: number }>({
  id: "bearing", title: "Bearing", goal: "the line pointing at the dealt angle", reads: ["m"], focus: ["si", "m"],
  space: listSpace(DEGREES.map(deg => ({ deg })), p => String(p.deg), "a whole number of degrees from 1 to 89, not 45 (e.g. 37)"),
  peers: [{ deg: 37 }, { deg: 61 }],
  card: ({ deg }) => `Your line should point ${deg}° above flat: its gradient should be tan ${deg}° = ${Math.tan((deg * Math.PI) / 180).toFixed(6)}…, which no fraction ever equals. You score one point for every binary digit of the gradient that matches.`,
  u: (m, _c, { deg }) => bearingU(m, deg),
  searches: [{ id: "convergents", propose: (_m, _c, uStar, { deg }) =>
    convergents(continuedFraction(q(tanFixed(deg, Math.ceil(Math.max(0, uStar)) + 64), 1n << BigInt(Math.ceil(Math.max(0, uStar)) + 64)))).filter(v => bearingU(v, deg) >= uStar - 1e-9).slice(0, 3).map(v => ({ m: v })) }],
});

// ------------------------------------------------------------------ 2. Golden Path (approach): the gradient's continued fraction follows a word

const WORDS = ["1", "2", "12", "21", "112", "123", "1122", "13"];
export function goldenPathU(m: Q, word: string): number {
  if (!searchTick()) return -Infinity;
  const cf = continuedFraction(Qn.abs(m));
  let k = 0;
  while (k < cf.length && cf[k] === BigInt(word[k % word.length]!)) k++;
  return k;
}
export const goldenPath = dynamicLine<{ word: string }>({
  id: "golden-path", title: "Golden Path", goal: "the gradient's path in the tree of fractions following the dealt pattern", reads: ["m"], focus: ["si", "m"],
  space: listSpace(WORDS.map(word => ({ word })), p => p.word, `a repeating pattern of steps: one of ${WORDS.join(", ")}`),
  peers: [{ word: "1" }, { word: "12" }],
  card: ({ word }) => `Write the gradient (ignore its sign) as a continued fraction: its whole part, then flip what is left and take that whole part, and so on. Those whole parts are your path down the tree of all fractions. You score one point for every step, from the first, that follows ${word} repeated (${[...Array(6)].map((_, i) => word[i % word.length]).join(", ")}, …).`,
  u: (m, _c, { word }) => goldenPathU(m, word),
  searches: [{ id: "pattern", propose: (m, _c, uStar, { word }) => {
    const need = Math.max(1, Math.ceil(uStar - 1e-9));
    return [need, need + 1, need + 2].map(k => ({ m: Qn.mul(q(sign(m)), fromContinued(Array.from({ length: k }, (_, i) => BigInt(word[i % word.length]!)))) }));
  } }],
});

// ------------------------------------------------------------------ 3. Ring (approach): just touch a circle that no line touches exactly

/** a, b, c of the line in lowest whole numbers, b > 0. */
function abcOf(m: Q, c: Q): [bigint, bigint, bigint] {
  const L = (m.d * c.d) / gcd(m.d, c.d), a = -m.n * (L / m.d), b = L, cc = -c.n * (L / c.d), g = gcd(gcd(babs(a), b), babs(cc));
  return [a / g, b / g, cc / g];
}
export interface RingP { readonly u: number; readonly v: number; readonly rho: number }
const RINGS: RingP[] = [{ u: 2, v: 1, rho: 7 }, { u: 0, v: 0, rho: 3 }, { u: -1, v: 3, rho: 11 }, { u: 3, v: -2, rho: 6 }, { u: 1, v: 1, rho: 19 }];
export function ringU(m: Q, c: Q, p: RingP): number {
  const [a, b, cc] = abcOf(m, c);
  return ringUabc(a, b, cc, p);
}
export function ringUabc(a: bigint, b: bigint, cc: bigint, { u, v, rho }: RingP): number {
  if (!searchTick()) return -Infinity;
  // Exact at any size: with N = |a·u + b·v + c| and M = a² + b², the distance is N/√M and
  // |N/√M − √ρ| = |N² − ρM| / ((N + √(ρM))·√M), every part a whole number but the last sum's root (a sum, no cancellation).
  // ρ is never a square times a sum of two squares here (every dealt ρ has a prime 3 mod 4 to an odd power), so N² ≠ ρM.
  // Scale-free, so any multiple of the line's a, b, c gives the same value.
  const N = babs(a * BigInt(u) + b * BigInt(v) + cc), M = a * a + b * b, R = BigInt(rho);
  const gap = babs(N * N - R * M);
  return 0.5 * log2Big(M) + log2Big(N + isqrt(R * M) + 1n) - log2Big(gap === 0n ? 1n : gap);
}
export const ring = dynamicLine<RingP>({
  id: "ring", title: "Ring", goal: "the line just touching the dealt circle", reads: ["gen"], focus: ["gen", "c"],
  space: listSpace(RINGS, p => `${p.u} ${p.v} ${p.rho}`, "a centre and a squared radius: one of " + RINGS.map(p => `${p.u} ${p.v} ${p.rho}`).join(", ")),
  peers: [RINGS[0]!, RINGS[1]!],
  card: ({ u, v, rho }) => `A circle is drawn round (${u}, ${v}) with radius √${rho}, a size no straight line with whole-number parts can touch exactly. Your line should just touch it: you score one point for every binary digit to which its distance from the centre matches the radius.`,
  u: (m, c, p) => ringU(m, c, p),
  uABC: (a, b, c, p) => ringUabc(a, b, c, p),
  searches: [{ id: "tangents", propose: (m, c, uStar, p) => {
    // Keep the start's direction (a, b), scaled up until the rounding of c can be fine enough; c from the tangent formula.
    // In whole numbers at any size: c = −(a·u + b·v) ± √(ρ(a² + b²)), the root rounded to the nearest whole number.
    const [a0, b0] = abcOf(m, c), out: LineTarget[] = [], R = BigInt(p.rho);
    for (let k = 1n; k < 1n << 40n && out.length < 6; k *= 2n) {
      const a = a0 * k, b = b0 * k, M = a * a + b * b;
      if (0.5 * log2Big(M) < uStar - 1) continue;
      const root = (isqrt(4n * R * M) + 1n) / 2n;
      for (const s of [1n, -1n]) {
        const cc = -(a * BigInt(p.u) + b * BigInt(p.v)) + s * root;
        if (b === 0n) continue;
        const mm = q(-a, b), c2 = q(-cc, b);
        if (ringU(mm, c2, p) >= uStar - 1e-9) out.push({ m: mm, c: c2 });
      }
    }
    return out;
  } }, { id: "one-number", propose: (m, c, uStar, p) => {
    // One number moved, in any lens (a larger search's cheap routes; 17 Nov, estimator-accuracy.md).
    const ok = (t: LineTarget) => ringU(t.m ?? m, t.c ?? c, p) >= uStar - 1e-9;
    return oneNumberScan(m, c, ok, 8, 6);
  } }],
});

// ------------------------------------------------------------------ 4. Archimedes (approach): top² − D·bottom² tiny against the numbers' size

const NONSQ = [2, 3, 5, 6, 7, 10, 13, 19, 61];
export function archimedesU(m: Q, D: number): number {
  if (!searchTick()) return -Infinity;
  const t = babs(m.n), u = m.d, big = t * t + BigInt(D) * u * u, diff = babs(t * t - BigInt(D) * u * u);
  return diff === 0n ? 0 : log2Big(big) - log2Big(diff);
}
/** The continued fraction of √D (whole-number algorithm), `n` terms. */
function sqrtCf(D: number, n: number): bigint[] {
  const a0 = BigInt(Math.floor(Math.sqrt(D))), out = [a0];
  let m = 0n, d = 1n, a = a0;
  for (let i = 1; i < n; i++) { m = d * a - m; d = (BigInt(D) - m * m) / d; a = (a0 + m) / d; out.push(a); }
  return out;
}
export const archimedes = dynamicLine<{ k: number }>({
  id: "archimedes", title: "Archimedes", goal: "the gradient's top² − D·bottom² tiny while the numbers are big", reads: ["m"], focus: ["si", "m"],
  space: listSpace(NONSQ.map(k => ({ k })), p => String(p.k), `D, one of ${NONSQ.join(", ")}`),
  peers: [{ k: 2 }, { k: 7 }],
  card: ({ k }) => `Write the gradient as top/bottom in lowest terms (ignore its sign). Make top × top − ${k} × bottom × bottom as small as you can while the numbers stay big: you score the binary digits of top² + ${k}·bottom² less those of the difference. The best gradients creep towards √${k}.`,
  u: (m, _c, { k }) => archimedesU(m, k),
  searches: [{ id: "pell", propose: (m, _c, uStar, { k }) =>
    convergents(sqrtCf(k, 60)).filter(v => archimedesU(v, k) >= uStar - 1e-9).slice(0, 3).map(v => ({ m: Qn.mul(q(sign(m)), v) })) }],
});

// ------------------------------------------------------------------ 5. Hensel (exactness): p divides top² − D·bottom² many times

export interface HenselP { readonly k: number; readonly p: number }
const HENSEL: HenselP[] = [{ k: 2, p: 7 }, { k: 3, p: 11 }, { k: 5, p: 11 }, { k: 2, p: 17 }, { k: 7, p: 3 }];
/** The roots r_e of x² ≡ D (mod p^e), e = 1, 2, … (index e − 1), lifted once per (D, p) and kept; empty when D is no square mod p. */
const henselRoots = new Map<string, bigint[]>();
function henselRoot(D: number, p: number, e: number): bigint | null {
  const key = `${D} ${p}`;
  let rs = henselRoots.get(key);
  if (!rs) { const r1 = liftRoot(D, p, 1); rs = r1 === null ? [] : [r1]; henselRoots.set(key, rs); }
  if (!rs.length) return null;
  const P = BigInt(p), d = BigInt(D);
  while (rs.length < e) {
    // Newton's step from p^k to p^(k+1): r ← r − (r² − D)·(2r)⁻¹.
    const mod = P ** BigInt(rs.length + 1), r = rs[rs.length - 1]!;
    rs.push((((r - (r * r - d) * modInverse(2n * r, mod)) % mod) + mod) % mod);
  }
  return rs[e - 1]!;
}
const modInverse = (a: bigint, n: bigint): bigint => {
  let [t, nt, r, nr] = [0n, 1n, n, ((a % n) + n) % n];
  while (nr !== 0n) { const k = r / nr; [t, nt] = [nt, t - k * nt]; [r, nr] = [nr, r - k * nr]; }
  return ((t % n) + n) % n;
};
/**
 * Hensel, graded (17 Nov): the best over levels e of e·log2 p less log2(1 + the distance from the top to the nearest
 * top t' with p^e dividing t'² − D·bottom²). A top where p divides it e times scores at least e·log2 p (distance 0); one
 * a step away keeps all but a bit, where the ungraded count fell to 0. Exact at any size (bigint).
 */
export function henselU(m: Q, { k: D, p }: HenselP): number {
  if (!searchTick()) return -Infinity;
  const P = BigInt(p), t = babs(m.n), b = m.d, L = log2(p);
  // p dividing the bottom: top² − D·bottom² ≡ top² (mod p), and the top is coprime to the bottom, so no top qualifies.
  if (b % P === 0n) return 0;
  // Levels up to the size of top² + D·bottom² and one more: a deeper level's nearest top lies a whole p^e away.
  const ceiling = t * t + BigInt(D) * b * b;
  let best = 0, mod = 1n;
  for (let e = 1; mod <= ceiling; e++) {
    mod *= P;
    const r = henselRoot(D, p, e);
    if (r === null) break;
    const want = (r * b) % mod;
    for (const root of [want, (mod - want) % mod]) {
      const d = (((t - root) % mod) + mod) % mod, dist = d < mod - d ? d : mod - d;
      const score = e * L - log2Big(1n + dist);
      if (score > best) best = score;
    }
  }
  return best;
}
/** x with x² ≡ D (mod p^k) (Hensel's lift), or null. */
function liftRoot(D: number, p: number, k: number): bigint | null {
  const P = BigInt(p);
  let r = -1n;
  for (let x = 1n; x < P; x++) if ((x * x - BigInt(D)) % P === 0n) { r = x; break; }
  if (r < 0n) return null;
  let mod = P;
  const inv = (a: bigint, n: bigint) => { let [t, nt, rr, nr] = [0n, 1n, n, ((a % n) + n) % n]; while (nr !== 0n) { const qq = rr / nr; [t, nt] = [nt, t - qq * nt]; [rr, nr] = [nr, rr - qq * nr]; } return ((t % n) + n) % n; };
  for (let i = 1; i < k; i++) { mod *= P; r = (((r - ((r * r - BigInt(D)) * inv(2n * r, mod))) % mod) + mod) % mod; }
  return r;
}
export const hensel = dynamicLine<HenselP>({
  id: "hensel", whole: true, title: "Hensel", goal: "the dealt prime dividing top² − D·bottom² many times, or a top near one that does", reads: ["m"], focus: ["si", "m"],
  space: listSpace(HENSEL, h => `${h.k} ${h.p}`, "D and p: one of " + HENSEL.map(h => `${h.k} ${h.p}`).join(", ")),
  peers: [HENSEL[0]!, HENSEL[1]!],
  card: ({ k, p }) => `Write the gradient as top/bottom in lowest terms and work out top × top − ${k} × bottom × bottom. If ${p} divides it e times, you score e × log2 ${p}. A top near such a top scores nearly as much: you score your best over e of e × log2 ${p} less log2(1 + the distance from your top to the nearest top that makes ${p}^e divide it).`,
  u: (m, _c, h) => henselU(m, h),
  searches: [{ id: "lift", propose: (m, _c, uStar, h) => {
    const need = Math.max(1, Math.ceil(uStar / log2(h.p) - 1e-9)), out: LineTarget[] = [];
    for (const k of [need, need + 1]) {
      const r = liftRoot(h.k, h.p, k), mod = BigInt(h.p) ** BigInt(k);
      if (r === null) continue;
      const u = m.d, t0 = babs(m.n), want = (r * u) % mod;
      for (const root of [want, (mod - want) % mod]) {
        const delta = ((root - t0) % mod + mod) % mod, t = t0 + (delta > mod / 2n ? delta - mod : delta);
        if (t !== 0n) out.push({ m: q(sign(m) * t, u) });
      }
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 6. Whole Stair (exactness): rise² + run² = n × a square

const SUMS2 = [1, 2, 5, 10, 13];
export function wholeStairU(m: Q, n: number): number {
  if (!searchTick()) return -Infinity;
  // Exact at any size (bigint): the distance from rise² + run² to the nearest n × a square.
  const p = babs(m.n), qq = m.d;
  if (p === 0n) return NaN;
  return stairFromH(p * p + qq * qq, n);
}
/** Whole Stair's value from H = rise² + run²: half its binary digits less those of its distance from n × a square. */
function stairFromH(h2: bigint, n: number): number {
  const N = BigInt(n), c0 = isqrt(h2 / N);
  const dist = [c0, c0 + 1n].map(c => babs(h2 - N * c * c)).reduce((x, y) => (y < x ? y : x));
  return 0.5 * log2Big(h2) - log2Big(1n + dist);
}
/**
 * Whole Stair's exact steps by ratio (17 Nov). For n = s² + t², every primitive (A, B) = (u² − v², 2uv) with u < 400, both
 * orders, turned by s + ti: rise = |A·s − B·t|, run = |A·t + B·s|, so rise² + run² = n·(A² + B²)² exactly. Built once per n
 * and kept sorted by rise/run (the old search rebuilt and scanned the whole list on every call: 70 ms a start).
 */
const STAIRS = new Map<number, { r: number; rise: number; run: number; u: number }[][]>();
/** The steps for n, in buckets by ⌊log2(rise² + run²)⌋ (a step's value: exact, so twice its value), each sorted by ratio. */
function stairsFor(k: number) {
  let buckets = STAIRS.get(k);
  if (buckets) return buckets;
  const [s0, t0] = [...Array(4)].flatMap((_, a) => [...Array(4)].map((__, b) => [a, b] as const)).find(([a, b]) => a * a + b * b === k)!;
  buckets = [];
  for (let u = 2; u < 400; u++) for (let v = 1; v < u; v++) {
    if ((u - v) % 2 === 0 || Number(gcd(BigInt(u), BigInt(v))) !== 1) continue;
    for (const [A, B] of [[u * u - v * v, 2 * u * v], [2 * u * v, u * u - v * v]]) {
      const rise = abs(A! * s0 - B! * t0), run = abs(A! * t0 + B! * s0);
      if (rise === 0 || run === 0) continue;
      const b = Math.floor(log2(rise * rise + run * run));
      (buckets[b] ??= []).push({ r: rise / run, rise, run, u });
    }
  }
  for (const list of buckets) list?.sort((a, b) => a.r - b.r);
  STAIRS.set(k, buckets);
  return buckets;
}
/**
 * The exact steps nearest |m| in rise/run that reach the level (2·u* bits of rise² + run²) without passing u² ≥ 2^(u*+1):
 * from each size bucket that can, the nearest on either side by binary search; the three nearest overall.
 */
function stairSteps(m: Q, uStar: number, k: number): LineTarget[] {
  const buckets = stairsFor(k), x = abs(toNum(m)) || 1, top = Math.max(64, 2 ** (uStar + 1));
  const near: { e: { r: number; rise: number; run: number; u: number }; d: number }[] = [];
  for (let b = Math.max(0, Math.floor(2 * uStar) - 1); b < buckets.length; b++) {
    const list = buckets[b];
    if (!list) continue;
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid]!.r < x) lo = mid + 1; else hi = mid; }
    for (const dir of [-1, 1]) for (let j = dir < 0 ? lo - 1 : lo, n = 0; j >= 0 && j < list.length && n < 3; j += dir) {
      const e = list[j]!;
      if (e.u * e.u >= top) continue;
      near.push({ e, d: abs(e.r - x) }); n++;
    }
  }
  near.sort((a, b) => a.d - b.d);
  const found: LineTarget[] = [];
  for (const { e } of near) {
    if (found.length >= 3 || searchMeter.left <= 0) break;
    const v = q(BigInt(e.rise), BigInt(e.run));
    if (wholeStairU(v, k) >= uStar - 1e-9) found.push({ m: Qn.mul(q(sign(m)), v) });
  }
  return found;
}
/** The divisors of n (trial division to 2^10; past that, n's factors found that far and the rest whole). */
function divisors(n: bigint): bigint[] {
  let ds = [1n];
  for (let p = 2n; p < 1n << 10n && p * p <= n; p += p === 2n ? 1n : 2n) {
    let e = 0;
    while (n % p === 0n) { n /= p; e++; }
    if (e) { const pw = ds.flatMap(d => Array.from({ length: e }, (_, i) => d * p ** BigInt(i + 1))); ds = ds.concat(pw); }
    if (ds.length > 4096) break;
  }
  if (n > 1n) ds = ds.concat(ds.map(d => d * n));
  return ds;
}
/**
 * Whole Stair with n = 1, one number at a time: the moved number z scales one leg (rise or run = α·z, the other leg β
 * fixed). Every whole leg α·z with β is d·e = β² split as (e − d)/2, so z = (β²/d − d)/(2α) for each divisor d of β² below
 * β (exact Pythagorean steps; a larger search's near misses are oneNumberScan's).
 */
function legLines(m: Q, c: Q, ok: (t: LineTarget) => boolean, keep: number): LineTarget[] {
  const found: { t: LineTarget; d: bigint }[] = [];
  for (const one of oneNumbers(m, c)) {
    // Each number's divisor work is charged as one utility (the meter bounds it with the rest).
    if (!one.movesM) continue;
    if (!searchTick()) break;
    const z0 = babs(one.z0), sg = one.z0 < 0n ? -1n : 1n;
    if (z0 === 0n) continue;
    const t1 = one.at(sg * (z0 + 1n)), t2 = one.at(sg * (z0 + 2n));
    if (!t1 || !t2 || !t1.m || !t2.m) continue;
    // Which leg z scales, and by how much: the leg that grows by α as z steps by 1 (the other stays β).
    for (const [leg, other] of [[(v: Q) => babs(v.n), (v: Q) => v.d], [(v: Q) => v.d, (v: Q) => babs(v.n)]] as const) {
      const a1 = leg(t1.m), a2 = leg(t2.m), alpha = a2 - a1, beta = other(t1.m);
      if (alpha <= 0n || other(t2.m) !== beta || a1 !== alpha * (z0 + 1n)) continue;
      const B2 = beta * beta;
      for (const d of divisors(B2)) {
        if (d >= beta) continue;
        const twice = B2 / d - d;
        if (twice % (2n * alpha) !== 0n) continue;
        const z = twice / (2n * alpha), t = z > 0n && z !== z0 ? one.at(sg * z) : null;
        if (t && ok(t)) found.push({ t, d: babs(z - z0) });
      }
    }
  }
  found.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  return found.slice(0, keep).map(f => f.t);
}
export const wholeStair = dynamicLine<{ k: number }>({
  id: "whole-stair", title: "Whole Stair", goal: "the gradient's step with a whole-number slanted edge (times √n)", reads: ["m"], focus: ["si", "m"],
  space: listSpace(SUMS2.map(k => ({ k })), p => String(p.k), `n, one of ${SUMS2.join(", ")}`),
  peers: [{ k: 1 }, { k: 5 }],
  card: ({ k }) => `Walk one step along your line: its gradient is rise/run in lowest terms. The slanted edge of that step is √(rise² + run²); it should be a whole number${k === 1 ? "" : ` times √${k}`}. You score half the binary digits of rise² + run², less the binary digits of how far it is from ${k === 1 ? "a square" : `${k} times a square`}.`,
  u: (m, _c, { k }) => wholeStairU(m, k),
  searches: [{ id: "pythagorean", propose: (m, _c, uStar, { k }) => stairSteps(m, uStar, k) }, { id: "one-number", propose: (m, c, uStar, { k }) => {
    const ok = (t: LineTarget) => wholeStairU(t.m ?? m, k) >= uStar - 1e-9;
    return [...(k === 1 ? legLines(m, c, ok, 6) : []), ...screenedScan(m, c, uStar, stairModel(k), ok, J_SCREEN, 6)];
  } }],
});

// ------------------------------------------------------------------ 7. Corner (exactness): the corner triangle's area n × a square (by the slope)

const SQFREE = [1, 2, 3, 5, 6, 7];
export function cornerU(m: Q, n: number): number {
  if (!searchTick()) return -Infinity;
  // Exact at any size (bigint): the distance from 2n·top·bottom to the nearest square.
  const A = 2n * BigInt(n) * babs(m.n) * m.d;
  if (A === 0n) return NaN;
  return cornerFromA(A);
}
/** Corner's value from A = 2n·top·bottom: half its binary digits less those of its distance from a square. */
function cornerFromA(A: bigint): number {
  const s = isqrt(A), dist = [s, s + 1n].map(r => babs(A - r * r)).reduce((x, y) => (y < x ? y : x));
  return 0.5 * log2Big(A) - log2Big(1n + dist);
}
export const corner = dynamicLine<{ k: number }>({
  id: "corner", title: "Corner", goal: "2n × top × bottom of the gradient a square", reads: ["m"], focus: ["si", "m"],
  space: listSpace(SQFREE.map(k => ({ k })), p => String(p.k), `n, one of ${SQFREE.join(", ")}`),
  peers: [{ k: 5 }, { k: 1 }],
  card: ({ k }) => `Your line and the two axes cut off a right-angled corner. Write the gradient as top/bottom in lowest terms (ignore its sign): 2 × ${k} × top × bottom should be a square number. You score half its binary digits, less the binary digits of how far it is from a square.`,
  u: (m, _c, { k }) => cornerU(m, k),
  searches: [{ id: "squares", propose: (m, _c, uStar, { k }) => {
    // top = a², bottom = 2n·b² (or the other way round): 2n·top·bottom = (2n·a·b)².
    // In whole numbers at any size: a ≥ 2^u* / (2n·b).
    const out: LineTarget[] = [], need = 1n << BigInt(Math.ceil(Math.max(0, uStar))), K = BigInt(k);
    for (let b = 1n; b < 200n && out.length < 4; b++) {
      const a = (need + 2n * K * b - 1n) / (2n * K * b) || 1n;
      for (const [t, d] of [[a * a, 2n * K * b * b], [2n * K * a * a, b * b]] as const) {
        const v = q(t, d);
        if (cornerU(v, k) >= uStar - 1e-9) out.push({ m: Qn.mul(q(sign(m)), v) });
      }
    }
    return out.slice(0, 4);
  } }, { id: "one-number", propose: (m, c, uStar, { k }) =>
    // One number of a lens moved so 2n·top·bottom is a square or near one (the routes a larger search found; 17 Nov).
    [...nearSquareLines(m, c, t => { const mm = t.m ?? m; return 2n * BigInt(k) * babs(mm.n) * mm.d; }, t => cornerU(t.m ?? m, k) >= uStar - 1e-9, 0, 6),
     ...screenedScan(m, c, uStar, cornerModel(k), t => cornerU(t.m ?? m, k) >= uStar - 1e-9, J_SCREEN, 6)] }],
});

// ------------------------------------------------------------------ one number at a time, in the lenses a turn pins

/** One whole number of the line in a lens, and the line with it replaced (a single add or multiply on that number). */
interface OneNumber { readonly z0: bigint; readonly movesM: boolean; at(z: bigint): LineTarget | null }
/** The whole numbers of the gradient-and-intercept, intercepts and a, b, c lenses, each with its replacement. */
function oneNumbers(m: Q, c: Q): OneNumber[] {
  const out: OneNumber[] = [];
  const pairs = (vs: bigint[], movesM: (i: number) => boolean, build: (v: bigint[]) => LineTarget | null) =>
    vs.forEach((z0, i) => out.push({ z0, movesM: movesM(i), at: z => { if (i % 2 === 1 && z <= 0n) return null; const v = vs.slice(); v[i] = z; return build(v); } }));
  pairs([m.n, m.d, c.n, c.d], i => i < 2, v => ({ m: q(v[0]!, v[1]!), c: q(v[2]!, v[3]!) }));
  if (m.n !== 0n) {
    const X = Qn.neg(Qn.div(c, m));   // the x-intercept; the y-intercept is c
    pairs([X.n, X.d, c.n, c.d], () => true, v => (v[0] === 0n ? null : { m: Qn.neg(Qn.div(q(v[2]!, v[3]!), q(v[0]!, v[1]!))), c: q(v[2]!, v[3]!) }));
  }
  const abc = abcOf(m, c);
  abc.forEach((z0, i) => out.push({ z0, movesM: i < 2, at: z => { const v = abc.slice(); v[i] = z; return v[1] === 0n ? null : { m: q(-v[0]!, v[1]!), c: q(-v[2]!, v[1]!) }; } }));
  return out;
}
/**
 * Lines one number away (in any lens) that pass `ok`: each number moved by up to ±J, or multiplied or divided exactly by
 * 2 to 16. The cheapest-looking first (the smallest change), at most `keep`. A rule's own number theory comes first; this
 * finds the near misses a single small add or multiply reaches (the routes a larger search found that the rules' own
 * candidates missed; 17 Nov).
 */
export function oneNumberScan(m: Q, c: Q, ok: (t: LineTarget) => boolean, J: number, keep: number, gradientOnly = false): LineTarget[] {
  // Every try, cheapest to name first (an add of j costs about 2·log2 j bits, a multiply by f about 2·log2 f), so the
  // search meter cuts the dear ones. A rule that reads only the gradient skips the numbers that cannot move it.
  const tries: { one: OneNumber; z: bigint; bits: number }[] = [];
  for (const one of oneNumbers(m, c)) {
    if (gradientOnly && !one.movesM) continue;
    const z0 = one.z0;
    for (let j = 1; j <= J; j++) for (const z of [z0 + BigInt(j), z0 - BigInt(j)]) tries.push({ one, z, bits: 2 * log2(j + 1) + 1 });
    for (let f = 2n; f <= 16n; f++) {
      const b = 2 * log2(Number(f));
      tries.push({ one, z: z0 * f, bits: b });
      if (z0 !== 0n && z0 % f === 0n) tries.push({ one, z: z0 / f, bits: b });
    }
  }
  tries.sort((x, y) => x.bits - y.bits);
  const found: LineTarget[] = [];
  for (const { one, z } of tries) {
    if (found.length >= keep || searchMeter.left <= 0) break;
    if (z === one.z0) continue;
    const t = one.at(z);
    if (t && ok(t)) found.push(t);
  }
  return found;
}
/** The squarefree part of n, up to the primes below 4096 (a cofactor left over counts as squarefree: still exact, maybe not least). */
function squarefreePart(n: bigint): bigint {
  let g = 1n;
  for (let p = 2n; p < 4096n && p * p <= n; p += p === 2n ? 1n : 2n) {
    let e = 0;
    while (n % p === 0n) { n /= p; e++; }
    if (e % 2) g *= p;
  }
  return g * n;
}
/**
 * Lines one number away (in any lens) whose A, a positive whole number proportional to that number, is a square or
 * near one: for each number z with A = K·z, (1) z = g·w², g the squarefree part of K, for the w nearest (A then an exact
 * square), and (2) for s within J of √A, the z nearest s²/K (a near square at a step of about 2·s·j/K), or, where that
 * step is under 1, every z within J of z0.
 */
function nearSquareLines(m: Q, c: Q, A: (t: LineTarget) => bigint, ok: (t: LineTarget) => boolean, J: number, keep: number): LineTarget[] {
  // The tries, exact squares first, then by distance (|j|), so the search meter cuts the dear ones.
  const tries: { one: OneNumber; sg: bigint; z0: bigint; z: bigint; rank: number }[] = [];
  for (const one of oneNumbers(m, c)) {
    if (searchMeter.left <= 0) break;
    if (!one.movesM) continue;   // Corner reads only the gradient
    const z0 = babs(one.z0), sg = one.z0 < 0n ? -1n : 1n;
    if (z0 === 0n) continue;
    // K from the next number up: at z0 itself a shared factor can cancel (the intercepts lens), next to it rarely.
    const t1 = one.at(sg * (z0 + 1n));
    if (!t1 || !searchTick()) continue;
    const A1 = A(t1);
    if (A1 <= 0n || A1 % (z0 + 1n) !== 0n) continue;
    const K = A1 / (z0 + 1n), g = squarefreePart(K), w = isqrt(z0 / g), r0 = isqrt(K * z0);
    for (const ww of [w, w + 1n]) tries.push({ one, sg, z0, z: g * ww * ww, rank: 0 });
    // Where a step of s moves z by less than 1 (4·z < K), every z near z0 is its own try.
    for (let j = 1; j <= J; j++) for (const jj of [j, -j]) {
      const s = r0 + BigInt(jj);
      tries.push({ one, sg, z0, z: 4n * z0 < K ? z0 + BigInt(jj) : s > 0n ? (2n * s * s + K) / (2n * K) : 0n, rank: j });
    }
  }
  tries.sort((x, y) => x.rank - y.rank);
  const found: { t: LineTarget; d: bigint }[] = [];
  for (const { one, sg, z0, z } of tries) {
    if (found.length >= 4 * keep || searchMeter.left <= 0) break;
    if (z <= 0n || z === z0) continue;
    const t = one.at(sg * z);
    if (t && ok(t)) found.push({ t, d: babs(z - z0) });
  }
  found.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  return found.slice(0, keep).map(f => f.t);
}

/**
 * A one-number scan screened by direct arithmetic (17 Nov): for each number z of a lens that moves the gradient, `model`
 * gives the rule's value as a closed form of z (true while no shared factor changes as z moves), so a try costs one
 * isqrt and a tenth of a search unit; only a try that screens at the level asked builds its line and is scored exactly
 * (a full unit). Tries go outwards from z0 (±1, ±2, …, up to J), then the multiples and exact divisions by 2–16.
 */
function screenedScan(m: Q, c: Q, uStar: number, model: (one: OneNumber, z0: bigint, sg: bigint) => ((z: bigint) => number) | null, ok: (t: LineTarget) => boolean, J: number, keep: number): LineTarget[] {
  const models: { one: OneNumber; z0: bigint; sg: bigint; f: (z: bigint) => number }[] = [];
  for (const one of oneNumbers(m, c)) {
    if (!one.movesM || one.z0 === 0n) continue;
    const z0 = babs(one.z0), sg = one.z0 < 0n ? -1n : 1n;
    if (!searchTick()) break;   // reading the model costs a line or two
    const f = model(one, z0, sg);
    if (f) models.push({ one, z0, sg, f });
  }
  const found: { t: LineTarget; d: bigint }[] = [], screen = searchMeter.unit / 10;
  const tryZ = (x: (typeof models)[number], z: bigint) => {
    if (z <= 0n || z === x.z0) return;
    searchMeter.left -= screen;
    if (x.f(z) < uStar - 0.5) return;
    const t = x.one.at(x.sg * z);
    if (t && ok(t)) found.push({ t, d: babs(z - x.z0) });
  };
  for (let j = 1n; j <= BigInt(J) && found.length < keep && searchMeter.left > 0; j++) for (const x of models) { tryZ(x, x.z0 + j); tryZ(x, x.z0 - j); }
  for (let f = 2n; f <= 16n && found.length < keep && searchMeter.left > 0; f++) for (const x of models) { tryZ(x, x.z0 * f); if (x.z0 % f === 0n) tryZ(x, x.z0 / f); }
  found.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  return found.slice(0, keep).map(f => f.t);
}
/** Corner's model: A = 2n·top·bottom is K·z for a number z of the gradient (K read one step from z0). */
const cornerModel = (k: number) => (one: OneNumber, z0: bigint, sg: bigint): ((z: bigint) => number) | null => {
  const t1 = one.at(sg * (z0 + 1n));
  if (!t1?.m) return null;
  const A1 = 2n * BigInt(k) * babs(t1.m.n) * t1.m.d;
  if (A1 <= 0n || A1 % (z0 + 1n) !== 0n) return null;
  const K = A1 / (z0 + 1n);
  return z => cornerFromA(K * z);
};
/** Whole Stair's model: one leg is α·z and the other β (read at two steps from z0), so H = α²z² + β². */
const stairModel = (k: number) => (one: OneNumber, z0: bigint, sg: bigint): ((z: bigint) => number) | null => {
  const t1 = one.at(sg * (z0 + 1n)), t2 = one.at(sg * (z0 + 2n));
  if (!t1?.m || !t2?.m) return null;
  for (const [leg, other] of [[(v: Q) => babs(v.n), (v: Q) => v.d], [(v: Q) => v.d, (v: Q) => babs(v.n)]] as const) {
    const a1 = leg(t1.m), alpha = leg(t2.m) - a1, beta = other(t1.m);
    if (alpha > 0n && other(t2.m) === beta && a1 === alpha * (z0 + 1n)) return z => stairFromH(alpha * alpha * z * z + beta * beta, k);
  }
  return null;
};

/** How far out the screened scans go, either side of a number. */
const J_SCREEN = 512;

// ------------------------------------------------------------------ number readers for Prime Palette and Long Run

const PARTS = ["gradient top", "gradient bottom", "y-intercept top", "y-intercept bottom"] as const;
export type Part = (typeof PARTS)[number];
const partOf = (m: Q, c: Q, on: Part): bigint => babs(on === "gradient top" ? m.n : on === "gradient bottom" ? m.d : on === "y-intercept top" ? c.n : c.d);
/** The line with one part replaced (its sign kept), as a target. */
function withPart(m: Q, c: Q, on: Part, v: bigint): LineTarget | null {
  if (v <= 0n) return null;
  if (on === "gradient top") return { m: q(sign(m) * v, m.d) };
  if (on === "gradient bottom") return { m: q(m.n, v) };
  if (on === "y-intercept top") return { c: q(sign(c) * v, c.d) };
  return { c: q(c.n, v) };
}

// ------------------------------------------------------------------ 8. Prime Palette (exactness): dealt primes dividing one number

export interface PaletteP { readonly primes: readonly number[]; readonly on: Part }
const PALETTES: PaletteP[] = [{ primes: [3], on: "gradient top" }, { primes: [2, 5], on: "y-intercept bottom" }, { primes: [7], on: "y-intercept top" }, { primes: [3, 11], on: "gradient bottom" }];
export function paletteU(n: bigint, primes: readonly number[]): number {
  if (n === 0n) return 0;
  let u = 0;
  for (const p of primes) { const P = BigInt(p); while (n % P === 0n) { n /= P; u += log2(p); } }
  return u;
}
export const primePalette = dynamicLine<PaletteP>({
  id: "prime-palette", title: "Prime Palette", goal: "the dealt primes dividing the dealt number many times", reads: ["m", "c"], focus: ["si", "m"],
  space: listSpace(PALETTES, p => `${p.primes.join(",")} ${p.on}`, "primes and a number: one of " + PALETTES.map(p => `${p.primes.join(",")} ${p.on}`).join("; ")),
  peers: [PALETTES[0]!, PALETTES[1]!],
  card: ({ primes, on }) => `Write the gradient and the y-intercept as fractions in lowest terms and look at the ${on}. Every time ${primes.join(" or ")} divides it, you score that prime's size in binary digits.`,
  u: (m, c, p) => paletteU(partOf(m, c, p.on), p.primes),
  searches: [{ id: "multiply-in", propose: (m, c, uStar, p) => {
    const n = partOf(m, c, p.on) || 1n, out: LineTarget[] = [];
    for (let extra = 1n, i = 0; i < 64 && out.length < 3; i++, extra *= BigInt(p.primes[0]!)) {
      const t = withPart(m, c, p.on, n * extra);
      if (t && paletteU(n * extra, p.primes) >= uStar - 1e-9) out.push(t);
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 9. Long Run (exactness): the longest run of a digit in a base

export interface RunP { readonly b: number; readonly d: number; readonly on: Part }
const RUNS: RunP[] = [{ b: 7, d: 3, on: "y-intercept top" }, { b: 10, d: 9, on: "gradient top" }, { b: 3, d: 2, on: "gradient bottom" }, { b: 12, d: 5, on: "y-intercept bottom" }];
export function longRunU(n: bigint, b: number, d: number): number {
  if (!searchTick()) return -Infinity;
  const B = BigInt(b), D = BigInt(d);
  let best = 0, run = 0;
  for (let x = n; x > 0n; x /= B) { if (x % B === D) { run++; if (run > best) best = run; } else run = 0; }
  return Math.max(0, best - 1) * log2(b);
}
export const longRun = dynamicLine<RunP>({
  id: "long-run", whole: true, title: "Long Run", goal: "a long run of the dealt digit in the dealt base", reads: ["m", "c"], focus: ["si", "c"],
  space: listSpace(RUNS, p => `${p.b} ${p.d} ${p.on}`, "a base, a digit and a number: one of " + RUNS.map(p => `${p.b} ${p.d} ${p.on}`).join("; ")),
  peers: [RUNS[0]!, RUNS[1]!],
  card: ({ b, d, on }) => `Write the ${on} (in lowest terms) in base ${b}. Find the longest run of the digit ${d} in a row: you score the binary digits of ${b} for every ${d} in that run after the first.`,
  u: (m, c, p) => longRunU(partOf(m, c, p.on), p.b, p.d),
  searches: [{ id: "overwrite", propose: (m, c, uStar, p) => {
    const L = Math.max(2, Math.ceil(uStar / log2(p.b) - 1e-9) + 1), n = partOf(m, c, p.on), B = BigInt(p.b), out: LineTarget[] = [];
    for (const len of [L, L + 1]) {
      let rep = 0n;
      for (let i = 0; i < len; i++) rep = rep * B + BigInt(p.d);
      const mod = B ** BigInt(len);
      for (const v of [(n / mod) * mod + rep, rep, n * mod + rep]) { const t = withPart(m, c, p.on, v); if (t) out.push(t); }
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 10. Kin (exactness): gradient and y-intercept Farey neighbours

export function kinU(m: Q, c: Q): number {
  if (!searchTick()) return -Infinity;
  const det = babs(m.n * c.d - c.n * m.d);
  if (det === 0n) return 0;
  const top = [m.n, m.d, c.n, c.d].reduce((t, x) => (babs(x) > t ? babs(x) : t), 0n);
  return 2 * log2Big(top) - log2Big(det);
}
export const kin = dynamicLine<Record<string, never>>({
  id: "kin", title: "Kin", goal: "the gradient and the y-intercept close kin: big fractions whose cross-products differ by 1", reads: ["m", "c"], focus: ["si", "c"],
  space: listSpace([{}], () => "-", "no parameters"), peers: [{}],
  card: () => `Write the gradient as p/q and the y-intercept as r/s in lowest terms. Cross-multiply: p × s and r × q. They are close kin when the two differ by 1. You score twice the binary digits of the biggest of p, q, r, s, less the binary digits of the difference.`,
  u: (m, c) => kinU(m, c),
  searches: [{ id: "neighbours", propose: (m, c, uStar) => {
    // Keep the gradient p/q; r/s with p·s − r·q = ±1 (extended Euclid), stepped by (p, q) to the needed size.
    const p = m.n, qq = m.d, out: LineTarget[] = [];
    if (p === 0n) return out;
    const [g, x] = (() => { let [r0, r1, s0, s1] = [babs(p), qq, 1n, 0n]; while (r1 !== 0n) { const k = r0 / r1; [r0, r1] = [r1, r0 - k * r1]; [s0, s1] = [s1, s0 - k * s1]; } return [r0, s0]; })();
    if (g !== 1n) return out;
    const s0 = ((x * (p < 0n ? -1n : 1n)) % qq + qq) % qq || qq;   // p·s ≡ 1 (mod q)
    for (let j = 0n; j < 64n && out.length < 3; j++) {
      const s = s0 + j * qq, r = (p * s - 1n) / qq;
      if (s <= 0n) continue;
      const cc = q(r, s);
      if (kinU(m, cc) >= uStar - 1e-9) out.push({ c: cc });
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 11. Shared Secret (exactness): a, b, c sharing factors pairwise

export function secretU(m: Q, c: Q): number {
  const [a, b, cc] = abcOf(m, c);
  if (a === 0n || cc === 0n) return 0;
  return log2Big(gcd(babs(a), b)) + log2Big(gcd(b, babs(cc))) + log2Big(gcd(babs(cc), babs(a)));
}
export const sharedSecret = dynamicLine<Record<string, never>>({
  id: "shared-secret", title: "Shared Secret", goal: "each pair of a, b, c sharing a big factor", reads: ["gen"], focus: ["gen", "b"],
  space: listSpace([{}], () => "-", "no parameters"), peers: [{}],
  card: () => `Write the line as a·x + b·y + c = 0 with whole numbers sharing no factor all three. Each pair of them may still share a factor: score the binary digits of what a and b share, b and c share, and c and a share (a or c of 0 scores nothing).`,
  u: (m, c) => secretU(m, c),
  searches: [{ id: "x-y-z", propose: (m, _c, uStar) => {
    // a = xy, b = yz, c = zx with x, y, z pairwise coprime (consecutive odd numbers near 2^(u*/3) and powers of 2).
    const base = Math.max(3, Math.ceil(2 ** (uStar / 3))), out: LineTarget[] = [];
    for (let i = 0; i < 6 && out.length < 3; i++) {
      const x = BigInt(base + 2 * i) | 1n, y = x + 2n, z = 1n << BigInt(Math.max(1, Math.ceil(log2(base))));
      if (gcd(x, y) !== 1n || gcd(y, z) !== 1n || gcd(x, z) !== 1n) continue;
      const a = x * y * (m.n < 0n ? 1n : -1n), b = y * z, cc = z * x;
      out.push({ m: q(-a, b), c: q(-cc, b) });
    }
    return out;
  } }],
});

/** The candidate rules still on trial, never dealt (no agents): Prime Palette, Kin and Shared Secret (energy.md flags). */
export const candidateFamilies: readonly RuleFamily<LineState, any>[] = [primePalette, kin, sharedSecret];
