// Trial script (no engine change): does a state's energy defined as the surprise of the passive jiggle reaching
// {u ≥ u*} (SUM) behave better than the cheapest single route (MIN)? One whole-number parameter n in [0, N).
// Run: node --experimental-strip-types lib/v2-linear/scripts/free-energy.ts   (about two minutes)
// Write-up: docs/engine-v2/redesign/free-energy.md.

const N = 1 << 18; // state space cap
const DELTA = 16; // height bins per bit
const LAMBDA = 1.5; // resting law ∝ 2^(−λH); λ > 1 so Σ (1+n)^−λ converges
const RHO = 0.3; // share of acts that multiply or divide
const FMAX = 1024; // factors 2..FMAX (prior mass past it is below 2^−10)
const KMAX = 4 * DELTA; // additive bell truncated at ±4 bits

// ---- the kernel ------------------------------------------------------------------------------------------------
const binOf = new Int32Array(N);
for (let n = 0; n < N; n++) binOf[n] = Math.floor(DELTA * Math.log2(1 + n));
const NB = binOf[N - 1] + 1;
const bStart = new Int32Array(NB).fill(-1);
const bSize = new Int32Array(NB);
for (let n = 0; n < N; n++) {
  const b = binOf[n];
  if (bStart[b] < 0) bStart[b] = n;
  bSize[b]++;
}
const logpi = (b: number) => -LAMBDA * (b / DELTA); // quantised height b/DELTA

const gRaw: number[] = [];
for (let k = -KMAX; k <= KMAX; k++) gRaw.push(Math.exp(-((k / DELTA) ** 2) / 2));
const gSum = gRaw.reduce((a, b) => a + b, 0);
const g = (k: number) => (Math.abs(k) > KMAX ? 0 : gRaw[k + KMAX] / gSum);

// addB[b*NB + b2]: probability that an act from bin b lands somewhere in bin b2 (accepted; includes b2 = b)
const addB = new Float64Array(NB * NB);
for (let b = 0; b < NB; b++) {
  if (!bSize[b]) continue;
  for (let b2 = Math.max(0, b - KMAX); b2 <= Math.min(NB - 1, b + KMAX); b2++) {
    if (!bSize[b2]) continue;
    const a = b2 === b ? 1 : Math.min(1, 2 ** (logpi(b2) - logpi(b)) * (bSize[b2] / bSize[b]));
    addB[b * NB + b2] = (1 - RHO) * g(b2 - b) * a;
  }
}

const fRaw = new Float64Array(FMAX + 1);
let fSum = 0;
for (let f = 2; f <= FMAX; f++) {
  fRaw[f] = 2 ** -(2 * Math.floor(Math.log2(f)) + 1); // Elias gamma length
  fSum += fRaw[f];
}
const Pf = (f: number) => (f < 2 || f > FMAX ? 0 : fRaw[f] / fSum);

// multiplicative pairs m ↔ m·f
const pa: number[] = [], pb: number[] = [], pUp: number[] = [], pDown: number[] = [];
for (let m = 1; m < N; m++) {
  for (let f = 2; f <= FMAX && m * f < N; f++) {
    const y = m * f;
    pa.push(m); pb.push(y);
    pUp.push((RHO / 2) * Pf(f) * Math.min(1, 2 ** (logpi(binOf[y]) - logpi(binOf[m]))));
    pDown.push((RHO / 2) * Pf(f) * Math.min(1, 2 ** (logpi(binOf[m]) - logpi(binOf[y]))));
  }
}
const PA = Int32Array.from(pa), PB = Int32Array.from(pb), PU = Float64Array.from(pUp), PD = Float64Array.from(pDown);
const NP = PA.length;
const stay = new Float64Array(N);
const addOut = new Float64Array(NB);
for (let b = 0; b < NB; b++) for (let b2 = 0; b2 < NB; b2++) addOut[b] += addB[b * NB + b2];
for (let n = 0; n < N; n++) stay[n] = 1 - addOut[binOf[n]];
for (let i = 0; i < NP; i++) { stay[PA[i]] -= PU[i]; stay[PB[i]] -= PD[i]; }

/** Exact p(y | x) for y ≠ x (used by importance sampling and the route cost). */
function pMove(x: number, y: number): number {
  let p = 0;
  const b = binOf[x], b2 = binOf[y];
  if (Math.abs(b2 - b) <= KMAX) p += addB[b * NB + b2] / bSize[b2];
  if (x > 0 && y > x && y % x === 0) p += (RHO / 2) * Pf(y / x) * Math.min(1, 2 ** (logpi(b2) - logpi(b)));
  if (y > 0 && x > y && x % y === 0) p += (RHO / 2) * Pf(x / y) * Math.min(1, 2 ** (logpi(b2) - logpi(b)));
  return p;
}

// ---- exact operators -------------------------------------------------------------------------------------------
const meanV = new Float64Array(NB);
const R = new Float64Array(NB);
function applyP(V: Float64Array, out: Float64Array) {
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
function hitProbs(inG: Uint8Array, marks: number[]): Map<number, Float64Array> {
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
function discounted(inG: Uint8Array, q: number): Float64Array {
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
const minD = new Float64Array(NB);
const wB = new Float64Array(NB * NB).map((_, i) => {
  const b2 = i % NB;
  const v = addB[i];
  return v > 0 ? -Math.log2(v / bSize[b2]) : Infinity;
});
const wU = Float64Array.from(PU, (p) => -Math.log2(p));
const wD = Float64Array.from(PD, (p) => -Math.log2(p));
function minCost(inG: Uint8Array): Float64Array {
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
const sieve = new Uint8Array(2 * N).fill(1);
sieve[0] = sieve[1] = 0;
for (let i = 2; i * i < 2 * N; i++) if (sieve[i]) for (let j = i * i; j < 2 * N; j += i) sieve[j] = 0;
const primes1: number[] = [];
for (let i = 2; i < 2 * N; i++) if (sieve[i] && i % 10 === 1) primes1.push(i);

function nearestOf(list: number[], n: number): number {
  let lo = 0, hi = list.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] < n) lo = mid + 1; else hi = mid; }
  const a = list[lo], c = lo > 0 ? list[lo - 1] : a;
  return Math.abs(n - c) <= Math.abs(a - n) ? c : a;
}
const pow3: number[] = [];
for (let p = 1; p < 4 * N; p *= 3) pow3.push(p);
function factorDiff(m: number, k: number): number {
  let ks = 0, others = 0, x = m;
  while (x % k === 0) { x /= k; ks++; }
  for (let p = 2; p * p <= x; p++) while (x % p === 0) { x /= p; others++; }
  if (x > 1) others++;
  return ks - others;
}
const RULES: Record<string, (n: number) => number> = {
  "Power Hug k=3": (n) => { const P = nearestOf(pow3, n); return Math.sqrt(Math.log2(P)) - Math.abs(n - P) ** 3; },
  "Prime Hug, ends in 1": (n) => { const p = nearestOf(primes1, n); return Math.sqrt(Math.log2(p)) - Math.abs(n - p) ** 3; },
  "Multiples k=7": (n) => { const m = Math.max(7, Math.round(n / 7) * 7); return (Math.log2(m) - Math.sqrt(Math.abs(n - m))) * factorDiff(m, 7); },
  "Bigger is better": (n) => n,
};
const U: Record<string, Float64Array> = {};
for (const [name, u] of Object.entries(RULES)) U[name] = Float64Array.from({ length: N }, (_, n) => u(n));

// ---- starts at the reference size ------------------------------------------------------------------------------
const SIZE = 12; // starts: floor(log2(1 + x)) = 12, i.e. x in [4095, 8190]
const starts: number[] = [];
for (let x = 0; x < N; x++) if (Math.floor(Math.log2(1 + x)) === SIZE) starts.push(x);
const meanOver = (f: (x: number) => number) => starts.reduce((s, x) => s + f(x), 0) / starts.length;
const bitsOf = (v: number) => (v >= 1 ? 0 : -Math.log2(v));

// ---- 1, 4: MIN, SUM_T, discount --------------------------------------------------------------------------------
const MARKS = [1, 4, 16, 64, 256];
type Goal = { rule: string; label: string; inG: Uint8Array };
function goalAt(rule: string, label: string, uStar: number): Goal {
  const u = U[rule];
  const inG = new Uint8Array(N);
  for (let n = 0; n < N; n++) inG[n] = u[n] >= uStar - 1e-12 ? 1 : 0;
  return { rule, label, inG };
}
function quantile(rule: string, q: number): number {
  const vals = starts.map((x) => U[rule][x]).sort((a, b) => a - b);
  return vals[Math.min(vals.length - 1, Math.floor(q * vals.length))];
}
const goals: Goal[] = [];
for (const rule of Object.keys(RULES)) {
  for (const [label, q] of [["median", 0.5], ["top 10%", 0.9], ["top 1%", 0.99], ["best", 1]] as const) {
    goals.push(goalAt(rule, label, quantile(rule, q)));
  }
}
goals.push(goalAt("Power Hug k=3", "3^8 within 1 (near)", Math.sqrt(Math.log2(6561)) - 1));
goals.push(goalAt("Power Hug k=3", "3^11 only (rare)", Math.sqrt(Math.log2(177147))));
const trophies = (k: number, label: string): Goal => {
  const inG = new Uint8Array(N);
  for (let j = 0; j < k; j++) inG[6561 + 37 * j] = 1;
  return { rule: "custom", label, inG };
};
goals.push(trophies(1, "one trophy {6561}"), trophies(8, "eight trophies 6561+37j"));

const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "∞");
const cache = new Map<Goal, Map<number, Float64Array>>();
console.log(`N = ${N}, bins ${NB}, pairs ${NP}, starts ${starts.length} (size ${SIZE} bits)`);
let t0 = performance.now();
applyP(new Float64Array(N).fill(1), new Float64Array(N));
console.log(`one exact step: ${(performance.now() - t0).toFixed(1)} ms`);
console.log("\n| rule | goal | share of space in G | MIN | SUM T=1 | 4 | 16 | 64 | 256 | disc q=1 | q=0.25 | q=0.05 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const goal of goals) {
  const share = goal.inG.reduce((s, v) => s + v, 0) / N;
  const D = minCost(goal.inG);
  const H = hitProbs(goal.inG, MARKS);
  cache.set(goal, H);
  const disc = [1, 0.25, 0.05].map((q) => discounted(goal.inG, q));
  console.log(`| ${goal.rule} | ${goal.label} | ${share.toExponential(1)} | ${fmt(meanOver((x) => D[x]))} | ` +
    MARKS.map((T) => fmt(meanOver((x) => bitsOf(H.get(T)![x])))).join(" | ") + " | " +
    disc.map((V) => fmt(meanOver((x) => bitsOf(V[x])))).join(" | ") + " |");
}

// ---- 2: plain simulation ---------------------------------------------------------------------------------------
let seed = 12345;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gCdf: number[] = [];
{ let s = 0; for (let k = -KMAX; k <= KMAX; k++) { s += g(k); gCdf.push(s); } }
const fCdf: number[] = [];
{ let s = 0; for (let f = 0; f <= FMAX; f++) { s += Pf(f); fCdf.push(s); } }
const draw = (cdf: number[]) => { const r = rng() * cdf[cdf.length - 1]; let lo = 0, hi = cdf.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; } return lo; };
function step(x: number): number {
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
const T = 16;
function walkMax(x: number, u: Float64Array): number { let m = u[x]; for (let t = 0; t < T; t++) { x = step(x); if (u[x] > m) m = u[x]; } return m; }

t0 = performance.now();
let steps = 0;
for (let i = 0; i < 20000; i++) { let x = starts[i % starts.length]; for (let t = 0; t < T; t++) x = step(x); steps += T; }
const stepsPerMs = steps / (performance.now() - t0);
console.log(`\nplain simulation: ${Math.round(stepsPerMs)} steps per ms (Node, this machine)`);
console.log("| energy E (bits) | walks for 2% se (formula) | ms at T=16 | measured se over 20 repeats |");
console.log("|---|---|---|---|");
const pg = goals.find((g) => g.rule === "Power Hug k=3" && g.label === "best")!;
const V16 = cache.get(pg)!.get(16)!;
const pgStar = quantile(pg.rule, 1);
for (const E of [5, 10, 20, 30]) {
  // a single start whose exact 16-tick surprise is nearest E
  let best = -1, bd = Infinity;
  for (let x = 0; x < N; x++) { const e = bitsOf(V16[x]); if (Math.abs(e - E) < bd) { bd = Math.abs(e - E); best = x; } }
  const P = V16[best], e = bitsOf(P);
  const walks = Math.ceil((1 - P) / (P * (0.02 * e * Math.LN2) ** 2));
  let measured = "not run";
  if (walks * T < 4e6) {
    const ests: number[] = [];
    for (let r = 0; r < 20; r++) {
      let hit = 0;
      for (let i = 0; i < walks; i++) if (walkMax(best, U[pg.rule]) >= pgStar - 1e-12) hit++;
      ests.push(bitsOf(hit / walks));
    }
    const mu = ests.reduce((a, b) => a + b, 0) / ests.length;
    const sd = Math.sqrt(ests.reduce((a, b) => a + (b - mu) ** 2, 0) / (ests.length - 1));
    measured = `${(100 * sd / e).toFixed(1)}% (mean ${mu.toFixed(2)} vs exact ${e.toFixed(2)})`;
  }
  console.log(`| ${e.toFixed(1)} (x = ${best}) | ${walks.toExponential(1)} | ${(walks * T / stepsPerMs).toExponential(1)} | ${measured} |`);
}

// one batch of walks gives the whole curve P(max u ≥ u*)
console.log("\nOne batch, Power Hug k=3, start x = 5000, 20,000 walks of 16 ticks: energy read from the curve vs exact");
{
  const x = 5000, M = 20000, u = U["Power Hug k=3"];
  const maxes = Array.from({ length: M }, () => walkMax(x, u));
  console.log("| u* | goal | curve −log2 P(max ≥ u*) | exact SUM_16 |");
  console.log("|---|---|---|---|");
  for (const goal of goals.filter((g) => g.rule === "Power Hug k=3")) {
    let uStar = Infinity;
    for (let n = 0; n < N; n++) if (goal.inG[n] && u[n] < uStar) uStar = u[n];
    const hits = maxes.filter((m) => m >= uStar - 1e-12).length;
    console.log(`| ${uStar.toFixed(3)} | ${goal.label} | ${fmt(bitsOf(hits / M))} | ${fmt(bitsOf(cache.get(goal)!.get(16)![x]))} |`);
  }
}

// ---- 3: importance sampling toward one target ------------------------------------------------------------------
console.log("\nImportance sampling, G = {3^11}, T = 16, proposal: half the time one bin-stride (1 bit) toward the target, landing on it once in its bin");
{
  const goal = goals.find((g) => g.label === "3^11 only (rare)")!;
  const z = 177147, bz = binOf[z], BETA = 0.5;
  const H16 = cache.get(goal)!.get(16)!;
  // h: deterministic bin stride toward z; y uniform in that bin, or z itself in z's bin
  const hTarget = (x: number) => {
    let b2 = binOf[x] + Math.max(-DELTA, Math.min(DELTA, bz - binOf[x]));
    while (!bSize[b2]) b2 += Math.sign(bz - b2);
    return b2;
  };
  const hProb = (x: number, y: number) => {
    const b2 = hTarget(x);
    if (b2 === bz) return y === z ? 1 : 0;
    return binOf[y] === b2 ? 1 / bSize[b2] : 0;
  };
  console.log("| start x | exact SUM_16 | IS estimate (mean of 10 runs) | relative sd of P per run | walks per run | ms per run |");
  console.log("|---|---|---|---|---|---|");
  for (const x of [5000, 300, 20]) {
    const exact = H16[x];
    const runs: number[] = [];
    const W = 20000;
    const ts = performance.now();
    for (let r = 0; r < 10; r++) {
      let sum = 0;
      for (let i = 0; i < W; i++) {
        let s = x, w = 1;
        for (let t = 0; t < T && s !== z; t++) {
          let y: number;
          if (rng() < BETA) y = step(s);
          else { const b2 = hTarget(s); y = b2 === bz ? z : bStart[b2] + Math.floor(rng() * bSize[b2]); }
          if (y === s) { w *= 1 / BETA; continue; }
          const p = pMove(s, y);
          w *= p / (BETA * p + (1 - BETA) * hProb(s, y));
          s = y;
        }
        if (s === z) sum += w;
      }
      runs.push(sum / W);
    }
    const ms = (performance.now() - ts) / 10;
    const mu = runs.reduce((a, b) => a + b, 0) / runs.length;
    const sd = Math.sqrt(runs.reduce((a, b) => a + (b - mu) ** 2, 0) / (runs.length - 1));
    console.log(`| ${x} | ${fmt(bitsOf(exact))} | ${fmt(bitsOf(mu))} | ${(sd / mu).toFixed(2)} | ${W} | ${ms.toFixed(0)} |`);
  }
}
