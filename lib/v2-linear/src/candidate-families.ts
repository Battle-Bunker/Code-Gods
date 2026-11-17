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
import { continuedFraction, dynamicLine, fromContinued, type LineTarget } from "./dynamic-families.ts";

const log2 = Math.log2, abs = Math.abs;
const babs = (x: bigint) => (x < 0n ? -x : x);
const log2Big = (n: bigint): number => { n = babs(n); if (n === 0n) return -Infinity; const L = n.toString(2).length; return L <= 52 ? log2(Number(n)) : log2(Number(n >> BigInt(L - 52))) + (L - 52); };
const toNum = (v: Q) => Qn.toNumber(v);
/** Floats carry about 52 bits: an approach utility is capped there. */
const CAP = 50;
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
/** The continued fraction of a positive float (at most `n` terms; floats limit it to about 15). */
function floatCf(x: number, n = 18): bigint[] {
  const out: bigint[] = [];
  for (let i = 0; i < n && Number.isFinite(x); i++) { const a = Math.floor(x); out.push(BigInt(a)); if (x - a < 1e-12) break; x = 1 / (x - a); }
  return out;
}
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
export const bearingU = (m: Q, deg: number) => Math.min(CAP, -log2(abs(toNum(m) - Math.tan((deg * Math.PI) / 180))));
export const bearing = dynamicLine<{ deg: number }>({
  id: "bearing", title: "Bearing", goal: "the line pointing at the dealt angle", reads: ["m"], focus: ["si", "m"],
  space: listSpace(DEGREES.map(deg => ({ deg })), p => String(p.deg), "a whole number of degrees from 1 to 89, not 45 (e.g. 37)"),
  peers: [{ deg: 37 }, { deg: 61 }],
  card: ({ deg }) => `Your line should point ${deg}° above flat: its gradient should be tan ${deg}° = ${Math.tan((deg * Math.PI) / 180).toFixed(6)}…, which no fraction ever equals. You score one point for every binary digit of the gradient that matches.`,
  u: (m, _c, { deg }) => bearingU(m, deg),
  searches: [{ id: "convergents", propose: (_m, _c, uStar, { deg }) =>
    convergents(floatCf(Math.tan((deg * Math.PI) / 180))).filter(v => bearingU(v, deg) >= uStar - 1e-9).slice(0, 3).map(v => ({ m: v })) }],
});

// ------------------------------------------------------------------ 2. Golden Path (approach): the gradient's continued fraction follows a word

const WORDS = ["1", "2", "12", "21", "112", "123", "1122", "13"];
export function goldenPathU(m: Q, word: string): number {
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
export function ringU(m: Q, c: Q, { u, v, rho }: RingP): number {
  const [a, b, cc] = abcOf(m, c), norm = Math.sqrt(Number(a) ** 2 + Number(b) ** 2);
  const d = abs(Number(a * BigInt(u) + b * BigInt(v) + cc)) / norm;
  return Math.min(CAP, -log2(abs(d - Math.sqrt(rho))));
}
export const ring = dynamicLine<RingP>({
  id: "ring", title: "Ring", goal: "the line just touching the dealt circle", reads: ["gen"], focus: ["gen", "c"],
  space: listSpace(RINGS, p => `${p.u} ${p.v} ${p.rho}`, "a centre and a squared radius: one of " + RINGS.map(p => `${p.u} ${p.v} ${p.rho}`).join(", ")),
  peers: [RINGS[0]!, RINGS[1]!],
  card: ({ u, v, rho }) => `A circle is drawn round (${u}, ${v}) with radius √${rho}, a size no straight line with whole-number parts can touch exactly. Your line should just touch it: you score one point for every binary digit to which its distance from the centre matches the radius.`,
  u: (m, c, p) => ringU(m, c, p),
  searches: [{ id: "tangents", propose: (m, c, uStar, p) => {
    // Keep the start's direction (a, b), scaled up until the rounding of c can be fine enough; c from the tangent formula.
    const [a0, b0] = abcOf(m, c), out: LineTarget[] = [], R = Math.sqrt(p.rho);
    for (let k = 1n; k < 1n << 40n && out.length < 6; k *= 2n) {
      const a = a0 * k, b = b0 * k, norm = Math.sqrt(Number(a) ** 2 + Number(b) ** 2);
      if (norm < 2 ** (uStar - 1)) continue;
      for (const s of [1, -1]) {
        const cc = BigInt(Math.round(-Number(a * BigInt(p.u) + b * BigInt(p.v)) + s * R * norm));
        if (b === 0n) continue;
        const mm = q(-a, b), c2 = q(-cc, b);
        if (ringU(mm, c2, p) >= uStar - 1e-9) out.push({ m: mm, c: c2 });
      }
    }
    return out;
  } }],
});

// ------------------------------------------------------------------ 4. Archimedes (approach): top² − D·bottom² tiny against the numbers' size

const NONSQ = [2, 3, 5, 6, 7, 10, 13, 19, 61];
export function archimedesU(m: Q, D: number): number {
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
export function henselU(m: Q, { k: D, p }: HenselP): number {
  let N = babs(m.n) ** 2n - BigInt(D) * m.d * m.d, e = 0;
  if (N === 0n) return 0;
  const P = BigInt(p);
  while (N % P === 0n) { N /= P; e++; }
  return e * log2(p);
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
  id: "hensel", whole: true, title: "Hensel", goal: "the dealt prime dividing top² − D·bottom² many times", reads: ["m"], focus: ["si", "m"],
  space: listSpace(HENSEL, h => `${h.k} ${h.p}`, "D and p: one of " + HENSEL.map(h => `${h.k} ${h.p}`).join(", ")),
  peers: [HENSEL[0]!, HENSEL[1]!],
  card: ({ k, p }) => `Write the gradient as top/bottom in lowest terms. Work out top × top − ${k} × bottom × bottom. Score log2 ${p} for every time ${p} divides it.`,
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
  // Exact at any size (bigint): the distance from rise² + run² to the nearest n × a square.
  const p = babs(m.n), qq = m.d, h2 = p * p + qq * qq, N = BigInt(n);
  if (p === 0n) return NaN;
  const c0 = isqrt(h2 / N);
  const dist = [c0, c0 + 1n].map(c => babs(h2 - N * c * c)).reduce((x, y) => (y < x ? y : x));
  return 0.5 * log2Big(h2) - log2Big(1n + dist);
}
/** Primitive Pythagorean (A, B) with hypotenuse below `top` (at most 400², whatever is asked), both orders. */
function triples(top: number): [number, number][] {
  const out: [number, number][] = [];
  for (let u = 2; u * u < Math.min(top, 160000); u++) for (let v = 1; v < u; v++) {
    if ((u - v) % 2 === 0 || Number(gcd(BigInt(u), BigInt(v))) !== 1) continue;
    out.push([u * u - v * v, 2 * u * v], [2 * u * v, u * u - v * v]);
  }
  return out;
}
export const wholeStair = dynamicLine<{ k: number }>({
  id: "whole-stair", title: "Whole Stair", goal: "the gradient's step with a whole-number slanted edge (times √n)", reads: ["m"], focus: ["si", "m"],
  space: listSpace(SUMS2.map(k => ({ k })), p => String(p.k), `n, one of ${SUMS2.join(", ")}`),
  peers: [{ k: 1 }, { k: 5 }],
  card: ({ k }) => `Walk one step along your line: its gradient is rise/run in lowest terms. The slanted edge of that step is √(rise² + run²); it should be a whole number${k === 1 ? "" : ` times √${k}`}. You score half the binary digits of rise² + run², less the binary digits of how far it is from ${k === 1 ? "a square" : `${k} times a square`}.`,
  u: (m, _c, { k }) => wholeStairU(m, k),
  searches: [{ id: "pythagorean", propose: (m, _c, uStar, { k }) => {
    // (A + Bi)(s + ti) with s² + t² = n: rise² + run² = n·(A² + B²) exactly.
    const st = [...Array(4)].flatMap((_, s) => [...Array(4)].map((__, t) => [s, t] as const)).find(([s, t]) => s * s + t * t === k)!;
    const out: LineTarget[] = [], x = abs(toNum(m)) || 1;
    for (const [A, B] of triples(Math.max(64, 2 ** (uStar + 1)))) {
      const p = abs(A * st[0] - B * st[1]), qq = abs(A * st[1] + B * st[0]);
      if (p === 0 || qq === 0) continue;
      const v = q(BigInt(p), BigInt(qq));
      if (wholeStairU(v, k) >= uStar - 1e-9) out.push({ m: Qn.mul(q(sign(m)), v) });
    }
    return out.sort((a, b) => abs(toNum(a.m!) - x) - abs(toNum(b.m!) - x)).slice(0, 3);
  } }],
});

// ------------------------------------------------------------------ 7. Corner (exactness): the corner triangle's area n × a square (by the slope)

const SQFREE = [1, 2, 3, 5, 6, 7];
export function cornerU(m: Q, n: number): number {
  // Exact at any size (bigint): the distance from 2n·top·bottom to the nearest square.
  const A = 2n * BigInt(n) * babs(m.n) * m.d;
  if (A === 0n) return NaN;
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
    const out: LineTarget[] = [], need = 2 ** uStar;
    for (let b = 1; b < 200 && out.length < 4; b++) {
      const a = Math.max(1, Math.ceil(need / (2 * k * b)));
      for (const [t, d] of [[a * a, 2 * k * b * b], [2 * k * a * a, b * b]] as const) {
        const v = q(BigInt(t), BigInt(d));
        if (cornerU(v, k) >= uStar - 1e-9) out.push({ m: Qn.mul(q(sign(m)), v) });
      }
    }
    return out.slice(0, 4);
  } }],
});

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
