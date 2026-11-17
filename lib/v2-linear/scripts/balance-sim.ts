// Balance harness (not a test): plays whole Lines · beginner games headless, on the engine's own code paths: the turn
// law (v2-core applyCalls over the game's lens mutators: naming bits + the turn's surprise), the energy estimator
// (estimateLine, as the server re-estimates every seat on a line at each commit), the economy's selection
// (pickByEnergy, opportunities, affordable/actCredit) and the dealt pool (lines-beginner). docs/engine-v2/balance.md.
//
// Simplifications (say them when quoting results): one agent per seat with three quarters of the seat's power, empty at
// the start (the start energy pays for summons); reads cost a fixed 16 bits ÷ κ an act; no locks, drift or bidding;
// the practice partners below are this script's, not the app's starters.
//
//   node --experimental-strip-types scripts/balance-sim.ts '{"gravity":1,"power":3,"store":240,"seed":"a"}'
import { applyCalls, rng as makeRng, withPhysics, type Call, type Rng, type Variant } from "@workspace/v2-core";
import { LINES_BEGINNER_ECONOMY, LINES_BEGINNER_PHYSICS, opportunities, pickByEnergy, affordable, actCredit, KAPPA } from "@workspace/v2-economy";
import { lineQ, lineType } from "../src/type.ts";
import { lenses, readLens } from "../src/lens-moves.ts";
import { preset } from "../src/presets.ts";
import { dynamicFamilies } from "../src/dealt.ts";
import { estimateLine, lineRule, type LineRule } from "../src/energy.ts";
import { routePrice, LENSES } from "../src/lens-routes.ts";
import type { Line, LineState } from "../src/line.ts";

export type Kind = "greedy" | "hopper" | "saver" | "knocker" | "points";
export interface SimOpts {
  gravity?: number; power?: number; store?: number; K?: number; band?: number; seed?: string; seats?: number;
  worldSeconds?: number; startLines?: number; birthEvery?: number; opsPerSecond?: number; share?: number;
  kinds?: Kind[]; saveTo?: number; quiet?: boolean; rot?: number; agentStart?: number;
  /** How a cut-off (bound) estimate is scored: keep it (the engine today), cap its rise at the move's cost, or keep the previous value. */
  boundRule?: "keep" | "capCost" | "prev";
}

const READ_BITS = 16;
const babs = (x: bigint) => (x < 0n ? -x : x);
const key = (l: Line) => `${l.a},${l.b},${l.c}`;

/** Every single-mutation turn worth trying on a line in the given lenses, as wire calls. */
function singleCalls(l: Line, lensIds: readonly string[]): Call[] {
  const out: Call[] = [];
  const push = (mutator: string, lens: string, at: number, k?: bigint) => out.push({ mutator, site: 0, args: { lens, at: String(at + 1), ...(k === undefined ? {} : { k: String(k) }) } });
  for (const lens of lenses) {
    if (!lensIds.includes(lens.id)) continue;
    const n = readLens(lens, l);
    if ("invalid" in n) continue;
    const bottoms = new Set(lens.pairs.map(p => p[1]));
    const cfSlots = lens.id === "cf" ? lens.numbers.length / 2 : 0;
    for (let i = 0; i < n.length; i++) {
      if (cfSlots && i % cfSlots > 0 && n[i] === 0n && n[i - 1] === 0n) continue;
      if (lens.id === "pe" && i % 7 !== 6) { push("add", lens.id, i, 1n); if (n[i]! > 0n) push("add", lens.id, i, -1n); continue; }
      const v = n[i]!, L = babs(v).toString(2).length;
      const ks: bigint[] = [1n, 2n];
      for (let j = 2; j <= L + 1; j += 2) ks.push(1n << BigInt(j));
      for (const k of ks) for (const kk of [k, -k]) if (!(bottoms.has(i) && v + kk <= 0n)) push("add", lens.id, i, kk);
      for (const f of [2n, 3n, 10n]) { if (v !== 0n) push("mul", lens.id, i, f); if (v !== 0n && v % f === 0n) push("div", lens.id, i, f); }
      if (!bottoms.has(i) && v !== 0n) push("neg", lens.id, i);
    }
    lens.pairs.forEach(([t, b], p) => { if (n[t] !== 0n) push("swap", lens.id, p); if (n[b] !== 1n) push("round", lens.id, p); });
  }
  return out;
}

interface Option { calls: Call[]; to: Line; bits: number; lens: string }
function price(V: Variant, l: Line, calls: Call[]): Option | null {
  const r = applyCalls(lineType, V, { lines: [l] } as LineState, calls);
  if ("invalid" in r) return null;
  const to = r.result.lines[0]!;
  if (key(to) === key(l)) return null;
  return { calls, to, bits: r.total, lens: calls[0]!.args.lens! };
}
/** Calls that write target t in lens `lensId` from l: one add per changed number, re-read after each (pairs reduce). */
function callsTo(V: Variant, l: Line, t: Line, lensId: string): Option | null {
  const lens = lenses.find(x => x.id === lensId)!;
  const tn = readLens(lens, t);
  if ("invalid" in tn) return null;
  let cur = l; const calls: Call[] = [];
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < tn.length; i++) {
    const n = readLens(lens, cur);
    if ("invalid" in n || n[i] === tn[i]) continue;
    const c: Call = { mutator: "add", site: 0, args: { lens: lensId, at: String(i + 1), k: String(tn[i]! - n[i]!) } };
    const r = applyCalls(lineType, V, { lines: [cur] } as LineState, [c]);
    if ("invalid" in r) continue;
    cur = r.result.lines[0]!; calls.push(c);
    if (calls.length > 6) return null;
  }
  if (key(cur) !== key(t) || !calls.length) return null;
  return price(V, l, calls);
}

export function simulate(o: SimOpts = {}) {
  const physics = { ...LINES_BEGINNER_PHYSICS, ...(o.gravity === undefined ? {} : { gravity: o.gravity }), ...(o.K === undefined ? {} : { estimatorStarts: o.K }), ...(o.band === undefined ? {} : { sameSizeBand: o.band }) };
  const V = withPhysics(lineQ, physics);
  const power = o.power ?? LINES_BEGINNER_ECONOMY.powerPerSecond, store = o.store ?? LINES_BEGINNER_ECONOMY.fullChargeSeconds;
  const seed = o.seed ?? "s", R: Rng = makeRng("balance", seed);
  const T = o.worldSeconds ?? 600, nSeats = o.seats ?? 4, share = o.share ?? 0.75;
  const income = power * share, capacity = income * store, credit = actCredit(capacity);
  const ops = o.opsPerSecond ?? LINES_BEGINNER_ECONOMY.opportunitiesPerSecond, birthEvery = o.birthEvery ?? 240;
  const kinds: Kind[] = o.kinds ?? ["greedy", "hopper", "saver", "knocker"];
  // Deal: distinct families, one parameter set each.
  const pool = preset("lines-beginner").rules, fams = [...new Set(pool.map(r => r.family))];
  const picked: string[] = [];
  while (picked.length < nSeats) { const f = fams[R.below(fams.length)]!; if (!picked.includes(f)) picked.push(f); }
  const seats = picked.map((fam, i) => {
    const opts = pool.filter(r => r.family === fam), pr = opts[R.below(opts.length)]!;
    const F = dynamicFamilies.find(f => f.id === fam)! as any;
    const rule: LineRule = lineRule(F.dynamic, pr.params);
    const kind = kinds[(i + (o.rot ?? 0)) % kinds.length]!;
    return { i, fam, params: pr.params, rule, kind, balance: o.agentStart ?? 0, spent: 0, turns: 0, skips: 0, byLens: {} as Record<string, number>, byMove: {} as Record<string, number>, bitsByTurn: [] as number[], knocks: 0, why: { none: 0, unaffordable: 0, saving: 0 } };
  });
  let estimates = 0, estMs = 0, lastBound = false;
  const est = (l: Line, s: (typeof seats)[number], K?: number, sd?: string) => {
    const t0 = performance.now();
    const r = estimateLine(l, s.rule, V, { ...(K ? { K } : {}), seed: sd ?? `${seed}:${estimates}` });
    estimates++; estMs += performance.now() - t0; lastBound = r.bound;
    return r.energy;
  };
  interface LineRec { line: Line; born: number; E: number[]; E0: number[]; commits: number; states: Set<string>; lastCommit: number; commitTimes: number[]; u0: number[] }
  const lines: LineRec[] = [];
  const birth = (t: number) => {
    const l = lineType.newborn(V, R).lines[0]!;
    const E0 = seats.map(s => est(l, s));
    lines.push({ line: l, born: t, E: E0, E0, commits: 0, states: new Set([key(l)]), lastCommit: t, commitTimes: [], u0: seats.map(s => s.rule.u(l)) });
  };
  for (let j = 0; j < (o.startLines ?? 3); j++) birth(0);
  const pointsOn = (E: number[], i: number) => { const sum = E.reduce((a, b) => a + b, 0); return E[i]! * Math.max(0, sum - E[i]!); };
  const totals = () => seats.map(s => lines.reduce((t, L) => t + pointsOn(L.E, s.i), 0));
  const energies = () => seats.map(s => lines.reduce((t, L) => t + L.E[s.i]!, 0));
  const snaps: { t: number; points: number[]; energy: number[]; balance: number[]; turns: number[] }[] = [];
  const ALL = LENSES.map(l => l.id);
  /** Per commit: t, seat, line, bits, mutations, own energy change, the others' energy change. */
  const log: number[][] = [];

  let lastWhy: "none" | "unaffordable" | "saving" = "none";
  const decide = (s: (typeof seats)[number], L: LineRec): Option | null => {
    const l = L.line, u0 = s.rule.u(l);
    const room = s.balance + credit;
    const lensIds = s.kind === "greedy" ? [s.rule.lens] : ALL;
    const all = singleCalls(l, lensIds).map(c => price(V, l, [c])).filter((x): x is Option => !!x);
    const gain = (x: Option) => s.rule.u(x.to) - u0;
    const opts = all.filter(x => x.bits <= room);
    // Why a climber skips: no single step raises its utility, or every one that does is past what it can pay.
    lastWhy = all.some(x => gain(x) > 0) ? "unaffordable" : "none";
    if (s.kind === "greedy" || s.kind === "hopper") {
      let best: Option | null = null, bv = 0;
      for (const x of opts) { const g = gain(x); if (Number.isFinite(g) && g > 0 && g / x.bits > bv) { bv = g / x.bits; best = x; } }
      return best;
    }
    if (s.kind === "saver") {
      if (s.balance < (o.saveTo ?? 60)) { lastWhy = "saving"; return null; }
      const budget = s.balance;
      // Big turns: a greedy chain of up to four mutations in one lens, and the rule's own candidates written in one turn.
      const pool: Option[] = [];
      const firsts = opts.filter(x => gain(x) > 0).sort((a, b) => gain(b) - gain(a)).slice(0, 4);
      for (const f of firsts) {
        let cur = f;
        pool.push(cur);
        for (let d = 0; d < 3; d++) {
          const next = singleCalls(cur.to, [cur.lens]).map(c => price(V, l, [...cur.calls, c])).filter((x): x is Option => !!x && x.bits <= budget && s.rule.u(x.to) > s.rule.u(cur.to));
          if (!next.length) break;
          cur = next.reduce((a, b) => (s.rule.u(b.to) > s.rule.u(a.to) ? b : a));
          pool.push(cur);
        }
      }
      for (const t of Number.isFinite(u0) ? s.rule.candidates(l, u0).slice(0, 12) : []) {
        if (t.b === 0n || !(s.rule.u(t) > u0)) continue;
        const rp = routePrice(V.physics!.gravity as number, l, t);
        if (!rp.lens || rp.total > budget) continue;
        const x = callsTo(V, l, t, rp.lens);
        if (x && x.bits <= budget) pool.push(x);
      }
      const ok = pool.filter(x => x.bits <= budget && gain(x) > 0);
      return ok.length ? ok.reduce((a, b) => (gain(b) > gain(a) ? b : a)) : null;
    }
    if (s.kind === "points") {
      // Points-aware: the affordable turn with the best gain in this line's points, own energy × the others' sum (what a
      // player sees through othersAfter), per bit; the four best by utility gain per bit are weighed, energies at K = 4.
      const cands = opts.filter(x => gain(x) > 0).sort((a, b) => gain(b) / b.bits - gain(a) / a.bits).slice(0, 4);
      if (!cands.length) { lastWhy = "none"; return null; }
      const p0 = pointsOn(seats.map(z => est(l, z, 4, `p0:${estimates}`)), s.i);   // the same K as the candidates'
      let best: Option | null = null, bv = 0;
      for (const x of cands) {
        const E = seats.map(z => est(x.to, z, 4));
        const v = (pointsOn(E, s.i) - p0) / x.bits;
        if (v > bv) { bv = v; best = x; }
      }
      if (!best) lastWhy = "none";
      return best;
    }
    // knocker: the best move by the change in (my points − the leader's points) on this line per bit, energies at K = 4.
    const tot = totals();
    let leader = -1;
    seats.forEach(x => { if (x.i !== s.i && (leader < 0 || tot[x.i]! > tot[leader]!)) leader = x.i; });
    if (leader < 0 || L.E[leader]! <= 0) return decideClimb(s, opts, gain);
    const lr = seats[leader]!.rule, uL = lr.u(l);
    const climbs = opts.filter(x => gain(x) > 0).sort((a, b) => gain(b) / b.bits - gain(a) / a.bits).slice(0, 2);
    const knocks = opts.filter(x => lr.u(x.to) < uL).sort((a, b) => (uL - lr.u(b.to)) / b.bits - (uL - lr.u(a.to)) / a.bits).slice(0, 3);
    const gap = (E: number[]) => pointsOn(E, s.i) - pointsOn(E, leader);
    const g0 = gap(L.E);
    let best: Option | null = null, bv = 0, bestIsKnock = false;
    for (const x of [...climbs, ...knocks]) {
      const E = L.E.slice();
      E[s.i] = est(x.to, s, 4); E[leader] = est(x.to, seats[leader]!, 4);
      const v = (gap(E) - g0) / x.bits;
      if (v > bv) { bv = v; best = x; bestIsKnock = !climbs.includes(x); }
    }
    if (best && bestIsKnock) s.knocks++;
    return best;
  };
  const decideClimb = (_s: unknown, opts: Option[], gain: (x: Option) => number) => {
    let best: Option | null = null, bv = 0;
    for (const x of opts) { const g = gain(x); if (Number.isFinite(g) && g > 0 && g / x.bits > bv) { bv = g / x.bits; best = x; } }
    return best;
  };

  for (let t = 0; t < T; t++) {
    if (t > 0 && t % birthEvery === 0) birth(t);
    for (const s of seats) s.balance = Math.min(capacity, s.balance + income);
    const n = opportunities(ops, 1, R);
    for (let k = 0; k < n; k++) {
      const L = lines[R.below(lines.length)]!;
      const s = pickByEnergy(seats, x => x.balance, R);
      if (!s) break;
      const read = READ_BITS / KAPPA;
      const x = decide(s, L);
      if (!x || !affordable(s.balance - read, x.bits, credit)) { s.balance -= read; s.spent += read; s.skips++; s.why[x ? "unaffordable" : lastWhy]++; continue; }
      s.balance -= read + x.bits; s.spent += read + x.bits; s.turns++; s.bitsByTurn.push(x.bits);
      s.byLens[x.lens] = (s.byLens[x.lens] ?? 0) + 1;
      for (const c of x.calls) s.byMove[c.mutator] = (s.byMove[c.mutator] ?? 0) + 1;
      const prev = key(L.line), prevLine = L.line;
      L.line = x.to; L.commits++; L.states.add(key(x.to)); L.lastCommit = t; L.commitTimes.push(t);
      const Eb = L.E, lb = L.line === x.to ? null : null;
      let ownBound = false;
      L.E = seats.map(z => {
        let e = est(L.line, z);
        if (lastBound && o.boundRule === "capCost") e = Math.min(e, Eb[z.i]! + x.bits);
        else if (lastBound && o.boundRule === "prev") e = Eb[z.i]!;
        if (z.i === s.i) ownBound = lastBound;
        return e;
      });
      if (process.env.TRACE && L.E[s.i]! - Eb[s.i]! > Math.max(100, 3 * x.bits)) console.error(JSON.stringify({ t, fam: s.fam, params: s.params, bits: x.bits, calls: x.calls, from: prev, to: key(x.to), Eb: Eb[s.i], Ea: L.E[s.i], uB: s.rule.u(prevLine), uA: s.rule.u(x.to) }));
      log.push([t, s.i, lines.indexOf(L), Math.round(x.bits * 10) / 10, x.calls.length, Math.round((L.E[s.i]! - Eb[s.i]!) * 10) / 10, Math.round(L.E.reduce((a, e, j) => a + (j === s.i ? 0 : e - Eb[j]!), 0) * 10) / 10, sizeBits(L.line) - sizeBits(prevLine), ownBound ? 1 : 0, sizeBits(L.line), Math.round((s.rule.u(L.line) - s.rule.u(prevLine)) * 100) / 100]);
    }
    if ((t + 1) % 30 === 0) snaps.push({ t: t + 1, points: totals(), energy: energies(), balance: seats.map(s => s.balance), turns: seats.map(s => s.turns) });
  }
  // Final standing: every line re-estimated once more (the end's exact values), and its spread over fresh seeds.
  return {
    settings: { gravity: physics.gravity, power, store, K: physics.estimatorStarts, band: physics.sameSizeBand, seed, T, income, capacity },
    seats: seats.map(s => ({ i: s.i, fam: s.fam, params: s.params, kind: s.kind, turns: s.turns, skips: s.skips, spent: s.spent, knocks: s.knocks, why: s.why, byLens: s.byLens, byMove: s.byMove, medianTurnBits: median(s.bitsByTurn), balance: s.balance })),
    lines: lines.map(L => ({ born: L.born, commits: L.commits, distinct: L.states.size, lastCommit: L.lastCommit, end: key(L.line), E: L.E, E0: L.E0, u0: L.u0, uEnd: seats.map(s => s.rule.u(L.line)), lateCommits: L.commitTimes.filter(x => x >= T - 120).length })),
    snaps, log, estimates, estMs,
    final: { points: totals(), energy: energies() },
    lineStates: lines.map(L => L.line),
  };
}
const sizeBits = (l: Line) => [l.a, l.b, l.c].map(v => (v < 0n ? -v : v)).reduce((t, v) => (v > t ? v : t), 0n).toString(2).length;
export const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]!; };

if (import.meta.url === `file://${process.argv[1]}`) {
  const o = JSON.parse(process.argv[2] ?? "{}");
  const t0 = performance.now();
  const r = simulate(o);
  const { lineStates: _ls, ...rest } = r;
  const text = JSON.stringify({ ...rest, ms: performance.now() - t0 }, (_k, v) => (typeof v === "bigint" ? String(v) : typeof v === "number" ? Math.round(v * 100) / 100 : v));
  if (o.out) (await import("node:fs")).writeFileSync(o.out, text); else console.log(text);
}
