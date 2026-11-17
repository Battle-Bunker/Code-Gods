// Trial script (no engine change): does a state's energy defined as the surprise of the passive jiggle reaching
// {u ≥ u*} (SUM) behave better than the cheapest single route (MIN)? One whole-number parameter n in [0, N).
// Run: node --experimental-strip-types lib/v2-linear/scripts/free-energy.ts   (about two minutes)
// Write-up: docs/engine-v2/redesign/free-energy.md.

import { DELTA, FMAX, KMAX, LAMBDA, N, NB, NP, PA, Pf, R, RHO, RULES, SIZE, U, addB, addOut, applyP, bSize, bStart, binOf, bitsOf, discounted, draw, fCdf, fRaw, factorDiff, g, gCdf, gRaw, gSum, hitProbs, logpi, meanOver, meanV, minCost, minD, nearestOf, pMove, pa, pow3, primes1, rng, sieve, starts, stay, step, wB, wD, wU } from "./free-energy-toy.ts";


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
