// The one-number toy shared by the free-energy trial scripts (see docs/engine-v2/redesign/free-energy.md).

export const N = 1 << 18; // state space cap
export const DELTA = 16; // height bins per bit
export const LAMBDA = 1.5; // resting law ∝ 2^(−λH); λ > 1 so Σ (1+n)^−λ converges
export const RHO = 0.3; // share of acts that multiply or divide
export const FMAX = 1024; // factors 2..FMAX (prior mass past it is below 2^−10)
export const KMAX = 4 * DELTA; // additive bell truncated at ±4 bits

// ---- the kernel ------------------------------------------------------------------------------------------------
export const binOf = new Int32Array(N);
for (let n = 0; n < N; n++) binOf[n] = Math.floor(DELTA * Math.log2(1 + n));
export const NB = binOf[N - 1] + 1;
export const bStart = new Int32Array(NB).fill(-1);
export const bSize = new Int32Array(NB);
for (let n = 0; n < N; n++) {
  const b = binOf[n];
  if (bStart[b] < 0) bStart[b] = n;
  bSize[b]++;
}
export const logpi = (b: number) => -LAMBDA * (b / DELTA); // quantised height b/DELTA

export const gRaw: number[] = [];
for (let k = -KMAX; k <= KMAX; k++) gRaw.push(Math.exp(-((k / DELTA) ** 2) / 2));
export const gSum = gRaw.reduce((a, b) => a + b, 0);
export const g = (k: number) => (Math.abs(k) > KMAX ? 0 : gRaw[k + KMAX] / gSum);

// addB[b*NB + b2]: probability that an act from bin b lands somewhere in bin b2 (accepted; includes b2 = b)
export const addB = new Float64Array(NB * NB);
for (let b = 0; b < NB; b++) {
  if (!bSize[b]) continue;
  for (let b2 = Math.max(0, b - KMAX); b2 <= Math.min(NB - 1, b + KMAX); b2++) {
    if (!bSize[b2]) continue;
    const a = b2 === b ? 1 : Math.min(1, 2 ** (logpi(b2) - logpi(b)) * (bSize[b2] / bSize[b]));
    addB[b * NB + b2] = (1 - RHO) * g(b2 - b) * a;
  }
}

export const fRaw = new Float64Array(FMAX + 1);
export let fSum = 0;
for (let f = 2; f <= FMAX; f++) {
  fRaw[f] = 2 ** -(2 * Math.floor(Math.log2(f)) + 1); // Elias gamma length
  fSum += fRaw[f];
}
export const Pf = (f: number) => (f < 2 || f > FMAX ? 0 : fRaw[f] / fSum);

// multiplicative pairs m ↔ m·f
export const pa: number[] = [], pb: number[] = [], pUp: number[] = [], pDown: number[] = [];
for (let m = 1; m < N; m++) {
  for (let f = 2; f <= FMAX && m * f < N; f++) {
    const y = m * f;
    pa.push(m); pb.push(y);
    pUp.push((RHO / 2) * Pf(f) * Math.min(1, 2 ** (logpi(binOf[y]) - logpi(binOf[m]))));
    pDown.push((RHO / 2) * Pf(f) * Math.min(1, 2 ** (logpi(binOf[m]) - logpi(binOf[y]))));
  }
}
export const PA = Int32Array.from(pa), PB = Int32Array.from(pb), PU = Float64Array.from(pUp), PD = Float64Array.from(pDown);
export const NP = PA.length;
export const stay = new Float64Array(N);
export const addOut = new Float64Array(NB);
for (let b = 0; b < NB; b++) for (let b2 = 0; b2 < NB; b2++) addOut[b] += addB[b * NB + b2];
for (let n = 0; n < N; n++) stay[n] = 1 - addOut[binOf[n]];
for (let i = 0; i < NP; i++) { stay[PA[i]] -= PU[i]; stay[PB[i]] -= PD[i]; }

/** Exact p(y | x) for y ≠ x (used by importance sampling and the route cost). */
export function pMove(x: number, y: number): number {
  let p = 0;
  const b = binOf[x], b2 = binOf[y];
  if (Math.abs(b2 - b) <= KMAX) p += addB[b * NB + b2] / bSize[b2];
  if (x > 0 && y > x && y % x === 0) p += (RHO / 2) * Pf(y / x) * Math.min(1, 2 ** (logpi(b2) - logpi(b)));
  if (y > 0 && x > y && x % y === 0) p += (RHO / 2) * Pf(x / y) * Math.min(1, 2 ** (logpi(b2) - logpi(b)));
  return p;
}

// ---- exact operators -------------------------------------------------------------------------------------------
export const meanV = new Float64Array(NB);
export const R = new Float64Array(NB);
export function applyP(V: Float64Array, out: Float64Array) {
  meanV.fill(0);
  for (let n = 0; n < N; n++) meanV[binOf[n]] += V[n];
  for (let b = 0; b < NB; b++) if (bSize[b]) meanV[b] /= bSize[b];
  for (let b = 0; b < NB; b++) {
    let s = 0;
    for (let b2 = Math.max(0, b - KMAX); b2 <= Math.min(NB - 1, b + KMAX); b2++) s += addB[b * NB + b2] * meanV[b2];
    R[b] = s;
  }
  for (let n = 0; n < N; n++) out[n] = R[binOf[n]] + stay[n] * V[n];
  for (let i = 0; i < NP; i++) { out[PA[i]] += PU[i] * V[PB[i]]; out[PB[i]] += PD[i] * V[PA[i]]; }
}

/** V_T(x) = P(the jiggle from x is in G at some tick 0..T), for each T in `marks`. */
export function hitProbs(inG: Uint8Array, marks: number[]): Map<number, Float64Array> {
  let V = new Float64Array(N), W = new Float64Array(N);
  for (let n = 0; n < N; n++) V[n] = inG[n];
  const res = new Map<number, Float64Array>();
  const last = Math.max(...marks);
  for (let t = 1; t <= last; t++) {
    applyP(V, W);
    for (let n = 0; n < N; n++) if (inG[n]) W[n] = 1;
    [V, W] = [W, V];
    if (marks.includes(t)) res.set(t, Float64Array.from(V));
  }
  return res;
}

/** E[2^(−q·τ)], τ the first tick in G. */
export function discounted(inG: Uint8Array, q: number): Float64Array {
  let V = new Float64Array(N), W = new Float64Array(N);
  for (let n = 0; n < N; n++) V[n] = inG[n];
  const d = 2 ** -q;
  for (let it = 0; it < 5000; it++) {
    applyP(V, W);
    let change = 0;
    for (let n = 0; n < N; n++) {
      const w = inG[n] ? 1 : d * W[n];
      if (V[n] > 0) change = Math.max(change, Math.abs(Math.log2(w / V[n])));
      else if (w > 0) change = Infinity;
      W[n] = w;
    }
    [V, W] = [W, V];
    if (change < 1e-6) break;
  }
  return V;
}

/** MIN(x): cheapest route cost Σ −log2 p(step) into G (Bellman–Ford to the fixed point). */
export const minD = new Float64Array(NB);
export const wB = new Float64Array(NB * NB).map((_, i) => {
  const b2 = i % NB;
  const v = addB[i];
  return v > 0 ? -Math.log2(v / bSize[b2]) : Infinity;
});
export const wU = Float64Array.from(PU, (p) => -Math.log2(p));
export const wD = Float64Array.from(PD, (p) => -Math.log2(p));
export function minCost(inG: Uint8Array): Float64Array {
  const D = new Float64Array(N).fill(Infinity);
  for (let n = 0; n < N; n++) if (inG[n]) D[n] = 0;
  for (let it = 0; it < 500; it++) {
    let changed = false;
    minD.fill(Infinity);
    for (let n = 0; n < N; n++) if (D[n] < minD[binOf[n]]) minD[binOf[n]] = D[n];
    for (let b = 0; b < NB; b++) {
      let best = Infinity;
      for (let b2 = Math.max(0, b - KMAX); b2 <= Math.min(NB - 1, b + KMAX); b2++) {
        const c = wB[b * NB + b2] + minD[b2];
        if (c < best) best = c;
      }
      R[b] = best;
    }
    for (let n = 0; n < N; n++) if (R[binOf[n]] < D[n] - 1e-12) { D[n] = R[binOf[n]]; changed = true; }
    for (let i = 0; i < NP; i++) {
      if (wU[i] + D[PB[i]] < D[PA[i]] - 1e-12) { D[PA[i]] = wU[i] + D[PB[i]]; changed = true; }
      if (wD[i] + D[PA[i]] < D[PB[i]] - 1e-12) { D[PB[i]] = wD[i] + D[PA[i]]; changed = true; }
    }
    if (!changed) break;
  }
  return D;
}

// ---- rules -----------------------------------------------------------------------------------------------------
export const sieve = new Uint8Array(2 * N).fill(1);
sieve[0] = sieve[1] = 0;
for (let i = 2; i * i < 2 * N; i++) if (sieve[i]) for (let j = i * i; j < 2 * N; j += i) sieve[j] = 0;
export const primes1: number[] = [];
for (let i = 2; i < 2 * N; i++) if (sieve[i] && i % 10 === 1) primes1.push(i);

export function nearestOf(list: number[], n: number): number {
  let lo = 0, hi = list.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] < n) lo = mid + 1; else hi = mid; }
  const a = list[lo], c = lo > 0 ? list[lo - 1] : a;
  return Math.abs(n - c) <= Math.abs(a - n) ? c : a;
}
export const pow3: number[] = [];
for (let p = 1; p < 4 * N; p *= 3) pow3.push(p);
export function factorDiff(m: number, k: number): number {
  let ks = 0, others = 0, x = m;
  while (x % k === 0) { x /= k; ks++; }
  for (let p = 2; p * p <= x; p++) while (x % p === 0) { x /= p; others++; }
  if (x > 1) others++;
  return ks - others;
}
export const RULES: Record<string, (n: number) => number> = {
  "Power Hug k=3": (n) => { const P = nearestOf(pow3, n); return Math.sqrt(Math.log2(P)) - Math.abs(n - P) ** 3; },
  "Prime Hug, ends in 1": (n) => { const p = nearestOf(primes1, n); return Math.sqrt(Math.log2(p)) - Math.abs(n - p) ** 3; },
  "Multiples k=7": (n) => { const m = Math.max(7, Math.round(n / 7) * 7); return (Math.log2(m) - Math.sqrt(Math.abs(n - m))) * factorDiff(m, 7); },
  "Bigger is better": (n) => n,
};
export const U: Record<string, Float64Array> = {};
for (const [name, u] of Object.entries(RULES)) U[name] = Float64Array.from({ length: N }, (_, n) => u(n));

// ---- starts at the reference size ------------------------------------------------------------------------------
export const SIZE = 12; // starts: floor(log2(1 + x)) = 12, i.e. x in [4095, 8190]
export const starts: number[] = [];
for (let x = 0; x < N; x++) if (Math.floor(Math.log2(1 + x)) === SIZE) starts.push(x);
export const meanOver = (f: (x: number) => number) => starts.reduce((s, x) => s + f(x), 0) / starts.length;
export const bitsOf = (v: number) => (v >= 1 ? 0 : -Math.log2(v));

export let seed = 12345;
export const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
export const gCdf: number[] = [];
{ let s = 0; for (let k = -KMAX; k <= KMAX; k++) { s += g(k); gCdf.push(s); } }
export const fCdf: number[] = [];
{ let s = 0; for (let f = 0; f <= FMAX; f++) { s += Pf(f); fCdf.push(s); } }
export const draw = (cdf: number[]) => { const r = rng() * cdf[cdf.length - 1]; let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; } return lo; };
export function step(x: number): number {
  if (rng() < RHO) {
    const f = draw(fCdf);
    if (rng() < 0.5) {
      const y = x * f;
      if (x === 0 || y >= N) return x;
      return rng() < Math.min(1, 2 ** (logpi(binOf[y]) - logpi(binOf[x]))) ? y : x;
    }
    return x % f === 0 && x > 0 ? x / f : x;
  }
  const b = binOf[x], b2 = b + draw(gCdf) - KMAX;
  if (b2 < 0 || b2 >= NB || !bSize[b2]) return x;
  const y = bStart[b2] + Math.floor(rng() * bSize[b2]);
  return rng() < (b2 === b ? 1 : Math.min(1, 2 ** (logpi(b2) - logpi(b)) * (bSize[b2] / bSize[b]))) ? y : x;
}
