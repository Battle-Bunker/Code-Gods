/**
 * The scoring trial's NEIGHBOURHOOD mode, no lift term (docs/engine-v2/scoring-trial.md, "Neighbourhood"; the owner's
 * definition, 16 November): energy(L) = the expected price from a state drawn from L's neighbourhood to (V1) a uniformly
 * random member of L, or (V2, the coordinator's amendment) the nearest member.
 *
 * BUILT here:
 * - A rule reads one number r in its own representation: the y-intercept c, the x-intercept X = −c/m, or the signed area
 *   of the axis triangle A = ½·X·c = −c²/(2m). The other number of the line is free.
 * - A level is an interval of r: exact [T, T]; T's basin (the midpoints to its neighbours in the target set); one unit off
 *   (|r − T| = 1). Members: r uniform in the interval (an exact or ±1 level: the point itself), the free number from the
 *   trial's scale-free law (trial-rarity drawLine).
 * - Neighbourhood: log2|r| Gaussian with the members' mean and standard deviation, the latter at least SIGMA_MIN = 0.5
 *   doublings (so one-point levels are not degenerate), r's sign as the members'; the free number from the law; r rounded
 *   to a fraction with bottom at most 4.
 * - Prices: the trial's log mode (callPrice, TRIAL_LOG: the game's fee or the friction distance, plus the rise in H).
 *   V1 to a member line: tilt then shift, shift then tilt, or a stretch then one addition. V2 to the level: the single
 *   solved addition onto the interval (shift or tilt, whichever reaches it; to the interval's simplest fraction and its
 *   nearest point) or a stretch by the exact ratio, and the two-addition routes as a fallback.
 *   node --experimental-strip-types scripts/neighbourhood-trial.ts [--pairs 160]
 */
import { Qn, q, rng, type Q } from "@workspace/v2-core";
import { allMutators, callPrice, drawLine, fromMC, isPrime, isVertical, lineQLenses, TRIAL_LOG, type Line } from "../src/index.ts";

const args = process.argv.slice(2);
const PAIRS = Number((i => (i < 0 ? "160" : args[i + 1]!))(args.indexOf("--pairs")));
const SIGMA_MIN = 0.5;
const BY_ID = new Map(allMutators.map(m => [m.id, m]));
const apply = (id: string, a: Record<string, unknown>, l: Line): Line | null => { const r = BY_ID.get(id)!.apply({ lines: [l] }, 0, a as never, lineQLenses); return "invalid" in r || isVertical(r.lines[0]!) ? null : r.lines[0]!; };
const price = (id: string, a: Record<string, unknown>, x: Line, y: Line) => callPrice(id, a, x, y, TRIAL_LOG)?.total ?? Infinity;
const M = (l: Line): Q => q(-l.a, l.b), C = (l: Line): Q => q(-l.c, l.b);
/** The fraction with bottom at most `maxDen` nearest x. */
const near = (x: number, maxDen = 4): Q => { let best = q(Math.round(x)); for (let d = 2; d <= maxDen; d++) { const t = q(Math.round(x * d), d); if (Math.abs(Qn.toNumber(t) - x) < Math.abs(Qn.toNumber(best) - x)) best = t; } return best; };
/** The simplest fraction in [a, b] (bottom up to 64), or null. */
const simplest = (a: number, b: number): Q | null => { if (!(b >= a)) return null; for (let d = 1; d <= 64; d++) { const n = Math.ceil(a * d - 1e-9); if (n / d <= b + 1e-9) return q(n, d); } return null; };

// ---------------------------------------------------------------- representations

interface Rep {
  readonly name: string;
  read(l: Line): number | null;
  /** A line with reading r and free number from the law (u: a law draw). */
  make(r: number, u: { m: Q; c: Q }): Line | null;
  /** The single additions (and stretch) that put the reading in [lo, hi]: [mutator, args, result]. */
  onto(l: Line, lo: number, hi: number): [string, Record<string, unknown>, Line][];
}
const moves = (l: Line, list: [string, Q | null][]): [string, Record<string, unknown>, Line][] => list.flatMap(([id, target]) => {
  if (!target) return [];
  const cur = id === "si.tilt" ? M(l) : C(l), k = Qn.sub(target, cur);
  if (Qn.isZero(k)) return [];
  const to = apply(id, { k }, l);
  return to ? [[id, { k }, to] as [string, Record<string, unknown>, Line]] : [];
});
const stretchTo = (l: Line, f: number, inRange: (x: Line) => boolean): [string, Record<string, unknown>, Line][] => {
  if (!Number.isFinite(f) || f === 0) return [];
  const fq = near(f, 8), to = apply("mach.stretch", { f: fq }, l);
  return to && inRange(to) ? [["mach.stretch", { f: fq }, to]] : [];
};
const pick = (lo: number, hi: number, cur: number): Q[] => [simplest(lo, hi), near(Math.min(hi, Math.max(lo, cur)), 64)].filter((x): x is Q => x !== null && Qn.toNumber(x) >= lo - 1e-9 && Qn.toNumber(x) <= hi + 1e-9);
const REPS: Rep[] = [
  {
    name: "y-intercept", read: l => Qn.toNumber(C(l)),
    make: (r, u) => fromMC(u.m, near(r)),
    onto: (l, lo, hi) => { const c = Qn.toNumber(C(l)); return [...moves(l, pick(lo, hi, c).map(t => ["si.shift", t] as [string, Q])), ...(c ? stretchTo(l, (lo + hi) / 2 / c, x => { const v = Qn.toNumber(C(x)); return v >= lo - 1e-9 && v <= hi + 1e-9; }) : [])]; },
  },
  {
    name: "x-intercept", read: l => (Qn.isZero(M(l)) ? null : -Qn.toNumber(C(l)) / Qn.toNumber(M(l))),
    make: (r, u) => (Qn.isZero(u.m) ? null : fromMC(u.m, Qn.neg(Qn.mul(u.m, near(r))))),
    onto: (l, lo, hi) => {
      const m = Qn.toNumber(M(l)), c = Qn.toNumber(C(l)), out: [string, Q | null][] = [];
      // shift: c = −m·X for X in [lo, hi]; tilt: m = −c / X.
      if (m !== 0) for (const t of pick(Math.min(-m * lo, -m * hi), Math.max(-m * lo, -m * hi), c)) out.push(["si.shift", t]);
      if (c !== 0) for (const X of pick(lo, hi, m ? -c / m : lo)) if (!Qn.isZero(X)) out.push(["si.tilt", Qn.div(Qn.neg(C(l)), X)]);
      return moves(l, out);
    },
  },
  {
    name: "signed area", read: l => (Qn.isZero(M(l)) ? null : -(Qn.toNumber(C(l)) ** 2) / (2 * Qn.toNumber(M(l)))),
    make: (r, u) => (Qn.isZero(u.c) || r === 0 ? null : fromMC(Qn.div(Qn.neg(Qn.mul(u.c, u.c)), Qn.mul(q(2), near(r))), u.c)),
    onto: (l, lo, hi) => {
      const m = Qn.toNumber(M(l)), c = Qn.toNumber(C(l)), out: [string, Q | null][] = [];
      // tilt: m = −c²/(2A); shift: c = ±√(−2mA) (rational only by luck: the simplest fraction in the interval it maps to).
      if (c !== 0) for (const A of pick(lo, hi, m ? -(c * c) / (2 * m) : lo)) if (!Qn.isZero(A)) out.push(["si.tilt", Qn.div(Qn.neg(Qn.mul(C(l), C(l))), Qn.mul(q(2), A))]);
      if (m !== 0 && -m * lo >= 0 && -m * hi >= 0) { const a = Math.sqrt(-2 * m * lo), b = Math.sqrt(-2 * m * hi), s = Math.sign(c) || 1; for (const t of pick(Math.min(a, b), Math.max(a, b), Math.abs(c))) out.push(["si.shift", Qn.mul(q(s), t)]); }
      const A0 = m ? -(c * c) / (2 * m) : 0;
      return [...moves(l, out), ...(A0 ? stretchTo(l, (lo + hi) / 2 / A0, x => { const v = REPS[2]!.read(x); return v !== null && v >= lo - 1e-9 && v <= hi + 1e-9; }) : [])];
    },
  },
];

// ---------------------------------------------------------------- prices

/** V1: the cheapest route found from s to exactly the line t. */
function toLine(s: Line, t: Line): number {
  if (Qn.eq(M(s), M(t)) && Qn.eq(C(s), C(t))) return 0;
  let best = Infinity;
  const two = (a: string, b: string) => {
    const k1 = a === "si.tilt" ? Qn.sub(M(t), M(s)) : Qn.sub(C(t), C(s));
    const mid = Qn.isZero(k1) ? s : apply(a, { k: k1 }, s);
    if (!mid) return;
    const p1 = Qn.isZero(k1) ? 0 : price(a, { k: k1 }, s, mid);
    const k2 = b === "si.tilt" ? Qn.sub(M(t), M(mid)) : Qn.sub(C(t), C(mid));
    if (Qn.isZero(k2)) { best = Math.min(best, p1); return; }
    const end = apply(b, { k: k2 }, mid);
    if (end) best = Math.min(best, p1 + price(b, { k: k2 }, mid, end));
  };
  two("si.tilt", "si.shift"); two("si.shift", "si.tilt");
  // A stretch matching the gradient, then a shift.
  if (!Qn.isZero(M(s)) && !Qn.isZero(M(t))) {
    const f = Qn.div(M(t), M(s)), mid = apply("mach.stretch", { f }, s);
    if (mid) { const k = Qn.sub(C(t), C(mid)); const end = Qn.isZero(k) ? mid : apply("si.shift", { k }, mid); if (end) best = Math.min(best, price("mach.stretch", { f }, s, mid) + (Qn.isZero(k) ? 0 : price("si.shift", { k }, mid, end))); }
  }
  return best;
}
/** V2: the cheapest route found from s into the level [lo, hi] of the representation. */
function toLevel(rep: Rep, s: Line, lo: number, hi: number, member: Line): number {
  const r = rep.read(s);
  if (r !== null && r >= lo - 1e-9 && r <= hi + 1e-9) return 0;
  let best = Infinity;
  for (const [id, a, to] of rep.onto(s, lo, hi)) best = Math.min(best, price(id, a, s, to));
  return Math.min(best, toLine(s, member));
}

// ---------------------------------------------------------------- levels and energies

const lawDraw = (r: ReturnType<typeof rng>) => { const d = drawLine(r); return { m: q(d.m.p, d.m.q), c: q(d.c.p, d.c.q) }; };
function energy(rep: Rep, lo: number, hi: number, seed: string, joint?: { m: Q }): { v1: number; v2: number } {
  const r = rng("neighbourhood", seed, rep.name);
  const memberAt = (): Line | null => {
    for (let i = 0; i < 20; i++) {
      const x = lo === hi ? lo : lo + (hi - lo) * r.unit(), u = lawDraw(r);
      const l = rep.make(lo === hi ? lo : x, joint ? { ...u, m: joint.m } : u);
      if (l) return l;
    }
    return null;
  };
  // The members' log-size mean and spread (a sample), the neighbourhood's Gaussian.
  const sample = Array.from({ length: 64 }, memberAt).filter((x): x is Line => !!x).map(l => Math.log2(Math.abs(rep.read(l)!) || 1e-9));
  const mu = sample.reduce((a, b) => a + b, 0) / sample.length, sd = Math.max(SIGMA_MIN, Math.sqrt(sample.reduce((a, b) => a + (b - mu) ** 2, 0) / sample.length));
  const sign = Math.sign(lo + hi) || 1;
  const jointSd = joint ? Math.max(SIGMA_MIN, 0) : 0, jm = joint ? Math.log2(Math.abs(Qn.toNumber(joint.m)) || 1) : 0;
  let v1 = 0, v2 = 0, n = 0;
  for (let i = 0; i < PAIRS; i++) {
    const g = Math.sqrt(-2 * Math.log(1 - r.unit())) * Math.cos(2 * Math.PI * r.unit());
    const u = lawDraw(r);
    if (joint) { const g2 = Math.sqrt(-2 * Math.log(1 - r.unit())) * Math.cos(2 * Math.PI * r.unit()); u.m = Qn.mul(q(Math.sign(Qn.toNumber(joint.m)) || 1), near(2 ** (jm + jointSd * g2))); }
    const s = rep.make(sign * 2 ** (mu + sd * g), u), t = memberAt();
    if (!s || !t) continue;
    const a = toLine(s, t);
    // V2 with a joint condition: the gradient must also be set; nearest member = the solved addition onto the level, then the tilt.
    const b = joint ? Math.min(toLine(s, t), (() => { const k = Qn.sub(joint.m, M(s)); const mid = Qn.isZero(k) ? s : apply("si.tilt", { k }, s); return mid ? (Qn.isZero(k) ? 0 : price("si.tilt", { k }, s, mid)) + toLevel(rep, mid, lo, hi, t) : Infinity; })()) : toLevel(rep, s, lo, hi, t);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    v1 += a; v2 += b; n++;
  }
  return { v1: v1 / n, v2: v2 / n };
}

// Target sets of different thinning, with the target nearest 2^h and its neighbours.
interface Set { name: string; around(x: number): { T: number; prev: number; next: number } }
const fromStep = (name: string, ok: (n: number) => boolean): Set => ({ name, around(x) {
  const up = (n: number) => { for (let k = Math.max(1, Math.ceil(n)); ; k++) if (ok(k)) return k; }, down = (n: number) => { for (let k = Math.floor(n); k >= 1; k--) if (ok(k)) return k; return 0; };
  const a = up(x), b = down(x), T = b && x - b <= a - x ? b : a;
  return { T, prev: down(T - 1), next: up(T + 1) };
} });
const SETS: Set[] = [
  fromStep("whole numbers ending in 7", n => n % 10 === 7),
  fromStep("primes ending in 1", n => n % 10 === 1 && isPrime(BigInt(n))),
  fromStep("primes ending in 101", n => n % 1000 === 101 && isPrime(BigInt(n))),
  fromStep("squares", n => Number.isInteger(Math.sqrt(n))),
  fromStep("powers of 2", n => (n & (n - 1)) === 0),
];
const HS = [4, 8, 12, 16];
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "—");
const yRep = REPS[0]!;
const retype = (T: number) => { const s = fromMC(q(1), q(0)), t = fromMC(q(1), near(T)); return price("si.shift", { k: near(T) }, s, t); };

console.log(`## (1) Energy against height, on the y-intercept (pairs ${PAIRS}; σ_min ${SIGMA_MIN} doublings)\n`);
console.log("| target set | h (doublings) | T | exact V1 / V2 | basin V1 / V2 | basin width | retype price |\n|---|---|---|---|---|---|---|");
for (const S of SETS) for (const h of HS) {
  const { T, prev, next } = S.around(2 ** h), lo = prev ? (prev + T) / 2 : 0, hi = (T + next) / 2;
  const ex = energy(yRep, T, T, `${S.name}:${h}:exact`), ba = energy(yRep, lo, hi, `${S.name}:${h}:basin`);
  console.log(`| ${S.name} | ${h} | ${T} | ${f1(ex.v1)} / ${f1(ex.v2)} | ${f1(ba.v1)} / ${f1(ba.v2)} | ${(hi - lo).toFixed(1)} | ${f1(retype(T))} |`);
}
console.log(`\n## (2) One joint tied condition against its single-number parent (y-intercept on T; joint: and the gradient on the number of T's digits)\n`);
console.log("| T | parent V1 / V2 | joint V1 / V2 |\n|---|---|---|");
for (const h of HS) {
  const T = SETS[1]!.around(2 ** h).T, digits = String(T).length;
  const p = energy(yRep, T, T, `parent:${h}`), j = energy(yRep, T, T, `joint:${h}`, { m: q(digits) });
  console.log(`| ${T} | ${f1(p.v1)} / ${f1(p.v2)} | ${f1(j.v1)} / ${f1(j.v2)} |`);
}
console.log(`\n## (3) Representation neutrality: the same exact target read in three representations\n`);
console.log("| T | y-intercept V1 / V2 | x-intercept V1 / V2 | signed area V1 / V2 |\n|---|---|---|---|");
for (const h of HS) {
  const T = SETS[1]!.around(2 ** h).T;
  const cells = REPS.map(rep => energy(rep, T, T, `rep:${h}`));
  console.log(`| ${T} | ${cells.map(e => `${f1(e.v1)} / ${f1(e.v2)}`).join(" | ")} |`);
}
console.log(`\n## (4) Exact against one unit off (primes ending in 1, y-intercept)\n`);
console.log("| T | exact V1 / V2 | one off (T ± 1) V1 / V2 |\n|---|---|---|");
for (const h of HS) {
  const T = SETS[1]!.around(2 ** h).T;
  const ex = energy(yRep, T, T, `ex4:${h}`), up = energy(yRep, T + 1, T + 1, `off4:${h}`);
  console.log(`| ${T} | ${f1(ex.v1)} / ${f1(ex.v2)} | ${f1(up.v1)} / ${f1(up.v2)} |`);
}
