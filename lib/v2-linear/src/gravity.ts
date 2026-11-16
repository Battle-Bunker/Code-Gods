/**
 * Gravity (docs/engine-v2/gravity.md; the owner, 16 Nov: "We want gravity towards smaller numbers to be a configurable
 * force size ... scaled up considerably so that it really behaves like a force of gravity").
 *
 * The line y = −(a/b)x − c/b is a point at heights |a|/b (the gradient's size) and |c|/b (the y-intercept's size). Its
 * potential is
 *
 *   φ(a, b, c) = B(b) + H(a | b) + H(c | b),   H(n | b) = g·(|n|/d)^α + log2 Z(d),   d = max(b, 1),
 *
 * B(b) the steps code on the bottom number (p(0) = 1/16, half a bit per unit), Z(d) = Σ_n 2^(−g·(|n|/d)^α). So:
 * - g·height^α is the height in a gravity field of strength g bits per unit (α = 1: a constant field, the still
 *   atmosphere's barometric law, density halving every 1/g units of height; α > 1: the field steepens with height);
 * - log2 Z(d) is the precision of a position on the grid of spacing 1/d: about log2 d bits, so a fraction pays for its
 *   bottom number twice, once in B and once as the finer grid it sits on;
 * - neighbours cost nearly the same: 101 and 100 differ by g bits, and 100½ costs about B(2) − B(1) + 2 bits more than
 *   either (its bottom number), never tens of bits.
 * The law π ∝ 2^−φ is complete over (a, b, c) for each b (Σ_n 2^−H(n|b) = 1), so it is a sub-probability on the
 * canonical lines, as the codes it replaces were.
 */
import { stepsIntCode, type IntCode, type Rng } from "@workspace/v2-core";

export interface Gravity {
  /** Bits per unit of height. */
  readonly g: number;
  /** The field's shape: 1 constant, above 1 steepening with height. */
  readonly alpha: number;
}

const B_CODE: IntCode = stepsIntCode(1 / 16);

/** Z_t(d) = Σ_{n ∈ Z} 2^(−t·g·(|n|/d)^α), as log2. */
function log2Zt(gr: Gravity, d: number, t: number): number {
  const k = t * gr.g;
  if (gr.alpha === 1) {
    const r = 2 ** (-k / d);
    return Math.log2((1 + r) / (1 - r));
  }
  // Direct sum to where the terms fall below 2^−64 of the first, then the integral of the rest (negligible).
  const nMax = Math.ceil(d * (64 / k) ** (1 / gr.alpha));
  if (nMax > 400_000) {
    // Wide and smooth: Σ_Z f(|n|) = 2∫_0^∞ f to far below a bit's precision. ∫_0^∞ 2^(−k(x/d)^α) dx = d·Γ(1 + 1/α)/(k ln2)^(1/α).
    return Math.log2(2 * d * gamma(1 + 1 / gr.alpha) / (k * Math.LN2) ** (1 / gr.alpha));
  }
  let s = 1;
  for (let n = 1; n <= nMax; n++) s += 2 * 2 ** (-k * (n / d) ** gr.alpha);
  return Math.log2(s);
}
function gamma(x: number): number {
  // Lanczos (g = 7), x > 0.
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  let a = c[0]!;
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (x + i);
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
}

export interface GravityLineCode {
  readonly gravity: Gravity;
  /** H(n | d): the bits of one coefficient n over the bottom number d ≥ 1. */
  coefficient(n: bigint, d: number): number;
  /** φ of a triple (a, b, c), b ≥ 0. */
  bits(a: bigint, b: bigint, c: bigint): number;
  /** One triple from q_t ∝ 2^(−t·φ) (t = 1: the law), with its φ. */
  sample(r: Rng, t: number): { a: bigint; b: bigint; c: bigint; bits: number };
  /** log2 Σ 2^(−t·φ) over all triples (0 at t = 1). */
  log2Norm(t: number): number;
}

const codeCache = new Map<string, GravityLineCode>();
export function gravityLineCode(gr: Gravity): GravityLineCode {
  if (!(gr.g > 0) || !(gr.alpha >= 1)) throw new RangeError("gravity needs g > 0 and α ≥ 1");
  const key = `${gr.g}:${gr.alpha}`;
  const hit = codeCache.get(key);
  if (hit) return hit;
  const z1 = new Map<number, number>();
  const log2Z1 = (d: number) => { let z = z1.get(d); if (z === undefined) z1.set(d, z = log2Zt(gr, d, 1)); return z; };
  const H = (n: bigint, d: number) => gr.g * (Number(n < 0n ? -n : n) / d) ** gr.alpha + log2Z1(d);
  const bits = (a: bigint, b: bigint, c: bigint) => { const d = b === 0n ? 1 : Number(b < 0n ? -b : b); return B_CODE.bits(b) + H(a, d) + H(c, d); };
  // The tilted marginal of b: w_t(b) = 2^(−t·B(b)) · (Z_t(d) / Z_1(d)^t)², b ≥ 0 (B's negative half is the leftover mass).
  const tables = new Map<number, { cdf: Float64Array; log2Norm: number }>();
  const table = (t: number) => {
    let tb = tables.get(t);
    if (tb) return tb;
    const ws: number[] = [];
    for (let b = 0; ; b++) {
      const d = Math.max(b, 1);
      const lw = -t * B_CODE.bits(BigInt(b)) + 2 * (log2Zt(gr, d, t) - t * log2Z1(d));
      ws.push(lw);
      if (b > 8 && lw < Math.max(...ws.slice(0, 8)) - 70) break;
      if (b > 20_000) break;
    }
    // |b| ≥ 1 carries both signs (b < 0 is the code's leftover mass: drawn, then discarded as non-canonical).
    ws.forEach((lw, i) => { if (i > 0) ws[i] = lw + 1; });
    const top = Math.max(...ws);
    const cdf = new Float64Array(ws.length);
    let s = 0;
    ws.forEach((lw, i) => { s += 2 ** (lw - top); cdf[i] = s; });
    for (let i = 0; i < cdf.length; i++) cdf[i]! /= s;
    tables.set(t, tb = { cdf, log2Norm: Math.log2(s) + top });
    return tb;
  };
  /** n from 2^(−t·g·(|n|/d)^α) / Z_t(d). */
  const sampleN = (r: Rng, d: number, t: number): bigint => {
    const k = t * gr.g;
    if (gr.alpha === 1) {
      const ratio = 2 ** (-k / d);
      if (r.unit() < (1 - ratio) / (1 + ratio)) return 0n;
      const m = 1 + Math.floor(Math.log1p(-r.unit()) / Math.log(ratio));
      return BigInt(r.bit() ? -m : m);
    }
    // Tangent envelope at x0 (x^α ≥ x0^α + α·x0^(α−1)(x − x0)): a two-sided geometric proposal, then accept.
    const x0 = (1 / (k * Math.LN2)) ** (1 / gr.alpha), slopeK = k * gr.alpha * x0 ** (gr.alpha - 1);
    const ratio = 2 ** (-slopeK / d);
    for (;;) {
      let m = 0;
      if (r.unit() >= (1 - ratio) / (1 + ratio)) m = 1 + Math.floor(Math.log1p(-r.unit()) / Math.log(ratio));
      const x = m / d;
      const excess = k * (x ** gr.alpha - x0 ** gr.alpha - gr.alpha * x0 ** (gr.alpha - 1) * (x - x0));
      if (r.unit() < 2 ** -excess) return BigInt(m && r.bit() ? -m : m);
    }
  };
  const code: GravityLineCode = {
    gravity: gr,
    coefficient: H,
    bits,
    sample(r, t) {
      const { cdf } = table(t);
      const u = r.unit();
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) { const h = (lo + hi) >> 1; if (cdf[h]! < u) lo = h + 1; else hi = h; }
      const b = lo > 0 && r.bit() ? -BigInt(lo) : BigInt(lo);
      const d = Math.max(lo, 1);
      const a = sampleN(r, d, t), c = sampleN(r, d, t);
      return { a, b, c, bits: bits(a, b, c) };
    },
    log2Norm: t => table(t).log2Norm,
  };
  codeCache.set(key, code);
  return code;
}
