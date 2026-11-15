/**
 * The alignment / tension matrix of the dealt line pool (owner decision 30): when a move climbs one rule's hill, what
 * happens to every other rule's bits? Measurements behind docs/engine-v2/tension-matrix.md. Analysis only: nothing here
 * changes game behaviour.
 *
 *   pnpm --filter @workspace/v2-agents tension -- [--perbin 24] [--maxbin 16] [--steps 8] [--seed t1] [--json file]
 *
 * Rules   every dealt (family, params, tie-breaker) of the preset lines-beginner on line-q with a committed value
 *         function (landscape-lib poolOf); bits = the rule's value function at the state's score (harness valuer).
 * States  per rule A, states covering A's bits range by subset simulation (as hold-measure.ts): draws from π, then the
 *         walk (v2-core walkStep) restricted to {bits_A ≥ u} for rising u; up to `perbin` distinct states per 1-bit bin
 *         0 … maxbin of A's bits.
 * Moves   a fixed set of directions: each line-q mutator with small arguments of both signs (shift, tilt, step, slide,
 *         nudge and intercept moves by ±1, ±2, ±1/2; pivots at x0 = −1, 1, 2; every mirror axis; stretch by 2, 3, 5, 7,
 *         1/2, 1/3, −2, −1/2). Each is applied once at every state of every rule (applyPriced, so its price is real).
 * Climbs  for an ordered pair (A, B) of rules of different families: among the (state of A's pool, direction) where the
 *         move raises A's bits, the fractions where B's bits rise / fall / stay (|Δ| < 1e-6) and the mean Δbits_B.
 * Basic strategies  the same along k = 1 … steps repeated applications of one move with a fixed argument (shift +1,
 *         tilt +1, stretch ×2, …), from every state: a climb of A is Δbits_A > 0 after k steps.
 * Flag    the shared-prime case: lines with x-intercept a prime p, and stretch by p, scored on every rule.
 * Climbs per rule  (JSON only, for scripts/gen-tension.ts) per rule and direction: one application's rises, falls,
 *         mean Δbits given a rise and mean price; and the direction repeated `steps` times from every state, its
 *         rises, mean Δbits given a rise and the price of the run; and along the runs that raise the rule, every other
 *         family's rule's opportunity cost (its best bits one move from the start less its bits at the run's end) as
 *         a share of the climber's gain.
 *
 * Printed: Markdown tables (the doc's results section). With --json, every count, per direction and strategy.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { applyPriced, rng, variantMutators, walkStep, type Rng } from "@workspace/v2-core";
import { lineLaw, lineQ, lineType, normalise, type LineState } from "@workspace/v2-linear";
import { valuer } from "../src/harness.ts";
import { poolOf, ruleName, type Rule } from "./landscape-lib.ts";

const { values: o } = parseArgs({
  options: {
    perbin: { type: "string", default: "24" }, maxbin: { type: "string", default: "16" }, steps: { type: "string", default: "8" },
    seed: { type: "string", default: "t1" }, json: { type: "string" },
  },
  allowPositionals: true,
  args: process.argv.slice(2).filter(a => a !== "--"),   // pnpm passes its "--" through
});
const PERBIN = Number(o.perbin), MAXBIN = Number(o.maxbin), STEPS = Number(o.steps), SEED = o.seed!;
const say = (s = "") => console.log(s);
const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–");
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–");

// ---------------------------------------------------------------- rules and bits

const pool = poolOf("line-q");
const RULES: Rule[] = pool.rules;
const NR = RULES.length;
const FAM = RULES.map(r => r.family);
const families = [...new Set(FAM)];
const bitsFns = RULES.map(r => valuer(lineType, lineQ, r).bits);
const cache = new Map<string, Float64Array>();
/** Every rule's bits at a state (cached by encoding). */
function allBits(s: LineState): Float64Array {
  const e = lineType.encode(s);
  let v = cache.get(e);
  if (!v) {
    if (cache.size > 400_000) cache.clear();
    v = new Float64Array(NR);
    for (let i = 0; i < NR; i++) v[i] = bitsFns[i]!(s);
    cache.set(e, v);
  }
  return v;
}

// ---------------------------------------------------------------- directions

const MS = variantMutators(lineType, lineQ);
interface Dir { readonly id: string; readonly mutator: string; readonly wire: Record<string, string>; readonly args: unknown }
const dir = (mutator: string, wire: Record<string, string>, label: string): Dir => {
  const m = MS.find(x => x.id === mutator);
  if (!m) throw new Error(`line-q has no mutator ${mutator}`);
  return { id: label, mutator, wire, args: m.args(lineQ).decode(wire) };
};
const DIRS: Dir[] = [
  ...["1", "-1", "2", "-2", "1/2", "-1/2"].map(k => dir("si.shift", { k }, `shift ${k}`)),
  ...["1", "-1", "2", "-2", "1/2", "-1/2"].map(k => dir("si.tilt", { k }, `tilt ${k}`)),
  ...["1", "-1", "2", "-2"].map(k => dir("seq.step", { k }, `step ${k}`)),
  ...["-1", "1", "2"].flatMap(x0 => ["1", "-1"].map(k => dir("cart.pivot", { x0, k }, `pivot@${x0} ${k}`))),
  ...[["1", "0"], ["-1", "0"], ["0", "1"], ["0", "-1"]].map(([u, v]) => dir("cart.slide", { u: u!, v: v! }, `slide (${u},${v})`)),
  ...["x", "y", "origin", "diagonal"].map(axis => dir("cart.mirror", { axis }, `mirror ${axis}`)),
  ...["a", "b", "c"].flatMap(which => ["1", "-1"].map(k => dir("gen.nudge", { which, k }, `nudge ${which} ${k}`))),
  ...["x", "y"].flatMap(axis => ["1", "-1"].map(k => dir("int.move", { axis, k }, `move ${axis} ${k}`))),
  ...["2", "3", "5", "7", "1/2", "1/3", "-2", "-1/2"].map(f => dir("mach.stretch", { f }, `stretch ×${f}`)),
];
const ND = DIRS.length;
/** The basic strategies: one move with a fixed argument, repeated. */
const STRATS: Dir[] = ["shift 1", "shift -1", "tilt 1", "tilt -1", "step 1", "pivot@-1 1", "slide (1,0)", "nudge a 1", "nudge c 1", "nudge c -1", "move x 1", "move y 1", "stretch ×2", "stretch ×3", "stretch ×1/2"]
  .map(id => { const d = DIRS.find(x => x.id === id); if (!d) throw new Error(id); return d; });
const NS = STRATS.length;
const KS = [1, 2, 4, STEPS].filter((k, i, a) => k <= STEPS && a.indexOf(k) === i);

function applyDir(s: LineState, d: Dir): { s: LineState; price: number; fee: number } | null {
  const m = MS.find(x => x.id === d.mutator)!;
  const r = applyPriced(lineType, lineQ, s, m, 0, d.args as never);
  if ("invalid" in r) return null;
  return { s: r.result, price: r.price.total, fee: r.price.total - r.price.surcharge };
}

// ---------------------------------------------------------------- states per rule (subset simulation)

const law = lineLaw(lineQ);
function draw(r: Rng): LineState { for (;;) { const d = law.draw(r, 1); if (d.state) return d.state; } }

function statesFor(a: number): LineState[] {
  const r = rng("tension", SEED, ruleName(RULES[a]!));
  const b = (s: LineState) => allBits(s)[a]!;
  type P = { s: LineState; bits: number };
  const N = 120, KEEP = 0.2, WALK = 16;
  let parts: P[] = Array.from({ length: N }, () => { const s = draw(r); return { s, bits: b(s) }; });
  const all: { p: P; floor: number }[] = parts.map(p => ({ p, floor: -Infinity }));
  for (let level = 0; level < 14; level++) {
    parts.sort((x, y) => y.bits - x.bits);
    let u = parts[Math.floor(KEEP * N)]!.bits;
    if (parts.filter(p => p.bits >= u).length > 0.6 * N) {
      const higher = parts.filter(p => p.bits > u);
      if (!higher.length) break;
      u = higher.at(-1)!.bits;
    }
    const seeds = parts.filter(p => p.bits >= u);
    const accept = (s: LineState) => b(s) >= u;
    parts = Array.from({ length: N }, (_, i) => {
      let s = seeds[i % seeds.length]!.s;
      for (let k = 0; k < WALK; k++) s = walkStep(lineType, lineQ, s, r, accept);
      return { s, bits: b(s) };
    });
    for (const p of parts) all.push({ p, floor: u });
    if (u >= MAXBIN + 1) break;
  }
  const chosen: LineState[] = [];
  for (let bin = 0; bin <= MAXBIN; bin++) {
    const seen = new Set<string>(), cand: LineState[] = [];
    for (const { p, floor } of all) {
      if (Math.min(MAXBIN, Math.floor(p.bits)) !== bin || floor > bin + 1) continue;
      const e = lineType.encode(p.s); if (seen.has(e)) continue; seen.add(e); cand.push(p.s);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = r.below(i + 1); [cand[i], cand[j]] = [cand[j]!, cand[i]!]; }
    chosen.push(...cand.slice(0, PERBIN));
  }
  return chosen;
}

// ---------------------------------------------------------------- tallies

const EPS = 1e-6;
/** [up, down, same, sumΔ] of B given a climb of A, per (A, direction, B). */
const T = new Float64Array(NR * ND * NR * 4);
const ti = (a: number, d: number, b: number) => ((a * ND + d) * NR + b) * 4;
/** Per (A, direction): moves made, moves raising A, sum of ΔA over raising moves, moves lowering A. */
const H = new Float64Array(NR * ND * 4);
/** Per (A, direction): sum of the price (fee + surcharge) over the moves raising A. */
const HP = new Float64Array(NR * ND);
/** Per (A, direction), the direction repeated STEPS times from every state: [runs, runs raising A, sum ΔA over raising runs, sum price of the STEPS moves over raising runs]. */
const HR = new Float64Array(NR * ND * 4);
/**
 * Opportunity cost (the coordinator, 14 Nov: small/smooth adversaries contest by opportunity cost, not by falling):
 * along a run of A's that rises, another rule C's cost is its best bits one move from the start (any direction, or
 * staying) less its bits at the run's end, as a ratio r to A's gain. Per (A, direction, C): [rising runs, runs with
 * r ≥ OPP_F[i] for each i].
 */
const OPP_F = [0.1, 0.25, 0.5, 1, 2, 4];
const NF = OPP_F.length;
const OC = new Float64Array(NR * ND * NR * (1 + NF));
const oci = (a: number, d: number, c: number) => ((a * ND + d) * NR + c) * (1 + NF);
/** Per (A, strategy, k index, B): [up, down, same, sumΔ] given Δbits_A > 0 after k steps. */
const TS = new Float64Array(NR * NS * KS.length * NR * 4);
const tsi = (a: number, s: number, k: number, b: number) => (((a * NS + s) * KS.length + k) * NR + b) * 4;
/** Per (A, strategy, k index): [runs, A raised, sum ΔA]. */
const HS = new Float64Array(NR * NS * KS.length * 3);
const feeSum = new Float64Array(ND), feeN = new Float64Array(ND);
/** By the sign of the move's read-length change (shorter, same, longer): [moves, moves raising A], and B's [up, down, same] given A climbs. */
const PHI_MOVES = Array.from({ length: 3 }, () => new Float64Array(2)), PHI_B = Array.from({ length: 3 }, () => new Float64Array(3));
/** The same split by the change in b of ax + by + c = 0 (normalised, b ≥ 0): the common denominator of the gradient and the y-intercept. */
const DEN_MOVES = Array.from({ length: 3 }, () => new Float64Array(2)), DEN_B = Array.from({ length: 3 }, () => new Float64Array(3));
const range: { lo: number; hi: number; n: number }[] = [];

function tally(row: Float64Array, d: number) { if (d > EPS) row[0]!++; else if (d < -EPS) row[1]!++; else row[2]!++; }

for (let a = 0; a < NR; a++) {
  const states = statesFor(a);
  let lo = Infinity, hi = -Infinity;
  for (const s of states) {
    const b0 = allBits(s);
    lo = Math.min(lo, b0[a]!); hi = Math.max(hi, b0[a]!);
    for (let d = 0; d < ND; d++) {
      const mv = applyDir(s, DIRS[d]!);
      if (!mv) continue;
      feeSum[d]! += mv.fee; feeN[d]!++;
      const b1 = allBits(mv.s), dA = b1[a]! - b0[a]!, h = (a * ND + d) * 4;
      const dPhi = lineType.readLength(mv.s, lineQ) - lineType.readLength(s, lineQ), ps = dPhi < -EPS ? 0 : dPhi > EPS ? 2 : 1;
      PHI_MOVES[ps]![0]!++; if (dA > EPS) PHI_MOVES[ps]![1]!++;
      const b0c = s.lines[0]!.b, b1c = mv.s.lines[0]!.b, qs = b1c < b0c ? 0 : b1c > b0c ? 2 : 1;
      DEN_MOVES[qs]![0]!++; if (dA > EPS) DEN_MOVES[qs]![1]!++;
      H[h]!++;
      if (dA < -EPS) H[h + 3]!++;
      if (dA <= EPS) continue;
      H[h + 1]!++; H[h + 2]! += dA; HP[a * ND + d]! += mv.price;
      for (let b = 0; b < NR; b++) {
        if (FAM[b] === FAM[a]) continue;
        const i = ti(a, d, b), db = b1[b]! - b0[b]!;
        const row = T.subarray(i, i + 4); tally(row, db); row[3]! += db;
        tally(PHI_B[ps]!, db); tally(DEN_B[qs]!, db);
      }
    }
    // Every rule's best bits one move from the start (or staying): its alternative to a climb along a direction.
    const bestNear = Float64Array.from(b0);
    for (let d = 0; d < ND; d++) {
      const mv = applyDir(s, DIRS[d]!);
      if (!mv) continue;
      const b1 = allBits(mv.s);
      for (let c = 0; c < NR; c++) if (b1[c]! > bestNear[c]!) bestNear[c] = b1[c]!;
    }
    // Every direction repeated STEPS times: the sustained climb along it (A's gain; tension-gen's gain per ⚡), and
    // the others' opportunity cost when it rises.
    for (let d = 0; d < ND; d++) {
      let x: LineState | null = s, price = 0;
      for (let k = 0; k < STEPS && x; k++) { const mv = applyDir(x, DIRS[d]!); x = mv ? mv.s : null; if (mv) price += mv.price; }
      if (!x) continue;
      const dA = bitsFns[a]!(x) - b0[a]!, h = (a * ND + d) * 4;
      HR[h]!++;
      if (dA <= EPS) continue;
      HR[h + 1]!++; HR[h + 2]! += dA; HR[h + 3]! += price;
      const bE = allBits(x);
      for (let c = 0; c < NR; c++) {
        if (FAM[c] === FAM[a]) continue;
        const i = oci(a, d, c), r = (bestNear[c]! - bE[c]!) / dA;
        OC[i]!++;
        for (let f = 0; f < NF; f++) if (r >= OPP_F[f]!) OC[i + 1 + f]!++;
      }
    }
    for (let si = 0; si < NS; si++) {
      let x: LineState | null = s;
      for (let k = 1; k <= STEPS && x; k++) {
        const mv = applyDir(x, STRATS[si]!);
        x = mv ? mv.s : null;
        const ki = KS.indexOf(k);
        if (!x || ki < 0) continue;
        const b1 = allBits(x), dA = b1[a]! - b0[a]!, h = ((a * NS + si) * KS.length + ki) * 3;
        HS[h]!++;
        if (dA <= EPS) continue;
        HS[h + 1]!++; HS[h + 2]! += dA;
        for (let b = 0; b < NR; b++) {
          if (FAM[b] === FAM[a]) continue;
          const i = tsi(a, si, ki, b), db = b1[b]! - b0[b]!;
          const row = TS.subarray(i, i + 4); tally(row, db); row[3]! += db;
        }
      }
    }
  }
  range.push({ lo, hi, n: states.length });
  console.error(`${ruleName(RULES[a]!)}: ${states.length} states, bits ${f2(lo)}–${f2(hi)} (${elapsed()})`);
}

// ---------------------------------------------------------------- classification

const MIN = 8;            // A-raising moves a direction needs before it is judged
const CHEAP = 12;         // a cheap direction: mean fee (price less surcharge) ≤ 12 bits
const fee = Array.from({ length: ND }, (_, d) => feeSum[d]! / feeN[d]!);
const cheap = fee.map(f => f <= CHEAP);

type Verdict = "with" | "against" | "none" | "mixed" | "few";
function dirVerdict(a: number, d: number, b: number): { v: Verdict; n: number; up: number; down: number; same: number; mean: number } {
  const i = ti(a, d, b), n = T[i]! + T[i + 1]! + T[i + 2]!;
  if (n < MIN) return { v: "few", n, up: NaN, down: NaN, same: NaN, mean: NaN };
  const up = T[i]! / n, down = T[i + 1]! / n, same = T[i + 2]! / n, mean = T[i + 3]! / n;
  const v: Verdict = up >= 0.5 && up >= 2 * down ? "with" : down >= 0.5 && down >= 2 * up ? "against" : same >= 0.5 ? "none" : "mixed";
  return { v, n, up, down, same, mean };
}
/** Pooled over the cheap directions: of A's climbing moves, the share raising / lowering / leaving B. */
function pooled(a: number, b: number) {
  let up = 0, down = 0, same = 0, sum = 0;
  for (let d = 0; d < ND; d++) if (cheap[d]) { const i = ti(a, d, b); up += T[i]!; down += T[i + 1]!; same += T[i + 2]!; sum += T[i + 3]!; }
  const n = up + down + same;
  return { n, up: up / n, down: down / n, same: same / n, mean: sum / n };
}

type Cls = "ALIGNED" | "IN TENSION" | "NEUTRAL" | "MIXED";
interface PairResult { a: number; b: number; cls: Cls; note: string; shared: string[]; against: string[]; ab: ReturnType<typeof pooled>; ba: ReturnType<typeof pooled> }
const pairs: PairResult[] = [];
for (let a = 0; a < NR; a++) for (let b = a + 1; b < NR; b++) {
  if (FAM[a] === FAM[b]) continue;
  const shared: string[] = [], against: string[] = [];
  for (let d = 0; d < ND; d++) {
    if (!cheap[d]) continue;
    const x = dirVerdict(a, d, b), y = dirVerdict(b, d, a);
    if (x.v === "with" && y.v === "with") shared.push(DIRS[d]!.id);
    if (x.v === "against" || y.v === "against") against.push(DIRS[d]!.id);
  }
  const ab = pooled(a, b), ba = pooled(b, a);
  let cls: Cls, note = "";
  if (shared.length && !against.length) cls = "ALIGNED";
  else if (ab.down >= 0.5 && ba.down >= 0.5 && ab.down > ab.up && ba.down > ba.up) cls = "IN TENSION";
  else if (ab.same >= 0.5 && ba.same >= 0.5) cls = "NEUTRAL";
  else {
    cls = "MIXED";
    if (shared.length) note = "shared climb";
    else if ((ab.down >= 0.5 && ab.down > ab.up) || (ba.down >= 0.5 && ba.down > ba.up)) note = "one-sided tension";
  }
  pairs.push({ a, b, cls, note, shared, against, ab, ba });
}

// ---------------------------------------------------------------- the flagged case: one prime for several rules

const idx = (name: string) => { const i = RULES.findIndex(r => ruleName(r) === name); if (i < 0) throw new Error(name); return i; };
const FLAG = ["square-area/spf", "whole-crossing/k-spf", "prime-landing/big-prime"].map(idx);
/** The line with x-intercept p and y-intercept q (p, q whole, non-zero): q·x + p·y − p·q = 0, normalised. */
function byIntercepts(p: bigint, q: bigint): LineState {
  const n = normalise(q, p, -p * q);
  if ("invalid" in n) throw new Error(n.invalid);
  return { lines: [n] };
}
const PRIMES = [5n, 11n, 31n, 101n, 1009n, 100003n];

// ---------------------------------------------------------------- report

const R = (i: number) => ruleName(RULES[i]!);
say(`Generated by \`pnpm --filter @workspace/v2-agents tension\` (seed ${SEED}, ${PERBIN} states per 1-bit bin of each rule's bits, bins 0–${MAXBIN}, strategies up to ${STEPS} steps) in ${elapsed()}.`);
say();
say(`${NR} rules (${families.length} families) of ${pool.preset} on line-q with committed value functions; ${pool.skipped.length ? `skipped (no value function): ${pool.skipped.join(", ")}` : "none skipped"}.`);
say(`${ND} directions, ${cheap.filter(Boolean).length} cheap (mean fee ≤ ${CHEAP} bits). ${pairs.length} unordered pairs of rules of different families.`);
say();
say("### States per rule");
say();
say("| Rule | States | Bits range |");
say("|---|--:|---|");
RULES.forEach((_, i) => say(`| ${R(i)} | ${range[i]!.n} | ${f2(range[i]!.lo)}–${f2(range[i]!.hi)} |`));
say();
say("### Directions: fee, and how many rules each climbs");
say();
say("A rule *likes* a direction when one application raises its bits at ≥ 40% of its states and lowers them at fewer. Climb / fall share: over every rule's states, the mean share of moves raising / lowering that rule's bits.");
say();
say("| Direction | Mean fee (bits) | Cheap | Rules liking it | Climb / fall share | Rules liking it |");
say("|---|--:|:-:|--:|--:|---|");
const likes: number[][] = DIRS.map(() => []);
DIRS.forEach((d, di) => {
  let up = 0, down = 0;
  for (let a = 0; a < NR; a++) {
    const h = (a * ND + di) * 4, n = Math.max(1, H[h]!), u = H[h + 1]! / n, w = H[h + 3]! / n;
    up += u / NR; down += w / NR;
    if (u >= 0.4 && u > w) likes[di]!.push(a);
  }
  say(`| ${d.id} | ${f2(fee[di]!)} | ${cheap[di] ? "yes" : "no"} | ${likes[di]!.length} | ${pct(up)} / ${pct(down)} | ${likes[di]!.map(R).join(", ")} |`);
});
say();

const counts = { "ALIGNED": 0, "IN TENSION": 0, "NEUTRAL": 0, "MIXED": 0 } as Record<Cls, number>;
for (const p of pairs) counts[p.cls]++;
const notes = pairs.reduce((m, p) => { if (p.note) m[p.note] = (m[p.note] ?? 0) + 1; return m; }, {} as Record<string, number>);
say("### Counts");
say();
say("| Class | Pairs |");
say("|---|--:|");
for (const c of Object.keys(counts) as Cls[]) say(`| ${c} | ${counts[c]} |`);
for (const [k, v] of Object.entries(notes)) say(`| MIXED, of which ${k} | ${v} |`);
say();

const SYM = (p: PairResult) => p.cls === "ALIGNED" ? "A" : p.cls === "IN TENSION" ? "T" : p.cls === "NEUTRAL" ? "·" : p.note === "shared climb" ? "a" : p.note === "one-sided tension" ? "t" : "~";
say("### Families × families");
say();
say("Each cell counts the rule pairs (tie-breaker × tie-breaker) by symbol: A aligned, a mixed with a shared climbing direction, T in tension, t one-sided tension, · neutral, ~ mixed.");
say();
const fshort = (f: string) => f.split("-").map(w => w[0]!.toUpperCase()).join("");
say(`| | ${families.map(fshort).join(" | ")} |`);
say(`|---|${families.map(() => "---").join("|")}|`);
for (const f of families) {
  const cells = families.map(g => {
    if (f === g) return "";
    const ps = pairs.filter(p => (FAM[p.a] === f && FAM[p.b] === g) || (FAM[p.a] === g && FAM[p.b] === f));
    const c: Record<string, number> = {};
    for (const p of ps) c[SYM(p)] = (c[SYM(p)] ?? 0) + 1;
    return ["A", "a", "T", "t", "·", "~"].filter(s => c[s]).map(s => `${s}${c[s]}`).join(" ");
  });
  say(`| **${fshort(f)}** ${f} | ${cells.join(" | ")} |`);
}
say();
say("### Rules × rules");
say();
say("```");
const head = RULES.map((_, i) => String(i).padStart(2)).join("");
say(`${"".padEnd(34)}${head}`);
for (let a = 0; a < NR; a++) {
  let row = `${String(a).padStart(2)} ${R(a).padEnd(31)}`;
  for (let b = 0; b < NR; b++) {
    if (a === b) { row += " \\"; continue; }
    if (FAM[a] === FAM[b]) { row += "  "; continue; }
    const p = pairs.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a))!;
    row += ` ${SYM(p)}`;
  }
  say(row);
}
say("```");
say();
say("### Aligned pairs");
say();
say("Shared direction: a cheap direction where climbing A raises B (≥ 50%, at least twice as often as it lowers it) and climbing B raises A likewise. Pooled: of A's climbing moves over all cheap directions, the share raising / lowering B.");
say();
say("| Pair | Class | Shared directions | Directions against | A → B up / down / same | B → A up / down / same |");
say("|---|---|---|---|---|---|");
for (const p of pairs.filter(x => x.cls === "ALIGNED")) {
  say(`| ${R(p.a)} · ${R(p.b)} | ${p.cls}${p.note ? ` (${p.note})` : ""} | ${p.shared.join(", ")} | ${p.against.join(", ") || "–"} | ${pct(p.ab.up)} / ${pct(p.ab.down)} / ${pct(p.ab.same)} | ${pct(p.ba.up)} / ${pct(p.ba.down)} / ${pct(p.ba.same)} |`);
}
say();
say("### Shared climbing directions: how many pairs share each");
say();
say("Over all pairs (aligned or mixed), the number whose shared directions include each direction, and the number with that direction against.");
say();
say("| Direction | Pairs sharing it | Pairs with it against |");
say("|---|--:|--:|");
DIRS.forEach(d => { const sh = pairs.filter(p => p.shared.includes(d.id)).length, ag = pairs.filter(p => p.against.includes(d.id)).length; if (cheap[DIRS.indexOf(d)]) say(`| ${d.id} | ${sh} | ${ag} |`); });
say();
say("### Pairs in tension");
say();
say("| Pair | A → B up / down / same (mean Δ) | B → A up / down / same (mean Δ) | Most-against directions |");
say("|---|---|---|---|");
for (const p of pairs.filter(x => x.cls === "IN TENSION" || x.note === "one-sided tension").sort((x, y) => (y.ab.down + y.ba.down) - (x.ab.down + x.ba.down))) {
  say(`| ${R(p.a)} · ${R(p.b)}${p.cls === "IN TENSION" ? "" : " (one-sided)"} | ${pct(p.ab.up)} / ${pct(p.ab.down)} / ${pct(p.ab.same)} (${f2(p.ab.mean)}) | ${pct(p.ba.up)} / ${pct(p.ba.down)} / ${pct(p.ba.same)} (${f2(p.ba.mean)}) | ${p.against.slice(0, 6).join(", ") || "–"} |`);
}
say();

// Basic strategies.
say("### Basic strategies (one move repeated)");
say();
say(`For each strategy and k: the share of (rule, state) runs where k steps raise the rule's own bits, the mean Δbits given a rise, and over the climbs of each rule A, the share of the other families' rules B raised / lowered.`);
say();
say("| Strategy | k | Runs raising own rule | Mean Δ own (given a rise) | Rules raised at ≥ 50% of their states | B up / down / same given A climbs |");
say("|---|--:|--:|--:|--:|---|");
const stratLikes: number[][][] = STRATS.map(() => KS.map(() => []));
STRATS.forEach((st, si) => KS.forEach((k, ki) => {
  let runs = 0, ups = 0, sum = 0, bu = 0, bd = 0, bs = 0;
  for (let a = 0; a < NR; a++) {
    const h = ((a * NS + si) * KS.length + ki) * 3;
    runs += HS[h]!; ups += HS[h + 1]!; sum += HS[h + 2]!;
    if (HS[h]! > 0 && HS[h + 1]! / HS[h]! >= 0.5) stratLikes[si]![ki]!.push(a);
    for (let b = 0; b < NR; b++) { const i = tsi(a, si, ki, b); bu += TS[i]!; bd += TS[i + 1]!; bs += TS[i + 2]!; }
  }
  const n = bu + bd + bs;
  say(`| ${st.id} | ${k} | ${pct(ups / runs)} | ${f2(sum / ups)} | ${stratLikes[si]![ki]!.length} | ${pct(bu / n)} / ${pct(bd / n)} / ${pct(bs / n)} |`);
}));
say();
const kLast = KS.length - 1;
say(`Rules each strategy raises at ≥ 50% of their states after ${KS[kLast]} steps:`);
say();
STRATS.forEach((st, si) => say(`- ${st.id}: ${stratLikes[si]![kLast]!.map(R).join(", ") || "none"}`));
say();

// Flagged case.
say("### Flag: one prime for several rules");
say();
say(`Bits of ${FLAG.map(R).join(", ")} (and every rule over 8 bits) on lines given by their intercepts.`);
say();
say("| Line (x-int, y-int) | " + FLAG.map(R).join(" | ") + " | Other rules over 8 bits |");
say("|---|" + FLAG.map(() => "--:").join("|") + "|---|");
for (const p of PRIMES) for (const [lab, x, y] of [["(p, 2p)", p, 2n * p], ["(p, −2p)", p, -2n * p], ["(p, p)", p, p], ["(2p, p)", 2n * p, p], ["(p, 2)", p, 2n], ["(1, p)", 1n, p]] as const) {
  const v = allBits(byIntercepts(x, y));
  const others = RULES.map((_, i) => i).filter(i => !FLAG.includes(i) && v[i]! > 8).map(i => `${R(i)} ${f2(v[i]!)}`);
  say(`| p = ${p}: ${lab} | ${FLAG.map(i => f2(v[i]!)).join(" | ")} | ${others.join(", ") || "–"} |`);
}
say();
say("Stretch by p from a line with x-intercept p and y-intercept c0 (the stretch keeps the x-intercept and multiplies the y-intercept by p): Δbits of the three rules, and the fee.");
say();
say("| p | c0 | " + FLAG.map(R).join(" Δ | ") + " Δ | Fee (bits) |");
say("|--:|--:|" + FLAG.map(() => "--:").join("|") + "|--:|");
const stretchM = MS.find(x => x.id === "mach.stretch")!;
for (const p of PRIMES) for (const c0 of [1n, 2n, -2n]) {
  const s = byIntercepts(p, c0), b0 = allBits(s);
  const r = applyPriced(lineType, lineQ, s, stretchM, 0, stretchM.args(lineQ).decode({ f: String(p) }) as never);
  if ("invalid" in r) { say(`| ${p} | ${c0} | refused: ${r.invalid} |`); continue; }
  const b1 = allBits(r.result);
  say(`| ${p} | ${c0} | ${FLAG.map(i => f2(b1[i]! - b0[i]!)).join(" | ")} | ${f2(r.price.total - r.price.surcharge)} |`);
}
say();
say("Per-direction detail among the three (A → B: share of A's climbing moves raising / lowering B, n climbs):");
say();
say("| A → B | " + DIRS.filter(d => d.mutator === "mach.stretch" || d.mutator === "int.move" || d.mutator === "si.shift").map(d => d.id).join(" | ") + " |");
const flagDirs = DIRS.map((d, i) => [d, i] as const).filter(([d]) => d.mutator === "mach.stretch" || d.mutator === "int.move" || d.mutator === "si.shift");
say("|---|" + flagDirs.map(() => "---").join("|") + "|");
for (const a of FLAG) for (const b of FLAG) {
  if (a === b) continue;
  say(`| ${R(a)} → ${R(b)} | ${flagDirs.map(([, d]) => { const x = dirVerdict(a, d, b); return x.v === "few" ? `– (${x.n})` : `${pct(x.up)}/${pct(x.down)} (${x.n})`; }).join(" | ")} |`);
}
say();

say("### Hidden shared anchors: shorter numbers, whole numbers");
say();
say("Every move split by the sign of its change in the line's read length φ (law bits: roughly, the size of the numbers written), and by the change in b of ax + by + c = 0 (the common denominator of the gradient and the y-intercept: b = 1 is a line with whole m and c). Share of moves raising the climbing rule A, and over A's climbs, the share raising / lowering / leaving another family's rule B.");
say();
say("| Move | Moves | Share raising A | B up / down / same given A climbs |");
say("|---|--:|--:|---|");
const splitRow = (lab: string, m: Float64Array, b: Float64Array) => { const n = b[0]! + b[1]! + b[2]!; say(`| ${lab} | ${m[0]} | ${pct(m[1]! / m[0]!)} | ${pct(b[0]! / n)} / ${pct(b[1]! / n)} / ${pct(b[2]! / n)} |`); };
["φ falls (shorter)", "φ unchanged", "φ rises (longer)"].forEach((lab, i) => splitRow(lab, PHI_MOVES[i]!, PHI_B[i]!));
["b falls (more whole)", "b unchanged", "b rises (less whole)"].forEach((lab, i) => splitRow(lab, DEN_MOVES[i]!, DEN_B[i]!));
say();

// Co-climbing: pooled over the cheap directions, climbing either raises the other more often than not.
say("### Co-climbing pairs (pooled)");
say();
say("Pairs where, pooled over every cheap direction, A's climbing moves raise B at ≥ 50% and more often than they lower it, and the same for B's climbs (whatever the per-direction verdicts).");
say();
say("| Pair | Class | A → B up / down / same (mean Δ) | B → A up / down / same (mean Δ) |");
say("|---|---|---|---|");
for (const p of pairs.filter(x => x.ab.up >= 0.5 && x.ab.up > x.ab.down && x.ba.up >= 0.5 && x.ba.up > x.ba.down)) {
  say(`| ${R(p.a)} · ${R(p.b)} | ${p.cls}${p.note ? ` (${p.note})` : ""} | ${pct(p.ab.up)} / ${pct(p.ab.down)} / ${pct(p.ab.same)} (${f2(p.ab.mean)}) | ${pct(p.ba.up)} / ${pct(p.ba.down)} / ${pct(p.ba.same)} (${f2(p.ba.mean)}) |`);
}
say();

/** One character per cheap direction for an ordered pair: + with, − against, 0 none, ~ mixed, . too few climbs. */
const CHEAP_DIRS = DIRS.map((_, d) => d).filter(d => cheap[d]);
const signature = (a: number, b: number) => CHEAP_DIRS.map(d => ({ with: "+", against: "-", none: "0", mixed: "~", few: "." })[dirVerdict(a, d, b).v]).join("");
say("### Per-direction signatures");
say();
say("For the aligned and in-tension pairs (every pair's are in the JSON): one character per cheap direction, in this order:");
say();
CHEAP_DIRS.forEach((d, i) => say(`${String(i + 1).padStart(2)}. ${DIRS[d]!.id}`));
say();
say("\\+ climbing A raises B (≥ 50%, at least twice as often as it lowers it), − lowers it likewise, 0 leaves it (≥ 50%), ~ mixed, . fewer than 8 climbs of A.");
say();
say("```");
for (const p of pairs.filter(x => x.cls === "ALIGNED" || x.cls === "IN TENSION")) {
  say(`${p.cls === "MIXED" ? "shared" : p.cls === "ALIGNED" ? "aligned" : "tension"}  ${R(p.a)} → ${R(p.b)}`.padEnd(80) + signature(p.a, p.b));
  say(`${"".padEnd(9)}${R(p.b)} → ${R(p.a)}`.padEnd(80) + signature(p.b, p.a));
}
say("```");
say();

if (o.json) {
  const st = (x: ReturnType<typeof pooled>) => ({ n: x.n, up: +x.up.toFixed(2), down: +x.down.toFixed(2), same: +x.same.toFixed(2), mean: +x.mean.toFixed(2) });
  writeFileSync(o.json, JSON.stringify({
    seed: SEED, perbin: PERBIN, maxbin: MAXBIN, steps: STEPS, rules: RULES.map((_, i) => R(i)),
    directions: DIRS.map((d, i) => ({ id: d.id, mutator: d.mutator, args: d.wire, fee: +fee[i]!.toFixed(3), cheap: cheap[i] })),
    signatureLegend: "one character per cheap direction (directions with cheap: true, in order): + with, - against, 0 none, ~ mixed, . fewer than 8 climbs",
    pairs: pairs.map(p => ({ a: R(p.a), b: R(p.b), cls: p.cls, note: p.note || undefined,
      ab: { ...st(p.ab), signature: signature(p.a, p.b) }, ba: { ...st(p.ba), signature: signature(p.b, p.a) } })),
    strategiesLegend: "per strategy, per rule: for k in ks, [runs, runs raising the rule, mean Δbits given a rise]",
    ks: KS,
    strategies: Object.fromEntries(STRATS.map((x, si) => [x.id, Object.fromEntries(RULES.map((_, a) => [R(a), KS.map((_k, ki) => {
      const h = ((a * NS + si) * KS.length + ki) * 3;
      return [HS[h]!, HS[h + 1]!, +(HS[h + 2]! / Math.max(1, HS[h + 1]!)).toFixed(2)];
    })]))])),
    climbsLegend: "per rule, per direction (in the order of directions): [moves, moves raising the rule, moves lowering it, mean Δbits given a rise, mean price (fee + surcharge, bits) of the raising moves]",
    climbs: Object.fromEntries(RULES.map((_, a) => [R(a), DIRS.map((_d, d) => {
      const h = (a * ND + d) * 4, up = Math.max(1, H[h + 1]!);
      return [H[h]!, H[h + 1]!, H[h + 3]!, +(H[h + 2]! / up).toFixed(3), +(HP[a * ND + d]! / up).toFixed(3)];
    })])),
    repeatsLegend: `per rule, per direction: the direction repeated ${STEPS} times from every state, [runs, runs raising the rule, mean Δbits given a rise, mean price (fee + surcharge, bits) of the ${STEPS} moves of a raising run]`,
    opportunityLegend: `per rule A, per direction (in order): one character per rule C (in the order of rules): the number of fractions in [${OPP_F.join(", ")}] that C's opportunity cost reaches, as a share of A's gain, in at least half of A's rising runs of ${STEPS} repeats (C's cost: its best bits one move from the start, or staying, less its bits at the run's end); " " the same family, "." fewer than 8 rising runs`,
    opportunityFractions: OPP_F,
    opportunity: Object.fromEntries(RULES.map((_, a) => [R(a), DIRS.map((_d, d) => RULES.map((_c, c) => {
      if (FAM[c] === FAM[a]) return " ";
      const i = oci(a, d, c), n = OC[i]!;
      if (n < 8) return ".";
      let k = 0;
      while (k < NF && OC[i + 1 + k]! >= 0.5 * n) k++;
      return String(k);
    }).join(""))])),
    repeats: Object.fromEntries(RULES.map((_, a) => [R(a), DIRS.map((_d, d) => {
      const h = (a * ND + d) * 4, up = Math.max(1, HR[h + 1]!);
      return [HR[h]!, HR[h + 1]!, +(HR[h + 2]! / up).toFixed(3), +(HR[h + 3]! / up).toFixed(3)];
    })])),
  }));
}
