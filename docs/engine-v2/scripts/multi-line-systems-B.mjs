#!/usr/bin/env node
// Systems of two and three lines (docs/engine-v2/multi-line-systems-B.md): the law, the mutators and their prices, the
// rule families, value functions by tilted direct draws, reachability, entanglement, scripted climbers and the five
// collapse tests of landscape-analysis.md §4. Self-contained: it does not import the engine (design study only).
//
//   node docs/engine-v2/scripts/multi-line-systems-B.mjs [--part law,reach,values,entangle,climb,collapse,attack]
//        [--samples 60000] [--seed 7] [--out docs/engine-v2/scripts/multi-line-systems-B-results.md]
//
// Everything is seeded; a run reproduces its numbers. About 10–20 minutes for every part with the defaults.
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : d);
const PARTS = new Set(opt("part", "law,reach,values,entangle,climb,collapse,attack,tension,adversaries,hills").split(","));
const SAMPLES = Number(opt("samples", "60000"));
const OUT = opt("out", "docs/engine-v2/scripts/multi-line-systems-B-results.md");
const out = [];
const say = (s = "") => { out.push(s); console.log(s); };

// ------------------------------------------------------------------------------------------------ rng (sfc32)
function rngFrom(seed) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; const r = (t + d) | 0; c = (c + r) | 0; return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 20; i++) next();
  return { unit: next, int: (n) => Math.floor(next() * n), pick: (xs) => xs[Math.floor(next() * xs.length)] };
}
const SEED = Number(opt("seed", "7"));
const CAPR = Number(opt("cap", "15000"));
const ACTS = Number(opt("acts", "1500"));
const ENERGY_PER_ACT = Number(opt("energy", "8")); // ⚡ each seat gains per act of the table; 600 at the start, 1,920 at most

// ------------------------------------------------------------------------------------------------ numbers
const STEP = 0.5;
const PRIMES = (() => { const L = 200000, s = new Uint8Array(L + 1), o = []; for (let i = 2; i <= L; i++) { if (s[i]) continue; o.push(i); for (let j = i * i; j <= L; j += i) s[j] = 1; } return o; })();
const LOG2Z = PRIMES.slice(0, 2000).reduce((a, p) => a - Math.log2(1 - 2 ** (-STEP * p)), 0);
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const bgcd = (a, b) => { if (a < 0n) a = -a; if (b < 0n) b = -b; while (b) [a, b] = [b, a % b]; return a; };
const sopfrCache = new Map();
function factor(n) { // n ≥ 1, Number ≤ ~1e13: [[p, e], …]
  const f = []; let m = n;
  for (const p of PRIMES) { if (p * p > m) break; if (m % p === 0) { let e = 0; while (m % p === 0) { m /= p; e++; } f.push([p, e]); } }
  if (m > 1) f.push([m, 1]);
  return f;
}
function sopfr(n) { let v = sopfrCache.get(n); if (v === undefined) { v = factor(n).reduce((a, [p, e]) => a + p * e, 0); if (sopfrCache.size < 2e6) sopfrCache.set(n, v); } return v; }
const mixedInt = (n) => (n === 0 ? 1 : 2 + STEP * sopfr(Math.abs(n)) + LOG2Z);
function spf(n) { n = Math.abs(Math.round(n)); if (n < 2) return 1; if (!Number.isSafeInteger(n)) return 1; for (const p of PRIMES) { if (p * p > n) return n; if (n % p === 0) return p; } return n; }
function omega(n) { n = Math.abs(Math.round(n)); if (n < 2 || !Number.isSafeInteger(n)) return 0; return factor(n).reduce((a, [, e]) => a + e, 0); }
function cfLen(n, d) { // partial quotients of |n|/|d| (Number or BigInt)
  if (typeof n === "bigint") { n = n < 0n ? -n : n; d = d < 0n ? -d : d; let k = 0; while (d) { [n, d] = [d, n % d]; k++; } return k; }
  n = Math.abs(n); d = Math.abs(d); let k = 0; while (d) { [n, d] = [d, n % d]; k++; } return k;
}

// Exact rationals as [n, d] BigInt pairs (d > 0), reduced lazily.
const B = BigInt;
const rq = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } return [n, d]; };
const radd = (x, y) => rq(x[0] * y[1] + y[0] * x[1], x[1] * y[1]);
const rsub = (x, y) => rq(x[0] * y[1] - y[0] * x[1], x[1] * y[1]);
const rmul = (x, y) => rq(x[0] * y[0], x[1] * y[1]);
const rdiv = (x, y) => rq(x[0] * y[1], x[1] * y[0]);
const rabs = (x) => [x[0] < 0n ? -x[0] : x[0], x[1]];
const rnum = (x) => Number(x[0]) / Number(x[1]);
const rred = (x) => { const g = bgcd(x[0], x[1]) || 1n; return [x[0] / g, x[1] / g]; };
function rdist(x) { const [n, d] = x; let r = n % d; if (r < 0n) r += d; const m = r < d - r ? r : d - r; return Number(m) / Number(d); } // to nearest integer
function rround(x) { const [n, d] = x; const f = n >= 0n ? n / d : -((-n + d - 1n) / d); const r = n - f * d; return 2n * r >= d ? f + 1n : f; } // floor(x + 1/2)
function nearestSquareDist(x) { // |x − k²| over k ≥ 1, and k
  const v = rnum(x); let k = Math.max(1, Math.round(Math.sqrt(Math.max(v, 0)))); let best = Infinity, bk = 1;
  for (const kk of [k - 1, k, k + 1]) { if (kk < 1) continue; const dd = Math.abs(rnum(rsub(x, [B(kk) * B(kk), 1n]))); if (dd < best) { best = dd; bk = kk; } }
  return [best, bk];
}

// ------------------------------------------------------------------------------------------------ lines and systems
// A line is a primitive triple [a, b, c] of a·x + b·y + c = 0, with b > 0, or b = 0 and a > 0 (spec §12.1, domain Q).
const CAP = 1e6;
function canon(a, b, c) { // Numbers or BigInts in; a canonical Number triple, or null (degenerate, past the cap)
  if (typeof a !== "bigint") { a = B(a); b = B(b); c = B(c); }
  if (a === 0n && b === 0n) return null;
  const g = bgcd(bgcd(a, b), c); a /= g; b /= g; c /= g;
  if (b < 0n || (b === 0n && a < 0n)) { a = -a; b = -b; c = -c; }
  const lim = B(CAP); for (const v of [a, b, c]) if (v > lim || v < -lim) return null;
  return [Number(a), Number(b), Number(c)];
}
const isPrimitive = (a, b, c) => gcd(gcd(a, b), c) === 1;
const lineKey = (l) => `${l[0]},${l[1]},${l[2]}`;
const sysKey = (s) => s.map(lineKey).join("|");
const phiLine = (l) => mixedInt(l[0]) + mixedInt(l[1]) + mixedInt(l[2]);
const phi = (s) => s.reduce((a, l) => a + phiLine(l), 0);
const sameLine = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
const distinct = (s) => { for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) if (sameLine(s[i], s[j])) return false; return true; };

// The law: each coefficient from the mixed code (owner decision 17), kept when the triple is canonical and primitive,
// the lines distinct. Tilted draws q_t(n) ∝ 2^(−t·mixedInt(n)) reach the tail (spec §7.0's sampler, the same law).
const tiltCache = new Map();
function tiltNorm(t) { // log2 Z_t
  if (tiltCache.has(t)) return tiltCache.get(t);
  const logProd = PRIMES.slice(0, 3000).reduce((a, p) => a - Math.log2(1 - 2 ** (-t * STEP * p)), 0);
  const z = Math.log2(2 ** -t + 2 ** (1 - t * (2 + LOG2Z) + logProd)); tiltCache.set(t, z); return z;
}
function drawInt(r, t) {
  if (r.unit() < 2 ** (-t - tiltNorm(t))) return 0;
  const neg = r.unit() < 0.5; let n = 1;
  for (const p of PRIMES) { const ratio = 2 ** (-t * STEP * p); if (ratio < 1e-15) break; while (r.unit() < ratio) { n *= p; if (n > CAP) return null; } }
  return neg ? -n : n;
}
const ACC = new Map(); // per tilt: [line tries, lines, system tries, systems] — the acceptance rates of the raw code
const acc = (t) => { if (!ACC.has(t)) ACC.set(t, [0, 0, 0, 0]); return ACC.get(t); };
function drawLine(r, t) {
  const A = acc(t);
  for (;;) {
    A[0]++;
    const a = drawInt(r, t), b = drawInt(r, t), c = drawInt(r, t);
    if (a === null || b === null || c === null) continue;
    if (a === 0 && b === 0) continue;
    if (b < 0 || (b === 0 && a < 0)) continue; // the code writes each triple once; only the canonical sign is a line
    if (!isPrimitive(a, b, c)) continue;
    A[1]++;
    return [a, b, c];
  }
}
function drawSystem(r, k, t = 1) { const A = acc(t); for (;;) { const s = []; for (let i = 0; i < k; i++) s.push(drawLine(r, t)); A[2]++; if (distinct(s)) { A[3]++; return s; } } }
const log2Acc = (t, k) => { const A = acc(t); return k * Math.log2(A[1] / A[0]) + Math.log2(A[3] / A[2]); };
// log q_t(line) up to a per-t constant (the acceptance rate), used for importance weights.
const logq = (s, t) => s.reduce((a, l) => a + l.reduce((b, n) => b - t * mixedInt(n) - tiltNorm(t), 0), 0);

// ------------------------------------------------------------------------------------------------ features
// Everything a rule reads, computed once per system. Derived numbers are exact (BigInt rationals) where a rule tests
// exactness; Numbers where it only measures.
function cross(l1, l2) { // crossing point as rationals, or null (parallel)
  const D = B(l1[0]) * B(l2[1]) - B(l2[0]) * B(l1[1]);
  if (D === 0n) return null;
  const X = B(l1[1]) * B(l2[2]) - B(l2[1]) * B(l1[2]);
  const Y = B(l2[0]) * B(l1[2]) - B(l1[0]) * B(l2[2]);
  return { D, x: rq(X, D), y: rq(Y, D) };
}
const dotN = (l1, l2) => l1[0] * l2[0] + l1[1] * l2[1];
const detN = (l1, l2) => l1[0] * l2[1] - l2[0] * l1[1];
const si = (l) => (l[1] === 0 ? null : { m: rq(B(-l[0]), B(l[1])), c: rq(B(-l[2]), B(l[1])) });

// interior lattice points of the triangle bounded by three lines (strict), by columns; approximated by area if wide
function pegsInside(L, V) {
  const xs = V.map((v) => rnum(v.x)), ys = V.map((v) => rnum(v.y));
  const x0 = Math.ceil(Math.min(...xs) - 1e-9), x1 = Math.floor(Math.max(...xs) + 1e-9);
  const area = Math.abs((xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0])) / 2;
  if (x1 - x0 > 4000) return Math.max(0, Math.round(area)); // Pick: I ≈ A for a big triangle (wide ones only)
  // the side of each line the opposite vertex is on
  const sg = L.map((l, i) => { const v = V[i]; const s = B(l[0]) * v.x[0] * v.y[1] + B(l[1]) * v.y[0] * v.x[1] + B(l[2]) * v.x[1] * v.y[1]; const den = v.x[1] * v.y[1]; return (s > 0n) === (den > 0n) ? 1 : -1; });
  let count = 0;
  for (let x = x0; x <= x1; x++) {
    let lo = -Infinity, hi = Infinity, ok = true;
    for (let i = 0; i < 3; i++) {
      const [a, b, c] = L[i], s = sg[i]; const r = a * x + c; // s·(r + b·y) > 0
      if (b === 0) { if (!(s * r > 0)) { ok = false; break; } continue; }
      // s·b·y > −s·r
      const num = -s * r, den = s * b;
      if (den > 0) { const f = Math.floor(num / den) + 1; if (f > lo) lo = f; } else { const f = Math.ceil(num / den) - 1; if (f < hi) hi = f; }
    }
    if (ok && hi >= lo) count += hi - lo + 1;
  }
  return count;
}

function features2(s) {
  const [l1, l2] = s; const f = { k: 2 };
  const P = cross(l1, l2); f.P = P; f.D = detN(l1, l2); f.dot = dotN(l1, l2);
  f.si1 = si(l1); f.si2 = si(l2);
  f.X1 = l1[0] ? rq(B(-l1[2]), B(l1[0])) : null; f.X2 = l2[0] ? rq(B(-l2[2]), B(l2[0])) : null;
  f.Y1 = l1[1] ? rq(B(-l1[2]), B(l1[1])) : null; f.Y2 = l2[1] ? rq(B(-l2[2]), B(l2[1])) : null;
  if (P && f.X1 && f.X2) {
    const base = rabs(rsub(f.X1, f.X2)); const h = rabs(P.y);
    f.triArea = rmul(rmul(base, h), [1n, 2n]);
    f.triOk = base[0] !== 0n && h[0] !== 0n;
  } else f.triOk = false;
  return f;
}
function features3(s) {
  const f = { k: 3 }; const pairs = [[0, 1], [1, 2], [2, 0]];
  f.C = pairs.map(([i, j]) => cross(s[i], s[j])); // C[0] = L1∩L2 (opposite L3), C[1] = L2∩L3 (opp L1), C[2] = L3∩L1 (opp L2)
  f.Dij = pairs.map(([i, j]) => detN(s[i], s[j]));
  f.dots = pairs.map(([i, j]) => dotN(s[i], s[j]));
  f.si = s.map(si);
  f.tri = f.C.every(Boolean);
  if (f.tri) {
    const [A, Bv, Cv] = f.C; // vertices
    const ax = rsub(Bv.x, A.x), ay = rsub(Bv.y, A.y), bx = rsub(Cv.x, A.x), by = rsub(Cv.y, A.y);
    f.area = rabs(rmul(rsub(rmul(ax, by), rmul(ay, bx)), [1n, 2n]));
    f.degenerate = f.area[0] === 0n;
    f.G = { x: rmul(radd(radd(A.x, Bv.x), Cv.x), [1n, 3n]), y: rmul(radd(radd(A.y, Bv.y), Cv.y), [1n, 3n]) };
    const sq = (p, q) => { const dx = rsub(p.x, q.x), dy = rsub(p.y, q.y); return radd(rmul(dx, dx), rmul(dy, dy)); };
    f.sides2 = [sq(Bv, Cv), sq(Cv, A), sq(A, Bv)];
  }
  return f;
}

// Pegs, computed on demand (the slowest feature).
function pegs2(s, f) { if (!f.triOk) return null; const L = [s[0], s[1], [0, 1, 0]]; const V = [{ x: f.X2, y: [0n, 1n] }, { x: f.X1, y: [0n, 1n] }, f.P]; // V[i] opposite L[i]
  return pegsInside(L, [V[0], V[1], { x: f.P.x, y: f.P.y }]); }
function pegs3(s, f) { if (!f.tri || f.degenerate) return null; return pegsInside(s, [f.C[1], f.C[2], f.C[0]]); }

// rails: in the frame of lines j, k (crossing O, steps = each rail's primitive direction), line i meets j at s steps
// and k at t steps. Minimum over the three choices of i of ‖s‖ + ‖t‖ (and the s·t of that choice).
function rails(s, f) {
  if (!f.tri || f.degenerate) return null;
  let best = null;
  const at = (i, j) => f.C[[[null, 0, 2], [0, null, 1], [2, 1, null]][i][j]];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const O = at(j, k), Pj = at(i, j), Pk = at(i, k);
    const step = (l) => { const g = gcd(l[0], l[1]); return [B(l[1] / g), B(-l[0] / g)]; };
    const coord = (P, l) => { const [dx, dy] = step(l); const vx = rsub(P.x, O.x), vy = rsub(P.y, O.y); const num = radd(rmul(vx, [dx, 1n]), rmul(vy, [dy, 1n])); return rdiv(num, [dx * dx + dy * dy, 1n]); };
    const sj = coord(Pj, s[j]), tk = coord(Pk, s[k]);
    const d = rdist(sj) + rdist(tk);
    if (!best || d < best.d) best = { d, st: Math.abs(Number(rround(sj)) * Number(rround(tk))) };
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ rule families
// A family: id, aspect, primary (min, a distance, null = undefined = worst), secondaries (max, integers ≥ 0; null =
// undefined, last). Every family's secondaries read an aspect other than its primary's (except the owner's own
// "grade the target" pattern, marked same).
const sec2 = {
  "det-spf": { aspect: "angle", f: (s, F) => (F.D === 0 ? null : spf(F.D)) },
  "answer-spf": { aspect: "crossing", f: (s, F) => (F.P ? spf(Math.abs(Number(rround(F.P.x))) + Math.abs(Number(rround(F.P.y)))) : null) },
  "tri-pegs": { aspect: "triangle", f: (s, F) => pegs2(s, F) },
  "angle-cf": { aspect: "angle", f: (s, F) => (F.D === 0 ? null : cfLen(F.D, F.dot)) },
  "gap-spf": { aspect: "gap", f: (s, F) => (F.Y1 && F.Y2 ? spf(Number(rround(rabs(rsub(F.Y1, F.Y2))))) : null) },
};
const fam2 = [
  { id: "whole-answer", aspect: "crossing", card: "Solve the two equations: the answer (x, y) should be whole numbers.",
    p: (s, F) => (F.P ? rdist(F.P.x) + rdist(F.P.y) : null), secs: ["det-spf", "tri-pegs", "angle-cf"] },
  { id: "square-cross", aspect: "angle", card: "The two lines should cross at a right angle (gradients multiply to −1).",
    p: (s, F) => (F.D === 0 ? null : Math.abs(F.dot) / Math.abs(F.D)), secs: ["answer-spf", "gap-spf", "tri-pegs"] },
  { id: "square-triangle", aspect: "triangle", card: "The triangle the lines make with the x-axis should have an area close to a square number (1, 4, 9, …).",
    p: (s, F) => (F.triOk ? nearestSquareDist(F.triArea)[0] : null), secs: ["root-omega", "angle-cf", "answer-spf"],
    extra: { "root-omega": { aspect: "same", f: (s, F) => (F.triOk ? omega(nearestSquareDist(F.triArea)[1]) : null) } } },
  { id: "on-the-diagonal", aspect: "crossing", card: "The lines should cross on the line y = x (the answer has x = y).",
    p: (s, F) => (F.P ? Math.abs(rnum(rsub(F.P.x, F.P.y))) : null), secs: ["det-spf", "gap-spf", "tri-pegs"] },
  { id: "whole-distance", aspect: "distance", card: "The crossing should be a whole distance from (0, 0) (Pythagoras: x² + y² close to a square).",
    p: (s, F) => (F.P ? nearestSquareDist(radd(rmul(F.P.x, F.P.x), rmul(F.P.y, F.P.y)))[0] : null), secs: ["root-spf", "angle-cf", "gap-spf"],
    extra: { "root-spf": { aspect: "same", f: (s, F) => (F.P ? spf(nearestSquareDist(radd(rmul(F.P.x, F.P.x), rmul(F.P.y, F.P.y)))[1]) : null) } } },
  { id: "mirror-twins", aspect: "symmetry", card: "The lines should be mirror images of each other in the y-axis.",
    p: (s, F) => (F.si1 && F.si2 ? Math.abs(rnum(radd(F.si1.m, F.si2.m))) + Math.abs(rnum(rsub(F.si1.c, F.si2.c))) : null), secs: ["det-spf", "tri-pegs", "answer-spf"] },
  { id: "gap-match", aspect: "gap", card: "The gap between the y-intercepts should equal the gap between the x-intercepts.",
    p: (s, F) => (F.X1 && F.X2 && F.Y1 && F.Y2 ? Math.abs(rnum(rabs(rsub(F.Y1, F.Y2))) - rnum(rabs(rsub(F.X1, F.X2)))) : null), secs: ["answer-spf", "angle-cf", "det-spf"] },
  { id: "steep-ratio", aspect: "gradient", card: "One line should be a whole number of times as steep as the other (2, 3, 4, … times).",
    p: (s, F) => steepRatio(F)?.d ?? null, secs: ["k-spf", "tri-pegs", "answer-spf"],
    extra: { "k-spf": { aspect: "same", f: (s, F) => { const r = steepRatio(F); return r ? spf(r.k) : null; } } } },
];
function steepRatio(F) {
  if (!F.si1 || !F.si2) return null; const m1 = rabs(F.si1.m), m2 = rabs(F.si2.m);
  if (m1[0] === 0n || m2[0] === 0n) return null;
  const r = rnum(m1) >= rnum(m2) ? rdiv(m1, m2) : rdiv(m2, m1); const v = rnum(r);
  const k = Math.max(2, Math.round(v)); const kk = [k - 1, k, k + 1].filter((x) => x >= 2);
  let best = Infinity, bk = 2; for (const x of kk) { const d = Math.abs(rnum(rsub(r, [B(x), 1n]))); if (d < best) { best = d; bk = x; } }
  return { d: best, k: bk };
}

const sec3 = {
  "area-spf": { aspect: "area", f: (s, F) => (F.tri && !F.degenerate ? spf(Number(rround(F.area))) : null) },
  "pegs": { aspect: "corners", f: (s, F) => pegs3(s, F) },
  "det-min-spf": { aspect: "angles", f: (s, F) => (F.Dij.some((d) => d === 0) ? null : Math.min(...F.Dij.map(spf))) },
  "centroid-spf": { aspect: "centroid", f: (s, F) => (F.tri ? spf(Math.abs(Number(rround(F.G.x))) + Math.abs(Number(rround(F.G.y)))) : null) },
  "angles-cf": { aspect: "angles", f: (s, F) => (F.Dij.some((d) => d === 0) ? null : F.Dij.reduce((a, d, i) => a + cfLen(d, F.dots[i]), 0)) },
};
const triOK = (F) => F.tri && !F.degenerate;
const fam3 = [
  { id: "grid-triangle", aspect: "corners", card: "All three corners of the triangle should be on grid points.",
    p: (s, F) => (triOK(F) ? F.C.reduce((a, P) => a + rdist(P.x) + rdist(P.y), 0) : null), secs: ["area-spf", "det-min-spf", "angles-cf"] },
  { id: "square-area", aspect: "area", card: "The triangle's area should be close to a square number (1, 4, 9, …).",
    p: (s, F) => (triOK(F) ? nearestSquareDist(F.area)[0] : null), secs: ["root-omega", "centroid-spf", "det-min-spf"],
    extra: { "root-omega": { aspect: "same", f: (s, F) => (triOK(F) ? omega(nearestSquareDist(F.area)[1]) : null) } } },
  { id: "meeting-point", aspect: "concurrency", card: "Make the little triangle as small as you can: best of all, all three lines through one point.",
    p: (s, F) => (F.tri ? rnum(F.area) : null), secs: ["det-min-spf", "centroid-spf", "angles-cf"] },
  { id: "right-triangle", aspect: "right angle", card: "The triangle should have a right angle (two gradients multiply to −1).",
    p: (s, F) => (triOK(F) ? Math.min(...F.dots.map((d, i) => Math.abs(d) / Math.abs(F.Dij[i]))) : null), secs: ["area-spf", "pegs", "centroid-spf"] },
  { id: "isosceles", aspect: "sides", card: "Two sides of the triangle should be the same length.",
    p: (s, F) => { if (!triOK(F)) return null; const v = F.sides2.map(rnum).sort((a, b) => a - b); return Math.min((v[1] - v[0]) / v[1], (v[2] - v[1]) / v[2]); }, secs: ["det-min-spf", "pegs", "centroid-spf"] },
  { id: "balance-point", aspect: "centroid", card: "The triangle's balance point (the average of its corners) should be a grid point.",
    p: (s, F) => (triOK(F) ? rdist(F.G.x) + rdist(F.G.y) : null), secs: ["area-spf", "angles-cf", "pegs"] },
  { id: "rails", aspect: "frame", card: "Two lines are rails with notches one step apart; the third should cross both rails exactly at notches.",
    p: (s, F) => rails(s, F)?.d ?? null, secs: ["st-spf", "area-spf", "det-min-spf"],
    extra: { "st-spf": { aspect: "same", f: (s, F) => { const r = rails(s, F); return r ? spf(r.st) : null; } } } },
  { id: "even-gradients", aspect: "gradients", card: "The three gradients should go up in equal steps (the middle one halfway between the others).",
    p: (s, F) => { if (F.si.some((x) => !x)) return null; const m = F.si.map((x) => rnum(x.m)).sort((a, b) => a - b); if (m[0] === m[1] || m[1] === m[2]) return null; return Math.abs(m[1] - (m[0] + m[2]) / 2); }, secs: ["area-spf", "pegs", "centroid-spf"] },
  { id: "mirror", aspect: "mirror", card: "One line is a mirror: the other two should be reflections of each other in it.",
    p: (s, F) => { let best = null; for (let k = 0; k < 3; k++) { const i = (k + 1) % 3, j = (k + 2) % 3; const r = reflect(s[i], s[k]); if (!r) continue; const a = si(r), b = F.si[j]; if (!a || !b) continue; const d = Math.abs(rnum(rsub(a.m, b.m))) + Math.abs(rnum(rsub(a.c, b.c))); if (best === null || d < best) best = d; } return best; },
    secs: ["area-spf", "det-min-spf", "pegs"] },
];
for (const f of fam2) f.sec = (id) => f.extra?.[id] ?? sec2[id];
for (const f of fam3) f.sec = (id) => f.extra?.[id] ?? sec3[id];
const FAMS = { 2: fam2, 3: fam3 };

// ------------------------------------------------------------------------------------------------ the tied pool (B2)
// After the owner's rule (relayed 14 November): "Secondary rules should tie to the primary in some way even if they
// invoke an extra dimension of the object", and decision 30 ("bigger is better mechanics so there are unbounded hills
// to climb", adversaries, deliberate tensions, rules that prefer small values and many prime factors). Each family has
// an anchor (the whole number its primary is closing in on) and secondaries that relate the anchor to another aspect.
const gcdA = (anchor, other) => { anchor = Math.abs(Math.round(anchor)); other = Math.abs(Math.round(other)); if (!anchor || !other || !Number.isSafeInteger(anchor) || !Number.isSafeInteger(other)) return 1; return gcd(anchor, other); };
const fl = (x) => Math.floor(Math.abs(rnum(x)));
const nearInt = (x) => Number(rround(x));
const xInt = (l) => (l[0] ? rq(B(-l[2]), B(l[0])) : null);
const yInt = (l) => (l[1] ? rq(B(-l[2]), B(l[1])) : null);
const steeper = (F) => (F.si1 && F.si2 ? Math.max(fl(F.si1.m), fl(F.si2.m)) : null);
const fam2t = [
  { id: "whole-answer", aspect: "crossing", card: "Solve the two equations: the answer (x, y) should be whole numbers.",
    p: (s, F) => (F.P ? rdist(F.P.x) + rdist(F.P.y) : null),
    tied: {
      "answer-divisor": { reads: "crossing ↔ divisor", sense: "big", text: "the common factor of x + y (of the answer) and the divisor", f: (s, F) => (F.P ? gcdA(nearInt(F.P.x) + nearInt(F.P.y), F.D) : null) },
      "south-west": { reads: "crossing ↔ position", sense: "small", text: "x + y of the answer as negative as possible", f: (s, F) => (F.P ? -(nearInt(F.P.x) + nearInt(F.P.y)) : null) },
    } },
  { id: "square-cross", aspect: "angle", card: "The two lines should cross at a right angle.",
    p: (s, F) => (F.D === 0 ? null : Math.abs(F.dot) / Math.abs(F.D)),
    tied: {
      "divisor-factors": { reads: "angle ↔ divisor", sense: "smooth", text: "the number of prime factors of the divisor (for square crossings, a² + b²)", f: (s, F) => (F.D === 0 ? null : omega(F.D)) },
      "divisor-meets-intercept": { reads: "angle ↔ y-intercepts", sense: "big", text: "the common factor of the divisor and red's y-intercept", f: (s, F) => (F.D === 0 || !F.Y1 ? null : gcdA(F.D, nearInt(F.Y1))) },
    } },
  { id: "on-the-diagonal", aspect: "crossing", card: "The lines should cross on the line y = x.",
    p: (s, F) => (F.P ? Math.abs(rnum(rsub(F.P.x, F.P.y))) : null),
    tied: {
      "north-east": { reads: "crossing ↔ position", sense: "big", text: "the whole number nearest the crossing's x, as big as possible", f: (s, F) => (F.P ? nearInt(F.P.x) : null) },
      "diagonal-gradient": { reads: "crossing ↔ gradient", sense: "big", text: "the common factor of that whole number and the steeper gradient's whole part (the owner's example)", f: (s, F) => (F.P ? gcdA(nearInt(F.P.x), steeper(F) ?? 0) : null) },
    } },
  { id: "whole-distance", aspect: "distance", card: "The crossing should be a whole distance from (0, 0).",
    p: (s, F) => (F.P ? nearestSquareDist(radd(rmul(F.P.x, F.P.x), rmul(F.P.y, F.P.y)))[0] : null),
    tied: {
      "distance-factors": { reads: "distance (its own root)", sense: "smooth", text: "the number of prime factors of that whole distance", f: (s, F) => (F.P ? omega(nearestSquareDist(radd(rmul(F.P.x, F.P.x), rmul(F.P.y, F.P.y)))[1]) : null) },
      "distance-divisor": { reads: "distance ↔ divisor", sense: "big", text: "the common factor of the distance and the divisor", f: (s, F) => (F.P ? gcdA(nearestSquareDist(radd(rmul(F.P.x, F.P.x), rmul(F.P.y, F.P.y)))[1], F.D) : null) },
    } },
  { id: "steep-ratio", aspect: "gradient", card: "One line should be a whole number of times as steep as the other.",
    p: (s, F) => steepRatio(F)?.d ?? null,
    tied: {
      "steep": { reads: "gradient ratio ↔ steepness", sense: "big", text: "the whole part of the steeper gradient, as big as possible", f: (s, F) => (steepRatio(F) ? steeper(F) : null) },
      "ratio-gap": { reads: "gradient ↔ y-intercepts", sense: "big", text: "the common factor of the ratio and the gap between the y-intercepts", f: (s, F) => { const r = steepRatio(F); return r && F.Y1 && F.Y2 ? gcdA(r.k, nearInt(rsub(F.Y1, F.Y2))) : null; } },
    } },
  { id: "far-crossing", aspect: "x-intercept", card: "Red's x-intercept (where it crosses the x-axis) should be a whole number.",
    p: (s, F) => { const X = xInt(s[0]); return X ? rdist(X) : null; },
    tied: {
      "far-right": { reads: "x-intercept (its size)", sense: "big", text: "that whole number, as big as possible (far to the right)", f: (s, F) => { const X = xInt(s[0]); return X ? nearInt(X) : null; } },
      "crossing-share": { reads: "x-intercept ↔ y-intercept", sense: "big", text: "the common factor of red's x-intercept and red's y-intercept", f: (s, F) => { const X = xInt(s[0]), Y = yInt(s[0]); return X && Y ? gcdA(nearInt(X), nearInt(Y)) : null; } },
    } },
  { id: "high-start", aspect: "y-intercept", card: "Red's y-intercept should be a whole number.",
    p: (s, F) => (F.Y1 ? rdist(F.Y1) : null),
    tied: {
      "steep-and-high": { reads: "y-intercept ↔ gradient", sense: "big", text: "the smaller of that whole number and red's gradient, as big as possible (so red's x-intercept is small and negative)", f: (s, F) => (F.Y1 && F.si1 ? Math.min(nearInt(F.Y1), Math.floor(rnum(F.si1.m))) : null) },
      "start-factors": { reads: "y-intercept ↔ divisor", sense: "smooth", text: "the number of prime factors the y-intercept shares with the divisor", f: (s, F) => (F.Y1 && F.D ? omega(gcdA(nearInt(F.Y1), F.D)) : null) },
    } },
  { id: "gap-match", aspect: "gap", card: "The gap between the y-intercepts should equal the gap between the x-intercepts.",
    p: (s, F) => (F.X1 && F.X2 && F.Y1 && F.Y2 ? Math.abs(rnum(rabs(rsub(F.Y1, F.Y2))) - rnum(rabs(rsub(F.X1, F.X2)))) : null),
    tied: {
      "small-gap-factors": { reads: "gap (its own factors)", sense: "smooth", text: "the number of prime factors of the gap (a rich, small gap)", f: (s, F) => (F.Y1 && F.Y2 ? omega(nearInt(rabs(rsub(F.Y1, F.Y2)))) : null) },
      "gap-divisor": { reads: "gap ↔ divisor", sense: "big", text: "the common factor of the gap and the divisor", f: (s, F) => (F.Y1 && F.Y2 ? gcdA(nearInt(rsub(F.Y1, F.Y2)), F.D) : null) },
    } },
];
for (const f of fam2t) { f.secs = Object.keys(f.tied); f.sec = (id) => f.tied[id]; }
let TIED = null;
function buildTied() {
  if (TIED) return TIED; buildValues(2); TIED = [];
  for (const fam of fam2t) for (const sec of fam.secs) { const rule = { fam, sec, id: `${fam.id}/${sec}` }; rule.v = valueFn(rule, SAMPLE[2], FEATS[2]); rule.bits = (x, F = feat(x)) => rule.v.bits(utility(rule, x, F)); TIED.push(rule); }
  return TIED;
}
const mgroup = (id) => id.replace(/^L\d\./, "line.").replace(/\(.*$/, "");

const FCACHE = new Map();
const feat = (s) => { const key = sysKey(s); let F = FCACHE.get(key); if (!F) { if (FCACHE.size > 400000) FCACHE.clear(); F = s.length === 2 ? features2(s) : features3(s); FCACHE.set(key, F); } return F; };
// a dealt rule: [family, secondary]; its utility is [−primary, secondary] (bigger better; null = worst)
function utility(rule, s, F) {
  const p = rule.fam.p(s, F); if (p === null || !Number.isFinite(p)) return null;
  const q = rule.fam.sec(rule.sec).f(s, F);
  return [-p, q === null ? -1 : q];
}
const cmpU = (u, v) => (u === null ? (v === null ? 0 : -1) : v === null ? 1 : u[0] !== v[0] ? (u[0] < v[0] ? -1 : 1) : u[1] - v[1]);

// ------------------------------------------------------------------------------------------------ mutators and prices
// The spec's scheme (§5.2, §12.4): which (log2 N) + where (log2 k for a line, log2 k(k−1) for an ordered pair) +
// choices, with one size priced so that the whole fee is rate(o)·σ, plus the surcharge max(0, Δφ).
function solve(f) { let lo = 1e-9, hi = 0.999999; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 1) hi = m; else lo = m; } return -Math.log2(lo); }
const rateZ = (o) => Math.log2(2 ** (o + 1) + 1);
const rateQ = (o) => solve((r) => 2 ** o * 2 * r / (1 - r) ** 2);
const rateSlide = (o) => solve((r) => { const g = 2 * r / (1 - r); return 2 ** o * ((1 + g) ** 2 - 1); });
const zeta = (s) => { let z = 0; for (let n = 1; n < 20000; n++) z += n ** -s; return z + 20000 ** (1 - s) / (s - 1); };
const rateFactor = (o) => { let lo = 1.05, hi = 30; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (2 ** (o + 1) * (zeta(m) ** 2 - 1) > 1) lo = m; else hi = m; } return hi; };
const memo = (fn) => { const c = new Map(); return (o) => { if (!c.has(o)) c.set(o, fn(o)); return c.get(o); }; };
const RZ = memo(rateZ), RQ = memo(rateQ), RS = memo(rateSlide), RF = memo(rateFactor);

function reflect(l, m) { // reflect line l in line m (both canonical); null if degenerate or past the cap
  const [a1, b1, c1] = l.map(B), [a2, b2, c2] = m.map(B);
  const N = a2 * a2 + b2 * b2, d = a1 * a2 + b1 * b2;
  return canon(N * a1 - 2n * d * a2, N * b1 - 2n * d * b2, N * c1 - 2n * d * c2);
}
function siLine(m, c) { // y = m x + c (rationals) → triple
  const L = (m[1] * c[1]) / bgcd(m[1], c[1]); // lcm
  return canon(-m[0] * (L / m[1]), L, -c[0] * (L / c[1]));
}
const QARGS = [[1n, 1n], [-1n, 1n], [2n, 1n], [-2n, 1n], [1n, 2n], [-1n, 2n]];
const sizeQ = (k) => Number(k[0] < 0n ? -k[0] : k[0]) + Number(k[1]) - 1;
const FACTORS = [[2n, 1n], [1n, 2n], [-2n, 1n], [-1n, 2n], [3n, 1n], [1n, 3n]];

// Every mutator: (sys, rng?) → list of candidate calls { id, s', fee (without surcharge) }. `all` enumerates the small
// arguments climbers look at; the walk would draw arguments from the codes instead.
function moves(sys, opts = {}) {
  const k = sys.length, N = k === 3 ? 13 : k === 2 ? 12 : 6, which = Math.log2(N), line = Math.log2(k), pair = Math.log2(k * (k - 1));
  const res = [];
  const push = (id, i, l, fee) => { if (!l) return; const s2 = sys.slice(); s2[i] = l; if (!distinct(s2)) return; res.push({ id, s: s2, fee }); };
  const pushAll = (id, s2, fee) => { if (!s2 || s2.some((x) => !x) || !distinct(s2)) return; res.push({ id, s: s2, fee }); };
  for (let i = 0; i < k; i++) {
    const L = sys[i], S = si(L);
    // si.shift, si.tilt: an amount on Q (σ = |p| + q − 1)
    if (S) for (const a of QARGS) {
      const o = which + line, fee = RQ(o) * sizeQ(a);
      push(`L${i + 1}.si.shift(${a[0]}/${a[1]})`, i, siLine(S.m, radd(S.c, a)), fee);
      push(`L${i + 1}.si.tilt(${a[0]}/${a[1]})`, i, siLine(radd(S.m, a), S.c), fee);
    }
    // gen.nudge(which, ±1, ±2): refused when the result is not primitive (spec §12.4)
    for (let w = 0; w < 3; w++) for (const a of [1, -1, 2, -2]) {
      const t = L.slice(); t[w] += a; if (t[0] === 0 && t[1] === 0) continue; if (!isPrimitive(...t)) continue;
      if (t[1] < 0 || (t[1] === 0 && t[0] < 0)) continue; // would turn the equation over
      const o = which + line + Math.log2(3); push(`L${i + 1}.gen.nudge(${"abc"[w]},${a})`, i, canon(...t), RZ(o) * Math.abs(a));
    }
    // cart.mirror (4 axes, self-inverse)
    const [a, b, c] = L; const o4 = which + line + 2;
    push(`L${i + 1}.mirror(x)`, i, canon(a, -b, c), o4); push(`L${i + 1}.mirror(y)`, i, canon(-a, b, c), o4);
    push(`L${i + 1}.mirror(origin)`, i, canon(a, b, -c), o4); push(`L${i + 1}.mirror(diagonal)`, i, canon(b, a, c), o4);
    // mach.stretch(f): m·f, c·f (non-vertical lines)
    if (S) for (const f of FACTORS) { const o = which + line; push(`L${i + 1}.stretch(${f[0]}/${f[1]})`, i, siLine(rmul(S.m, f), rmul(S.c, f)), RF(o) * Math.log2(Number(f[0] < 0n ? -f[0] : f[0]) * Number(f[1]))); }
    // cart.slide(u, v) of one line
    for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) push(`L${i + 1}.slide(${u},${v})`, i, canon(a, b, c - a * u - b * v), RS(which + line) * (Math.abs(u) + Math.abs(v)));
  }
  if (k === 1) return res;
  // sys.translate(u, v): every line slides by (u, v)
  for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pushAll(`sys.translate(${u},${v})`, sys.map(([a, b, c]) => canon(a, b, c - a * u - b * v)), RS(which) * (Math.abs(u) + Math.abs(v)));
  // sys.mirror(axis): the whole picture in an axis (choice of 4)
  for (const [nm, f] of [["x", ([a, b, c]) => canon(a, -b, c)], ["y", ([a, b, c]) => canon(-a, b, c)], ["origin", ([a, b, c]) => canon(a, b, -c)], ["diagonal", ([a, b, c]) => canon(b, a, c)]]) pushAll(`sys.mirror(${nm})`, sys.map(f), which + 2);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    if (i === j) continue;
    const Li = sys[i], Lj = sys[j];
    // pair.combine(i, j, n): equation i += n × equation j (elimination; turns line i about its crossing with j)
    for (const n of [1, -1, 2, -2]) {
      const t = [Li[0] + n * Lj[0], Li[1] + n * Lj[1], Li[2] + n * Lj[2]];
      if (t[0] === 0 && t[1] === 0) continue; if (!isPrimitive(...t)) continue;
      push(`pair.combine(L${i + 1}+=${n}·L${j + 1})`, i, canon(...t), RZ(which + pair) * Math.abs(n));
    }
    // pair.reflect(i, j): line i reflected in line j (self-inverse)
    push(`pair.reflect(L${i + 1} in L${j + 1})`, i, reflect(Li, Lj), which + pair);
    // pair.quarter(i, j, ±): line i a quarter turn about its crossing with j
    const P = cross(Li, Lj);
    if (P) for (const sgn of [1, -1]) {
      // normal (a, b) → sgn·(−b, a), through P
      const na = sgn * -Li[1], nb = sgn * Li[0];
      const cc = -(B(na) * P.x[0] + B(nb) * P.y[0]); // with P = (X/D, Y/D): na·X + nb·Y + cc·D = 0 → line (na·D, nb·D, cc)
      push(`pair.quarter(L${i + 1} about L${j + 1}∩,${sgn > 0 ? "+" : "−"})`, i, canon(B(na) * P.x[1], B(nb) * P.x[1], cc), which + pair + 1);
    }
    // pair.slideOn(i, j, n): move line i parallel to itself so its crossing with j moves n steps along j
    if (P) { const g = gcd(Lj[0], Lj[1]); const dx = Lj[1] / g, dy = -Lj[0] / g;
      for (const n of [1, -1]) push(`pair.slideOn(L${i + 1} along L${j + 1},${n})`, i, canon(Li[0], Li[1], Li[2] - Li[0] * n * dx - Li[1] * n * dy), RZ(which + pair) * Math.abs(n)); }
  }
  // rail.move(i, rail, n) (three lines): where line i meets rail j moves n steps along j; where it meets k stays
  if (k === 3) for (let i = 0; i < 3; i++) for (const j of [(i + 1) % 3, (i + 2) % 3]) {
    const kk = 3 - i - j, Pj = cross(sys[i], sys[j]), Pk = cross(sys[i], sys[kk]); if (!Pj || !Pk) continue;
    const g = gcd(sys[j][0], sys[j][1]); const dx = B(sys[j][1] / g), dy = B(-sys[j][0] / g);
    for (const n of [1n, -1n]) {
      const Q = { x: radd(Pj.x, [n * dx, 1n]), y: radd(Pj.y, [n * dy, 1n]) };
      // the line through Q and Pk
      const ux = rsub(Q.x, Pk.x), uy = rsub(Q.y, Pk.y); // direction; normal (uy, −ux)
      const na = rmul(uy, [1n, 1n]), nb = rmul(ux, [-1n, 1n]);
      const cc = rsub([0n, 1n], radd(rmul(na, Pk.x), rmul(nb, Pk.y)));
      const L = na[1] * nb[1] * cc[1];
      push(`rail.move(L${i + 1} on L${j + 1},${n})`, i, canon(na[0] * (L / na[1]), nb[0] * (L / nb[1]), cc[0] * (L / cc[1])), RZ(which + Math.log2(6)) * 1);
    }
  }
  return res;
}
const price = (s, m) => m.fee + Math.max(0, phi(m.s) - phi(s));

// ------------------------------------------------------------------------------------------------ value functions
// bits(s) = −log2 π{x : utility(x) ≥ utility(s)}, from N draws of a mixture of tilted laws, self-normalised weights.
const TILTS = [1, 0.75, 0.55, 0.4, 0.3];
function lawSample(k, n, seed) {
  ACC.clear(); // acceptance counted from this sample's own draws only, so every part selection gives the same values
  const r = rngFrom(seed); const xs = [];
  for (let i = 0; i < n; i++) { const t = TILTS[i % TILTS.length]; xs.push(drawSystem(r, k, t)); }
  // weights π/q_mix up to a constant; acceptance rates per tilt counted while drawing (warmed up first)
  for (const t of TILTS) for (let i = 0; i < 3000; i++) drawSystem(r, k, t);
  const la = TILTS.map((t) => log2Acc(t, k));
  const w = xs.map((s) => { const lp = logq(s, 1) - la[0]; let mix = 0; TILTS.forEach((t, i) => { mix += 2 ** (logq(s, t) - la[i] - lp); }); return 1 / (mix / TILTS.length); });
  return { xs, w };
}
function valueFn(rule, sample, feats) {
  const n = sample.xs.length; const us = sample.xs.map((s, i) => utility(rule, s, feats[i]));
  const idx = [...Array(n).keys()].sort((a, b) => cmpU(us[b], us[a])); // best first
  const total = sample.w.reduce((a, b) => a + b, 0);
  const sortedU = idx.map((i) => us[i]); const cum = new Float64Array(n); let acc = 0;
  // cum[r] = mass of every draw at least as good as sortedU[r] (ties included)
  let r = 0; while (r < n) { let e = r; let m = 0; while (e < n && cmpU(sortedU[e], sortedU[r]) === 0) { m += sample.w[idx[e]]; e++; } acc += m; for (let q = r; q < e; q++) cum[q] = acc; r = e; }
  // tail slope along the secondary at the best primary level (for extrapolation past the best draw)
  const topP = sortedU[0]?.[0]; const atTop = []; for (let q = 0; q < n && sortedU[q] && sortedU[q][0] === topP; q++) atTop.push([sortedU[q][1], -Math.log2(cum[q] / total)]);
  // Past the best draw the value is extrapolated along the secondary at the top primary level, by the more modest of a
  // linear and a logarithmic fit of bits on the secondary over the best draws (conservative: it may undervalue).
  const fit = (pts, fx) => { const xs = pts.map(([x]) => fx(x)), ys = pts.map(([, y]) => y); const mx = mean(xs), my = mean(ys); let nu = 0, de = 0; for (let i = 0; i < xs.length; i++) { nu += (xs[i] - mx) * (ys[i] - my); de += (xs[i] - mx) ** 2; } return de > 0 ? Math.max(0, nu / de) : 0; };
  const pts = atTop.filter(([x]) => x >= 1).slice(0, 60); const linS = pts.length > 4 ? fit(pts, (x) => x) : 0.5, logS = pts.length > 4 ? fit(pts, (x) => Math.log2(x)) : 1;
  const topBits = n ? -Math.log2(cum[0] / total) : 0;
  return {
    bits(u) {
      if (u === null) return 0;
      // first index with sortedU[i] < u (sorted descending): everything before is ≥ u
      let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (cmpU(sortedU[m], u) >= 0) lo = m + 1; else hi = m; }
      if (lo === 0) { const t1 = sortedU[0]?.[1] ?? 1; const ext = sortedU[0] && u[0] === sortedU[0][0] ? Math.min(linS * Math.max(0, u[1] - t1), logS * Math.max(0, Math.log2(Math.max(1, u[1]) / Math.max(1, t1)))) : 1; return topBits + ext; } // beyond the best draw
      return -Math.log2(cum[lo - 1] / total);
    },
    topBits,
  };
}

// ------------------------------------------------------------------------------------------------ helpers
function Heap() { const h = []; return { get size() { return h.length; },
  push(x) { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } },
  pop() { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; } }; }
// every state within budget Wmax of s0 (Dijkstra on call prices), at most cap states: [[cost, state], …]
function reachable(s0, Wmax, cap) {
  const dist = new Map([[sysKey(s0), [0, s0]]]); const heap = Heap(); heap.push([0, s0]); let capped = false;
  while (heap.size) { const [d, s] = heap.pop(); if (d > dist.get(sysKey(s))[0]) continue; if (dist.size >= cap) { capped = true; break; }
    for (const m of moves(s)) { const nd = d + price(s, m); if (nd > Wmax) continue; const key = sysKey(m.s); const cur = dist.get(key); if (!cur || cur[0] > nd) { dist.set(key, [nd, m.s]); heap.push([nd, m.s]); } } }
  let frontier = Infinity; if (capped) { frontier = heap.size ? heap.pop()[0] : Wmax; } // complete up to this cost
  const set = [...dist.values()].filter(([d]) => d <= frontier);
  return { set, capped, frontier: Math.min(frontier, Wmax) };
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const corr = (xs, ys) => { const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0; for (let i = 0; i < xs.length; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; } return b && c ? a / Math.sqrt(b * c) : 0; };
const fmt = (x, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "–" : typeof x === "number" ? x.toFixed(d) : String(x));
const showLine = (l) => { const [a, b, c] = l; const t = (v, s) => (v === 0 ? "" : `${v > 0 ? "+" : "−"}${Math.abs(v) === 1 && s ? "" : Math.abs(v)}${s}`); let e = `${t(a, "x")}${t(b, "y")}${t(c, "")}`; if (e.startsWith("+")) e = e.slice(1); return `${e} = 0`; };
const showSys = (s) => s.map(showLine).join("; ");

// value functions for every dealt rule (family × secondary), per system size
const RULES = {}; const SAMPLE = {}; const FEATS = {};
function buildValues(k) {
  if (RULES[k]) return RULES[k];
  const t0 = Date.now();
  SAMPLE[k] = lawSample(k, SAMPLES, SEED + k);
  FEATS[k] = SAMPLE[k].xs.map(feat);
  RULES[k] = [];
  for (const fam of FAMS[k]) for (const sec of fam.secs) { const rule = { fam, sec, id: `${fam.id}/${sec}` }; rule.v = valueFn(rule, SAMPLE[k], FEATS[k]); rule.bits = (s, F = feat(s)) => rule.v.bits(utility(rule, s, F)); RULES[k].push(rule); }
  console.error(`values k=${k}: ${RULES[k].length} rules from ${SAMPLES} draws in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return RULES[k];
}
const defaultRule = (k, famId) => buildValues(k).find((r) => r.fam.id === famId);

// ================================================================================================ parts
say(`# Systems of lines (B): measurements`);
say();
say(`Generated by \`node docs/engine-v2/scripts/multi-line-systems-B.mjs\` (seed ${SEED}, ${SAMPLES} law draws per size).`);
say();

if (PARTS.has("law")) {
  say(`## Law: degrees of freedom and concentration`);
  say();
  say(`| Object | Integers | Degrees of freedom | Collision entropy (bits) | Median φ | Draws with a crossing undefined |`);
  say(`|---|--:|--:|--:|--:|--:|`);
  for (const k of [1, 2, 3]) {
    const r = rngFrom(SEED + 100 + k); const n = 40000; const phis = []; let par = 0;
    // Σπ² = E_π[π(X)]; π(X) ∝ 2^−φ / (A_k), A_k = acceptance of a raw draw
    let acc = 0, tot = 0; const rr = rngFrom(SEED + 200 + k);
    for (let i = 0; i < 60000; i++) { tot++; const s = []; let good = true; for (let j = 0; j < k; j++) { const a = drawInt(rr, 1), b = drawInt(rr, 1), c = drawInt(rr, 1); if (a === null || b === null || c === null || (a === 0 && b === 0) || b < 0 || (b === 0 && a < 0) || !isPrimitive(a, b, c)) { good = false; break; } s.push([a, b, c]); } if (good && distinct(s)) acc++; }
    const A = acc / tot; let sum = 0;
    for (let i = 0; i < n; i++) { const s = drawSystem(r, k); const p = phi(s); phis.push(p); sum += 2 ** -p / A; if (k >= 2) { for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) if (detN(s[a], s[b]) === 0) { par++; a = k; break; } } }
    phis.sort((a, b) => a - b);
    say(`| ${k === 1 ? "one line (line-q)" : k === 2 ? "system of two lines" : "system of three lines"} | ${3 * k} | ${2 * k} | ${fmt(-Math.log2(sum / n))} | ${fmt(phis[n >> 1])} | ${k === 1 ? "–" : `${fmt((100 * par) / n)}%`} |`);
  }
  say();
}

if (PARTS.has("reach")) {
  say(`## Reachable states per budget (sum of call prices W, from births)`);
  say();
  say(`Dijkstra over every candidate call the climbers see (small arguments; §2 of the doc), from 4 births each. ">n" means the search stopped at 200,000 states before reaching that budget.`);
  say();
  say(`| Object | W ≤ 8 | W ≤ 12 | W ≤ 16 | W ≤ 20 | growth per bit (12 → 16) |`);
  say(`|---|--:|--:|--:|--:|--:|`);
  for (const k of [1, 2, 3]) {
    const r = rngFrom(SEED + 300 + k); const BUD = [8, 12, 16, 20]; const counts = BUD.map(() => []); const grow = [];
    for (let b = 0; b < 4; b++) {
      const { set, frontier } = reachable(drawSystem(r, k), 20, 200000);
      const c12 = set.filter(([v]) => v <= 12).length, c16 = set.filter(([v]) => v <= 16).length; if (frontier >= 16) grow.push((c16 / c12) ** (1 / 4));
      BUD.forEach((B0, i) => counts[i].push(B0 <= frontier ? String(set.filter(([v]) => v <= B0).length) : ">" + set.length));
    }
    say(`| ${k === 1 ? "one line" : `${k} lines`} | ${counts.map((c) => c.join(" / ")).join(" | ")} | ${grow.length ? `×${fmt(mean(grow), 2)}` : "–"} |`);
  }
  say();
}

if (PARTS.has("values")) {
  say(`## Value functions: tops, ramps and how much of the tail is read length`);
  say();
  say(`Per dealt rule (family/secondary): the share of draws whose primary is undefined; the bits of the best draw; the`);
  say(`correlation of bits with φ over the tail (bits ≥ 8, π-weighted draws reweighted to the tilted sample); the share of`);
  say(`the tail's draws at the primary's top (0 distance).`);
  say();
  for (const k of [2, 3]) {
    buildValues(k);
    say(`### ${k} lines`);
    say();
    say(`| Rule | Undefined | Best draw (bits) | corr(bits, φ), tail | Tail at primary top |`);
    say(`|---|--:|--:|--:|--:|`);
    for (const rule of RULES[k]) {
      const us = SAMPLE[k].xs.map((s, i) => utility(rule, s, FEATS[k][i]));
      const und = us.filter((u) => u === null).length / us.length;
      const bits = us.map((u) => rule.v.bits(u)); const ph = SAMPLE[k].xs.map(phi);
      const tail = bits.map((b, i) => [b, ph[i], us[i]]).filter((x) => x[0] >= 8);
      say(`| ${rule.id} | ${fmt(100 * und, 0)}% | ${fmt(rule.v.topBits)} | ${fmt(corr(tail.map((x) => x[0]), tail.map((x) => x[1])), 2)} (${tail.length}) | ${fmt((100 * tail.filter((x) => x[2] && x[2][0] === 0).length) / Math.max(1, tail.length), 0)}% |`);
    }
    say();
  }
}

if (PARTS.has("entangle")) {
  say(`## Entanglement`);
  say();
  say(`For each pair of families (default secondaries): over random single calls from 3,000 states drawn from the tilted`);
  say(`law t = 0.55 (moderately rare states), the correlation of the two rules' changes in bits (+ the move that helps one`);
  say(`tends to help the other, − it tends to hurt it), and in brackets the share of calls that move rule i by ≥ 1 bit`);
  say(`that also move rule j by ≥ 1 bit (collateral reach).`);
  say();
  for (const k of [2, 3]) {
    const rules = FAMS[k].map((f) => defaultRule(k, f.id)); const r = rngFrom(SEED + 400 + k);
    const d = rules.map(() => []);
    for (let n = 0; n < 3000; n++) {
      const s = drawSystem(r, k, 0.55); const F = feat(s); const b0 = rules.map((ru) => ru.bits(s, F));
      const ms = moves(s); if (!ms.length) continue; const m = r.pick(ms); const F2 = feat(m.s);
      rules.forEach((ru, i) => d[i].push(ru.bits(m.s, F2) - b0[i]));
    }
    say(`### ${k} lines`);
    say();
    say(`| | ${rules.map((ru) => ru.fam.id).join(" | ")} |`);
    say(`|---|${rules.map(() => "--:").join("|")}|`);
    for (let i = 0; i < rules.length; i++) {
      const row = rules.map((_, j) => { if (i === j) return "·"; const reach = d[i].map((x, n) => [x, d[j][n]]).filter(([x]) => Math.abs(x) >= 1); const coll = reach.filter(([, y]) => Math.abs(y) >= 1).length / Math.max(1, reach.length); return `${fmt(corr(d[i], d[j]), 2)} (${fmt(100 * coll, 0)}%)`; });
      say(`| ${rules[i].fam.id} | ${row.join(" | ")} |`);
    }
    say();
  }
}

// ------------------------------------------------------------------------------------------------ tables
// A table: three dealt rules; F(s) = Σ_i n_i Σ_{j≠i} n_j on one object (the points rate, spec §8).
function tables(k, count, seed) {
  const r = rngFrom(seed); const fams = FAMS[k]; const out = [];
  while (out.length < count) {
    const ids = new Set(); while (ids.size < 3) ids.add(r.int(fams.length));
    const rules = [...ids].map((i) => { const f = fams[i]; const sec = r.pick(f.secs); return buildValues(k).find((ru) => ru.fam === f && ru.sec === sec); });
    out.push(rules);
  }
  return out;
}
const tableF = (rules, s) => { const F = feat(s); const n = rules.map((ru) => ru.bits(s, F)); const t = n.reduce((a, b) => a + b, 0); return { F: n.reduce((a, x) => a + x * (t - x), 0), n }; };

if (PARTS.has("climb")) {
  say(`## Scripted climbers: do they keep finding shared improvements?`);
  say();
  say(`Three seats, three rules, 12 objects (unique: no two objects in the same state), ${ACTS} acts. Each act offers a`);
  say(`random object to a random seat. "Points" seats take the call with the best own-points gain per bit of charge`);
  say(`(charge = W + 0.05·W²), if any gain is positive; "table" seats take the best gain in the table total F among calls`);
  say(`that do not lower their own points; "planner" seats are points seats that, when no single call helps, look at two-call
plans from 12 random first calls. Energy: each seat starts with 600 ⚡, gains ${3 * ENERGY_PER_ACT} ⚡ per act it is offered
(about ${ENERGY_PER_ACT} ⚡ per seat per table act, so at most about ${fmt((1800 + 3 * ACTS * ENERGY_PER_ACT) / 12, 0)} ⚡ per object over the run, near landscape-analysis's 2,475 ⚡ line share), holds at most
1,920 ⚡ and can only make a call it can pay for. Reported per fifth of the run:`);
  say(`commits, objects that moved, commits that raised two or more seats' bits, and the table's mean F.`);
  say();
  for (const k of [2, 3]) {
    for (const mode of ["points", "planner", "table"]) {
      const T = tables(k, 3, SEED + 500 + k);
      for (const rules of T.slice(0, 2)) {
        const r = rngFrom(SEED + 600 + k); const objs = []; const keys = new Set();
        while (objs.length < 12) { const s = drawSystem(r, k); const kk = sysKey(s); if (!keys.has(kk)) { keys.add(kk); objs.push(s); } }
        const births = objs.map(phi);
        const rows = []; let win = { commits: 0, moved: new Set(), shared: 0 }; const energy = [600, 600, 600]; let spentAll = 0;
        for (let act = 1; act <= ACTS; act++) {
          const o = r.int(objs.length), seat = r.int(3), s = objs[o]; energy[seat] = Math.min(1920, energy[seat] + 3 * ENERGY_PER_ACT); const cur = tableF(rules, s); const own = (v) => v.n[seat] * (v.n.reduce((a, b) => a + b, 0) - v.n[seat]);
          let best = null, bestScore = 0;
          for (const m of moves(s)) {
            const kk = sysKey(m.s); if (keys.has(kk)) continue; const W = price(s, m); const ch = W + 0.05 * W * W; if (ch > energy[seat]) continue; const nv = tableF(rules, m.s);
            const gOwn = own(nv) - own(cur); const gT = nv.F - cur.F;
            const sc = mode !== "table" ? gOwn / ch : gOwn >= 0 ? gT / ch : -1;
            if (sc > bestScore) { bestScore = sc; best = { m, nv, ch }; }
          }
          if (!best && mode === "planner") { // no single call helps: try 2-call plans from 12 random first calls
            const ms = moves(s).filter((m) => !keys.has(sysKey(m.s)));
            for (let tr = 0; tr < 12 && ms.length; tr++) { const m1 = r.pick(ms); const W1 = price(s, m1);
              for (const m2 of moves(m1.s)) { const kk = sysKey(m2.s); if (keys.has(kk) || kk === sysKey(s)) continue; const W = W1 + price(m1.s, m2); const ch = W + 0.05 * W * W; if (ch > energy[seat]) continue; const nv = tableF(rules, m2.s); const g = own(nv) - own(cur); if (g / ch > bestScore) { bestScore = g / ch; best = { m: m2, nv, ch }; } } }
          }
          if (best) { energy[seat] -= best.ch; spentAll += best.ch; keys.delete(sysKey(s)); keys.add(sysKey(best.m.s)); objs[o] = best.m.s; win.commits++; win.moved.add(o); if (best.nv.n.filter((x, i) => x > cur.n[i] + 1e-9).length >= 2) win.shared++; }
          if (act % (ACTS / 5) === 0) { const meanF = mean(objs.map((s) => tableF(rules, s).F)); rows.push(`${win.commits}/${win.moved.size}/${win.shared}/${fmt(meanF, 0)}`); win = { commits: 0, moved: new Set(), shared: 0 }; }
        }
        // end state: distinct shapes and how far apart objects are (φ spread)
        const ph = objs.map(phi);
        say(`- ${k} lines, ${mode} seats, ${rules.map((r) => r.id).join(" + ")}: windows (commits/objects moved/shared/mean F): ${rows.join(" → ")}; energy spent ${fmt(spentAll, 0)} ⚡ of ${fmt(1800 + 3 * ACTS * ENERGY_PER_ACT, 0)} earned at most; final φ ${fmt(Math.min(...ph), 0)}–${fmt(Math.max(...ph), 0)} (births ${fmt(Math.min(...births), 0)}–${fmt(Math.max(...births), 0)}); best object ${showSys(objs.reduce((a, b) => (tableF(rules, a).F > tableF(rules, b).F ? a : b)))}`);
      }
    }
  }
  say();
}

// The eight symmetries of the square grid and relabelling the lines leave most rules unchanged; an orbit key.
const SYMS = [(l) => l, (l) => [-l[0], l[1], l[2]], (l) => [l[0], -l[1], l[2]], (l) => [-l[0], -l[1], l[2]], (l) => [l[1], l[0], l[2]], (l) => [-l[1], l[0], l[2]], (l) => [l[1], -l[0], l[2]], (l) => [-l[1], -l[0], l[2]]];
const orbitKey = (s) => SYMS.map((g) => s.map((l) => lineKey(canon(...g(l)))).sort().join("|")).sort()[0];
// steepest-ascent climbs on the table total F from one birth, with random kicks, within a path budget of W bits
function search(rules, s0, budget, evals, rng, keep) {
  const obj = typeof rules === "function" ? rules : (x) => tableF(rules, x).F;
  let used = 0, best = obj(s0), bestS = s0;
  while (used < evals) {
    let s = s0, spent = 0;
    for (let kick = rng.int(4); kick > 0; kick--) { const ms = moves(s).filter((m) => spent + price(s, m) <= budget); if (!ms.length) break; const m = rng.pick(ms); spent += price(s, m); s = m.s; }
    let cur = obj(s); used++; if (keep) keep.set(sysKey(s), [cur, s]);
    for (;;) {
      let nb = null, nf = cur, nw = 0;
      for (const m of moves(s)) { const w = price(s, m); if (spent + w > budget) continue; used++; const v = obj(m.s); if (keep) keep.set(sysKey(m.s), [v, m.s]); if (v > nf) { nf = v; nb = m.s; nw = w; } if (used >= evals) break; }
      if (!nb) break; s = nb; cur = nf; spent += nw; if (used >= evals) break;
    }
    if (cur > best) { best = cur; bestS = s; }
  }
  return { best, bestS };
}

if (PARTS.has("collapse")) {
  say(`## Collapse tests (landscape-analysis.md §4)`);
  say();
  say(`The reachable sets cannot be enumerated (previous section), so the tests use sampled windows and searches:`);
  say();
  say(`- **Test 1, no ramp:** each rule alone, searched from one birth within path budgets 30, 60 and 120 bits. A ramp`);
  say(`  shows as bits that keep growing with each doubling of the budget while the best state's φ rises.`);
  say(`- **Test 2, no cheap optimum:** for 8 three-seat tables per size, from one birth each, a cheap searcher (2,000`);
  say(`  evaluations of F) against a strong one (100,000), both steepest ascent with random kicks, within a path budget`);
  say(`  of W = 60 bits (about ten unit moves). The table fails if the cheap search reaches 95% of the strong one.`);
  say(`- **Test 3, no single answer:** among every state the strong search evaluated, the best 12 distinct ones as a share`);
  say(`  of 12 × the best; again counting states that differ only by a symmetry of the grid (mirrors, quarter turns)`);
  say(`  or the order of the lines as one; and the top three, to read for a shared closed form.`);
  say(`- Test 4 (no convergence in play) is the climbers section; test 5 (disclosure) is a property of the disclosure`);
  say(`  rules, not of the object, and is not re-run here.`);
  say();
  for (const k of [2, 3]) {
    say(`### ${k} lines`);
    say();
    const rules = buildValues(k); const b0 = drawSystem(rngFrom(SEED + 1300 + k), k);
    say(`Test 1 from the birth ${showSys(b0)} (φ ${fmt(phi(b0), 0)}): best bits found by a 4,000-evaluation search for each rule alone`);
    say(`within path budgets W = 30, 60 and 120, with the φ of the best state.`);
    say();
    say(`| Rule | W = 30 | W = 60 | W = 120 | φ of best at 30 / 60 / 120 | ramp? |`);
    say(`|---|--:|--:|--:|--:|---|`);
    let fails1 = 0;
    for (const rule of rules) {
      const res = [30, 60, 120].map((W) => search((x) => rule.bits(x), b0, W, 4000, rngFrom(SEED + 1400 + W)));
      const g1 = res[1].best / Math.max(1e-9, res[0].best) - 1, g2 = res[2].best / Math.max(1e-9, res[1].best) - 1;
      const phs = res.map((x) => phi(x.bestS)); const f = g1 > 0.1 && g2 > 0.1 && phs[2] > phs[1] && phs[1] > phs[0];
      if (f) fails1++;
      say(`| ${rule.id} | ${fmt(res[0].best)} | ${fmt(res[1].best)} | ${fmt(res[2].best)} | ${phs.map((x) => fmt(x, 0)).join(" / ")} | ${f ? "ramp" : ""} |`);
    }
    say();
    say(`${fails1} of ${rules.length} rules ramp (bits grow by more than 10% at each doubling, with φ of the best state rising).`);
    say();
    say(`| Table | Strong F (100k) | Strong F (20k) | Cheap F (2k) | cheap/strong | fails? | Strong best state |`);
    say(`|---|--:|--:|--:|--:|---|---|`);
    const T = tables(k, 8, SEED + 800 + k); let fails2 = 0; const pools = [];
    T.forEach((rules3, ti) => {
      const r0 = rngFrom(SEED + 900 + ti + 10 * k); const s0 = drawSystem(r0, k); const keep = new Map();
      const strong = search(rules3, s0, 60, 100000, rngFrom(SEED + 1000 + ti), keep);
      const mid = search(rules3, s0, 60, 20000, rngFrom(SEED + 1100 + ti));
      const cheap = search(rules3, s0, 60, 2000, rngFrom(SEED + 1200 + ti));
      const ratio = cheap.best / Math.max(1e-9, strong.best); const f = ratio >= 0.95; if (f) fails2++;
      pools.push({ rules3, keep });
      say(`| ${rules3.map((r) => r.id).join(" + ")} | ${fmt(strong.best, 0)} | ${fmt(mid.best, 0)} | ${fmt(cheap.best, 0)} | ${fmt(ratio, 2)} | ${f ? "fails" : ""} | ${showSys(strong.bestS)} |`);
    });
    say();
    say(`${fails2} of ${T.length} tables fail test 2.`);
    say();
    for (const { rules3, keep } of pools.slice(0, 5)) {
      const all = [...keep.values()].sort((a, b) => b[0] - a[0]); const top = all.slice(0, 12); const share = top.reduce((a, b) => a + b[0], 0) / (12 * all[0][0]);
      const seen = new Set(), orb = []; for (const x of all) { const key = orbitKey(x[1]); if (seen.has(key)) continue; seen.add(key); orb.push(x); if (orb.length === 12) break; }
      const shareO = orb.reduce((a, b) => a + b[0], 0) / (12 * all[0][0]);
      say(`- ${rules3.map((r) => r.id).join(" + ")}: best 12 distinct keep ${fmt(100 * share, 0)}%, best 12 up to symmetry ${fmt(100 * shareO, 0)}%; top three orbits: ${orb.slice(0, 3).map(([f, s]) => `${showSys(s)} (F ${fmt(f, 0)})`).join("; ")}`);
    }
    say();
  }
}


if (PARTS.has("tension")) {
  const rules = buildTied();
  say(`## The tied pool (B2): alignment and tension, pair by pair and per mutator`);
  say();
  say(`Two lines. ${rules.length} dealt rules: 8 families, two tied secondaries each (§8 of the doc). From 1,500 states drawn from the`);
  say(`tilted law t = 0.55, every candidate call. For an ordered pair (i, j): among calls that raise rule i by at least`);
  say(`half a bit, the share that raise j (by ≥ ½ bit), lower it, or leave it. Verdict: **aligned** when raise − lower`);
  say(`≥ 0.15, **tension** when lower − raise ≥ 0.15, **neutral** when ≥ 60% leave it, else mixed.`);
  say();
  const r = rngFrom(SEED + 1500); const D = rules.map(() => []); const G = [];
  for (let n = 0; n < 1500; n++) {
    const s = drawSystem(r, 2, 0.55); const F = feat(s); const b0 = rules.map((ru) => ru.bits(s, F));
    for (const m of moves(s)) { const F2 = feat(m.s); rules.forEach((ru, i) => D[i].push(ru.bits(m.s, F2) - b0[i])); G.push(mgroup(m.id)); }
  }
  const groups = [...new Set(G)];
  const cell = (i, j, g) => { let up = 0, dn = 0, n = 0; for (let k = 0; k < G.length; k++) { if (g && G[k] !== g) continue; if (D[i][k] < 0.5) continue; n++; if (D[j][k] >= 0.5) up++; else if (D[j][k] <= -0.5) dn++; } return { n, up: up / Math.max(1, n), dn: dn / Math.max(1, n), le: (n - up - dn) / Math.max(1, n) }; };
  const verdict = (c) => (c.n < 20 ? "–" : c.up - c.dn >= 0.15 ? "aligned" : c.dn - c.up >= 0.15 ? "tension" : c.le >= 0.6 ? "neutral" : "mixed");
  const short = (c) => (c.n < 20 ? "–" : `${fmt(100 * c.up, 0)}/${fmt(100 * c.dn, 0)}/${fmt(100 * c.le, 0)}`);
  say(`### Overall (raise/lower/leave %, and the verdict)`);
  say();
  say(`| i ↓ raises, j → | ${rules.map((ru) => ru.id).join(" | ")} |`);
  say(`|---|${rules.map(() => "---").join("|")}|`);
  const counts = { aligned: 0, tension: 0, neutral: 0, mixed: 0, "–": 0 };
  for (let i = 0; i < rules.length; i++) say(`| ${rules[i].id} | ${rules.map((_, j) => { if (i === j) return "·"; const c = cell(i, j); const v = verdict(c); if (rules[i].fam !== rules[j].fam) counts[v]++; return `${short(c)} ${v}`; }).join(" | ")} |`);
  say();
  say(`Ordered pairs from different families: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  say();
  say(`### Per mutator: the verdict of every ordered pair from different families, counted`);
  say();
  say(`| Mutator | calls | aligned | tension | neutral | mixed | too few |`);
  say(`|---|--:|--:|--:|--:|--:|--:|`);
  for (const g of groups) { const c2 = { aligned: 0, tension: 0, neutral: 0, mixed: 0, "–": 0 }; for (let i = 0; i < rules.length; i++) for (let j = 0; j < rules.length; j++) if (rules[i].fam !== rules[j].fam) c2[verdict(cell(i, j, g))]++; say(`| ${g} | ${G.filter((x) => x === g).length} | ${c2.aligned} | ${c2.tension} | ${c2.neutral} | ${c2.mixed} | ${c2["–"]} |`); }
  say();
  say(`### Per mutator, pair by pair (raise/lower/leave %; "–" fewer than 20 calls raise i)`);
  say();
  for (const g of groups) {
    say(`<details><summary>${g}</summary>`);
    say();
    say(`| i ↓ raises, j → | ${rules.map((ru) => ru.id).join(" | ")} |`);
    say(`|---|${rules.map(() => "---").join("|")}|`);
    for (let i = 0; i < rules.length; i++) say(`| ${rules[i].id} | ${rules.map((_, j) => (i === j ? "·" : `${short(cell(i, j, g))} ${verdict(cell(i, j, g))}`)).join(" | ")} |`);
    say();
    say(`</details>`);
    say();
  }
}

if (PARTS.has("adversaries")) {
  const rules = buildTied();
  say(`## The tied pool (B2): every hill and its adversaries`);
  say();
  say(`Each rule alone climbs (steepest ascent with kicks, 3,000 evaluations, path budget W = 120) from 6 births. For`);
  say(`the climb's best state: the rule's own gain, the secondary reached, and every other rule's mean change in bits.`);
  say(`Adversaries lose a bit or more on average; allies gain a bit or more.`);
  say();
  say(`| Hill (rule) | own gain | secondary reached (mean) | adversaries (mean Δ bits) | allies (mean Δ bits) |`);
  say(`|---|--:|--:|---|---|`);
  const births = []; const r = rngFrom(SEED + 1600); while (births.length < 6) births.push(drawSystem(r, 2));
  for (const rule of rules) {
    const own = [], secv = [], d = rules.map(() => []);
    births.forEach((b, bi) => { const res = search((x) => rule.bits(x), b, 120, 3000, rngFrom(SEED + 1700 + bi)); own.push(rule.bits(res.bestS) - rule.bits(b)); const u = utility(rule, res.bestS, feat(res.bestS)); secv.push(u ? u[1] : 0); rules.forEach((o, j) => d[j].push(o.bits(res.bestS) - o.bits(b))); });
    const md = d.map(mean);
    const adv = rules.map((o, j) => [o, md[j]]).filter(([o, v]) => o.fam !== rule.fam && v <= -1).sort((a, b) => a[1] - b[1]).map(([o, v]) => `${o.id} (${fmt(v)})`);
    const ally = rules.map((o, j) => [o, md[j]]).filter(([o, v]) => o.fam !== rule.fam && v >= 1).sort((a, b) => b[1] - a[1]).map(([o, v]) => `${o.id} (+${fmt(v)})`);
    say(`| ${rule.id} (${rule.fam.sec(rule.sec).sense}) | ${fmt(mean(own))} | ${fmt(mean(secv))} | ${adv.join(", ") || "none"} | ${ally.join(", ") || "none"} |`);
  }
  say();
}

if (PARTS.has("hills")) {
  const rules = buildTied(); const R = rules.length;
  const atTop = (ru, x) => { const u = utility(ru, x, feat(x)); return u && u[0] === 0; };
  say(`## The tied pool (B2) on joint hills: alignment and tension where it counts`);
  say();
  say(`A rule's secondary only counts once its primary is at the top, so two rules' secondaries meet only on states where`);
  say(`both primaries are at the top: the joint hill a cooperating pair stands on. For every pair of rules from different`);
  say(`families: up to 6 such states (climbs on the sum of the two rules' bits from births, 600 evaluations each);`);
  say(`every candidate call from them that raises rule i (by any amount). Of those calls, "breaks" is the share that knock`);
  say(`rule j's primary off its top (any climber ignoring j does that; it is not the tension decision 30 asks for); of the`);
  say(`rest, the share that raise, lower or leave j's hill (by ≥ 0.05 bits). Verdict on those: aligned when raise − lower`);
  say(`≥ 0.15, tension when lower − raise ≥ 0.15, neutral when ≥ 60% leave it, else mixed; "–" fewer than 10 such calls.`);
  say(`Then **the ongoing climb**: from each joint state rule i climbs on (1,500 evaluations, W = 60) using only states that`);
  say(`keep rule j's primary at its top; rule j's mean change over that leg. An adversary loses ≥ 1 bit of its hill.`);
  say();
  const rows = []; const leg = []; for (let i = 0; i < R; i++) { rows.push([]); leg.push([]); for (let j = 0; j < R; j++) { rows[i].push([]); leg[i].push(null); } }
  const found = [];
  for (let i = 0; i < R; i++) for (let j = i + 1; j < R; j++) {
    if (rules[i].fam === rules[j].fam) continue;
    const r = rngFrom(SEED + 2000 + 37 * i + j); const states = []; let tries = 0;
    while (states.length < 6 && tries < 24) { tries++; const b0 = drawSystem(r, 2); const res = search((x) => rules[i].bits(x) + rules[j].bits(x), b0, 60, 600, rngFrom(SEED + 2100 + tries + 50 * i + j)); if (atTop(rules[i], res.bestS) && atTop(rules[j], res.bestS) && !states.some((x) => sysKey(x) === sysKey(res.bestS))) states.push(res.bestS); }
    found.push(states.length);
    const legs = [[], []];
    for (const st of states) {
      const F = feat(st); const bi = rules[i].bits(st, F), bj = rules[j].bits(st, F);
      for (const m of moves(st)) { const F2 = feat(m.s); const di = rules[i].bits(m.s, F2) - bi, dj = rules[j].bits(m.s, F2) - bj; const g = mgroup(m.id); const ti = atTop(rules[i], m.s), tj = atTop(rules[j], m.s); if (di > 0.05) rows[i][j].push([g, dj, tj]); if (dj > 0.05) rows[j][i].push([g, di, ti]); }
      // the ongoing climb keeps the other rule's primary at its top: only the other's hill can be lost
      for (const [a, c, k] of [[i, j, 0], [j, i, 1]]) { const res = search((x) => (atTop(rules[c], x) ? rules[a].bits(x) : -1e9), st, 60, 1500, rngFrom(SEED + 2200 + 1009 * i + 97 * j + 13 * k + legs[k].length)); legs[k].push(rules[c].bits(res.bestS) - rules[c].bits(st)); }
    }
    leg[i][j] = legs[0].length ? mean(legs[0]) : null; leg[j][i] = legs[1].length ? mean(legs[1]) : null;
  }
  // among calls that raise i: the share that break j's primary; of the rest (j's primary kept), raise/lower/leave j's hill
  const cell = (i, j, g) => { const all = rows[i][j].filter(([gg]) => !g || gg === g); const xs = all.filter(([, , t]) => t); const n = xs.length; const up = xs.filter(([, d]) => d >= 0.05).length, dn = xs.filter(([, d]) => d <= -0.05).length; return { n, br: (all.length - n) / Math.max(1, all.length), up: up / Math.max(1, n), dn: dn / Math.max(1, n), le: (n - up - dn) / Math.max(1, n) }; };
  const verdict = (c) => (c.n < 10 ? "–" : c.up - c.dn >= 0.15 ? "aligned" : c.dn - c.up >= 0.15 ? "tension" : c.le >= 0.6 ? "neutral" : "mixed");
  const short = (c) => (c.n < 10 ? "–" : `${fmt(100 * c.up, 0)}/${fmt(100 * c.dn, 0)}/${fmt(100 * c.le, 0)} (breaks ${fmt(100 * c.br, 0)}%)`);
  say(`Joint states found per pair: median ${[...found].sort((a, b) => a - b)[found.length >> 1]} of 6, none for ${found.filter((x) => x === 0).length} of ${found.length} pairs.`);
  say();
  say(`### Calls that raise i: raise/lower/leave % of j's hill (j's primary kept), the share breaking j's primary, and the verdict`);
  say();
  say(`| i ↓ climbs, j → | ${rules.map((ru) => ru.id).join(" | ")} |`);
  say(`|---|${rules.map(() => "---").join("|")}|`);
  const counts = { aligned: 0, tension: 0, neutral: 0, mixed: 0, "–": 0 };
  for (let i = 0; i < R; i++) say(`| ${rules[i].id} | ${rules.map((_, j) => { if (rules[i].fam === rules[j].fam) return "·"; const c = cell(i, j); const v = verdict(c); counts[v]++; return `${short(c)} ${v}`; }).join(" | ")} |`);
  say();
  say(`Ordered pairs (different families), by calls: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  say();
  const groups = [...new Set(rows.flat().flat().map(([g]) => g))].sort();
  say(`| Mutator | calls that raise i | aligned | tension | neutral | mixed | too few |`);
  say(`|---|--:|--:|--:|--:|--:|--:|`);
  for (const g of groups) { const c2 = { aligned: 0, tension: 0, neutral: 0, mixed: 0, "–": 0 }; let n = 0; for (let i = 0; i < R; i++) for (let j = 0; j < R; j++) if (rules[i].fam !== rules[j].fam) { const c = cell(i, j, g); n += c.n; c2[verdict(c)]++; } say(`| ${g} | ${n} | ${c2.aligned} | ${c2.tension} | ${c2.neutral} | ${c2.mixed} | ${c2["–"]} |`); }
  say();
  say(`### The ongoing climb: mean change of j (bits) while i climbs on alone from the joint hill`);
  say();
  say(`| i ↓ climbs, j → | ${rules.map((ru) => ru.id).join(" | ")} |`);
  say(`|---|${rules.map(() => "--:").join("|")}|`);
  for (let i = 0; i < R; i++) say(`| ${rules[i].id} | ${rules.map((_, j) => (leg[i][j] === null ? "·" : fmt(leg[i][j]))).join(" | ")} |`);
  say();
  const lc = { adversary: 0, ally: 0, neutral: 0 }; for (let i = 0; i < R; i++) for (let j = 0; j < R; j++) if (leg[i][j] !== null) lc[leg[i][j] <= -1 ? "adversary" : leg[i][j] >= 1 ? "ally" : "neutral"]++;
  say(`Ordered pairs by the climb: ${Object.entries(lc).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
  say();
  say(`| Hill | sense | adversaries (Δ bits while it climbs) | allies |`);
  say(`|---|---|---|---|`);
  for (let i = 0; i < R; i++) {
    const L = rules.map((o, j) => [o, leg[i][j]]).filter(([, v]) => v !== null);
    const adv = L.filter(([, v]) => v <= -1).sort((a, b) => a[1] - b[1]).map(([o, v]) => `${o.id} (${fmt(v)})`).join(", ") || "none";
    const al = L.filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([o, v]) => `${o.id} (+${fmt(v)})`).join(", ") || "none";
    say(`| ${rules[i].id} | ${rules[i].fam.sec(rules[i].sec).sense} | ${adv} | ${al} |`);
  }
  say();
}

if (PARTS.has("attack")) {
  say(`## Attacks: one-sentence families against each rule`);
  say();
  say(`Each attack is a closed-form family of systems; the table gives each rule's bits on the attack's members at`);
  say(`growing size, with φ, so a ramp shows as bits rising with φ at a fixed sentence.`);
  say();
  const P = PRIMES.filter((p) => p > 5);
  const attacks2 = [
    ["x = 0 and x + p·y = 0 (p prime)", (p) => [[1, 0, 0], [1, p, 0]]],
    ["y = x and y = −x + 2p", (p) => [[-1, 1, 0], [1, 1, -2 * p]]],
    ["perpendicular through (0,0): normals (a, b), (−b, a), a² + b² prime", (p) => { for (let a = 1; a < 200; a++) for (let b = a + 1; b < 400; b++) { const n = a * a + b * b; if (n >= p && spf(n) === n && gcd(a, b) === 1) return [canon(a, b, 0), canon(-b, a, 0)]; } }],
  ];
  const attacks3 = [
    ["x = 0, y = 0, x + y = p (a right triangle with legs p)", (p) => [[1, 0, 0], [0, 1, 0], [1, 1, -p]]],
    ["x = 0, y = 0, x + p·y = p (legs p and 1)", (p) => [[1, 0, 0], [0, 1, 0], [1, p, -p]]],
    ["y = 0, y = x, y = −x + 2p (isosceles right, apex (p, p))", (p) => [[0, 1, 0], [-1, 1, 0], [1, 1, -2 * p]]],
    ["x = 0, y = 0, x + y = n with n smooth (n = 16, 96, 1024, 13824: cheap to write, big triangles)", (p, n) => [[1, 0, 0], [0, 1, 0], [1, 1, -n]], [16, 96, 1024, 13824]],
  ];
  for (const [k, attacks] of [[2, attacks2], [3, attacks3]]) {
    const rules = buildValues(k);
    for (const [name, gen, smooth] of attacks) {
      const sizes = smooth ?? [7, 23, 61, 127];
      const systems = sizes.map((p) => { const q = P.find((x) => x >= p); const s = gen(q, p); return s && s.every(Boolean) && distinct(s) ? s : null; });
      say(`### ${k} lines: ${name}`);
      say();
      say(`| Rule | ${systems.map((s, i) => `${smooth ? "n =" : "p ≈"} ${sizes[i]} (φ ${s ? fmt(phi(s), 0) : "–"})`).join(" | ")} |`);
      say(`|---|${systems.map(() => "--:").join("|")}|`);
      for (const rule of rules) say(`| ${rule.id} | ${systems.map((s) => (s ? fmt(rule.bits(s)) : "–")).join(" | ")} |`);
      say();
    }
  }
}

writeFileSync(OUT, out.join("\n") + "\n");
console.error(`wrote ${OUT}`);
