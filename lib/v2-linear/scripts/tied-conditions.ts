/**
 * Tied conditions under the scoring candidate (docs/engine-v2/scoring-trial.md, "Tied conditions"; the coordinator,
 * 16 Nov): nearest-member cost over pooled levels, no lift (friction only, TRIAL_LOG dials). Does a rule's energy rise
 * when it demands more at once? Nested joint levels on three families:
 *   Prime Gradient (suffix 1): L1 |m| rounds to a level prime p; L2 also gcd(p + 1, ⌊|c|⌋) ≥ g.
 *   Smooth Intercept {3, 7}:   L1 |c| is a level smooth number s; L2 also gcd(s + 1, ⌊|m|⌋) ≥ g.
 *   Prime Top (ends 13, over 7): L1 the crossing |X| in a level fraction's basin; L2 also within δ of p/7; L3 also
 *   ||c| − r| ≤ ½, r = p mod 7 (the leftover top).
 * Levels pooled (members whose main size is within 0.5 doublings of T, else the nearest). Start: log-Gaussian on the
 * main number matched to the level's members (spread at least 0.5 doublings); the other number from the law (its members
 * span every size). Energy = mean over starts of the cheapest route found into the level: up to two solved moves, each
 * aimed at a target read from the line it starts from (si.tilt or mach.stretch onto a gradient; si.shift, cross.shift or
 * mach.stretch onto a y-intercept), membership tested on the line reached.
 * Hold (decision 29): from an L2 member at p, the cost of stepping p up to the next member while keeping L2: tied (the
 * secondary reads p' + 1) against independent (it keeps reading p + 1, so the start already meets it).
 *   node --experimental-strip-types scripts/tied-conditions.ts [--pairs 120]
 */
import { Qn, q, rng, type Q } from "@workspace/v2-core";
import { allMutators, callPrice, drawLine, fromMC, isPrime, isVertical, lineQ, TRIAL_LOG, type Line } from "../src/index.ts";

const argv = process.argv.slice(2);
const PAIRS = Number((i => (i < 0 ? "120" : argv[i + 1]!))(argv.indexOf("--pairs")));
const SIGMA = 0.5, TS = [100, 1000, 10000], GS = [2, 4, 8, 16], DS: [string, Q][] = [["1/4", q(1, 4)], ["1/16", q(1, 16)], ["1/64", q(1, 64)]];
const BY_ID = new Map(allMutators.map(m => [m.id, m]));
const M = (l: Line): Q => q(-l.a, l.b), C = (l: Line): Q => q(-l.c, l.b);
type Rng = ReturnType<typeof rng>;
const apply = (id: string, a: Record<string, unknown>, l: Line): Line | null => { const r = BY_ID.get(id)!.apply({ lines: [l] }, 0, a as never, lineQ); return "invalid" in r || isVertical(r.lines[0]!) ? null : r.lines[0]!; };
const fr = (id: string, a: Record<string, unknown>, x: Line, y: Line) => callPrice(id, a, x, y, TRIAL_LOG)?.friction ?? Infinity;
const near = (x: number, maxDen = 4): Q => { let best = q(Math.round(x)); for (let d = 2; d <= maxDen; d++) { const t = q(Math.round(x * d), d); if (Math.abs(Qn.toNumber(t) - x) < Math.abs(Qn.toNumber(best) - x)) best = t; } return best; };
const simplest = (a: number, b: number): Q | null => { if (!(b >= a)) return null; for (let d = 1; d <= 64; d++) { const n = Math.ceil(a * d - 1e-9); if (n / d <= b + 1e-9) return q(n, d); } return null; };
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(1 - r.unit())) * Math.cos(2 * Math.PI * r.unit());
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
const sgn = (x: Q) => (Qn.sign(x) < 0 ? -1 : 1);
const absFloor = (x: Q) => Qn.floor(Qn.abs(x));
const lawMC = (r: Rng) => { const d = drawLine(r); return { m: q(d.m.p, d.m.q), c: q(d.c.p, d.c.q) }; };

// ---------------------------------------------------------------- routes

/** A single-number target: set the gradient or the y-intercept to v. */
type Aim = { on: "m" | "c"; v: Q };
function moves(s: Line, t: Aim): [number, Line][] {
  const cur = t.on === "m" ? M(s) : C(s);
  if (Qn.eq(cur, t.v)) return [];
  const out: [number, Line][] = [], k = Qn.sub(t.v, cur);
  const push = (id: string, a: Record<string, unknown>) => { const u = apply(id, a, s); if (u && Qn.eq(t.on === "m" ? M(u) : C(u), t.v)) out.push([fr(id, a, s, u), u]); };
  if (t.on === "m") push("si.tilt", { k });
  else { push("si.shift", { k }); if (!Qn.isZero(M(s))) push("cross.shift", { k: Qn.div(Qn.neg(k), M(s)) }); }
  if (!Qn.isZero(cur) && !Qn.isZero(t.v)) push("mach.stretch", { f: Qn.div(t.v, cur) });
  return out;
}
interface Level { member(l: Line): boolean; aims(l: Line): Aim[] }
/** The cheapest route of up to two moves into the level (Infinity if none found). */
function cheapest(s: Line, L: Level): number {
  if (L.member(s)) return 0;
  let best = Infinity;
  for (const a of L.aims(s)) for (const [p1, u] of moves(s, a)) {
    if (p1 >= best) continue;
    if (L.member(u)) { best = p1; continue; }
    for (const b of L.aims(u)) for (const [p2, w] of moves(u, b)) if (p1 + p2 < best && L.member(w)) best = p1 + p2;
  }
  return best;
}

// ---------------------------------------------------------------- members

const band = (T: number) => [T * 2 ** -SIGMA, T * 2 ** SIGMA] as const;
function upTo(ok: (n: bigint) => boolean, hi: number): bigint[] { const out: bigint[] = []; for (let n = 2n; n <= BigInt(Math.ceil(hi)); n++) if (ok(n)) out.push(n); return out; }
function level(all: bigint[], T: number): bigint[] { const [lo, hi] = band(T), xs = all.filter(n => Number(n) >= lo && Number(n) <= hi); return xs.length ? xs : [all.reduce((b, n) => (Math.abs(Math.log2(Number(n) / T)) < Math.abs(Math.log2(Number(b) / T)) ? n : b))]; }
const matched = (xs: number[]) => { const l = xs.map(Math.log2), mu = l.reduce((a, b) => a + b, 0) / l.length; return { mu, sd: Math.max(SIGMA, Math.sqrt(l.reduce((a, b) => a + (b - mu) ** 2, 0) / l.length)) }; };
const nearestK = (xs: bigint[], v: number, k: number) => [...xs].sort((a, b) => Math.abs(Math.log2(Number(a) / v)) - Math.abs(Math.log2(Number(b) / v))).slice(0, k);
/** Whole numbers n ≥ 1 nearest |y| (one below, one above) with gcd(mod, n) ≥ g, signed as y. */
function tieValues(y: Q, mod: bigint, g: number): Q[] {
  const f = absFloor(y), out: Q[] = [], ok = (n: bigint) => n >= 1n && gcd(mod, n) >= BigInt(g);
  for (let n = f; n >= 1n; n--) if (ok(n)) { out.push(Qn.mul(q(sgn(y)), q(n))); break; }
  for (let n = f + 1n; n <= f + 4n * mod + 4n; n++) if (ok(n)) { out.push(Qn.mul(q(sgn(y)), q(n))); break; }
  return out;
}

// ---------------------------------------------------------------- the two ladder families (main on one number, tie on the other)

interface Ladder { name: string; all: bigint[]; main: "m" | "c"; reads(x: Q): bigint | null }
const PG: Ladder = { name: "Prime Gradient (suffix 1)", all: upTo(n => n % 10n === 1n && isPrime(n), 30000), main: "m", reads: x => Qn.floor(Qn.add(Qn.abs(x), q(1, 2))) };
const SI: Ladder = { name: "Smooth Intercept {3, 7}", all: upTo(n => { let x = n; for (const p of [3n, 7n]) while (x % p === 0n) x /= p; return x === 1n; }, 30000), main: "c", reads: x => (Qn.abs(x).d === 1n ? Qn.abs(x).n : null) };
const tie = (F: Ladder) => (F.main === "m" ? "c" : "m");

/** L1 (g null) or L2 on members; mod(p) is the number the secondary reads (p + 1 when tied). */
function ladderLevel(F: Ladder, members: bigint[], g: number | null, mod: (p: bigint) => bigint = p => p + 1n): Level {
  const set = new Set(members), x = (l: Line) => (F.main === "m" ? M(l) : C(l)), y = (l: Line) => (F.main === "m" ? C(l) : M(l));
  const at = (l: Line) => { const p = F.reads(x(l)); return p !== null && set.has(p) ? p : null; };
  return {
    member: l => { const p = at(l); if (p === null) return false; if (g === null) return true; const n = absFloor(y(l)); return n >= 1n && gcd(mod(p), n) >= BigInt(g); },
    aims: l => {
      const ps = nearestK(members, Math.max(1, Qn.toNumber(Qn.abs(x(l)))), 4), here = at(l), out: Aim[] = [];
      for (const p of ps) out.push({ on: F.main, v: Qn.mul(q(sgn(x(l))), q(p)) });
      // Aims for every stricter threshold too, so a looser level never prices above a tighter one it contains.
      if (g !== null) for (const p of here !== null ? [here] : ps) for (const h of GS.filter(h => h >= g)) for (const v of tieValues(y(l), mod(p), h)) out.push({ on: tie(F), v });
      return out;
    },
  };
}
function ladderStart(F: Ladder, members: bigint[], r: Rng): Line {
  const { mu, sd } = matched(members.map(Number)), law = lawMC(r), x = Qn.mul(q(r.bit() ? 1 : -1), near(2 ** (mu + sd * gauss(r))));
  const nz = (v: Q) => (Qn.isZero(v) ? q(1) : v);
  return F.main === "m" ? fromMC(nz(x), law.c) : fromMC(nz(law.m), nz(x));
}
function ladderEnergy(F: Ladder, T: number, g: number | null, seed: string): number {
  const members = level(F.all, T), L = ladderLevel(F, members, g), r = rng("tied", seed);
  let sum = 0;
  for (let i = 0; i < PAIRS; i++) sum += cheapest(ladderStart(F, members, r), L);
  return sum / PAIRS;
}
/** Bits: −log2 of the share of whole parts 1..4096 with gcd(p + 1, n) ≥ g, averaged over the level. */
function gcdBits(members: bigint[], g: number): number {
  let share = 0;
  for (const p of members) { let k = 0; for (let n = 1n; n <= 4096n; n++) if (gcd(p + 1n, n) >= BigInt(g)) k++; share += k / 4096; }
  return -Math.log2(share / members.length);
}
function hold(F: Ladder, T: number, g: number, seed: string): { tied: number; indep: number } {
  const members = level(F.all, T), r = rng("hold", seed);
  let tied = 0, indep = 0, n = 0;
  for (let i = 0; i < PAIRS; i++) {
    const p = members[r.below(members.length)]!, next = F.all.find(x => x > p)!, law = lawMC(r);
    const ys = tieValues(F.main === "m" ? law.c : law.m, p + 1n, g);
    if (!ys.length) continue;
    const s = F.main === "m" ? fromMC(q(p), ys[0]!) : fromMC(ys[0]!, q(p));
    tied += cheapest(s, ladderLevel(F, [next], g));
    indep += cheapest(s, ladderLevel(F, [next], g, () => p + 1n));
    n++;
  }
  return { tied: tied / n, indep: indep / n };
}

// ---------------------------------------------------------------- Prime Top (main on the crossing, close, then the y-intercept)

const OVER = 7n;
const PT_ALL = upTo(n => n % 100n === 13n && isPrime(n) && OVER % n !== 0n, 200000);
const fracOf = (p: bigint) => Number(p) / Number(OVER);
/** The basin of p/7 among all targets: midpoints to its neighbours. */
function basin(p: bigint): [number, number] { const i = PT_ALL.indexOf(p); return [i > 0 ? (fracOf(PT_ALL[i - 1]!) + fracOf(p)) / 2 : 0, i + 1 < PT_ALL.length ? (fracOf(p) + fracOf(PT_ALL[i + 1]!)) / 2 : Infinity]; }
const crossing = (l: Line): number | null => (Qn.isZero(M(l)) ? null : Math.abs(Qn.toNumber(Qn.div(C(l), M(l)))));
function ptLevel(members: bigint[], delta: Q | null, third: boolean): Level {
  const win = (p: bigint): [number, number] => { const [lo, hi] = basin(p), f = fracOf(p); return delta ? [Math.max(lo, f - Qn.toNumber(delta)), Math.min(hi, f + Qn.toNumber(delta))] : [lo, hi]; };
  const hit = (l: Line) => { const X = crossing(l); return X === null ? null : members.find(p => { const [lo, hi] = win(p); return X >= lo - 1e-12 && X <= hi + 1e-12; }) ?? null; };
  const thirdOk = (l: Line, p: bigint) => Math.abs(Math.abs(Qn.toNumber(C(l))) - Number(p % OVER)) <= 0.5;
  return {
    member: l => { const p = hit(l); return p !== null && (!third || thirdOk(l, p)); },
    aims: l => {
      const X = crossing(l) ?? 1, out: Aim[] = [], sx = Qn.isZero(M(l)) ? 1 : -sgn(Qn.div(C(l), M(l)));
      for (const p of nearestK(members, Math.max(1e-9, X * Number(OVER)), 4)) {
        const [lo, hi] = win(p);
        for (const xv of [simplest(lo, hi), near(Math.min(hi, Math.max(lo, X)), 64), q(p, OVER)]) {
          if (!xv || Qn.toNumber(xv) < lo - 1e-12 || Qn.toNumber(xv) > hi + 1e-12 || Qn.isZero(xv)) continue;
          const X1 = Qn.mul(q(sx), xv);   // signed crossing: m·X1 + c = 0
          if (!Qn.isZero(C(l))) out.push({ on: "m", v: Qn.div(Qn.neg(C(l)), X1) });
          if (!Qn.isZero(M(l))) out.push({ on: "c", v: Qn.neg(Qn.mul(M(l), X1)) });
        }
        if (third) out.push({ on: "c", v: Qn.mul(q(Qn.sign(C(l)) < 0 ? -1 : 1), q(p % OVER)) });
      }
      return out.filter(a => !(a.on === "m" && Qn.isZero(a.v)));
    },
  };
}
function ptEnergy(T: number, delta: Q | null, third: boolean, seed: string): number {
  const members = level(PT_ALL, T), { mu, sd } = matched(members.map(fracOf)), L = ptLevel(members, delta, third), r = rng("tied-pt", seed);
  let sum = 0;
  for (let i = 0; i < PAIRS; i++) {
    const law = lawMC(r), m = Qn.isZero(law.m) ? q(1) : law.m, x = Qn.mul(q(r.bit() ? 1 : -1), near(2 ** (mu + sd * gauss(r))));
    sum += cheapest(fromMC(m, Qn.neg(Qn.mul(m, Qn.isZero(x) ? q(1) : x))), L);
  }
  return sum / PAIRS;
}
function ptBits(T: number) {
  const members = level(PT_ALL, T), widths = members.map(p => { const [a, b] = basin(p); return b - a; });
  const close = (d: Q) => -Math.log2(widths.reduce((a, w) => a + Math.min(1, (2 * Qn.toNumber(d)) / w), 0) / widths.length);
  const r = rng("tied-pt-bits", String(T)), N = 20000;
  let hit = 0;
  for (let i = 0; i < N; i++) { const c = Math.abs(Qn.toNumber(lawMC(r).c)), t = Number(members[r.below(members.length)]! % OVER); if (Math.abs(c - t) <= 0.5) hit++; }
  return { close, third: -Math.log2(hit / N) };
}

// ---------------------------------------------------------------- report

const f0 = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : "—");
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "—");
for (const F of [PG, SI]) {
  console.log(`\n### ${F.name}\n\n| T (members) | L1 | ${GS.map(g => `L2 g ≥ ${g}: E (Δ) [bits]`).join(" | ")} | hold g ≥ 4: tied / independent |\n|---|---|${GS.map(() => "---").join("|")}|---|`);
  for (const T of TS) {
    const mem = level(F.all, T), e1 = ladderEnergy(F, T, null, `${F.name}:${T}`);
    const cells = GS.map(g => { const e = ladderEnergy(F, T, g, `${F.name}:${T}`); return `${f0(e)} (${f0(e - e1)}) [${f1(gcdBits(mem, g))}]`; });
    const h = hold(F, T, 4, `${F.name}:${T}`);
    console.log(`| ${T} (${mem.length}) | ${f0(e1)} | ${cells.join(" | ")} | ${f0(h.tied)} / ${f0(h.indep)} |`);
  }
}
console.log(`\n### Prime Top (ends 13, over 7)\n\n| T (members) | L1 | ${DS.map(([n]) => `L2 δ = ${n}: E (Δ) [bits]`).join(" | ")} | L3 (δ = 1/16 and ||c| − r| ≤ ½): E (Δ over L2) [bits] |\n|---|---|${DS.map(() => "---").join("|")}|---|`);
for (const T of TS) {
  const mem = level(PT_ALL, T), e1 = ptEnergy(T, null, false, `pt:${T}`), b = ptBits(T);
  const e2 = DS.map(([, d]) => ptEnergy(T, d, false, `pt:${T}`)), e3 = ptEnergy(T, q(1, 16), true, `pt:${T}`);
  console.log(`| ${T} (${mem.length}) | ${f0(e1)} | ${DS.map(([, d], i) => `${f0(e2[i]!)} (${f0(e2[i]! - e1)}) [${f1(b.close(d))}]`).join(" | ")} | ${f0(e3)} (${f0(e3 - e2[1]!)}) [${f1(b.third)}] |`);
}
