/**
 * The alignment / tension matrix of the two-line pool (lines-pairs on pair-q; owner decision 30: every unbounded hill
 * has an adversary), as scripts/tension.ts measures the line pool. Analysis only: nothing here changes game behaviour.
 *
 *   node --experimental-strip-types scripts/pair-tension.ts [--perbin 12] [--maxbin 16] [--steps 8] [--bits 8] [--seed p1]
 *
 * Rules       every dealt (family, tie-breaker) of lines-pairs with a committed value function (landscape-lib poolOf).
 * States      per rule A, up to `perbin` distinct states per 1-bit bin 0 … maxbin of A's bits, by subset simulation
 *             (draws from π, then the walk restricted to {bits_A ≥ u} for rising u), as tension.ts.
 * Directions  every call whose arguments cost at most `bits` bits (climbers.ts callsUpTo): each line move on either
 *             line, the system moves (combine, turn, reflect, quarter, slide along the other line, translate).
 * Matrix      for an ordered pair of families (A, B): over (state of A's, direction) where the move raises A's bits,
 *             the share where B's best tie-breaker rule rises and where it falls. "Aligned" when B rises more often
 *             than it falls.
 * Strategies  each direction repeated `steps` times from every state: how many families' rules it raises at once
 *             (Δbits > 1), and the largest gain of the second-best family raised (the joint gain a shared climb pays).
 */
import { parseArgs } from "node:util";
import { applyPriced, rng, variantMutators, walkStep, type Rng } from "@workspace/v2-core";
import { pairLaw, pairQ, pairType, type PairState } from "@workspace/v2-pair";
import { valuer } from "../src/harness.ts";
import { callsUpTo } from "./climbers.ts";
import { poolOf, ruleName } from "./landscape-lib.ts";

const { values: o } = parseArgs({
  options: {
    perbin: { type: "string", default: "12" }, maxbin: { type: "string", default: "16" }, steps: { type: "string", default: "8" },
    bits: { type: "string", default: "8" }, seed: { type: "string", default: "p1" },
  },
  args: process.argv.slice(2).filter(a => a !== "--"),
});
const PERBIN = Number(o.perbin), MAXBIN = Number(o.maxbin), STEPS = Number(o.steps), SEED = o.seed!;
const say = (s = "") => console.log(s);
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–");
const t0 = Date.now();

const RULES = poolOf("pair-q").rules;
const NR = RULES.length;
const FAMS = [...new Set(RULES.map(r => r.family))];
const NF = FAMS.length;
const famOf = RULES.map(r => FAMS.indexOf(r.family));
const bitsFns = RULES.map(r => valuer(pairType, pairQ, r).bits);
const cache = new Map<string, Float64Array>();
function allBits(s: PairState): Float64Array {
  const e = pairType.encode(s);
  let v = cache.get(e);
  if (!v) {
    if (cache.size > 300_000) cache.clear();
    v = new Float64Array(NR);
    for (let i = 0; i < NR; i++) v[i] = bitsFns[i]!(s);
    cache.set(e, v);
  }
  return v;
}
/** Per family, the best of its tie-breaker rules (a seat holds one; the family's direction is what is compared). */
function famBits(s: PairState): Float64Array {
  const b = allBits(s), f = new Float64Array(NF).fill(-Infinity);
  for (let i = 0; i < NR; i++) f[famOf[i]!] = Math.max(f[famOf[i]!]!, b[i]!);
  return f;
}

const MS = variantMutators(pairType, pairQ);
const DIRS = callsUpTo(pairType, pairQ, Number(o.bits)).map(c => {
  const m = MS.find(x => x.id === c.mutator)!;
  return { id: `${c.mutator} ${Object.values(c.args).join(",")}`, m, args: m.args(pairQ).decode(c.args) };
});
function apply(s: PairState, d: (typeof DIRS)[number]): PairState | null {
  const r = applyPriced(pairType, pairQ, s, d.m, 0, d.args as never);
  return "invalid" in r ? null : r.result;
}

const law = pairLaw(pairQ);
function draw(r: Rng): PairState { for (;;) { const d = law.draw(r, 1); if (d.state) return d.state; } }
function statesFor(a: number): PairState[] {
  const r = rng("pair-tension", SEED, ruleName(RULES[a]!));
  const b = (s: PairState) => allBits(s)[a]!;
  type P = { s: PairState; bits: number };
  const N = 80, KEEP = 0.2, WALK = 12;
  let parts: P[] = Array.from({ length: N }, () => { const s = draw(r); return { s, bits: b(s) }; });
  const all: P[] = [...parts];
  for (let level = 0; level < 14; level++) {
    parts.sort((x, y) => y.bits - x.bits);
    let u = parts[Math.floor(KEEP * N)]!.bits;
    if (parts.filter(p => p.bits >= u).length > 0.6 * N) {
      const higher = parts.filter(p => p.bits > u);
      if (!higher.length) break;
      u = higher.at(-1)!.bits;
    }
    const seeds = parts.filter(p => p.bits >= u);
    const accept = (s: PairState) => b(s) >= u;
    parts = Array.from({ length: N }, (_, i) => {
      let s = seeds[i % seeds.length]!.s;
      for (let k = 0; k < WALK; k++) s = walkStep(pairType, pairQ, s, r, accept);
      return { s, bits: b(s) };
    });
    all.push(...parts);
    if (u >= MAXBIN + 1) break;
  }
  const chosen: PairState[] = [];
  for (let bin = 0; bin <= MAXBIN; bin++) {
    const seen = new Set<string>(), cand: PairState[] = [];
    for (const p of all) {
      if (Math.min(MAXBIN, Math.floor(p.bits)) !== bin) continue;
      const e = pairType.encode(p.s); if (seen.has(e)) continue; seen.add(e); cand.push(p.s);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = r.below(i + 1); [cand[i], cand[j]] = [cand[j]!, cand[i]!]; }
    chosen.push(...cand.slice(0, PERBIN));
  }
  return chosen;
}

// Tallies: rises[A][B], falls[A][B], climbs[A] (one application raising A).
const rises = FAMS.map(() => new Float64Array(NF)), falls = FAMS.map(() => new Float64Array(NF)), climbs = new Float64Array(NF);
// Strategies: per repeated run that raises some family by > 1 bit, how many families it raises by > 1 bit.
const raisedCount = new Map<number, number>();
let runs = 0, bestJoint = { gain: 0, dir: "", start: "", end: "", fams: [] as string[] };
const EPS = 1e-6;
for (let a = 0; a < NR; a++) {
  const fa = famOf[a]!;
  const states = statesFor(a);
  for (const s of states) {
    const f0 = famBits(s);
    for (const d of DIRS) {
      const s1 = apply(s, d);
      if (s1) {
        const f1 = famBits(s1);
        if (f1[fa]! > f0[fa]! + EPS) {
          climbs[fa]!++;
          for (let b = 0; b < NF; b++) {
            if (b === fa) continue;
            if (f1[b]! > f0[b]! + EPS) rises[fa]![b]!++;
            else if (f1[b]! < f0[b]! - EPS) falls[fa]![b]!++;
          }
        }
      }
      // The direction repeated STEPS times (the basic strategy), from this state.
      let t: PairState | null = s;
      for (let k = 0; k < STEPS && t; k++) t = apply(t, d);
      if (!t) continue;
      const fe = famBits(t);
      const gains = Array.from(fe, (x, i) => x - f0[i]!);
      const up = gains.map((g, i) => [g, i] as const).filter(([g]) => g > 1).sort((x, y) => y[0] - x[0]);
      if (!up.length) continue;
      runs++;
      raisedCount.set(up.length, (raisedCount.get(up.length) ?? 0) + 1);
      if (up.length >= 2 && up[1]![0] > bestJoint.gain) bestJoint = { gain: up[1]![0], dir: `${d.id} ×${STEPS}`, start: pairType.encode(s), end: pairType.encode(t), fams: up.slice(0, 3).map(([g, i]) => `${FAMS[i]} +${g.toFixed(1)}`) };
    }
  }
  console.error(`${ruleName(RULES[a]!)}: ${states.length} states (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

say(`pair-q, lines-pairs: ${NR} rules in ${NF} families, ${DIRS.length} directions (arguments ≤ ${o.bits} bits), strategies repeated ${STEPS} times.`);
say();
say("When a move raises the row's family, the share of those moves that raise / lower the column's (best tie-breaker):");
say();
say(`| raises ↓ \\ then → | ${FAMS.join(" | ")} |`);
say(`|---|${FAMS.map(() => "---").join("|")}|`);
let aligned = 0, opposed = 0;
for (let a = 0; a < NF; a++) {
  const cells = FAMS.map((_, b) => {
    if (a === b) return "·";
    const up = rises[a]![b]! / climbs[a]!, down = falls[a]![b]! / climbs[a]!;
    if (up > down) aligned++; else opposed++;
    return `${pct(up)} / ${pct(down)}`;
  });
  say(`| ${FAMS[a]} (${climbs[a]} climbs) | ${cells.join(" | ")} |`);
}
say();
say(`Ordered pairs where the column rises more often than it falls (aligned): ${aligned} of ${aligned + opposed}.`);
say();
say(`Repeated basic strategies that raise some family by more than 1 bit: ${runs}. How many families each raises by more than 1 bit:`);
say();
for (const [k, n] of [...raisedCount.entries()].sort((x, y) => x[0] - y[0])) say(`- ${k}: ${pct(n / runs)} (${n})`);
say();
say(`Largest second-family gain of one repeated strategy: ${bestJoint.gain.toFixed(1)} bits, ${bestJoint.dir} from ${bestJoint.start} to ${bestJoint.end} (${bestJoint.fams.join(", ")}).`);
say(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
