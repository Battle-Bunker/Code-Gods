// Systems of two lines: the synthesis of designs A and B (docs/engine-v2/two-line-systems.md).
// Self-contained: it does not import the engine. The law, the draws, the value tables, the annealer, the climbers and
// the sentence attack are design A's (multi-line-systems-A.mjs), restricted to two lines; the joint-hill adversary test
// is design B's (multi-line-systems-B.mjs §8.3); the pool, the mutator set and the extra sentences are this design's.
//   node --max-old-space-size=6500 docs/engine-v2/scripts/two-line-systems.mjs [--part p,q,…] [--quick] [--write] [--pool v1…v6|v6-dealt] [--deal random|guard]
// Parts: law, values, ramp, entangle, adversary, climb, search, sentence, all (default).
// The object: two distinct lines over Q, each the primitive triple (a, b, c) of a·x + b·y + c = 0 with b > 0, or b = 0
// and a > 0, held as an unordered set (canonical order: sorted by triple). Law π ∝ 2^−φ, φ = Σ mixedInt of the six
// integers (spec §2.5), box |a|, |b|, |c| ≤ CAP. Prices follow spec §12.4 approximately (A's scheme).

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

// ---------- two-line elements ----------
// D the determinant, dot the normals' dot product, P = (Nx/D, Ny/D) the answer; per line m (gradient), c (y-intercept),
// r (x-intercept), each null where the line has none; s the steeper line (a vertical line is steepest; ties: the first).
function sys2(S) {
  const p = pair(S[0], S[1]);
  const e = { ...p, P: p.D !== 0 ? [p.Nx / p.D, p.Ny / p.D] : null };
  if (p.D !== 0) { e.X = Math.round(p.Nx / p.D); e.Y = Math.round(p.Ny / p.D); e.taxi = Math.abs(e.X) + Math.abs(e.Y); }
  const steep = L => L[1] === 0 ? Infinity : Math.abs(L[0] / L[1]);
  e.s = steep(S[1]) > steep(S[0]) ? 1 : 0; e.o = 1 - e.s;
  // the y-intercepts' gap (whole number nearest it), when both lines meet the y-axis once
  e.gap = S[0][1] && S[1][1] ? Math.round(Math.abs(-S[0][2] / S[0][1] + S[1][2] / S[1][1])) : null;
  return e;
}
const near = x => Math.round(x);

// ---------- the pool ----------
// A rule maps a system to [primary, secondary] (bigger better) or null (undefined: worst). Primaries are kid-readable
// distances to an exact condition (closer better). Each secondary reads the primary's ANCHOR (decision 29) and relates
// it to itself or to another aspect; every one is unbounded (decisions 26, 30). Senses: big, small (as negative as
// possible), smooth (many prime factors), prime (a big smallest prime factor), shared (a big common factor).
const omega = n => { n = Math.abs(n); if (n < 2) return 0; let c = 0; for (const p of PRIMES) { if (p * p > n) break; while (n % p === 0) { c++; n /= p; } } return n > 1 ? c + 1 : c; };
const gcd0 = (a, b) => (!a || !b) ? 0 : gcd(a, b);
const fd = fracDist;
const flo = x => Math.floor(Math.abs(x));
const POOL = args.includes("--pool") ? args[args.indexOf("--pool") + 1] : "v6";
// v2 (this design): positional anchors get "prime" hills (a big smallest prime factor) beside the smooth and shared
// ones, so a smooth scale-up of the picture (every position × a smooth n) no longer feeds most of a table at once.
const V2SECS = {
  "on-the-diagonal": { "diagonal-prime": [(S, e) => spf(e.X), "prime"] },
  "gap-match": { "gap-prime": [(S, e) => spf(e.gap), "prime"] },
  "far-crossing": { "far-prime": [(S, e) => spf(near(-S[e.s][2] / S[e.s][0])), "prime"] },
  "steep-ratio": { "ratio-prime": [(S, e) => { const [Ls, Lo] = [S[e.s], S[e.o]]; return spf(ratioK((Ls[0] * Lo[1]) / (Lo[0] * Ls[1]))); }, "prime"] },
};
const V2DROP = { "on-the-diagonal": "diagonal-gradient", "gap-match": "gap-divisor", "far-crossing": "crossing-share", "steep-ratio": "ratio-factors" };
const FAMS0 = [
  { id: "whole-answer", aspect: "crossing", anchor: "the answer's peg (X, Y)",
    p: (S, e) => e.D ? -(fd(e.Nx, e.D) + fd(e.Ny, e.D)) : null,
    secs: { "peg-divisor": [(S, e) => gcd0(e.taxi, e.D), "shared"], "south-west": [(S, e) => -(e.X + e.Y), "small"] } },
  { id: "no-fractions", aspect: "divisor", anchor: "the answer's peg, |X| + |Y|",
    p: (S, e) => e.D ? -(Math.abs(e.D) - 1) : null,
    secs: { "answer-prime": [(S, e) => spf(e.taxi), "prime"], "answer-factors": [(S, e) => omega(e.taxi), "smooth"] } },
  { id: "right-angle", aspect: "angle", anchor: "the divisor D",
    p: (S, e) => e.D ? -Math.abs(e.dot) / Math.abs(e.D) : null,
    secs: { "prime-divisor": [(S, e) => spf(e.D), "prime"], "divisor-meets-answer": [(S, e) => gcd0(e.D, e.taxi), "shared"] } },
  { id: "forty-five", aspect: "angle", anchor: "the divisor D",
    p: (S, e) => (e.D || e.dot) ? -Math.abs(Math.abs(e.D) - Math.abs(e.dot)) / (Math.abs(e.D) + Math.abs(e.dot)) : null,
    secs: { "smooth-divisor": [(S, e) => omega(e.D), "smooth"], "divisor-gap": [(S, e) => gcd0(e.D, e.gap), "shared"] } },
  { id: "on-the-diagonal", aspect: "crossing", anchor: "t, the whole number nearest the crossing's x",
    p: (S, e) => e.D ? -Math.abs(e.Nx - e.Ny) / Math.abs(e.D) : null,
    secs: { "north-east": [(S, e) => e.X, "big"], "diagonal-gradient": [(S, e) => S[e.s][1] ? gcd0(e.X, flo(S[e.s][0] / S[e.s][1])) : 0, "shared"] } },
  { id: "gap-match", aspect: "intercepts", anchor: "g, the y-intercepts' gap",
    p: (S, e) => S.every(L => L[0] && L[1]) ? -Math.abs(Math.abs(S[0][2] / S[0][1] - S[1][2] / S[1][1]) - Math.abs(S[0][2] / S[0][0] - S[1][2] / S[1][0])) : null,
    secs: { "gap-factors": [(S, e) => omega(e.gap), "smooth"], "gap-divisor": [(S, e) => gcd0(e.gap, e.D), "shared"] } },
  { id: "far-crossing", aspect: "steeper line", anchor: "r, the steeper line's x-intercept",
    p: (S, e) => S[e.s][0] ? -fd(-S[e.s][2], S[e.s][0]) : null,
    secs: { "far-right": [(S, e) => near(-S[e.s][2] / S[e.s][0]), "big"], "crossing-share": [(S, e) => S[e.s][1] ? gcd0(near(-S[e.s][2] / S[e.s][0]), near(-S[e.s][2] / S[e.s][1])) : 0, "shared"] } },
  { id: "high-start", aspect: "steeper line", anchor: "h, the steeper line's y-intercept",
    p: (S, e) => S[e.s][1] ? -fd(-S[e.s][2], S[e.s][1]) : null,
    secs: { "steep-and-high": [(S, e) => Math.min(near(-S[e.s][2] / S[e.s][1]), Math.floor(-S[e.s][0] / S[e.s][1])), "big"], "start-factors": [(S, e) => omega(gcd0(near(-S[e.s][2] / S[e.s][1]), e.D)), "smooth"] } },
  { id: "steep-ratio", aspect: "gradients", anchor: "k, the whole number of times",
    p: (S, e) => { const [Ls, Lo] = [S[e.s], S[e.o]]; if (!Ls[1] || !Lo[1] || !Lo[0]) return null; const rho = (Ls[0] * Lo[1]) / (Lo[0] * Ls[1]); return -Math.abs(rho - ratioK(rho)); },
    secs: { "ratio-gap": [(S, e) => { const [Ls, Lo] = [S[e.s], S[e.o]]; return gcd0(ratioK((Ls[0] * Lo[1]) / (Lo[0] * Ls[1])), e.gap); }, "shared"], "ratio-factors": [(S, e) => { const [Ls, Lo] = [S[e.s], S[e.o]]; return omega(ratioK((Ls[0] * Lo[1]) / (Lo[0] * Ls[1]))); }, "smooth"] } },
];
// v3 (this design, adopted): under a zoom of the picture by n (every position × n; gradients, D and the angle kept) only
// three hills grow (south-west, north-east, far-right), each with a direct opposite; every other secondary is capped by
// a zoom-invariant number (D or a gradient) or is a prime hill that a smooth zoom lowers.
const V3SECS = {
  "no-fractions": { "answer-gradient": [(S, e) => S[e.s][1] ? gcd0(e.taxi, flo(S[e.s][0] / S[e.s][1])) : 0, "shared"] },
  "gap-match": { "gap-divisor": [(S, e) => gcd0(e.gap, e.D), "shared"] },
};
const V3DROP = { "no-fractions": "answer-factors", "gap-match": "gap-factors" };
const swapSecs = (fs, add, drop) => fs.map(f => add[f.id] ? { ...f, secs: Object.fromEntries([...Object.entries(f.secs).filter(([k]) => k !== drop[f.id]), ...Object.entries(add[f.id])]) } : f);
const FAMS2 = swapSecs(FAMS0, V2SECS, V2DROP);
const FAMS3 = swapSecs(FAMS2, V3SECS, V3DROP);
// v4 (this design, adopted): every anchor is a whole number at its primary's top (A's definition), so a prime hill is
// never a rounded rational that is prime by luck; and no two families share a secondary.
const V4P = {
  "on-the-diagonal": (S, e) => e.D ? -(Math.abs(e.Nx - e.Ny) / Math.abs(e.D) + fd(e.Nx, e.D)) : null,
  "gap-match": (S, e) => S.every(L => L[0] && L[1]) ? -(Math.abs(Math.abs(S[0][2] / S[0][1] - S[1][2] / S[1][1]) - Math.abs(S[0][2] / S[0][0] - S[1][2] / S[1][0])) + fracDistX(Math.abs(S[0][2] / S[0][1] - S[1][2] / S[1][1]))) : null,
};
const fracDistX = x => { const r = Math.abs(x - Math.round(x)); return r < 1e-9 ? 0 : r; };
const V4SECS = { "right-angle": { "divisor-intercept": [(S, e) => S[e.s][1] ? gcd0(e.D, near(-S[e.s][2] / S[e.s][1])) : 0, "shared"] } };
const V4DROP = { "right-angle": "divisor-meets-answer" };
const FAMS4 = swapSecs(FAMS3, V4SECS, V4DROP).map(f => V4P[f.id] ? { ...f, p: V4P[f.id] } : f);
// v5 (this design, adopted): Gap Match's "equal gaps" is met by every pair symmetric about y = x (which also crosses on
// the diagonal), so it becomes Double Gap: the y-intercepts' gap is a whole number and twice the x-intercepts' gap.
const ygapOf = S => Math.abs(S[0][2] / S[0][1] - S[1][2] / S[1][1]), xgapOf = S => Math.abs(S[0][2] / S[0][0] - S[1][2] / S[1][0]);
const FAMS5 = FAMS4.map(f => f.id === "gap-match" ? { ...f, id: "double-gap", p: (S, e) => S.every(L => L[0] && L[1]) ? -(Math.abs(ygapOf(S) - 2 * xgapOf(S)) + fracDistX(ygapOf(S))) : null } : f);
// v6 (this design, adopted): a primary may not be met by one line alone. On the Diagonal is undefined when a line IS
// y = x (it would meet every other line on the diagonal); Double Gap is undefined when a line passes through the origin
// (both its intercepts 0: y = x and y = 2x + c would meet it for every c).
const isDiag = L => L[0] === -1 && L[1] === 1 && L[2] === 0;
const FAMS6 = FAMS5.map(f => f.id === "on-the-diagonal" ? { ...f, p: (S, e) => S.some(isDiag) ? null : V4P["on-the-diagonal"](S, e) }
  : f.id === "double-gap" ? { ...f, p: (S, e) => S.some(L => L[2] === 0) ? null : f.p(S, e) } : f);
// v6-dealt: the pool the preset deals: v6 without On the Diagonal, held back (§5.6: a sentence reaches its hills).
const FAMS = POOL === "v1" ? FAMS0 : POOL === "v2" ? FAMS2 : POOL === "v3" ? FAMS3 : POOL === "v4" ? FAMS4 : POOL === "v5" ? FAMS5 : POOL === "v6-dealt" ? FAMS6.filter(f => f.id !== "on-the-diagonal") : FAMS6;
// The zoom guard (a deal rule this design proposes): under a zoom of the picture by a smooth n > 0 the hills in ZOOM_UP
// grow, by n < 0 those in ZOOM_DOWN, and the prime hills on exact position anchors (ZOOM_HURT) fall. A dealt table seats
// at most one ZOOM_UP hill, and seats a zoom hill only beside an opposite: the other sign, or a ZOOM_HURT hill.
const ZOOM_UP = new Set(["on-the-diagonal/north-east", "far-crossing/far-right"]), ZOOM_DOWN = new Set(["whole-answer/south-west"]);
const ZOOM_HURT = new Set(["no-fractions/answer-prime", "on-the-diagonal/diagonal-prime", "far-crossing/far-prime", "gap-match/gap-prime", "double-gap/gap-prime"]);
function zoomGuard(rules) {
  const up = rules.filter(r => ZOOM_UP.has(r.id)).length, down = rules.filter(r => ZOOM_DOWN.has(r.id)).length, hurt = rules.filter(r => ZOOM_HURT.has(r.id)).length;
  if (up > 1) return false;
  return up + down === 0 || (up > 0 && down > 0) || hurt > 0;
}
function ratioK(rho) { let k = Math.round(rho); if (Math.abs(k) < 2) k = rho < 0 ? -2 : 2; return k; }

function rulesFor() {
  const rules = [];
  for (const f of FAMS) for (const [s, [g, sense]] of Object.entries(f.secs)) rules.push({ id: `${f.id}/${s}`, fam: f.id, sec: s, sense, aspect: f.aspect,
    prim: (S, e) => { const p = f.p(S, e); return p === null || Number.isNaN(p) ? null : p; },
    score: (S, e) => { const p = f.p(S, e); if (p === null || Number.isNaN(p)) return null; const v = g(S, e); return [p, Number.isFinite(v) ? v : 0]; } });
  return { rules, el: sys2 };
}
const cmpScore = (x, y) => x === null ? (y === null ? 0 : -1) : y === null ? 1 : (x[0] - y[0]) || (x[1] - y[1]);
// ---------- value functions by weighted draws (spec §7.0's direct draws, simplified) ----------
function buildValues(n) { const k = 2;
  const { rules, el } = rulesFor();
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

// ---------- mutators and prices (this design's set: the line's nine per line, five pair moves, one translate) ----------
// Each generated call: { id, line, size (amount size) | factor | choice, o (bits before the size), f() → S′ | null }.
// Fee = which + where + choices + RATE·size (amounts) or digits (factors), plus the surcharge max(0, Δφ) (A's scheme).
const RATE = 4.3, FACTOR_RATE = 5.4;
const M_COUNT = 15;
function siShift(L, k) { return L[1] === 0 ? null : canonLine(L[0], L[1], L[2] - k * L[1]); }
function siTilt(L, k) { return L[1] === 0 ? null : canonLine(L[0] - k * L[1], L[1], L[2]); }
function seqStep(L, k) { return L[1] === 0 ? null : canonLine(L[0] - k * L[1], L[1], L[2] + k * L[1]); }
function pivot(L, x0, k) { return L[1] === 0 ? null : canonLine(L[0] - k * L[1], L[1], L[2] - k * x0 * L[1]); }
function nudge(L, w, k) { const M = L.slice(); M[w] += k; if (gcd(gcd(M[0], M[1]), M[2]) !== 1) return null; if (M[1] < 0 || (M[1] === 0 && M[0] <= 0)) return null; return canonLine(...M); }
function stretch(L, p, q) { return L[1] === 0 ? null : canonLine(p * L[0], q * L[1], p * L[2]); }
function mirror(L, ax) { const [a, b, c] = L; return ax === 0 ? canonLine(a, -b, c) : ax === 1 ? canonLine(-a, b, c) : ax === 2 ? canonLine(a, b, -c) : canonLine(b, a, c); }
function slideLine(L, u, v) { return canonLine(L[0], L[1], L[2] - L[0] * u - L[1] * v); }
// pair.combine: L_i += k·L_j (an elimination step), refused when the result is not primitive (both ways).
function combine(Li, Lj, k) { const M = [Li[0] + k * Lj[0], Li[1] + k * Lj[1], Li[2] + k * Lj[2]]; if (M[0] === 0 && M[1] === 0) return null; if (gcd(gcd(M[0], M[1]), M[2]) !== 1) return null; return canonLine(...M); }
// pair.reflect: L_i folded over L_j.
function reflectIn(Li, Lj) { const n = Lj[0] ** 2 + Lj[1] ** 2, d = Li[0] * Lj[0] + Li[1] * Lj[1]; return canonLine(n * Li[0] - 2 * d * Lj[0], n * Li[1] - 2 * d * Lj[1], n * Li[2] - 2 * d * Lj[2]); }
// pair.quarter: the perpendicular to L_i through the crossing.
function perpAt(Li, Lj) { const p = pair(Li, Lj); if (p.D === 0) return null; return canonLine(-Li[1] * p.D, Li[0] * p.D, Li[1] * p.Nx - Li[0] * p.Ny); }
// pair.turn: L_i's gradient += k about the crossing.
function turnAt(Li, Lj, k) { const p = pair(Li, Lj); if (p.D === 0 || Li[1] === 0) return null; return canonLine((Li[0] - k * Li[1]) * p.D, Li[1] * p.D, Li[2] * p.D + k * Li[1] * p.Nx); }
// pair.slide: L_i moves parallel to itself so the crossing moves n primitive steps along L_j.
function slideOn(Li, Lj, n) { const g = gcd(Lj[0], Lj[1]); const dx = n * Lj[1] / g, dy = -n * Lj[0] / g; return canonLine(Li[0], Li[1], Li[2] - Li[0] * dx - Li[1] * dy); }

function calls(S) {
  const out = [], where = 1, base = Math.log2(M_COUNT);
  const rep = (i, L) => { const T = S.slice(); T[i] = L; return canonSys(T); };
  for (let i = 0; i < 2; i++) {
    const L = S[i], Lj = S[1 - i];
    for (const s of [1, -1, 2, -2]) {
      out.push({ id: "si.shift", size: Math.abs(s), o: base + where, f: () => rep(i, siShift(L, s)) });
      out.push({ id: "si.tilt", size: Math.abs(s), o: base + where, f: () => rep(i, siTilt(L, s)) });
      out.push({ id: "seq.step", size: Math.abs(s), o: base + where, f: () => rep(i, seqStep(L, s)) });
      out.push({ id: "pair.combine", size: Math.abs(s), o: base + where, f: () => rep(i, combine(L, Lj, s)) });
      out.push({ id: "pair.slide", size: Math.abs(s), o: base + where, f: () => rep(i, slideOn(L, Lj, s)) });
    }
    for (const x0 of [-2, -1, 1, 2]) for (const s of [1, -1]) out.push({ id: "cart.pivot", size: 1 + Math.abs(x0), o: base + where, f: () => rep(i, pivot(L, x0, s)) });
    for (let w = 0; w < 3; w++) for (const s of [1, -1]) out.push({ id: "gen.nudge", size: 1, o: base + where + Math.log2(3), f: () => rep(i, nudge(L, w, s)) });
    for (const [p, q] of [[2, 1], [1, 2], [3, 1], [1, 3], [-1, 2], [-2, 1]]) out.push({ id: "mach.stretch", factor: Math.log2(Math.abs(p) * q) + 1, o: base + where, f: () => rep(i, stretch(L, p, q)) });
    for (let ax = 0; ax < 4; ax++) out.push({ id: "cart.mirror", choice: 2, o: base + where, f: () => rep(i, mirror(L, ax)) });
    for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.push({ id: "cart.slide", size: 1, o: base + where, f: () => rep(i, slideLine(L, u, v)) });
    for (const s of [1, -1]) out.push({ id: "pair.turn", size: 1, o: base + where, f: () => rep(i, turnAt(L, Lj, s)) });
    out.push({ id: "pair.reflect", choice: 0, o: base + where, f: () => rep(i, reflectIn(L, Lj)) });
    out.push({ id: "pair.quarter", choice: 0, o: base + where, f: () => rep(i, perpAt(L, Lj)) });
  }
  for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) out.push({ id: "sys.translate", size: Math.abs(u) + Math.abs(v), o: base, f: () => canonSys(S.map(L => slideLine(L, u, v))) });
  return out;
}
function fee(call) { return call.size ? (call.o + 1) * call.size * (RATE / (Math.log2(M_COUNT) + 1)) : call.factor ? call.o + FACTOR_RATE * (call.factor - 1) + 1 : call.o + (call.choice || 0); }
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
const drawSys = () => drawSystem(2, 0);

// ---------- parts ----------
function partLaw() {
  log("\n## Law: two distinct lines over Q, π ∝ 2^−φ (box 10^4)");
  reseed(11); const n = 200000; const seen = new Map(); const phis = []; let par = 0;
  for (let i = 0; i < n; i++) { const S = drawSys(); const key = sysKey(S); seen.set(key, (seen.get(key) || 0) + 1); phis.push(phi(S)); if (pair(S[0], S[1]).D === 0) par++; }
  let coll = 0; for (const c of seen.values()) coll += c * (c - 1); coll /= n * (n - 1);
  phis.sort((a, b) => a - b);
  log(`Σπ² ≈ ${coll.toExponential(2)} (collision entropy ${fmt(-Math.log2(coll))} bits); distinct in ${n} draws: ${seen.size}; parallel ${fmt(100 * par / n)}%; φ median ${fmt(phis[n >> 1])}, 90% ${fmt(phis[Math.floor(n * 0.9)])}, 99% ${fmt(phis[Math.floor(n * 0.99)])}`);
}

let V = null;
function values() {
  if (!V) { reseed(31); const n = QUICK ? 60000 : 240000; const t = Date.now(); V = buildValues(n); log(`\n(values from ${n} weighted draws, tilts ${TILTS.join(", ")}; ${((Date.now() - t) / 1000).toFixed(0)} s)`); }
}
function partValues() {
  values();
  log("\n## Values (bits = −log2 π{score ≥ s}); certified top = the 30th best draw");
  log("| Rule | sense | P(primary undefined) | bits at primary top (worst secondary) | certified top bits | tail corr(bits, φ) | tail draws |");
  log("|---|---|--:|--:|--:|--:|--:|");
  for (const r of V.rules) {
    const tab = V.tables.get(r.id);
    const undef = tab.sc.filter(x => x.s === null).reduce((a, x) => a + x.w, 0);
    const topP = tab.sc[0].s ? tab.sc[0].s[0] : null;
    const atTop = topP === null ? NaN : valueOf(tab, [topP, -Infinity]);
    const tail = []; for (let i = 0; i < tab.sc.length; i++) if (tab.bitsAt[i] >= 8) tail.push(i);
    const c = corr(tail.map(i => tab.bitsAt[i]), tail.map(i => tab.sc[i].phi));
    log(`| ${r.id} | ${r.sense} | ${fmt(undef, 3)} | ${fmt(atTop)} | ${fmt(tab.certBits)} | ${fmt(c, 2)} | ${tail.length} |`);
  }
}

// The law's bound (the engine clamps value tails to it, decision 26): π{score ≥ s(S)} ≥ π(S), so bits(S) ≤ −log2 π(S)
// = φ(S) − 1 + log2 A, with A the chance that two raw draws are canonical, different lines (the 1: unordered pairs).
let LOGA = null;
function lawBound(S) {
  if (LOGA === null) { reseed(99); let ok = 0; const n = 400000; for (let i = 0; i < n; i++) { const L = [0, 1].map(() => { let a = drawInt(1), b = drawInt(1), c = drawInt(1); if (a === null || b === null || c === null || (a === 0 && b === 0) || gcd(gcd(a, b), c) !== 1 || b < 0 || (b === 0 && a < 0)) return null; return [a, b, c]; }); if (L[0] && L[1] && cmpLine(L[0], L[1]) !== 0) ok++; } LOGA = Math.log2(ok / n); log(`(law bound: bits(S) ≤ φ(S) − 1 + ${fmt(LOGA, 2)})`); }
  return phi(S) - 1 + LOGA;
}
const bitsOf = (r, S, e) => Math.min(valueOf(V.tables.get(r.id), r.score(S, e)), lawBound(S));
// F on one object: Σ_i n_i Σ_{j≠i} n_j (the product payoff's pairwise form, as A).
function tableF(rules, S) { const e = V.el(S); const n = rules.map(r => bitsOf(r, S, e)); let F = 0; for (let i = 0; i < n.length; i++) for (let j = 0; j < n.length; j++) if (i !== j) F += n[i] * n[j]; return { F, n }; }
// Annealing with rule knowledge inside φ ≤ W; keeps the best `keep` distinct states seen (collapse test 3).
function anneal(rules, S0, W, evals, seed, keep = 0) {
  reseed(seed); let S = S0, cur = tableF(rules, S).F, best = { S, F: cur }; const top = new Map();
  for (let used = 0; used < evals; used++) {
    const c = pick(calls(S)); const T = c.f();
    if (!T || phi(T) > W) continue;
    const f = tableF(rules, T).F; const temp = Math.max(0.5, 60 * (1 - used / evals));
    if (f >= cur || rnd() < Math.exp((f - cur) / temp)) {
      S = T; cur = f; if (f > best.F) best = { S: T, F: f };
      if (keep) { const k = sysKey(T); if (!top.has(k)) { top.set(k, { S: T, F: f }); if (top.size > 4 * keep) { const arr = [...top.entries()].sort((a, b) => b[1].F - a[1].F).slice(0, keep); top.clear(); for (const [kk, v] of arr) top.set(kk, v); } } }
    }
  }
  best.top = [...top.values()];
  return best;
}
// Tables: each draws `size` different families, a random secondary each.
const DEAL = args.includes("--deal") ? args[args.indexOf("--deal") + 1] : "random";
function tables(count, size, seed = 43, deal = DEAL) {
  const ts = []; reseed(seed + size);
  while (ts.length < count) {
    const fs = FAMS.slice().sort(() => rnd() - 0.5).slice(0, size); const t = fs.map(f => { const s = pick(Object.keys(f.secs)); return V.rules.find(r => r.id === `${f.id}/${s}`); });
    if (deal === "guard" && !zoomGuard(t)) continue;
    ts.push(t);
  }
  return ts;
}
function annealSingle(r, S0, W, evals, seed) {
  reseed(seed); const tab = V.tables.get(r.id); const val = S => bitsOf(r, S, V.el(S));
  let S = S0, cur = val(S), best = { S, bits: cur };
  for (let u = 0; u < evals; u++) {
    const c = pick(calls(S)); const T = c.f(); if (!T || phi(T) > W) continue;
    const f = val(T); const temp = Math.max(0.2, 6 * (1 - u / evals));
    if (f >= cur || rnd() < Math.exp((f - cur) / temp)) { S = T; cur = f; if (f > best.bits) best = { S: T, bits: f }; }
  }
  best.beyond = best.bits > tab.certBits; return best;
}
// Collapse test 1 as decision 30 reframed it: how steep is each hill (best bits in W and 2W)? Information, not a failure.
function partRamp() {
  values(); const W = 50;
  log(`\n## Hills (collapse test 1, information): each rule alone, annealed in φ ≤ ${W} and ${2 * W}`);
  log("| Rule | sense | best bits in W (score) | best bits in 2W (score) | grew > 10% | best state in 2W |");
  log("|---|---|--:|--:|:-:|---|");
  let ramps = 0;
  for (const r of V.rules) {
    const res = []; const starts = [];
    for (const [wi, w] of [W, 2 * W].entries()) { let b = -1, bS = null; for (let s = 0; s < 3; s++) { reseed(500 + s); const S0 = wi === 0 ? drawSys() : starts[s]; const best = annealSingle(r, S0, w, QUICK ? 1500 : 5000, 900 + s + wi); if (wi === 0) starts.push(best.S); if (best.bits > b) { b = best.bits; bS = best.S; } } res.push({ b, bS }); }
    const grew = res[1].b > 1.1 * res[0].b; if (grew) ramps++;
    const sc = res.map(x => r.score(x.bS, V.el(x.bS)));
    log(`| ${r.id} | ${r.sense} | ${fmt(res[0].b)} (${sc[0] ? fmt(sc[0][0], 2) + ", " + sc[0][1] : "–"}) | ${fmt(res[1].b)} (${sc[1] ? fmt(sc[1][0], 2) + ", " + sc[1][1] : "–"}) | ${grew ? "yes" : "no"} | ${show(res[1].bS)} |`);
  }
  log(`Hills whose best grew by more than 10% from W to 2W: ${ramps} of ${V.rules.length}.`);
}
function tableNs(rules, S) { const e = V.el(S); return rules.map(r => bitsOf(r, S, e)); }
function partEntangle() {
  values();
  const rules = FAMS.map(f => V.rules.find(r => r.fam === f.id));
  reseed(63); const states = []; for (let i = 0; i < (QUICK ? 300 : 1500); i++) states.push(drawSystem(2, i % 2 ? 0 : 2));
  const n = rules.length; const dA = rules.map(() => []);
  for (const S of states) { const nb = neighbours(S); if (!nb.length) continue; const m = pick(nb); const b0 = tableNs(rules, S), b1 = tableNs(rules, m.T); for (let i = 0; i < n; i++) dA[i].push(b1[i] - b0[i]); }
  log("\n## Entanglement anywhere: for a random priced move from a law-drawn state, P(B's bits change | A's change) (correlation of the changes)");
  log(`| A \\ B | ${rules.map(r => r.fam).join(" | ")} |`); log(`|---|${rules.map(() => "--:").join("|")}|`);
  for (let a = 0; a < n; a++) {
    const row = rules.map((_, b) => { if (a === b) return "—"; let ca = 0, cb = 0; for (let t = 0; t < dA[a].length; t++) if (Math.abs(dA[a][t]) > 1e-9) { ca++; if (Math.abs(dA[b][t]) > 1e-9) cb++; } return `${ca ? fmt(cb / ca, 2) : "–"} (${fmt(corr(dA[a], dA[b]), 2)})`; });
    log(`| ${rules[a].fam} | ${row.join(" | ")} |`);
  }
}

// Design B's joint-hill test (§8.3): states where both families' primaries are at their tops (exact conditions), found
// by annealing on the two primaries; from each, rule A climbs greedily (best rise in A's bits per bit of fee, W bits in
// all) through states that keep B's primary at its top; B's change in bits is recorded. Adversary: B loses ≥ 1 bit on
// average; ally: gains ≥ 1.
function jointStates(fa, fb, count, W) {
  const ra = V.rules.find(r => r.fam === fa.id), rb = V.rules.find(r => r.fam === fb.id);
  const obj = S => { const e = V.el(S); const pa = ra.prim(S, e), pb = rb.prim(S, e); return pa === null || pb === null ? -1e9 : pa + pb; };
  const found = new Map();
  for (let t = 0; t < count * 3 && found.size < count; t++) {
    reseed(3000 + t * 7 + fa.id.length * 31 + fb.id.length); let S = drawSys(), cur = obj(S);
    for (let u = 0; u < (QUICK ? 1500 : 4000); u++) {
      const T = pick(calls(S)).f(); if (!T || phi(T) > W) continue; const f = obj(T);
      if (f >= cur || rnd() < Math.exp((f - cur) / Math.max(0.01, 0.5 * (1 - u / 4000)))) { S = T; cur = f; }
      if (cur > -1e-12) { found.set(sysKey(S), S); break; }
    }
  }
  return [...found.values()];
}
function climbHolding(ra, rb, S0, budget, hold = true) {
  const ta = V.tables.get(ra.id); const fb = FAMS.find(f => f.id === rb.fam);
  let S = S0, spent = 0;
  for (let step = 0; step < 40; step++) {
    const e0 = V.el(S); const a0 = bitsOf(ra, S, e0); let best = null;
    for (const nb of neighbours(S)) {
      if (spent + nb.w > budget) continue; const e1 = V.el(nb.T); if (hold) { const pb = fb.p(nb.T, e1); if (pb === null || pb < -1e-12) continue; }
      const g = (bitsOf(ra, nb.T, e1) - a0) / nb.w; if (g > 1e-9 && (!best || g > best.g)) best = { g, nb };
    }
    if (!best) break; S = best.nb.T; spent += best.nb.w;
  }
  return S;
}
function partAdversary() {
  values(); const W = 50, BUDGET = 60, JOINT = QUICK ? 3 : 6;
  log(`\n## Adversaries on joint hills (B §8.3): from states where both families' primaries are at their tops, rule A climbs greedily for ${BUDGET} bits of fees; mean Δbits of rule B. "Free": A climbs as it likes (B may be knocked off its primary); "held": A climbs only through states that keep B's primary at its top.`);
  const res = new Map(); let pairsFound = 0;
  for (let i = 0; i < FAMS.length; i++) for (let j = 0; j < FAMS.length; j++) if (i < j) {
    const J = jointStates(FAMS[i], FAMS[j], JOINT, W); if (J.length) pairsFound++;
    for (const [fa, fb] of [[FAMS[i], FAMS[j]], [FAMS[j], FAMS[i]]]) for (const ra of V.rules.filter(r => r.fam === fa.id)) for (const rb of V.rules.filter(r => r.fam === fb.id)) {
      const free = [], held = [], dA = []; const tb = V.tables.get(rb.id), ta = V.tables.get(ra.id);
      for (const S0 of J) {
        const b0 = bitsOf(rb, S0, V.el(S0)), a0 = bitsOf(ra, S0, V.el(S0));
        const S1 = climbHolding(ra, rb, S0, BUDGET, false), S2 = climbHolding(ra, rb, S0, BUDGET, true);
        free.push(bitsOf(rb, S1, V.el(S1)) - b0); held.push(bitsOf(rb, S2, V.el(S2)) - b0); dA.push(bitsOf(ra, S1, V.el(S1)) - a0);
      }
      const m = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
      if (J.length) res.set(`${ra.id}|${rb.id}`, { free: m(free), held: m(held), rise: m(dA) });
    }
  }
  log(`Joint states found for ${pairsFound} of ${FAMS.length * (FAMS.length - 1) / 2} family pairs.`);
  const count = key => { let adv = 0, ally = 0, neu = 0; for (const v of res.values()) { if (v[key] <= -1) adv++; else if (v[key] >= 1) ally++; else neu++; } return `adversary ${adv}, ally ${ally}, neutral ${neu}`; };
  log(`Ordered rule pairs measured: ${res.size}. Free: ${count("free")}. Held: ${count("held")}.`);
  log("| Hill | sense | its climb (mean Δ bits) | adversaries, free (Δ bits of the other) | adversaries, held | allies, free |");
  log("|---|---|--:|---|---|---|");
  let lonely = 0;
  for (const ra of V.rules) {
    const row = [...res.entries()].filter(([k]) => k.startsWith(ra.id + "|")).map(([k, v]) => [k.split("|")[1], v]);
    const list = (key, f, sgn) => row.filter(x => f(x[1][key])).sort((x, y) => sgn * (x[1][key] - y[1][key]));
    const a = list("free", v => v <= -1, 1), h = list("held", v => v <= -1, 1), l = list("free", v => v >= 1, -1);
    if (!a.length && !h.length) lonely++;
    const rise = row.length ? row.reduce((s, x) => s + x[1].rise, 0) / row.length : NaN;
    const txt = (xs, key) => xs.slice(0, 4).map(([b, v]) => `${b} (${v[key] > 0 ? "+" : ""}${fmt(v[key])})`).join(", ") + (xs.length > 4 ? `, ${xs.length - 4} more` : "");
    log(`| ${ra.id} | ${ra.sense} | ${fmt(rise)} | ${txt(a, "free")} | ${txt(h, "held")} | ${txt(l, "free")} |`);
  }
  log(`Hills with no adversary (free or held): ${lonely} of ${V.rules.length}.`);
}

// Scripted climbers (A's, two lines): seats take turns; each picks over every object and call the best rise in its own
// points per bit (points: own bits × the others' bits + own bits); objects unique.
function partClimb() {
  values();
  log("\n## Scripted climbers (collapse test 4): 8 tables of 3 seats, 8 objects, each seat 400 bits of fees");
  log("| Table | moves | shared (≥ 2 seats rise) | collateral (another seat falls) | objects moved in last third | frozen at end | distinct final states | table F start → end |");
  log("|---|--:|--:|--:|--:|--:|--:|---|");
  let ti = 0;
  for (const rules of tables(QUICK ? 3 : 8, 3, 53)) {
    reseed(700 + ti);
    const objs = []; const keys = new Set(); while (objs.length < 8) { const S = drawSys(); const kk = sysKey(S); if (!keys.has(kk)) { keys.add(kk); objs.push(S); } }
    const F0 = objs.reduce((a, S) => a + tableF(rules, S).F, 0);
    const budget = rules.map(() => 400); let moves = 0, shared = 0, coll = 0; const movedAt = []; let rounds = 0;
    for (;;) {
      let any = false;
      for (let s = 0; s < rules.length; s++) {
        if (budget[s] <= 0) continue; let best = null;
        for (let o = 0; o < objs.length; o++) {
          const n0 = tableNs(rules, objs[o]); const pts0 = n0[s] * (n0.reduce((a, b) => a + b) - n0[s]) + n0[s];
          for (const nb of neighbours(objs[o])) {
            if (nb.w > budget[s]) continue; if (keys.has(sysKey(nb.T))) continue;
            const n1 = tableNs(rules, nb.T); const pts1 = n1[s] * (n1.reduce((a, b) => a + b) - n1[s]) + n1[s];
            const gain = (pts1 - pts0) / nb.w; if (gain > 1e-9 && (!best || gain > best.gain)) best = { gain, o, nb, n0, n1 };
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
    let frozen = 0; for (const S of objs) { const n0 = tableNs(rules, S); let improv = false; for (const nb of neighbours(S)) { const n1 = tableNs(rules, nb.T); if (n1.some((x, j) => x > n0[j] + 1e-9)) { improv = true; break; } } if (!improv) frozen++; }
    const F1 = objs.reduce((a, S) => a + tableF(rules, S).F, 0);
    log(`| ${rules.map(r => r.id).join(", ")} | ${moves} | ${moves ? fmt(100 * shared / moves, 0) : 0}% | ${moves ? fmt(100 * coll / moves, 0) : 0}% | ${last} of 8 | ${frozen} of 8 | ${keys.size} | ${fmt(F0, 0)} → ${fmt(F1, 0)} |`);
    ti++;
  }
}

// Collapse tests 2 and 3: cheap search (B evaluations) against a reference (10 runs × 10B), in φ ≤ W; test 3 reads the
// best 24 distinct states the reference visited (≥ 70% of 24 × the best fails).
const REFS = new Map();
function partSearch() {
  values(); const W = 50, B = QUICK ? 2000 : 5000;
  log(`\n## Search (collapse tests 2 and 3), window φ ≤ ${W}: cheap (B = ${B} evaluations, median of 5 births) against a reference (10 runs × 10B)`);
  log("| Table | cheap F | reference F | cheap/ref | 5 best runs distinct | best 24 distinct / (24 × best) | best state (bits) |");
  log("|---|--:|--:|--:|--:|--:|---|");
  let fail2 = 0, fail3 = 0; const tbls = [...tables(QUICK ? 2 : 6, 3, 43), ...tables(QUICK ? 1 : 3, 4, 43)];
  for (const rules of tbls) {
    reseed(800); const births = []; for (let i = 0; i < 5; i++) births.push(drawSys());
    const cheap = births.map((S, i) => anneal(rules, S, W, B, 1000 + i).F).sort((a, b) => a - b)[2];
    const refs = []; for (let r = 0; r < 10; r++) refs.push(anneal(rules, births[r % 5], W, 10 * B, 2000 + r, 24));
    refs.sort((a, b) => b.F - a.F); REFS.set(rules.map(r => r.id).join(), refs[0]);
    const all = new Map(); for (const r of refs) for (const x of r.top) all.set(sysKey(x.S), x.F);
    const top24 = [...all.values()].sort((a, b) => b - a).slice(0, 24); const share = top24.reduce((a, b) => a + b, 0) / (24 * refs[0].F);
    if (cheap / refs[0].F >= 0.95) fail2++; if (share >= 0.7) fail3++;
    log(`| ${rules.map(r => r.id).join(", ")} | ${fmt(cheap, 0)} | ${fmt(refs[0].F, 0)} | ${fmt(cheap / refs[0].F, 2)} | ${new Set(refs.slice(0, 5).map(x => sysKey(x.S))).size} | ${fmt(share, 2)} | ${show(refs[0].S)} (${tableF(rules, refs[0].S).n.map(x => fmt(x)).join(", ")}) |`);
  }
  log(`Test 2 (cheap ≥ 95% of reference): ${fail2} of ${tbls.length} tables. Test 3 (best 24 distinct keep ≥ 70%): ${fail3} of ${tbls.length}.`);
}

// The sentence attack (test 2′, A §4.7): the best member of a structured family against the reference search. A's
// generic sentence, A's axis sentences (§3.4), B's smooth-size sentence (§3.4), and the far-peg sentence.
function sentenceFamilies(W) {
  const fams = {}; const add = (name, T) => { if (T && phi(T) <= W) (fams[name] ??= []).push(T); };
  const normals = []; for (let a = -10; a <= 10; a++) for (let b = 0; b <= 10; b++) if ((b > 0 || a > 0) && gcd(a, b) === 1) normals.push([a, b]);
  for (let qx = -3; qx <= 3; qx++) for (let qy = -3; qy <= 3; qy++) for (let i = 0; i < normals.length; i++) for (let j = i + 1; j < normals.length; j++) {
    const [a1, b1] = normals[i], [a2, b2] = normals[j];
    add("two lines through one peg", canonSys([canonLine(a1, b1, -(a1 * qx + b1 * qy)), canonLine(a2, b2, -(a2 * qx + b2 * qy))]));
  }
  const big = []; for (let k = 1; k <= 13; k++) big.push(2 ** k, 3 * 2 ** k, 9 * 2 ** k, 5 * 2 ** k, 15 * 2 ** k); for (const p of PRIMES.slice(0, 60)) big.push(p);
  const vals = [...new Set(big)].filter(x => x <= CAP).flatMap(x => [x, -x]);
  const small = []; for (let a = -6; a <= 6; a++) for (let b = 0; b <= 6; b++) if ((b > 0 || a > 0) && gcd(a, b) === 1) small.push([a, b]);
  for (const ax of [[1, 0, 0], [0, 1, 0]]) for (const [a, b] of small) for (const c of vals) add("an axis and one line with a big number", canonSys([ax, canonLine(a, b, c)]));
  for (const u of vals) for (const v of vals) add("x = u and y = v, u and v big", canonSys([canonLine(1, 0, -u), canonLine(0, 1, -v)]));
  for (const n of vals) for (const [a, b] of small) for (const [c, d] of small) if (a * d - b * c) add("two lines through (n, n), n big", canonSys([canonLine(a, b, -(a + b) * n), canonLine(c, d, -(c + d) * n)]));
  return fams;
}
function partSentence() {
  values(); const W = 50, B = QUICK ? 2000 : 5000;
  const fams = sentenceFamilies(W);
  log(`\n## The sentence attack (test 2′), window φ ≤ ${W}: the best member of a structured family against the reference search`);
  log(`Families: ${Object.entries(fams).map(([n, S]) => `${n}: ${S.length} states`).join("; ")}.`);
  log("| Table | reference F | best member F | member / reference | best member (family; bits) |");
  log("|---|--:|--:|--:|---|");
  let beat = 0, near5 = 0; const tbls = [...tables(QUICK ? 2 : 6, 3, 43), ...tables(QUICK ? 1 : 3, 4, 43)];
  for (const rules of tbls) {
    reseed(800); const births = []; for (let i = 0; i < 5; i++) births.push(drawSys());
    let ref = REFS.get(rules.map(r => r.id).join()) || { F: -1 }; if (ref.F < 0) for (let r = 0; r < 10; r++) { const x = anneal(rules, births[r % 5], W, 10 * B, 2000 + r); if (x.F > ref.F) ref = x; }
    let best = { F: -1 }, bestName = "";
    for (const [name, S] of Object.entries(fams)) for (const T of S) { const f = tableF(rules, T).F; if (f > best.F) { best = { F: f, S: T }; bestName = name; } }
    const r = best.F / ref.F; if (r >= 1) beat++; else if (r >= 0.95) near5++;
    log(`| ${rules.map(r => r.id).join(", ")} | ${fmt(ref.F, 0)} | ${fmt(best.F, 0)} | ${fmt(r, 2)} | ${show(best.S)} (${bestName}; ${tableF(rules, best.S).n.map(x => fmt(x)).join(", ")}) |`);
  }
  log(`A sentence matches or beats the reference in ${beat} of ${tbls.length} tables, and is within 5% in ${near5} more.`);
}

const t0 = Date.now();
if (want("law")) partLaw();
if (want("values")) partValues();
if (want("ramp")) partRamp();
if (want("entangle")) partEntangle();
if (want("adversary")) partAdversary();
if (want("climb")) partClimb();
if (want("search")) partSearch();
if (want("sentence")) partSentence();
log(`\n(total ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
if (args.includes("--write")) { const fs = await import("node:fs"); fs.writeFileSync(new URL(`./two-line-systems-results-${POOL}${DEAL === "guard" ? "-guard" : ""}${args.includes("--part") ? "-" + PARTS.join("-") : ""}.md`, import.meta.url), "# Results: two-line-systems.mjs\n\nGenerated by `node docs/engine-v2/scripts/two-line-systems.mjs " + args.join(" ") + "`.\n" + out.join("\n") + "\n"); }
