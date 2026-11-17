// Trial script (no engine change): the cheapest route in bits of surprise, MIN(x) into {u ≥ u*}, found by cost-ordered
// search with no horizon, by sampled routes, and with rule heuristics as optional aids. Same toy as free-energy.ts.
// Run: node --experimental-strip-types lib/v2-linear/scripts/free-energy-search.ts
// Write-up: docs/engine-v2/redesign/free-energy.md, "Cheapest route by search".

import {
  DELTA, FMAX, KMAX, LAMBDA, N, NB, RHO, RULES, SIZE, U, addB, bSize, bStart, binOf, draw, fCdf, gCdf, logpi,
  minCost, pow3, primes1, rng, starts,
} from "./free-energy-toy.ts";

void LAMBDA;
// ---- move costs (each act names its kind, so additive and multiplicative acts are separate edges) ----------------
const wAdd = (b: number, b2: number) => {
  const p = Math.abs(b2 - b) <= KMAX ? addB[b * NB + b2] : 0;
  return p > 0 ? -Math.log2(p / bSize[b2]) : Infinity;
};
const fP = new Float64Array(FMAX + 1);
{ for (let f = 2; f <= FMAX; f++) fP[f] = fCdf[f] - fCdf[f - 1]; }
const wMul = (y: number, f: number) =>
  -Math.log2((RHO / 2) * fP[f] * Math.min(1, 2 ** (logpi(binOf[y * f]) - logpi(binOf[y]))));
const wDiv = (f: number) => -Math.log2((RHO / 2) * fP[f]);

// smallest prime factor, for divisor lists
const spf = new Int32Array(N);
for (let i = 2; i < N; i++) if (!spf[i]) for (let j = i; j < N; j += i) if (!spf[j]) spf[j] = i;
function divisors(y: number): number[] {
  let ds = [1];
  while (y > 1) {
    const p = spf[y];
    let e = 0;
    while (y % p === 0) { y /= p; e++; }
    const next: number[] = [];
    for (const d of ds) { let m = d; for (let i = 0; i <= e; i++) { if (m <= FMAX) next.push(m); m *= p; } }
    ds = next;
  }
  return ds.filter((d) => d >= 2).sort((a, b) => a - b);
}

// ---- 1. universal cost-ordered search ----------------------------------------------------------------------------
// Heap items: kind 0 = state a; 1 = every state of bin a; 2 = a·f with f = b; 3 = a / (b-th divisor of a).
let hk = new Float64Array(1 << 16), ht = new Int8Array(1 << 16), ha = new Int32Array(1 << 16), hb = new Int32Array(1 << 16);
let hn = 0;
function push(c: number, t: number, a: number, b: number) {
  if (hn === hk.length) {
    const grow = <T extends Float64Array | Int8Array | Int32Array>(x: T): T => { const y = new (x.constructor as any)(x.length * 2); y.set(x); return y; };
    hk = grow(hk); ht = grow(ht); ha = grow(ha); hb = grow(hb);
  }
  let i = hn++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (hk[p] <= c) break;
    hk[i] = hk[p]; ht[i] = ht[p]; ha[i] = ha[p]; hb[i] = hb[p]; i = p;
  }
  hk[i] = c; ht[i] = t; ha[i] = a; hb[i] = b;
}
let pc = 0, pt = 0, pa_ = 0, pb_ = 0;
function pop() {
  pc = hk[0]; pt = ht[0]; pa_ = ha[0]; pb_ = hb[0];
  const c = hk[--hn], t = ht[hn], a = ha[hn], b = hb[hn];
  let i = 0;
  for (;;) {
    let l = 2 * i + 1;
    if (l >= hn) break;
    if (l + 1 < hn && hk[l + 1] < hk[l]) l++;
    if (hk[l] >= c) break;
    hk[i] = hk[l]; ht[i] = ht[l]; ha[i] = ha[l]; hb[i] = hb[l]; i = l;
  }
  hk[i] = c; ht[i] = t; ha[i] = a; hb[i] = b;
}

const settled = new Int32Array(N);
const binDone = new Int32Array(NB);
const divCache = new Map<number, number[]>();
let stamp = 0;
type Result = { found: number; radius: number; expanded: number; ms: number };

/**
 * Cost-ordered search from x. Stops at the first settled state with u ≥ uStar (exact MIN), when the frontier reaches
 * `ub` (then MIN = ub, certified), or when `budget` states are settled (then MIN ≥ radius, certified).
 */
function search(x: number, u: Float64Array, uStar: number, budget: number, ub = Infinity, msBudget = Infinity): Result {
  const t0 = performance.now();
  stamp++; hn = 0;
  let expanded = 0, radius = 0;
  const done = (found: number): Result => ({ found, radius, expanded, ms: performance.now() - t0 });
  push(0, 0, x, 0);
  const settle = (y: number, c: number): boolean => {
    if (settled[y] === stamp) return false;
    settled[y] = stamp; expanded++;
    if (u[y] >= uStar) return true;
    const b = binOf[y];
    if (binDone[b] !== stamp) {
      binDone[b] = stamp; // the first settled state of a bin is its cheapest: additive moves depend on the bin only
      for (let b2 = Math.max(0, b - KMAX); b2 <= Math.min(NB - 1, b + KMAX); b2++) if (bSize[b2]) push(c + wAdd(b, b2), 1, b2, 0);
    }
    if (y > 0 && 2 * y < N) push(c + wMul(y, 2), 2, y, 2);
    if (y >= 2) {
      let ds = divCache.get(y);
      if (!ds) { ds = divisors(y); if (divCache.size < 1e6) divCache.set(y, ds); }
      if (ds.length) push(c + wDiv(ds[0]), 3, y, 0);
    }
    return false;
  };
  while (hn > 0) {
    pop();
    const c = pc, t = pt, a = pa_, b = pb_;
    radius = c;
    if (c >= ub) return done(ub);
    if (expanded >= budget) return done(Infinity);
    if ((expanded & 255) === 0 && performance.now() - t0 > msBudget) return done(Infinity);
    if (t === 0) { if (settle(a, c)) return done(c); }
    else if (t === 1) { for (let y = bStart[a], e = bStart[a] + bSize[a]; y < e; y++) if (settle(y, c)) return done(c); }
    else if (t === 2) {
      if (settle(a * b, c)) return done(c);
      const f = b + 1;
      if (f <= FMAX && a * f < N) push(c - wMul(a, b) + wMul(a, f), 2, a, f);
    } else {
      const ds = divCache.get(a) ?? divisors(a);
      if (settle(a / ds[b], c)) return done(c);
      if (b + 1 < ds.length) push(c - wDiv(ds[b]) + wDiv(ds[b + 1]), 3, a, b + 1);
    }
  }
  return done(Infinity);
}

// ---- 3. heuristics: candidate goal states, priced in closed form -------------------------------------------------
const mult7: number[] = [];
for (let j = 1; 7 ** j < N; j++) for (let m = 7 ** j; m < N; m += 7 ** j) mult7.push(m);
mult7.sort((a, b) => a - b);
const ANCHORS: Record<string, number[]> = {
  "Power Hug k=3": pow3.filter((p) => p < N),
  "Prime Hug, ends in 1": primes1.filter((p) => p < N),
  "Multiples k=7": [...new Set(mult7)],
};
/** Additive route x → z in k equal bin strides (each lands, so each pays its landing bits). */
function addRoute(x: number, z: number): number {
  const b = binOf[x], bz = binOf[z];
  let best = Infinity;
  for (let k = 1; k <= 8; k++) {
    let c = 0, prev = b;
    for (let i = 1; i <= k; i++) {
      let bi = Math.round(b + ((bz - b) * i) / k);
      while (!bSize[bi]) bi += Math.sign(bz - b) || 1;
      c += wAdd(prev, bi); prev = bi;
    }
    best = Math.min(best, c);
  }
  return best;
}
/** Cheapest closed-form route x → z: additive strides, optionally a multiply or divide first or last (f ≤ 64). */
function routeCost(x: number, z: number): number {
  let best = x === z ? 0 : addRoute(x, z);
  for (let f = 2; f <= 64; f++) {
    if (x * f < N) best = Math.min(best, wMul(x, f) + (x * f === z ? 0 : addRoute(x * f, z)));
    if (x % f === 0) best = Math.min(best, wDiv(f) + (x / f === z ? 0 : addRoute(x / f, z)));
    if (z % f === 0 && z / f >= 1) best = Math.min(best, (x === z / f ? 0 : addRoute(x, z / f)) + wMul(z / f, f));
  }
  return best;
}
function candidates(rule: string, x: number, u: Float64Array, uStar: number): number[] {
  if (rule === "Bigger is better") { const t = Math.max(0, Math.ceil(uStar)); return t < N ? [t, Math.min(N - 1, 2 * t)] : []; }
  const out: number[] = [];
  const anchors = ANCHORS[rule];
  const near: number[] = [];
  for (const a of anchors) for (let d = -2; d <= 2; d++) { const z = a + d; if (z >= 0 && z < N && u[z] >= uStar) near.push(z); }
  // the cheapest few by height distance from x
  near.sort((p, q) => Math.abs(binOf[p] - binOf[x]) - Math.abs(binOf[q] - binOf[x]));
  for (const z of near.slice(0, 12)) out.push(z);
  return out;
}
function heuristicUB(rule: string, x: number, u: Float64Array, uStar: number): number {
  if (u[x] >= uStar) return 0;
  let best = Infinity;
  for (const z of candidates(rule, x, u, uStar)) best = Math.min(best, routeCost(x, z));
  return best;
}

// ---- 2. sampled routes -------------------------------------------------------------------------------------------
function sampleStep(x: number): [number, number] {
  if (rng() < RHO) {
    const f = draw(fCdf);
    if (rng() < 0.5) {
      const y = x * f;
      if (x === 0 || y >= N) return [x, 0];
      return rng() < Math.min(1, 2 ** (logpi(binOf[y]) - logpi(binOf[x]))) ? [y, wMul(x, f)] : [x, 0];
    }
    return x % f === 0 && x > 0 ? [x / f, wDiv(f)] : [x, 0];
  }
  const b = binOf[x], b2 = b + draw(gCdf) - KMAX;
  if (b2 < 0 || b2 >= NB || !bSize[b2]) return [x, 0];
  const y = bStart[b2] + Math.floor(rng() * bSize[b2]);
  return rng() < (b2 === b ? 1 : Math.min(1, 2 ** (logpi(b2) - logpi(b)) * (bSize[b2] / bSize[b]))) ? [y, wAdd(b, b2)] : [x, 0];
}
/** Best route found by `walks` jiggle walks, each abandoned when its cost reaches the best so far (or 64 bits). */
function sampled(x: number, u: Float64Array, uStar: number, walks: number, ub = 64): number {
  let best = u[x] >= uStar ? 0 : ub;
  for (let w = 0; w < walks && best > 0; w++) {
    let s = x, c = 0;
    for (let i = 0; i < 400 && c < best; i++) {
      const [y, dc] = sampleStep(s);
      if (y === s) continue;
      s = y; c += dc;
      if (u[s] >= uStar && c < best) { best = c; break; }
    }
  }
  return best;
}

// ---- goals and exact MIN -----------------------------------------------------------------------------------------
type Goal = { rule: string; label: string; uStar: number; D: Float64Array };
const quantile = (rule: string, q: number) => {
  const v = starts.map((x) => U[rule][x]).sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(q * v.length))];
};
const goals: Goal[] = [];
const addGoal = (rule: string, label: string, uStar: number) => {
  const inG = new Uint8Array(N);
  for (let n = 0; n < N; n++) inG[n] = U[rule][n] >= uStar ? 1 : 0;
  goals.push({ rule, label, uStar, D: minCost(inG) });
};
for (const rule of Object.keys(RULES)) for (const [label, q] of [["median", 0.5], ["top 1%", 0.99], ["best", 1]] as const) addGoal(rule, label, quantile(rule, q));
addGoal("Power Hug k=3", "3^8 within 1 (near)", Math.sqrt(Math.log2(6561)) - 1);
addGoal("Power Hug k=3", "3^11 only (rare)", Math.sqrt(Math.log2(177147)));
const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "∞");
const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const pick = () => starts[Math.floor(rng() * starts.length)];
console.log(`toy: N = ${N}, ${NB} bins (${DELTA} per bit), starts of size ${SIZE} bits: ${starts.length}`);

// 1. exactness and growth
console.log("\n## 1. Universal search, no budget: exact against Bellman–Ford MIN, 200 starts per goal");
console.log("| rule | goal | mean MIN | max |search − exact| | median expanded | median ms |");
console.log("|---|---|---|---|---|---|");
const growth: { bits: number; expanded: number; ms: number }[] = [];
for (const g of goals) {
  const u = U[g.rule];
  const rows: Result[] = [];
  let err = 0, sum = 0;
  for (let i = 0; i < 200; i++) {
    const x = pick();
    const r = search(x, u, g.uStar, 5e6);
    rows.push(r); sum += r.found; err = Math.max(err, Math.abs(r.found - g.D[x]));
    growth.push({ bits: r.found, expanded: r.expanded, ms: r.ms });
  }
  console.log(`| ${g.rule} | ${g.label} | ${fmt(sum / 200)} | ${err.toExponential(1)} | ${median(rows.map((r) => r.expanded))} | ${fmt(median(rows.map((r) => r.ms)))} |`);
}
console.log("\n| answer (bits) | routes | median expanded | median ms |");
console.log("|---|---|---|---|");
for (const [lo, hi] of [[0.01, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 40]]) {
  const r = growth.filter((g) => g.bits >= lo && g.bits < hi);
  if (r.length) console.log(`| ${lo}–${hi} | ${r.length} | ${median(r.map((g) => g.expanded))} | ${fmt(median(r.map((g) => g.ms)))} |`);
}
{
  const at1: number[] = [], at10: number[] = [];
  for (let i = 0; i < 40; i++) {
    const x = pick();
    at1.push(search(x, U["Bigger is better"], Infinity, Infinity, Infinity, 1).radius);
    at10.push(search(x, U["Bigger is better"], Infinity, Infinity, Infinity, 10).radius);
  }
  console.log(`\nradius certified (no goal anywhere): median ${fmt(median(at1))} bits in 1 ms, ${fmt(median(at10))} bits in 10 ms`);
}

// 2. sampled routes
console.log("\n## 2. Sampled jiggle routes: mean (best found − exact MIN), 100 starts per goal");
console.log("| goal | exact mean | 10 walks | 100 | 1,000 | ms per start at 1,000 |");
console.log("|---|---|---|---|---|---|");
for (const g of goals.filter((g) => ["best", "top 1%", "3^11 only (rare)"].includes(g.label))) {
  const u = U[g.rule];
  const xs = Array.from({ length: 100 }, pick);
  const exact = xs.reduce((s, x) => s + g.D[x], 0) / xs.length;
  const cells: string[] = [];
  let ms = 0;
  for (const W of [10, 100, 1000]) {
    const t0 = performance.now();
    const est = xs.map((x) => sampled(x, u, g.uStar, W));
    if (W === 1000) ms = (performance.now() - t0) / xs.length;
    const miss = est.filter((e) => e >= 64).length;
    cells.push(`${fmt(est.reduce((s, e, i) => s + Math.min(e, 64) - g.D[xs[i]], 0) / xs.length)}${miss ? ` (${miss} none)` : ""}`);
  }
  console.log(`| ${g.rule}, ${g.label} | ${fmt(exact)} | ${cells.join(" | ")} | ${fmt(ms)} |`);
}

// 3. heuristics as aids
console.log("\n## 3. Heuristic candidates: the bound alone, then search seeded with it, at a budget of 2,000 states");
console.log("| goal | exact mean | heuristic UB mean | UB < exact (must be 0) | certified exact | bracket [r, UB] mean | ms per start |");
console.log("|---|---|---|---|---|---|---|");
for (const g of goals) {
  const u = U[g.rule];
  let ubSum = 0, below = 0, exactN = 0, lo = 0, hi = 0, ms = 0;
  const xs = Array.from({ length: 200 }, pick);
  for (const x of xs) {
    const t0 = performance.now();
    const ub = heuristicUB(g.rule, x, u, g.uStar);
    const r = search(x, u, g.uStar, 2000, ub);
    ms += performance.now() - t0;
    const best = Math.min(ub, r.found);
    if (ub < g.D[x] - 1e-9 || best < g.D[x] - 1e-9) below++;
    ubSum += Math.min(ub, 64);
    if (Number.isFinite(r.found)) { exactN++; lo += r.found; hi += r.found; } else { lo += r.radius; hi += Math.min(best, 64); }
  }
  console.log(`| ${g.rule}, ${g.label} | ${fmt(xs.reduce((s, x) => s + g.D[x], 0) / xs.length)} | ${fmt(ubSum / xs.length)} | ${below} | ${exactN}/${xs.length} | [${fmt(lo / xs.length)}, ${fmt(hi / xs.length)}] | ${fmt(ms / xs.length)} |`);
}
// reach: rare targets from far starts
console.log("\nRare target 3^11 from smaller starts, budget 2,000 states (search alone, then with heuristics):");
console.log("| start size | exact mean | search alone: certified | bracket | with heuristic: certified | bracket |");
console.log("|---|---|---|---|---|---|");
{
  const g = goals.find((g) => g.label === "3^11 only (rare)")!;
  const u = U[g.rule];
  for (const size of [12, 8, 4]) {
    const xs = Array.from({ length: 100 }, () => { const lo = 2 ** size - 1, hi = 2 ** (size + 1) - 1; return lo + Math.floor(rng() * (hi - lo)); });
    let a = 0, al = 0, ah = 0, b = 0, bl = 0, bh = 0;
    for (const x of xs) {
      const r = search(x, u, g.uStar, 2000);
      if (Number.isFinite(r.found)) { a++; al += r.found; ah += r.found; } else { al += r.radius; ah += 64; }
      const ub = heuristicUB(g.rule, x, u, g.uStar);
      const s = search(x, u, g.uStar, 2000, ub);
      const best = Math.min(ub, s.found);
      if (Number.isFinite(s.found)) { b++; bl += s.found; bh += s.found; } else { bl += s.radius; bh += Math.min(best, 64); }
    }
    const n = xs.length;
    console.log(`| ${size} bits | ${fmt(xs.reduce((s, x) => s + g.D[x], 0) / n)} | ${a}/${n} | [${fmt(al / n)}, ${fmt(ah / n)}${a < n ? " (∞ as 64)" : ""}] | ${b}/${n} | [${fmt(bl / n)}, ${fmt(bh / n)}] |`);
  }
}

// 4. the state's energy: mean over starts, with brackets
console.log("\n## 4. Energy = mean over starts of the best route found (heuristics + search, 2,000 states per start); 5 repeats");
console.log("| goal | exact (all 4,096 starts) | K | mean of repeats | sd between repeats | certified share | ms per estimate |");
console.log("|---|---|---|---|---|---|---|");
for (const g of goals.filter((g) => ["median", "best", "3^8 within 1 (near)", "3^11 only (rare)"].includes(g.label))) {
  const u = U[g.rule];
  const exact = starts.reduce((s, x) => s + g.D[x], 0) / starts.length;
  for (const K of [1000, 5000]) {
    const reps: number[] = [];
    let cert = 0, ms = 0;
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      let sum = 0;
      for (let i = 0; i < K; i++) {
        // stratified: start i takes the i-th slice of the size class
        const x = starts[Math.floor(((i + rng()) / K) * starts.length)];
        const ub = heuristicUB(g.rule, x, u, g.uStar);
        const s = search(x, u, g.uStar, 2000, ub);
        if (Number.isFinite(s.found)) cert++;
        sum += Math.min(ub, s.found, 64);
      }
      ms += performance.now() - t0;
      reps.push(sum / K);
    }
    const mu = reps.reduce((a, b) => a + b, 0) / reps.length;
    const sd = Math.sqrt(reps.reduce((a, b) => a + (b - mu) ** 2, 0) / (reps.length - 1));
    console.log(`| ${g.rule}, ${g.label} | ${fmt(exact)} | ${K} | ${fmt(mu)} | ${fmt(sd, 3)} | ${fmt(cert / (5 * K), 3)} | ${fmt(ms / 5, 0)} |`);
  }
}
