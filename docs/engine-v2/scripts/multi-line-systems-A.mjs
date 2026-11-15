// Systems of two and three lines: a design study (docs/engine-v2/multi-line-systems-A.md).
// Self-contained: it does not import the engine. Run:
//   node --max-old-space-size=6500 docs/engine-v2/scripts/multi-line-systems-A.mjs [--part p,q,…] [--quick] [--write]
// Parts: law, reach, values, ramp, entangle, climb, search, sentence, tension, all (default). The committed results file was
// assembled from three processes (reach; law,values,ramp,entangle,climb; search,sentence), about 15 minutes each.
//
// The object: k = 2 or 3 distinct lines over Q, each the primitive triple (a, b, c) of a·x + b·y + c = 0 with b > 0, or
// b = 0 and a > 0 (spec §12.1), held as an unordered set (canonical order: sorted by triple). The law is the spec's:
// π ∝ 2^−φ, φ = Σ mixedInt over all 3k integers (spec §2.5), on a box |a|, |b|, |c| ≤ CAP.
// Prices follow spec §12.4 approximately: an amount of size σ costs RATE·σ, a choice costs log2 of the calls offered,
// a factor its digits; plus the surcharge max(0, Δφ). Numbers are JavaScript doubles holding integers below 2^53.

const args = process.argv.slice(2);
const PARTS = (args.includes("--part") ? args[args.indexOf("--part") + 1] : "all").split(",");
const want = p => PARTS.includes(p) || PARTS.includes("all");
const QUICK = args.includes("--quick");
const CAP = 10_000;

// ---------- rng ----------
function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
let rnd = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, 7);
const reseed = s => { rnd = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, s); for (let i = 0; i < 20; i++) rnd(); };
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// ---------- numbers ----------
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const PRIMES = (() => { const s = new Uint8Array(20001); const p = []; for (let i = 2; i <= 20000; i++) if (!s[i]) { p.push(i); for (let j = i * i; j <= 20000; j += i) s[j] = 1; } return p; })();
function sopfr(n) { n = Math.abs(n); let s = 0; for (const p of PRIMES) { if (p * p > n) break; while (n % p === 0) { s += p; n /= p; } } if (n > 1) s += n; return s; }
function isPrimeMR(n) {
  if (n < 2) return false; for (const p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) { if (n === p) return true; if (n % p === 0) return false; }
  const N = BigInt(n); let d = N - 1n, r = 0; while (d % 2n === 0n) { d /= 2n; r++; }
  const pw = (b, e) => { let x = 1n; b %= N; while (e > 0n) { if (e & 1n) x = x * b % N; b = b * b % N; e >>= 1n; } return x; };
  outer: for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    let x = pw(a, d); if (x === 1n || x === N - 1n) continue;
    for (let i = 1; i < r; i++) { x = x * x % N; if (x === N - 1n) continue outer; } return false;
  }
  return true;
}
// Smallest prime factor; 1 for |n| < 2 (the worst). Exact up to 2·10^4 by trial, then primality; a composite with no
// factor below 2·10^4 reports 20011 (a lower bound), which the study never reaches in practice.
function spf(n) { n = Math.abs(n); if (n < 2) return 1; for (const p of PRIMES) { if (p * p > n) return n; if (n % p === 0) return p; } return isPrimeMR(n) ? n : 20011; }
function euclidSteps(a, b) { a = Math.abs(a); b = Math.abs(b); let s = 0; while (b) { [a, b] = [b, a % b]; s++; } return s; }
const fracDist = (n, d) => { if (d < 0) { n = -n; d = -d; } const r = ((n % d) + d) % d; return Math.min(r, d - r) / d; };
const fdiv = (n, d) => { if (d < 0) { n = -n; d = -d; } const q = Math.trunc(n / d); return (n % d !== 0 && n < 0) ? q - 1 : q; }; // exact floor
const cdiv = (n, d) => -fdiv(-n, d);

// ---------- the mixed code (spec §2.5) ----------
const STEP = 0.5;
const LOG2Z = PRIMES.slice(0, 1229).reduce((a, p) => a - Math.log2(1 - 2 ** (-STEP * p)), 0);
const mixedBits = n => n === 0 ? 1 : 2 + STEP * sopfr(n) + LOG2Z;
const lineBits = L => mixedBits(L[0]) + mixedBits(L[1]) + mixedBits(L[2]);
const phi = S => S.reduce((a, L) => a + lineBits(L), 0);
const DRAW_PRIMES = PRIMES.filter(p => p < 400);
function log2Zt(t) { return Math.log2(2 ** -t + 2 * 2 ** (-t * (2 + LOG2Z)) * DRAW_PRIMES.reduce((a, p) => a / (1 - 2 ** (-t * STEP * p)), 1)); }
const TILTS = [1, 0.75, 0.55, 0.4];
const LZT = TILTS.map(log2Zt);
const RATIOS = new Map(TILTS.map(t => [t, DRAW_PRIMES.map(p => 2 ** (-t * STEP * p)).filter(r => r > 1e-12)]));
const P0 = new Map(TILTS.map((t, i) => [t, 2 ** -t / 2 ** LZT[i]]));
function drawInt(t) {
  if (rnd() < P0.get(t)) return 0;
  let n = 1; const rs = RATIOS.get(t);
  for (let i = 0; i < rs.length; i++) { const r = rs[i]; while (rnd() < r) { n *= DRAW_PRIMES[i]; if (n > CAP) return null; } }
  return rnd() < 0.5 ? n : -n;
}

// ---------- lines and systems ----------
function canonLine(a, b, c) {
  if (a === 0 && b === 0) return null;
  const g = gcd(gcd(a, b), c); a /= g; b /= g; c /= g;
  if (b < 0 || (b === 0 && a < 0)) { a = -a; b = -b; c = -c; }
  if (Math.abs(a) > CAP || Math.abs(b) > CAP || Math.abs(c) > CAP) return null;
  return [a + 0, b + 0, c + 0];
}
const lineKey = L => L.join(",");
const cmpLine = (P, Q) => P[0] - Q[0] || P[1] - Q[1] || P[2] - Q[2];
function canonSys(lines) {
  if (lines.some(L => L === null)) return null;
  const s = lines.slice().sort(cmpLine);
  for (let i = 1; i < s.length; i++) if (cmpLine(s[i - 1], s[i]) === 0) return null; // lines are distinct
  return s;
}
const sysKey = S => S.map(lineKey).join("|");
// A line's primitive triple must also be canonical: drawn triples that are not are refused (the code's leftover mass).
function drawSystem(k, comp) {
  for (;;) {
    const t = TILTS[comp];
    const lines = []; let ok = true;
    for (let i = 0; i < k && ok; i++) {
      // each line has exactly two signed triples of equal φ, so drawing a triple and fixing its sign is exact
      let a = drawInt(t), b = drawInt(t), c = drawInt(t);
      if (a === null || b === null || c === null) { ok = false; break; }
      if ((a === 0 && b === 0) || gcd(gcd(a, b), c) !== 1) { ok = false; break; }
      if (b < 0 || (b === 0 && a < 0)) { a = -a; b = -b; c = -c; }
      lines.push([a + 0, b + 0, c + 0]);
    }
    if (!ok) continue;
    const S = canonSys(lines); if (!S) continue;
    return S;
  }
}
// log2 of the mixture density over the tilts, up to a constant shared with π (which is the t = 1 component).
function logWeight(S) {
  const bits = S.reduce((a, L) => a + lineBits(L), 0);
  const logs = TILTS.map((t, i) => -t * bits - S.length * 3 * LZT[i]);
  const mx = Math.max(...logs);
  const lq = mx + Math.log2(logs.reduce((a, l) => a + 2 ** (l - mx), 0) / TILTS.length);
  return (-bits - S.length * 3 * LZT[0]) - lq;
}

// ---------- system geometry ----------
function pair(L1, L2) {
  const [a1, b1, c1] = L1, [a2, b2, c2] = L2;
  return { D: a1 * b2 - a2 * b1, dot: a1 * a2 + b1 * b2, Nx: b1 * c2 - b2 * c1, Ny: c1 * a2 - c2 * a1 };
}
const det3 = S => { const [[a1, b1, c1], [a2, b2, c2], [a3, b3, c3]] = S; return a1 * (b2 * c3 - b3 * c2) - b1 * (a2 * c3 - a3 * c2) + c1 * (a2 * b3 - a3 * b2); };
const yAt = (L, x) => (-L[0] * x - L[2]) / L[1];
// Interior lattice points of a convex polygon given as the half-planes s_i·(a_i x + b_i y + c_i) > 0, scanning x.
function latticeInside(halfs, xmin, xmax, area) {
  const x0 = Math.floor(xmin) + 1, x1 = Math.ceil(xmax) - 1;
  if (x1 - x0 > 4000) return Math.floor(area); // wide triangles: Pick's estimate (interior ≈ area)
  let count = 0;
  for (let x = x0; x <= x1; x++) {
    let lo = -Infinity, hi = Infinity, dead = false;
    for (const [a, b, c, s] of halfs) {
      // s·(a x + b y + c) > 0
      if (b === 0) { if (!(s * (a * x + c) > 0)) { dead = true; break; } continue; }
      const num = -(a * x + c); // y vs num/b
      if (s * b > 0) { const m = fdiv(num, b) + 1; if (m > lo) lo = m; } // y > num/b
      else { const m = cdiv(num, b) - 1; if (m < hi) hi = m; }          // y < num/b
    }
    if (!dead && hi >= lo) count += hi - lo + 1;
  }
  return count;
}

// Two-line elements.
function sys2(S) {
  const [L1, L2] = S; const p = pair(L1, L2);
  const e = { ...p, P: p.D !== 0 ? [p.Nx / p.D, p.Ny / p.D] : null };
  // The triangle the two lines make with the y-axis: corners (0, y1), (0, y2) and the answer.
  if (p.D !== 0 && L1[1] !== 0 && L2[1] !== 0 && p.Nx !== 0) {
    const y1 = -L1[2] / L1[1], y2 = -L2[2] / L2[1];
    e.wallArea = Math.abs(y1 - y2) * Math.abs(e.P[0]) / 2;
    const sgnX = Math.sign(e.P[0]);
    const halfs = [[1, 0, 0, sgnX]];
    const ref = [e.P[0] / 2, (y1 + y2) / 2 + (e.P[1] - (y1 + y2) / 2) / 2]; // a point inside
    for (const L of S) halfs.push([...L, Math.sign(L[0] * ref[0] + L[1] * ref[1] + L[2])]);
    e.halfs = halfs; e.xr = sgnX > 0 ? [0, e.P[0]] : [e.P[0], 0];
  }
  return e;
}
function wallPegs(e) { return e.halfs ? latticeInside(e.halfs, e.xr[0], e.xr[1], e.wallArea) : 0; }

// Three-line elements.
function sys3(S) {
  const pr = [[0, 1], [0, 2], [1, 2]].map(([i, j]) => ({ i, j, ...pair(S[i], S[j]) }));
  const e = { pr, Delta: det3(S) };
  if (pr.some(p => p.D === 0)) return e;
  e.V = pr.map(p => [p.Nx / p.D, p.Ny / p.D]);
  e.area = e.Delta === 0 ? 0 : (e.Delta * e.Delta) / (2 * Math.abs(pr[0].D * pr[1].D * pr[2].D));
  e.G = [(e.V[0][0] + e.V[1][0] + e.V[2][0]) / 3, (e.V[0][1] + e.V[1][1] + e.V[2][1]) / 3];
  const d2 = (P, Q) => (P[0] - Q[0]) ** 2 + (P[1] - Q[1]) ** 2;
  e.side2 = [d2(e.V[0], e.V[1]), d2(e.V[0], e.V[2]), d2(e.V[1], e.V[2])];
  if (e.Delta !== 0) {
    e.halfs = S.map(L => [...L, Math.sign(L[0] * e.G[0] + L[1] * e.G[1] + L[2])]);
    e.xr = [Math.min(...e.V.map(v => v[0])), Math.max(...e.V.map(v => v[0]))];
  }
  return e;
}
const near = x => Math.round(x);
const d1lattice = P => { const dx = Math.abs(P[0] - Math.round(P[0])), dy = Math.abs(P[1] - Math.round(P[1])); return (dx < 1e-9 ? 0 : dx) + (dy < 1e-9 ? 0 : dy); };

// ---------- rule families ----------
// A rule maps a system to [primary, secondary] (bigger better) or null (undefined: worst). Primaries are kid-readable
// distances (closer is better); every secondary is unbounded (no top) and reads a different aspect than the primary.
// Every secondary is tied to its primary (owner decision 29): it reads the primary's ANCHOR, the whole number the
// primary is about (the peg nearest the answer, the root, the determinant at a 45° crossing, the triangle's root …),
// and relates it to itself or to another aspect of the system. Four kinds, all unbounded (decision 26, 30):
//   spf    the anchor's smallest prime factor (bigger better: "big primes")
//   omega  Ω of the anchor, prime factors counted with repeats (more better: "small values with lots of prime factors",
//          decision 30's rule in tension with spf)
//   gcd    the largest common factor of the anchor and a number from another aspect (decision 29's own example)
//   ladder the run n = n0, n0 + 1, … (n0 from the anchor) over which every line's height y(n) is a prime
const omega = n => { n = Math.abs(n); if (n < 2) return 0; let c = 0; for (const p of PRIMES) { if (p * p > n) break; while (n % p === 0) { c++; n /= p; } } return n > 1 ? c + 1 : c; };
const gcd0 = (a, b) => (a === 0 || b === 0) ? 0 : gcd(a, b);
// The prime ladder from n0: unbounded only by the prime k-tuples conjecture; long runs are found by sieving and search,
// not by a formula (they need the gradients to share the small primes, which smooth numbers make cheap).
function primeLadder(S, n0) {
  if (S.some(L => L[1] === 0 || L[0] === 0)) return 0;
  let n = n0;
  for (; n < n0 + 40; n++) for (const L of S) { const num = -L[0] * n - L[2]; if (num % L[1] !== 0) return n - n0; const y = num / L[1]; if (y < 2 || !isPrimeMR(y)) return n - n0; }
  return n - n0;
}
const taxi = P => Math.abs(near(P[0])) + Math.abs(near(P[1]));
const KINDS = {
  spf: { text: a => `the smallest prime factor of ${a} (bigger better)`, f: (A) => spf(A) },
  omega: { text: a => `how many prime factors ${a} has, with repeats (more better)`, f: (A) => omega(A) },
  gcd: { text: (a, b) => `the largest common factor of ${a} and ${b} (bigger better)`, f: (A, B) => gcd0(A, B) },
  ladder: { text: a => `how many whole x in a row, from ${a}, give every line a prime height (more better)`, f: (A, B, S) => primeLadder(S, A) },
};
// A family: primary p (a kid-readable distance, closer better), anchor (an integer, or null), other (an integer from
// another aspect, for gcd), ladderFrom (the ladder's first x), and its secondaries (kinds).
const FAM2 = [
  { id: "whole-answer", title: "Whole Answer", aspect: "answer", kid: "solve the pair of equations: the answer (x, y) should be whole numbers",
    p: (S, e) => e.P ? -(fracDist(e.Nx, e.D) + fracDist(e.Ny, e.D)) : null,
    anchor: (S, e) => taxi(e.P), anchorText: "|X| + |Y| of the peg nearest the answer", other: (S, e) => e.D, otherText: "the determinant", ladderFrom: (S, e) => near(e.P[0]), secs: ["gcd", "omega", "ladder"] },
  { id: "right-angle", title: "Right Angle", aspect: "angle", kid: "the lines cross at a right angle (gradients multiply to −1)",
    p: (S, e) => e.D !== 0 ? -Math.abs(e.dot) / Math.abs(e.D) : null,
    anchor: (S, e) => e.D, anchorText: "the determinant (a² + b² times a whole number when the lines are perpendicular)", other: (S, e) => e.P ? taxi(e.P) : 0, otherText: "|X| + |Y| of the answer's peg", ladderFrom: (S, e) => 0, secs: ["spf", "omega", "gcd"] },
  { id: "meet-on-floor", title: "Meet on the Floor", aspect: "answer", kid: "the lines cross on the x-axis (the answer's y close to 0)",
    p: (S, e) => e.P ? -Math.abs(e.P[1]) : null,
    anchor: (S, e) => near(e.P[0]), anchorText: "the whole number nearest the crossing's x", other: (S, e) => e.D, otherText: "the determinant", ladderFrom: (S, e) => near(e.P[0]), secs: ["spf", "omega", "gcd"] },
  { id: "treasure-crossing", title: "Treasure Crossing", aspect: "answer", kid: "the lines cross close to the treasure at (3, 2)", T: [3, 2],
    p: (S, e) => e.P ? -(Math.abs(e.P[0] - 3) + Math.abs(e.P[1] - 2)) : null,
    anchor: (S, e) => e.D, anchorText: "the determinant at the treasure", other: (S, e) => e.dot, otherText: "the dot product of the normals", ladderFrom: () => 3, secs: ["ladder", "omega", "gcd"] },
  { id: "wall-triangle", title: "Triangle on the Wall", aspect: "region", kid: "the triangle the lines make with the y-axis has area close to 6",
    p: (S, e) => e.wallArea !== undefined ? -Math.abs(e.wallArea - 6) : null,
    anchor: (S, e) => near(Math.abs(S[0][2] / S[0][1] - S[1][2] / S[1][1])), anchorText: "the whole number nearest the base on the wall (the y-intercepts' gap)", other: (S, e) => near(e.P[0]), otherText: "the whole number nearest the height (the crossing's x)", ladderFrom: () => 0, secs: ["spf", "omega", "gcd"] },
  { id: "forty-five", title: "Forty-Five", aspect: "angle", kid: "the lines cross at 45° (the angle's tangent close to 1)",
    p: (S, e) => (e.D !== 0 || e.dot !== 0) ? -Math.abs(Math.abs(e.D) - Math.abs(e.dot)) / (Math.abs(e.D) + Math.abs(e.dot)) : null,
    anchor: (S, e) => e.D, anchorText: "the determinant (equal to ± the dot product at 45°)", other: (S, e) => e.P ? taxi(e.P) : 0, otherText: "|X| + |Y| of the answer's peg", ladderFrom: () => 0, secs: ["spf", "omega", "gcd"] },
  { id: "no-fractions", title: "No Fractions", aspect: "matrix", kid: "solving by elimination, the number you divide by is close to 1",
    p: (S, e) => e.D !== 0 ? -(Math.abs(e.D) - 1) : null,
    anchor: (S, e) => taxi(e.P), anchorText: "|X| + |Y| of the answer (whole when you divide by 1)", other: (S, e) => e.dot, otherText: "the dot product", ladderFrom: (S, e) => near(e.P[0]), secs: ["spf", "omega", "ladder"] },
  { id: "mirror-pair", title: "Mirror Pair", aspect: "slope", kid: "the lines are mirror images in the y-axis (gradients opposite, same y-intercept)",
    p: (S, e) => (S[0][1] && S[1][1]) ? -(Math.abs(S[0][0] / S[0][1] + S[1][0] / S[1][1]) + Math.abs(S[0][2] / S[0][1] - S[1][2] / S[1][1])) : null,
    anchor: (S, e) => near(-(S[0][2] / S[0][1] + S[1][2] / S[1][1]) / 2), anchorText: "the whole number nearest the shared y-intercept", other: (S, e) => Math.floor(Math.abs(S[0][0] / S[0][1])), otherText: "the floor of the gradient's size", ladderFrom: () => 1, secs: ["gcd", "spf", "omega"] },
  { id: "gradient-point", title: "Crossing at the Gradients", aspect: "answer×slope", kid: "the lines cross at the point (m1, m2) made of their own gradients",
    p: (S, e) => (e.P && S[0][1] && S[1][1]) ? -Math.min(...[[0, 1], [1, 0]].map(([i, j]) => Math.abs(e.P[0] + S[i][0] / S[i][1]) + Math.abs(e.P[1] + S[j][0] / S[j][1]))) : null,
    anchor: (S, e) => near(e.P[0]), anchorText: "the whole number nearest the crossing's x (one gradient)", other: (S, e) => near(e.P[1]), otherText: "the whole number nearest the crossing's y (the other gradient)", ladderFrom: (S, e) => near(e.P[0]), secs: ["gcd", "spf", "ladder"] },
];
const vertexOf = (e, pi) => e.V[pi];
const rightCornerIdx = e => { let b = 0; for (let i = 1; i < 3; i++) if (Math.abs(e.pr[i].dot) / Math.abs(e.pr[i].D) < Math.abs(e.pr[b].dot) / Math.abs(e.pr[b].D)) b = i; return b; };
const apexIdx = e => { // the corner where the two most nearly equal sides meet; sides: 0 = V0V1, 1 = V0V2, 2 = V1V2
  const pairs = [[0, 1, 0], [0, 2, 1], [1, 2, 2]]; let best = null; // sides i, j share corner: (0,1) → V0, (0,2) → V1, (1,2) → V2
  for (const [i, j, v] of pairs) { const d = Math.abs(e.side2[i] - e.side2[j]) / (e.side2[i] + e.side2[j]); if (!best || d < best.d) best = { d, v }; }
  return best.v; };
const pegsIn = e => e.halfs ? latticeInside(e.halfs, e.xr[0], e.xr[1], e.area) : 0;
const FAM3 = [
  { id: "pegged-triangle", title: "Pegged Triangle", aspect: "corners", kid: "all three corners land on pegs (whole-number points)",
    p: (S, e) => e.V ? -e.V.reduce((a, v) => a + d1lattice(v), 0) : null,
    anchor: (S, e) => near(2 * e.area), anchorText: "twice the area (whole for a triangle on pegs)", other: (S, e) => e.Delta, otherText: "the 3×3 determinant", ladderFrom: (S, e) => near(Math.min(...e.V.map(v => v[0]))), secs: ["spf", "omega", "ladder"] },
  { id: "six-units", title: "Six Square Units", aspect: "region", kid: "the triangle's area is close to 6",
    p: (S, e) => e.area !== undefined ? -Math.abs(e.area - 6) : null,
    anchor: (S, e) => e.Delta, anchorText: "the 3×3 determinant (area = Δ² / 2|D₁₂D₁₃D₂₃|)", other: (S, e) => e.V ? e.V.reduce((a, v) => a + taxi(v), 0) : 0, otherText: "the corners' pegs' total |X| + |Y|", ladderFrom: () => 0, secs: ["spf", "omega", "gcd"] },
  { id: "right-corner", title: "Right Corner", aspect: "angle", kid: "one corner of the triangle is close to a right angle",
    p: (S, e) => e.V ? -Math.min(...e.pr.map(p => Math.abs(p.dot) / Math.abs(p.D))) : null,
    anchor: (S, e) => taxi(e.V[rightCornerIdx(e)]), anchorText: "|X| + |Y| of the peg nearest the right corner", other: (S, e) => e.pr[rightCornerIdx(e)].D, otherText: "the determinant of the two lines at that corner", ladderFrom: (S, e) => near(e.V[rightCornerIdx(e)][0]), secs: ["spf", "omega", "gcd"] },
  { id: "all-meet", title: "All Meet", aspect: "concurrency", kid: "the three lines nearly meet at one point (the triangle shrinks to nothing)",
    p: (S, e) => e.area !== undefined ? -e.area : null,
    anchor: (S, e) => taxi(e.G), anchorText: "|X| + |Y| of the peg nearest the meeting point", other: (S, e) => Math.min(...e.pr.map(p => Math.abs(p.D))), otherText: "the smallest 2×2 determinant", ladderFrom: (S, e) => near(e.G[0]), secs: ["spf", "omega", "ladder"] },
  { id: "balance-peg", title: "Balance on a Peg", aspect: "centroid", kid: "the triangle's balance point (centroid) lands on a peg",
    p: (S, e) => e.G && e.area > 0 ? -d1lattice(e.G) : null,
    anchor: (S, e) => taxi(e.G), anchorText: "|X| + |Y| of the balance point's peg", other: (S, e) => e.Delta, otherText: "the 3×3 determinant", ladderFrom: (S, e) => near(e.G[0]), secs: ["spf", "omega", "gcd"] },
  { id: "two-equal-sides", title: "Two Equal Sides", aspect: "shape", kid: "two sides of the triangle are close to the same length",
    p: (S, e) => e.side2 && e.area > 0 ? -Math.min(...[[0, 1], [0, 2], [1, 2]].map(([i, j]) => Math.abs(e.side2[i] - e.side2[j]) / (e.side2[i] + e.side2[j]))) : null,
    anchor: (S, e) => taxi(e.V[apexIdx(e)]), anchorText: "|X| + |Y| of the peg nearest the apex (where the equal sides meet)", other: (S, e) => e.Delta, otherText: "the 3×3 determinant", ladderFrom: (S, e) => near(e.V[apexIdx(e)][0]), secs: ["spf", "omega", "ladder"] },
  { id: "square-triangle", title: "Square Triangle", aspect: "region", kid: "the triangle's area is close to a square number (1, 4, 9, 16 …)",
    p: (S, e) => e.area > 0 ? -Math.abs(Math.sqrt(e.area) - Math.max(1, near(Math.sqrt(e.area)))) : null,
    anchor: (S, e) => Math.max(1, near(Math.sqrt(e.area))), anchorText: "the root k of the nearest square", other: (S, e) => e.Delta, otherText: "the 3×3 determinant", ladderFrom: () => 0, secs: ["spf", "omega", "gcd"] },
  { id: "five-pegs", title: "Five Pegs Inside", aspect: "region", kid: "exactly 5 pegs inside the triangle (closer to 5 is better)",
    p: (S, e) => e.halfs ? -Math.abs(pegsIn(e) - 5) : null,
    anchor: (S, e) => near(2 * e.area), anchorText: "the whole number nearest twice the area", other: (S, e) => e.Delta, otherText: "the 3×3 determinant", ladderFrom: () => 0, secs: ["spf", "omega", "gcd"] },
  { id: "area-is-pegs", title: "Area Counts Pegs", aspect: "region×count", kid: "the triangle's area equals the number of pegs inside it",
    p: (S, e) => e.halfs ? -Math.abs(e.area - pegsIn(e)) : null,
    anchor: (S, e) => pegsIn(e), anchorText: "the number of pegs inside", other: (S, e) => e.Delta, otherText: "the 3×3 determinant", ladderFrom: () => 0, secs: ["spf", "omega", "gcd"] },
];
function rulesFor(k) {
  const fams = k === 2 ? FAM2 : FAM3, el = k === 2 ? sys2 : sys3;
  const rules = [];
  for (const f of fams) for (const s of f.secs) rules.push({ id: `${f.id}/${s}`, fam: f.id, sec: s, aspect: f.aspect,
    score: (S, e) => { const p = f.p(S, e); if (p === null || Number.isNaN(p)) return null;
      const A = f.anchor(S, e); const sec = s === "ladder" ? primeLadder(S, f.ladderFrom(S, e)) : KINDS[s].f(A, f.other(S, e), S);
      return [p, sec]; } });
  return { rules, el };
}
const cmpScore = (x, y) => x === null ? (y === null ? 0 : -1) : y === null ? 1 : (x[0] - y[0]) || (x[1] - y[1]);

// ---------- value functions by weighted draws (spec §7.0's direct draws, simplified) ----------
function buildValues(k, n) {
  const { rules, el } = rulesFor(k);
  const draws = [];
  for (let i = 0; i < n; i++) {
    const comp = i % TILTS.length; const S = drawSystem(k, comp);
    draws.push({ S, lw: logWeight(S), phi: phi(S) });
  }
  const mx = draws.reduce((a, d) => Math.max(a, d.lw), -Infinity);
  for (const d of draws) d.w = 2 ** (d.lw - mx);
  const total = draws.reduce((a, d) => a + d.w, 0);
  const tables = new Map();
  const els = draws.map(d => el(d.S));
  for (const r of rules) {
    const sc = draws.map((d, i) => ({ s: r.score(d.S, els[i]), w: d.w / total, phi: d.phi }));
    sc.sort((x, y) => cmpScore(y.s, x.s)); // best first
    const cum = new Float64Array(sc.length); let c = 0; for (let i = 0; i < sc.length; i++) { c += sc[i].w; cum[i] = c; }
    // bits at the i-th draw: survival = cum at the last index with score ≥ its score
    const bitsAt = new Float64Array(sc.length);
    for (let i = sc.length - 1; i >= 0;) { let j = i; while (j > 0 && cmpScore(sc[j - 1].s, sc[i].s) === 0) j--; for (let t = j; t <= i; t++) bitsAt[t] = -Math.log2(Math.min(1, cum[i])); i = j - 1; }
    // certified top: the best score with at least 30 draws at or above it
    const certIdx = Math.min(29, sc.length - 1), knotIdx = Math.min(4, sc.length - 1);
    // Extrapolation past the draws (spec §7.0 "beyond"): at the best primary seen, bits grow along log2(1 + secondary)
    // with the slope of the conditional tail's last knots (fit on draws at that primary with secondary above its median).
    const topP = sc[knotIdx].s ? sc[knotIdx].s[0] : null; let slope = 1, knotSec = 0, knotBits = bitsAt[knotIdx];
    if (topP !== null) {
      const atTop = []; for (let i = 0; i < sc.length; i++) if (sc[i].s && sc[i].s[0] === topP && i >= knotIdx) atTop.push(i);
      if (atTop.length >= 8) {
        const xs = [], ys = []; const half = atTop.slice(0, Math.max(4, Math.floor(atTop.length / 2)));
        for (const i of half) { xs.push(Math.log2(1 + Math.max(0, sc[i].s[1]))); ys.push(bitsAt[i]); }
        const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
        let sxy = 0, sxx = 0; for (let t = 0; t < xs.length; t++) { sxy += (xs[t] - mx) * (ys[t] - my); sxx += (xs[t] - mx) ** 2; }
        if (sxx > 0 && sxy > 0) slope = Math.max(0.5, sxy / sxx);
      }
      knotSec = Math.max(0, sc[knotIdx].s[1]); knotBits = bitsAt[knotIdx];
    }
    tables.set(r.id, { rule: r, sc, cum, bitsAt, certIdx, certBits: bitsAt[certIdx], certScore: sc[certIdx].s, knotScore: sc[knotIdx].s, topP, slope, knotSec, knotBits });
  }
  return { rules, el, tables, draws };
}
// bits of a score: the survival at its actual score; better than every draw: the top draw's bits + 1 (marked beyond).
function valueOf(tab, s) {
  if (s === null) return 0;
  const sc = tab.sc; let lo = 0, hi = sc.length; // first index whose score < s
  if (tab.knotScore && cmpScore(s, tab.knotScore) > 0) { // fewer than 5 draws at or above: a monotone extrapolation from the 5th best draw (marked beyond)
    if (s[0] === tab.topP) return tab.knotBits + Math.max(0, tab.slope * (Math.log2(1 + Math.max(0, s[1])) - Math.log2(1 + tab.knotSec)));
    // a better primary (a distance closer to 0): one bit per halving of the distance, at most 3, then the secondary
    const dk = Math.max(1e-9, -tab.topP), d = Math.max(1e-9, -s[0]);
    return tab.knotBits + Math.min(3, Math.log2(dk / d)) + tab.slope * Math.log2(1 + Math.max(0, s[1]));
  }
  while (lo < hi) { const m = (lo + hi) >> 1; if (cmpScore(sc[m].s, s) >= 0) lo = m + 1; else hi = m; }
  return -Math.log2(Math.min(1, tab.cum[lo - 1]));
}

// ---------- mutators and prices ----------
// Each generated call: { id, rep, size (amount size or 0), choiceBits, apply(S) → S′ | null }. Fee = which + where + choices
// + RATE·size (amounts; spec: a size σ costs rate(o)·σ in all) or digits (factors), plus max(0, Δφ).
const RATE = 4.3, FACTOR_RATE = 5.4;
const M_COUNT = 16; // mutators offered on a system variant (9 single-line + 7 system)
function siShift(L, k) { return L[1] === 0 ? null : canonLine(L[0], L[1], L[2] - k * L[1]); }      // c_si += k
function siTilt(L, k) { return L[1] === 0 ? null : canonLine(L[0] - k * L[1], L[1], L[2]); }      // m += k
function seqStep(L, k) { return L[1] === 0 ? null : canonLine(L[0] - k * L[1], L[1], L[2] + k * L[1]); } // m += k, c_si −= k
function pivot(L, x0, k) { return L[1] === 0 ? null : canonLine(L[0] - k * L[1], L[1], L[2] - k * x0 * L[1]); }
function nudge(L, w, k) { const M = L.slice(); M[w] += k; if (gcd(gcd(M[0], M[1]), M[2]) !== 1) return null; if (M[1] < 0 || (M[1] === 0 && M[0] <= 0)) return null; return canonLine(...M); }
function stretch(L, p, q) { return L[1] === 0 ? null : canonLine(p * L[0], q * L[1], p * L[2]); } // m·f, c·f with f = p/q
function mirror(L, ax) { const [a, b, c] = L; return ax === 0 ? canonLine(a, -b, c) : ax === 1 ? canonLine(-a, b, c) : ax === 2 ? canonLine(a, b, -c) : canonLine(b, a, c); }
function slideLine(L, u, v) { return canonLine(L[0], L[1], L[2] - L[0] * u - L[1] * v); } // u, v whole
function combine(Li, Lj, k) { const M = [Li[0] + k * Lj[0], Li[1] + k * Lj[1], Li[2] + k * Lj[2]]; if (gcd(gcd(M[0], M[1]), M[2]) !== 1) return null; return canonLine(...M); }
function reflectIn(Li, Lj) { const n = Lj[0] ** 2 + Lj[1] ** 2, d = Li[0] * Lj[0] + Li[1] * Lj[1]; return canonLine(n * Li[0] - 2 * d * Lj[0], n * Li[1] - 2 * d * Lj[1], n * Li[2] - 2 * d * Lj[2]); }
function perpAt(Li, Lj) { const p = pair(Li, Lj); if (p.D === 0) return null; // the perpendicular to Li through Li ∩ Lj
  return canonLine(-Li[1] * p.D, Li[0] * p.D, Li[1] * p.Nx - Li[0] * p.Ny); }
function turnAt(Li, Lj, k) { const p = pair(Li, Lj); if (p.D === 0 || Li[1] === 0) return null; // gradient += k about Li ∩ Lj
  // m' = m + k through (x*, y*): a' = a − k b, c' = c + k b x*  (scaled by D)
  return canonLine((Li[0] - k * Li[1]) * p.D, Li[1] * p.D, Li[2] * p.D + k * Li[1] * p.Nx); }
function zoomLine(L, p, q) { return canonLine(q * L[0], q * L[1], p * L[2]); }

function calls(S) {
  const k = S.length, out = [], where = Math.log2(k), base = Math.log2(M_COUNT);
  const rep = (i, L) => { const T = S.slice(); T[i] = L; return canonSys(T); };
  for (let i = 0; i < k; i++) {
    const L = S[i];
    for (const s of [1, -1, 2, -2]) {
      out.push({ id: "si.shift", line: i, size: Math.abs(s), o: base + where, f: () => rep(i, siShift(L, s)) });
      out.push({ id: "si.tilt", line: i, size: Math.abs(s), o: base + where, f: () => rep(i, siTilt(L, s)) });
      out.push({ id: "seq.step", line: i, size: Math.abs(s), o: base + where, f: () => rep(i, seqStep(L, s)) });
    }
    for (const x0 of [-2, -1, 1, 2]) for (const s of [1, -1]) out.push({ id: "cart.pivot", line: i, size: 1 + Math.abs(x0), o: base + where, f: () => rep(i, pivot(L, x0, s)) });
    for (let w = 0; w < 3; w++) for (const s of [1, -1]) out.push({ id: "gen.nudge", line: i, size: 1, o: base + where + Math.log2(3), f: () => rep(i, nudge(L, w, s)) });
    for (const [p, q] of [[2, 1], [1, 2], [3, 1], [1, 3], [-1, 2], [-2, 1]]) out.push({ id: "mach.stretch", line: i, factor: Math.log2(Math.abs(p) * q) + 1, o: base + where, f: () => rep(i, stretch(L, p, q)) });
    for (let ax = 0; ax < 4; ax++) out.push({ id: "cart.mirror", line: i, choice: 2, o: base + where, f: () => rep(i, mirror(L, ax)) });
    for (let j = 0; j < k; j++) if (j !== i) {
      const pairBits = Math.log2(k - 1);
      for (const s of [1, -1, 2, -2]) out.push({ id: "row.add", line: i, size: Math.abs(s), o: base + where + pairBits, f: () => rep(i, combine(L, S[j], s)) });
      for (const s of [1, -1]) out.push({ id: "pencil.turn", line: i, size: 1, o: base + where + pairBits, f: () => rep(i, turnAt(L, S[j], s)) });
      out.push({ id: "pair.reflect", line: i, choice: 0, o: base + where + pairBits, f: () => rep(i, reflectIn(L, S[j])) });
      out.push({ id: "pair.perpendicular", line: i, choice: 0, o: base + where + pairBits, f: () => rep(i, perpAt(L, S[j])) });
    }
  }
  for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) out.push({ id: "sys.slide", size: Math.abs(u) + Math.abs(v), o: base, f: () => canonSys(S.map(L => slideLine(L, u, v))) });
  for (const [p, q] of [[2, 1], [1, 2], [3, 1], [1, 3], [-1, 1]]) out.push({ id: "sys.zoom", factor: Math.log2(Math.abs(p) * q) + 1, o: base, f: () => canonSys(S.map(L => zoomLine(L, p, q))) });
  for (let ax = 0; ax < 4; ax++) out.push({ id: "sys.mirror", choice: 2, o: base, f: () => canonSys(S.map(L => mirror(L, ax))) });
  return out;
}
function fee(call) { return call.size ? (call.o + 1) * call.size * (RATE / (Math.log2(M_COUNT) + 1)) + 0 : call.factor ? call.o + FACTOR_RATE * (call.factor - 1) + 1 : call.o + (call.choice || 0); }
function neighbours(S) {
  const p0 = phi(S), key0 = sysKey(S), out = [];
  for (const c of calls(S)) { const T = c.f(); if (!T) continue; if (sysKey(T) === key0) continue; const p1 = phi(T); out.push({ T, id: c.id, w: fee(c) + Math.max(0, p1 - p0), base: fee(c) }); }
  return out;
}

// ---------- reporting helpers ----------
const fmt = (x, d = 1) => Number.isFinite(x) ? x.toFixed(d) : String(x);
const out = [];
const log = s => { out.push(s); console.log(s); };
function corr(xs, ys) { const n = xs.length; if (n < 3) return NaN; const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sx * sy); }
const show = S => S.map(L => `${L[0]}x${L[1] >= 0 ? "+" : ""}${L[1]}y${L[2] >= 0 ? "+" : ""}${L[2]}=0`).join(" ; ");

// ---------- parts ----------
function partLaw() {
  log("\n## Law: concentration (π ∝ 2^−φ on systems of distinct lines over Q, box 10^4)");
  // Collision probability of one line: Σ π(L)² by draws (estimate E[π(L)] under π = Σπ²).
  reseed(11);
  for (const k of [1, 2, 3]) {
    const n = 200000; const seen = new Map(); let phis = [];
    for (let i = 0; i < n; i++) { const S = k === 1 ? [drawSystem(1, 0)[0]] : drawSystem(k, 0); const key = sysKey(S); seen.set(key, (seen.get(key) || 0) + 1); phis.push(phi(S)); }
    let coll = 0; for (const c of seen.values()) coll += c * (c - 1); coll /= n * (n - 1);
    phis.sort((a, b) => a - b);
    log(`k = ${k}: Σπ² ≈ ${coll.toExponential(2)} (collision entropy ${fmt(-Math.log2(coll))} bits); distinct in ${n} draws: ${seen.size}; φ median ${fmt(phis[n >> 1])}, 90% ${fmt(phis[Math.floor(n * 0.9)])}, 99% ${fmt(phis[Math.floor(n * 0.99)])}`);
  }
}

function partReach() {
  log("\n## Reach: states within a fee budget from a birth (cheapest paths over the generated calls)");
  reseed(21);
  for (const k of [2, 3]) {
    for (let b = 0; b < 3; b++) {
      const S0 = drawSystem(k, 0); const budgets = [15, 25, 35];
      const dist = new Map([[sysKey(S0), 0]]); const MAXN = QUICK ? 30000 : 150000; const Bmax = budgets[budgets.length - 1];
      const heap = [[0, S0]]; const push = x => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
      let settled = 0;
      while (heap.length && settled < MAXN) {
        const [d, S] = pop(); if (d > dist.get(sysKey(S))) continue; settled++;
        for (const nb of neighbours(S)) { const nd = d + nb.w, kk = sysKey(nb.T); if (nd <= Bmax && (!dist.has(kk) || nd < dist.get(kk))) { dist.set(kk, nd); push([nd, nb.T]); } }
      }
      const counts = budgets.map(B => [...dist.values()].filter(d => d <= B).length);
      log(`k = ${k}, birth ${show(S0)} (φ ${fmt(phi(S0))}): ${budgets.map((B, i) => `≤ ${B} bits: ${counts[i]}${settled >= MAXN && i === budgets.length - 1 ? "+" : ""}`).join(", ")}`);
    }
  }
}

let V2 = null, V3 = null;
function values() {
  if (!V2) { reseed(31); const n = QUICK ? 60000 : 240000; const t = Date.now(); V2 = buildValues(2, n); V3 = buildValues(3, n); log(`\n(values from ${n} weighted draws per size, tilts ${TILTS.join(", ")}; ${((Date.now() - t) / 1000).toFixed(0)} s)`); }
}
function partValues() {
  values();
  for (const [k, V] of [[2, V2], [3, V3]]) {
    log(`\n## Values: ${k} lines (bits = −log2 π{score ≥ s}); certified top = the 30th best draw`);
    log("| Rule | P(primary undefined) | bits at primary top (any secondary) | certified top bits | tail corr(bits, φ) | tail draws |");
    log("|---|--:|--:|--:|--:|--:|");
    for (const r of V.rules) {
      const tab = V.tables.get(r.id);
      const undef = tab.sc.filter(x => x.s === null).reduce((a, x) => a + x.w, 0);
      const topP = tab.sc[0].s ? tab.sc[0].s[0] : null;
      // bits of reaching the primary's best seen value with the worst secondary
      const atTop = topP === null ? NaN : valueOf(tab, [topP, -Infinity]);
      const tail = []; for (let i = 0; i < tab.sc.length; i++) if (tab.bitsAt[i] >= 8) tail.push(i);
      const c = corr(tail.map(i => tab.bitsAt[i]), tail.map(i => tab.sc[i].phi));
      log(`| ${r.id} | ${fmt(undef, 3)} | ${fmt(atTop)} | ${fmt(tab.certBits)} | ${fmt(c, 2)} | ${tail.length} |`);
    }
  }
}

// Annealing with rule knowledge on a table, inside the window φ ≤ W, from a birth; returns the best state found.
function tableF(V, rules, S) { const e = V.el(S); const n = rules.map(r => valueOf(V.tables.get(r.id), r.score(S, e))); let F = 0; for (let i = 0; i < n.length; i++) for (let j = 0; j < n.length; j++) if (i !== j) F += n[i] * n[j]; return { F, n }; }
function anneal(V, rules, S0, W, evals, seed) {
  reseed(seed); let S = S0, cur = tableF(V, rules, S).F, best = { S, F: cur }; let used = 0;
  while (used < evals) {
    const nbs = calls(S); const c = pick(nbs); const T = c.f(); used++;
    if (!T || phi(T) > W) continue;
    const f = tableF(V, rules, T).F; const temp = Math.max(0.5, 60 * (1 - used / evals));
    if (f >= cur || rnd() < Math.exp((f - cur) / temp)) { S = T; cur = f; if (f > best.F) best = { S: T, F: f }; }
  }
  return best;
}

function tables(k, V, count, size) {
  const fams = k === 2 ? FAM2 : FAM3; const ts = [];
  reseed(41 + k + size);
  for (let t = 0; t < count; t++) {
    const fs = fams.slice().sort(() => rnd() - 0.5).slice(0, size);
    ts.push(fs.map(f => { const id = `${f.id}/${pick(f.secs)}`; return V.rules.find(r => r.id === id); }));
  }
  return ts;
}

function partRamp() {
  values();
  log("\n## Ramp test (collapse test 1): each rule's best bits found by annealing in a φ-window W and 2W");
  for (const [k, V, W] of [[2, V2, 50], [3, V3, 75]]) {
    log(`\n${k} lines, W = ${W} bits of read length (births: median φ ${k === 2 ? "≈ 24" : "≈ 36"})`);
    log("| Rule | best bits in W (primary, secondary) | best bits in 2W | grew > 10% | past the draws |");
    log("|---|--:|--:|:-:|:-:|");
    let ramps = 0;
    for (const r of V.rules) {
      const res = []; const starts = [];
      for (const [wi, w] of [W, 2 * W].entries()) { let b = -1, beyond = false, bS = null; for (let s = 0; s < 3; s++) { reseed(500 + s); const S0 = wi === 0 ? drawSystem(k, 0) : starts[s]; const best = annealSingle(V, r, S0, w, QUICK ? 1500 : 5000, 900 + s + wi); if (wi === 0) starts.push(best.S); if (best.bits > b) { b = best.bits; bS = best.S; beyond = best.beyond; } } res.push({ b, beyond, bS }); }
      const grew = res[1].b > 1.1 * res[0].b; if (grew) ramps++;
      const sc = res.map(x => r.score(x.bS, V.el(x.bS))); const sgrew = sc[1] && sc[0] && cmpScore(sc[1], sc[0]) > 0 && sc[1][0] === sc[0][0] && sc[1][1] > sc[0][1];
      log(`| ${r.id} | ${fmt(res[0].b)} (${sc[0] ? fmt(sc[0][0], 2) + ", " + sc[0][1] : "–"}) | ${fmt(res[1].b)} (${sc[1] ? fmt(sc[1][0], 2) + ", " + sc[1][1] : "–"}) | ${grew ? "yes" : "no"} | ${res[0].beyond || res[1].beyond ? "yes" : ""} |`);
    }
    log(`Rules whose best grew by more than 10% from W to 2W: ${ramps} of ${V.rules.length}.`);
  }
}
function annealSingle(V, r, S0, W, evals, seed) {
  reseed(seed); const tab = V.tables.get(r.id); const val = S => valueOf(tab, r.score(S, V.el(S)));
  let S = S0, cur = val(S), best = { S, bits: cur };
  for (let u = 0; u < evals; u++) {
    const c = pick(calls(S)); const T = c.f(); if (!T || phi(T) > W) continue;
    const f = val(T); const temp = Math.max(0.2, 6 * (1 - u / evals));
    if (f >= cur || rnd() < Math.exp((f - cur) / temp)) { S = T; cur = f; if (f > best.bits) best = { S: T, bits: f }; }
  }
  best.beyond = best.bits > tab.certBits; return best;
}

function partEntangle() {
  values();
  for (const [k, V] of [[2, V2], [3, V3]]) {
    const fams = k === 2 ? FAM2 : FAM3;
    const rules = fams.map(f => V.rules.find(r => r.id === `${f.id}/${f.secs[0]}`));
    reseed(61 + k);
    const states = []; for (let i = 0; i < (QUICK ? 300 : 1200); i++) states.push(drawSystem(k, i % 2 ? 0 : 2));
    const n = rules.length; const dA = rules.map(() => []);
    for (const S of states) {
      const nb = neighbours(S); if (!nb.length) continue; const m = pick(nb);
      const before = tableNs(V, rules, S), after = tableNs(V, rules, m.T);
      for (let i = 0; i < n; i++) dA[i].push(after[i] - before[i]);
    }
    log(`\n## Entanglement, ${k} lines: for a random priced move from a law-drawn state, P(rule B's bits change | rule A's change) and the correlation of the two changes`);
    log("(rows A, columns B; each family with its first secondary; states drawn half from π, half from a flatter tilt so values are not all 0)");
    log(`| A \\ B | ${rules.map(r => r.fam).join(" | ")} |`); log(`|---|${rules.map(() => "--:").join("|")}|`);
    for (let a = 0; a < n; a++) {
      const row = rules.map((_, b) => { if (a === b) return "—"; let ca = 0, cb = 0; for (let t = 0; t < dA[a].length; t++) if (Math.abs(dA[a][t]) > 1e-9) { ca++; if (Math.abs(dA[b][t]) > 1e-9) cb++; } const c = corr(dA[a], dA[b]); return `${ca ? fmt(cb / ca, 2) : "–"} (${fmt(c, 2)})`; });
      log(`| ${rules[a].fam} | ${row.join(" | ")} |`);
    }
  }
}
function tableNs(V, rules, S) { const e = V.el(S); return rules.map(r => valueOf(V.tables.get(r.id), r.score(S, e))); }

// Scripted climbers: seats take turns; a seat picks, over every object and every generated call, the move with the best
// rise in its own points per bit of fee (points: own bits × the others' bits, summed over objects), if positive. Objects
// are unique. Reports dynamics.
function partClimb() {
  values();
  for (const [k, V] of [[2, V2], [3, V3]]) {
    log(`\n## Scripted climbers, ${k} lines: 8 tables of 3 seats, 8 objects, each seat 400 bits of fees`);
    log("| Table | moves | shared (≥ 2 seats rise) | collateral (another seat falls) | objects moved in last third | frozen at end | distinct final states | table F start → end |");
    log("|---|--:|--:|--:|--:|--:|--:|---|");
    const tbls = tables(k, V, QUICK ? 3 : 8, 3);
    let ti = 0;
    for (const rules of tbls) {
      reseed(700 + ti);
      const objs = []; const keys = new Set(); while (objs.length < 8) { const S = drawSystem(k, 0); const kk = sysKey(S); if (!keys.has(kk)) { keys.add(kk); objs.push(S); } }
      const F0 = objs.reduce((a, S) => a + tableF(V, rules, S).F, 0);
      const budget = rules.map(() => 400); let moves = 0, shared = 0, coll = 0; const movedAt = [];
      let rounds = 0;
      for (;;) {
        let any = false;
        for (let s = 0; s < rules.length; s++) {
          if (budget[s] <= 0) continue;
          let best = null;
          for (let o = 0; o < objs.length; o++) {
            const n0 = tableNs(V, rules, objs[o]); const pts0 = n0[s] * (n0.reduce((a, b) => a + b) - n0[s]) + n0[s];
            for (const nb of neighbours(objs[o])) {
              if (nb.w > budget[s]) continue; const kk = sysKey(nb.T); if (keys.has(kk)) continue;
              const n1 = tableNs(V, rules, nb.T); const pts1 = n1[s] * (n1.reduce((a, b) => a + b) - n1[s]) + n1[s];
              const gain = (pts1 - pts0) / nb.w;
              if (gain > 1e-9 && (!best || gain > best.gain)) best = { gain, o, nb, n0, n1 };
            }
          }
          if (!best) continue;
          any = true; budget[s] -= best.nb.w; moves++;
          keys.delete(sysKey(objs[best.o])); objs[best.o] = best.nb.T; keys.add(sysKey(best.nb.T));
          let rise = 0, fall = 0; for (let j = 0; j < rules.length; j++) { if (best.n1[j] > best.n0[j] + 1e-9) rise++; if (j !== s && best.n1[j] < best.n0[j] - 1e-9) fall++; }
          if (rise >= 2) shared++; if (fall) coll++; movedAt.push(best.o);
        }
        rounds++; if (!any || rounds > 200) break;
      }
      const last = new Set(movedAt.slice(Math.floor(movedAt.length * 2 / 3))).size;
      // frozen: no improving move for any seat on that object (budget ignored)
      let frozen = 0; for (const S of objs) { const n0 = tableNs(V, rules, S); let improv = false; for (const nb of neighbours(S)) { const n1 = tableNs(V, rules, nb.T); if (n1.some((x, j) => x > n0[j] + 1e-9)) { improv = true; break; } } if (!improv) frozen++; }
      const F1 = objs.reduce((a, S) => a + tableF(V, rules, S).F, 0);
      log(`| ${rules.map(r => r.id).join(", ")} | ${moves} | ${moves ? fmt(100 * shared / moves, 0) : 0}% | ${moves ? fmt(100 * coll / moves, 0) : 0}% | ${last} of 8 | ${frozen} of 8 | ${keys.size} | ${fmt(F0, 0)} → ${fmt(F1, 0)} |`);
      ti++;
    }
  }
}

// Collapse test 2 and 3: a searcher that knows the rules, cheap (B evaluations) against a reference (10 runs × 10B),
// inside the window; then the best distinct states, printed so the closed form (if any) can be read off.
const REFS = new Map();
function partSearch() {
  values();
  for (const [k, V, W] of [[2, V2, 50], [3, V3, 75]]) {
    log(`\n## Search, ${k} lines (window φ ≤ ${W}): cheap search (B evaluations, 1 run) against a reference (10 runs × 10B)`);
    const B = QUICK ? 2000 : 5000;
    log(`B = ${B}. Each table is 3–4 rules; F = Σ_i n_i Σ_{j≠i} n_j on one object.`);
    log("| Table | cheap F (median of 5 births) | reference F | cheap/reference | reference states agree? | best state |");
    log("|---|--:|--:|--:|---|---|");
    const tbls = [...tables(k, V, QUICK ? 2 : 5, 3), ...tables(k, V, QUICK ? 1 : 3, 4)];
    for (const rules of tbls) {
      reseed(800);
      const births = []; for (let i = 0; i < 5; i++) births.push(drawSystem(k, 0));
      const cheap = births.map((S, i) => anneal(V, rules, S, W, B, 1000 + i).F).sort((a, b) => a - b)[2];
      const refs = []; for (let r = 0; r < 10; r++) refs.push(anneal(V, rules, births[r % 5], W, 10 * B, 2000 + r)); REFS.set(rules.map(r => r.id).join(), refs.reduce((a, x) => x.F > a.F ? x : a));
      refs.sort((a, b) => b.F - a.F);
      const keysTop = new Set(refs.slice(0, 5).map(x => sysKey(x.S)));
      log(`| ${rules.map(r => r.id).join(", ")} | ${fmt(cheap, 0)} | ${fmt(refs[0].F, 0)} | ${fmt(cheap / refs[0].F, 2)} | ${keysTop.size} distinct among the 5 best runs (F ${refs.slice(0, 5).map(x => fmt(x.F, 0)).join(", ")}) | ${show(refs[0].S)} (bits ${tableF(V, rules, refs[0].S).n.map(x => fmt(x)).join(", ")}) |`);
    }
  }
}

// The one-sentence attack: a reasoner who knows the rules does not search blindly; it writes down a structured family
// ("lines through one peg", "a triangle with corners on pegs", "three lines through one peg") and takes the best member.
// If a family that small beats the blind reference search, a sentence solves the table.
function sentenceFamilies(k, W) {
  const fams = {};
  if (k === 2) {
    const normals = []; for (let a = -10; a <= 10; a++) for (let b = 0; b <= 10; b++) if ((b > 0 || a > 0) && gcd(a, b) === 1) normals.push([a, b]);
    const S = []; for (let qx = -3; qx <= 3; qx++) for (let qy = -3; qy <= 3; qy++) for (let i = 0; i < normals.length; i++) for (let j = i + 1; j < normals.length; j++) {
      const [a1, b1] = normals[i], [a2, b2] = normals[j];
      const T = canonSys([canonLine(a1, b1, -(a1 * qx + b1 * qy)), canonLine(a2, b2, -(a2 * qx + b2 * qy))]); if (T && phi(T) <= W) S.push(T);
    }
    fams["two lines through one peg (|x|, |y| ≤ 3; normals ≤ 10)"] = S;
  } else {
    const pts = []; for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) pts.push([x, y]);
    const lineThrough = (P, Q) => canonLine(P[1] - Q[1], Q[0] - P[0], -((P[1] - Q[1]) * P[0] + (Q[0] - P[0]) * P[1]));
    const tri = []; reseed(77);
    for (let n = 0; n < (QUICK ? 30000 : 150000); n++) { const A = pick(pts), B = pick(pts), C = pick(pts); if ((B[0] - A[0]) * (C[1] - A[1]) === (B[1] - A[1]) * (C[0] - A[0])) continue; const T = canonSys([lineThrough(A, B), lineThrough(B, C), lineThrough(A, C)]); if (T && phi(T) <= W) tri.push(T); }
    fams["a triangle with corners on pegs (|x|, |y| ≤ 5)"] = tri;
    const normals = []; for (let a = -6; a <= 6; a++) for (let b = 0; b <= 6; b++) if ((b > 0 || a > 0) && gcd(a, b) === 1) normals.push([a, b]);
    const conc = []; for (let n = 0; n < (QUICK ? 30000 : 150000); n++) { const qx = Math.floor(rnd() * 7) - 3, qy = Math.floor(rnd() * 7) - 3; const L = [pick(normals), pick(normals), pick(normals)].map(([a, b]) => canonLine(a, b, -(a * qx + b * qy))); const T = canonSys(L); if (T && phi(T) <= W) conc.push(T); }
    fams["three lines through one peg (normals ≤ 6)"] = conc;
  }
  return fams;
}
function partSentence() {
  values();
  for (const [k, V, W] of [[2, V2, 50], [3, V3, 75]]) {
    const fams = sentenceFamilies(k, W);
    log(`\n## The one-sentence attack, ${k} lines (window φ ≤ ${W}): the best member of a structured family against the blind reference search`);
    log(`Families: ${Object.entries(fams).map(([n, S]) => `${n}: ${S.length} states`).join("; ")}.`);
    log("| Table | reference search F | best family member F | family / reference | best member |");
    log("|---|--:|--:|--:|---|");
    const tbls = [...tables(k, V, QUICK ? 2 : 5, 3), ...tables(k, V, QUICK ? 1 : 3, 4)];
    for (const rules of tbls) {
      reseed(800); const births = []; for (let i = 0; i < 5; i++) births.push(drawSystem(k, 0));
      const B = QUICK ? 2000 : 5000; let ref = REFS.get(rules.map(r => r.id).join()) || { F: -1 }; if (ref.F < 0) for (let r = 0; r < 10; r++) { const x = anneal(V, rules, births[r % 5], W, 10 * B, 2000 + r); if (x.F > ref.F) ref = x; }
      let best = { F: -1 }, bestName = "";
      for (const [name, S] of Object.entries(fams)) for (const T of S) { const f = tableF(V, rules, T).F; if (f > best.F) { best = { F: f, S: T }; bestName = name; } }
      log(`| ${rules.map(r => r.id).join(", ")} | ${fmt(ref.F, 0)} | ${fmt(best.F, 0)} | ${fmt(best.F / ref.F, 2)} | ${show(best.S)} (${bestName.split(" (")[0]}; bits ${tableF(V, rules, best.S).n.map(x => fmt(x)).join(", ")}) |`);
    }
  }
}

// Alignment and tension, pair by pair and per mutator (decision 30): for two rules A and B, over moves from states where
// A is at least at its median, how often a move that RAISES A raises, lowers or leaves B. Each family with its first
// secondary. Moves are grouped by mutator id.
function partTension() {
  values();
  for (const [k, V] of [[2, V2], [3, V3]]) {
    const fams = k === 2 ? FAM2 : FAM3;
    const rules = fams.map(f => V.rules.find(r => r.id === `${f.id}/${f.secs[0]}`));
    reseed(91 + k);
    const states = []; for (let i = 0; i < (QUICK ? 400 : 1500); i++) states.push(drawSystem(k, i % 2 ? 0 : 2));
    const n = rules.length; const cnt = {}; // cnt[a][b] = {up, down, same}; perMut[id][a][b]
    const perMut = {};
    for (const S of states) {
      const n0 = tableNs(V, rules, S);
      for (const nb of neighbours(S)) {
        const n1 = tableNs(V, rules, nb.T);
        for (let a = 0; a < n; a++) { if (!(n1[a] > n0[a] + 1e-9)) continue;
          for (let b = 0; b < n; b++) { if (a === b) continue;
            const r = n1[b] > n0[b] + 1e-9 ? 0 : n1[b] < n0[b] - 1e-9 ? 1 : 2;
            const key = a + "," + b; (cnt[key] ??= [0, 0, 0])[r]++;
            ((perMut[nb.id] ??= {})[key] ??= [0, 0, 0])[r]++; } }
      }
    }
    log(`\n## Alignment and tension, ${k} lines: when a move raises A (row), the share of those moves that raise / lower / leave B (column), as up/down/same %`);
    log(`| A \\ B | ${rules.map(r => r.fam).join(" | ")} |`); log(`|---|${rules.map(() => ":-:").join("|")}|`);
    const verdict = [];
    for (let a = 0; a < n; a++) {
      log(`| ${rules[a].fam} | ${rules.map((_, b) => { if (a === b) return "—"; const c = cnt[a + "," + b]; if (!c) return "–"; const t = c[0] + c[1] + c[2]; const u = c[0] / t, d = c[1] / t; if (a < b) verdict.push({ a, b, u, d }); return `${Math.round(100 * u)}/${Math.round(100 * d)}/${Math.round(100 * (1 - u - d))}`; }).join(" | ")} |`);
    }
    const cls = v => v.u > 1.5 * v.d && v.u > 0.3 ? "aligned" : v.d > 1.5 * v.u && v.d > 0.3 ? "tension" : (v.u + v.d) < 0.4 ? "neutral" : "mixed";
    const tally = {}; for (const v of verdict) tally[cls(v)] = (tally[cls(v)] || 0) + 1;
    log(`Pairs (A before B): ${Object.entries(tally).map(([c, x]) => `${x} ${c}`).join(", ")} (aligned: up > 1.5 × down and up > 30%; tension: the reverse; neutral: fewer than 40% change B).`);
    // per mutator: averaged over pairs, the up/down/same shares
    log(`\nPer mutator, over all ordered pairs (a move that raises A: share that raises / lowers / leaves B):`);
    log("| Mutator | up | down | same | moves that raised some rule |"); log("|---|--:|--:|--:|--:|");
    for (const [id, m] of Object.entries(perMut).sort()) { let t = [0, 0, 0]; for (const c of Object.values(m)) for (let i = 0; i < 3; i++) t[i] += c[i]; const T = t[0] + t[1] + t[2]; log(`| ${id} | ${Math.round(100 * t[0] / T)}% | ${Math.round(100 * t[1] / T)}% | ${Math.round(100 * t[2] / T)}% | ${T} |`); }
  }
}

const t0 = Date.now();
if (want("law")) partLaw();
if (want("reach")) partReach();
if (want("values")) partValues();
if (want("ramp")) partRamp();
if (want("entangle")) partEntangle();
if (want("climb")) partClimb();
if (want("search")) partSearch();
if (want("sentence")) partSentence();
if (want("tension")) partTension();
log(`\n(total ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
if (args.includes("--write")) { const fs = await import("node:fs"); fs.writeFileSync(new URL("./multi-line-systems-A-results.md", import.meta.url), "# Results: multi-line-systems-A.mjs\n\nGenerated by `node docs/engine-v2/scripts/multi-line-systems-A.mjs --write`.\n" + out.join("\n") + "\n"); }
