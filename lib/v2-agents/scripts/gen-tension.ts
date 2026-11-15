/**
 * Generates src/tension.gen.ts, the table behind unopposedDirections (src/unopposed.ts): per variant (line-q now; grids
 * later), the dealt rules, the cheap directions, every ordered pair's per-direction signature, each rule's gain per energy
 * along each cheap direction, and the constructed prime ladders with each rule's gain per energy along them. It prints the
 * distribution of joint gains behind WEAK_BELOW and the stretch-to-367 reference.
 *
 *   pnpm --filter @workspace/v2-agents gen-tension [-- --json docs/engine-v2/scripts/tension-results.json]
 *
 * Input: scripts/tension.ts's JSON (rerun it with --json when the pool or the prices change; about 5 minutes).
 *
 * Gain per energy along a cheap direction: the direction repeated `steps` (8) times from every sampled state of the rule;
 * over the runs that raise the rule, the total Δbits over the total price (fee + surcharge) of their moves. The repeat
 * is the better estimate than one application: a single move's mean gain given a rise is mostly local roughness (the
 * same move from the next state gives it back), while the repeat measures a climb that keeps paying. A rule with fewer
 * than MIN raising runs gets 0 (no sustained climb).
 *
 * Ladders: the 247k case is not in the cheap directions (a stretch by the line's own prime from a constructed line, and
 * the shift between prime-intercept lines, are not moves from sampled states). So each ladder is a family of lines built
 * around a prime p, as in tension.ts's flag (x-intercept and y-intercept (p, 2p), (2p, p), (p, p), (1, p)), scored for
 * primes p from 53 to about 5,000. A rule's gain per energy along it is the least-squares slope of its bits against the
 * line's read length (the law's bits of the line, which the surcharge charges): the coordinator's "bits per unit of the
 * prime against the surcharge per unit". Fees are left out, so it is an upper bound on what a climber earns per energy.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { applyPriced, variantMutators } from "@workspace/v2-core";
import { lineQ, lineType, normalise, type LineState } from "@workspace/v2-linear";
import { valuer } from "../src/harness.ts";
import { poolOf, ruleName } from "./landscape-lib.ts";
import { OPPORTUNITY_FRACTION } from "../src/unopposed.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const { values: o } = parseArgs({
  options: { json: { type: "string", default: join(root, "docs/engine-v2/scripts/tension-results.json") } },
  args: process.argv.slice(2).filter(a => a !== "--"),
});
const say = (s = "") => console.log(s);
const MIN = 8;
const round = (x: number) => Math.round(x * 1000) / 1000;

interface Results {
  seed: string; steps: number; rules: string[];
  directions: { id: string; mutator: string; args: Record<string, string>; fee: number; cheap: boolean }[];
  pairs: { a: string; b: string; ab: { signature: string }; ba: { signature: string } }[];
  repeats?: Record<string, [number, number, number, number][]>;
  opportunityFractions?: number[];
  opportunity?: Record<string, string[]>;
  exclusion?: string[];
}
const res = JSON.parse(readFileSync(o.json!, "utf8")) as Results;
if (!res.repeats || !res.opportunity) throw new Error(`${o.json} has no per-direction repeats or opportunity costs: rerun scripts/tension.ts with --json`);
const rules = res.rules, NR = rules.length;
const cheapIdx = res.directions.map((d, i) => (d.cheap ? i : -1)).filter(i => i >= 0);
const dirs = cheapIdx.map(i => res.directions[i]!);
const ND = dirs.length;

// ---------------------------------------------------------------- signatures and gains

const signatures = rules.map(() => Array.from({ length: NR * ND }, () => " "));
for (const p of res.pairs) {
  const a = rules.indexOf(p.a), b = rules.indexOf(p.b);
  for (let d = 0; d < ND; d++) { signatures[a]![b * ND + d] = p.ab.signature[d]!; signatures[b]![a * ND + d] = p.ba.signature[d]!; }
}
/** opposition[a][c · ND + d]: how many of the opportunity fractions C's opportunity cost reaches along A's climbs. */
const opposition = rules.map(r => Array.from({ length: NR * ND }, (_, k) => res.opportunity![r]![cheapIdx[k % ND]!]![Math.floor(k / ND)]!).join(""));
const gains = rules.map(r => cheapIdx.map(i => {
  const [, up, meanD, meanPrice] = res.repeats![r]![i]!;
  return up >= MIN && meanPrice > 0 ? round(meanD / meanPrice) : 0;
}));

// ---------------------------------------------------------------- ladders

const pool = poolOf("line-q").rules;
const names = pool.map(ruleName);
if (names.join() !== rules.join()) throw new Error("the pool has changed since tension.ts ran: rerun it with --json");
const bitsFns = pool.map(r => valuer(lineType, lineQ, r).bits);
const isPrime = (n: number) => { if (n < 2) return false; for (let k = 2; k * k <= n; k++) if (n % k === 0) return false; return true; };
const PRIMES: bigint[] = [];
for (let x = 53; x <= 5000; x = Math.ceil(x * 1.15)) { let p = x; while (!isPrime(p)) p++; if (!PRIMES.includes(BigInt(p))) PRIMES.push(BigInt(p)); }
/** The line with x-intercept x and y-intercept y (non-zero integers): y·X + x·Y − x·y = 0, normalised. */
function byIntercepts(x: bigint, y: bigint): LineState {
  const n = normalise(y, x, -x * y);
  if ("invalid" in n) throw new Error(n.invalid);
  return { lines: [n] };
}
const LADDERS: { id: string; line: (p: bigint) => LineState }[] = [
  { id: "ladder (p, 2p)", line: p => byIntercepts(p, 2n * p) },
  { id: "ladder (2p, p)", line: p => byIntercepts(2n * p, p) },
  { id: "ladder (p, p)", line: p => byIntercepts(p, p) },
  { id: "ladder (1, p)", line: p => byIntercepts(1n, p) },
];
function slope(xs: number[], ys: number[]): number {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
  return sxy / sxx;
}
const MS = variantMutators(lineType, lineQ);
const moves = res.directions.map(d => { const m = MS.find(x => x.id === d.mutator)!; return { m, args: m.args(lineQ).decode(d.args) }; });
const median = (xs: number[]) => { const t = xs.slice().sort((a, b) => a - b); return t[Math.floor(t.length / 2)]!; };
/**
 * Per ladder: each rule's slope (bits per bit of read length); its median gain over a doubling of p (p to the first
 * listed prime ≥ 2p); and its median opportunity cost over that doubling (its best bits one move from the line at p,
 * or staying, less its bits at the line at 2p).
 */
const ladders = LADDERS.map(l => {
  const lines = PRIMES.map(l.line), len = lines.map(s => lineType.readLength(s, lineQ));
  const bits = lines.map(s => bitsFns.map(b => b(s)));
  const doubling: number[][] = rules.map(() => []), cost: number[][] = rules.map(() => []);
  PRIMES.forEach((p, i) => {
    const j = PRIMES.findIndex(x => x >= 2n * p);
    if (j < 0) return;
    const near = bits[i]!.slice();
    for (const { m, args } of moves) {
      const r = applyPriced(lineType, lineQ, lines[i]!, m, 0, args as never);
      if ("invalid" in r) continue;
      bitsFns.forEach((b, c) => { near[c] = Math.max(near[c]!, b(r.result)); });
    }
    for (let c = 0; c < NR; c++) { doubling[c]!.push(bits[j]![c]! - bits[i]![c]!); cost[c]!.push(near[c]! - bits[j]![c]!); }
  });
  return {
    id: l.id, gains: bitsFns.map((_, c) => round(slope(len, bits.map(x => x[c]!)))),
    doubling: doubling.map(x => round(median(x))), cost: cost.map(x => round(median(x))),
  };
});

// ---------------------------------------------------------------- the reference and the distribution

// The reference: the 247k case (Square Area's spf and Whole Crossing's k-spf on the first ladder) while both are dealt;
// otherwise the strongest shared rise of two dealt rules of different families along any constructed ladder.
let SA = rules.indexOf("square-area/spf"), WC = rules.indexOf("whole-crossing/k-spf"), ref = ladders[0]!;
const PL = rules.indexOf("prime-landing/big-prime");
if (SA < 0 || WC < 0) {
  let best = -Infinity;
  const fam = (r: string) => r.split("/")[0];
  for (const l of ladders) for (let a = 0; a < NR; a++) for (let b = a + 1; b < NR; b++) {
    if (fam(rules[a]!) === fam(rules[b]!)) continue;
    const j = Math.min(l.gains[a]!, l.gains[b]!);
    if (j > best) { best = j; SA = a; WC = b; ref = l; }
  }
}
const reference = { ladder: ref.id, rules: [rules[SA]!, rules[WC]!], perRule: [ref.gains[SA]!, ref.gains[WC]!], gainPerEnergy: Math.min(ref.gains[SA]!, ref.gains[WC]!) };
const q = (xs: number[], f: number) => xs[Math.min(xs.length - 1, Math.floor(f * xs.length))]!;
const f3 = (x: number) => x.toFixed(3);
const quant = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return `n ${s.length}; median ${f3(q(s, 0.5))}, 75% ${f3(q(s, 0.75))}, 90% ${f3(q(s, 0.9))}, 95% ${f3(q(s, 0.95))}, 99% ${f3(q(s, 0.99))}, max ${f3(s.at(-1)!)}`; };

say(`Tension table for line-q from ${o.json} (seed ${res.seed}, repeats of ${res.steps}): ${NR} rules, ${ND} cheap directions, ${ladders.length} ladders over ${PRIMES.length} primes ${PRIMES[0]}–${PRIMES.at(-1)}.`);
say();
say(`Reference (${ref.id}${reference.rules.join() === "square-area/spf,whole-crossing/k-spf" ? "; the 247k line y = −2x + 734 is p = 367" : "; the 247k pair is no longer dealt: the strongest shared ladder rise"}): ${rules[SA]} ${f3(ref.gains[SA]!)}, ${rules[WC]} ${f3(ref.gains[WC]!)}, ${PL < 0 ? "(prime-landing/big-prime no longer dealt)" : `${rules[PL]} ${f3(ref.gains[PL]!)}`} bits per energy; joint (the smaller) ${f3(reference.gainPerEnergy)}.`);
const joint: number[] = [], jointSum: number[] = [], per: number[] = [];
const perBy = new Map<string, number[]>();
for (let a = 0; a < NR; a++) for (let d = 0; d < ND; d++) if (res.repeats[rules[a]!]![cheapIdx[d]!]![1]! >= MIN) per.push(gains[a]![d]!);
for (let a = 0; a < NR; a++) for (let b = a + 1; b < NR; b++) for (let d = 0; d < ND; d++) {
  if (signatures[a]![b * ND + d] !== "+" || signatures[b]![a * ND + d] !== "+") continue;
  const j = Math.min(gains[a]![d]!, gains[b]![d]!);
  joint.push(j); jointSum.push(gains[a]![d]! + gains[b]![d]!);
  const k = dirs[d]!.id; if (!perBy.has(k)) perBy.set(k, []); perBy.get(k)!.push(j);
}
say(`Per rule and cheap direction (≥ ${MIN} raising runs), gain per energy: ${quant(per)}.`);
say(`Shared rises (pair "+" both ways, per cheap direction), joint gain (the smaller): ${quant(joint)}.`);
say(`The same, as the sum of the two: ${quant(jointSum)}.`);
say();
say("| Direction | Shared pairs | Median joint | Max joint |");
say("|---|--:|--:|--:|");
for (const [k, v] of [...perBy].sort((x, y) => Math.max(...y[1]) - Math.max(...x[1]))) { const s = v.slice().sort((a, b) => a - b); say(`| ${k} | ${v.length} | ${f3(q(s, 0.5))} | ${f3(s.at(-1)!)} |`); }
say();
// Opportunity cost: of the shared rises, how often a third seated rule (another family) is opposed at each fraction.
{
  const F = res.opportunityFractions!, fam = (x: string) => x.split("/")[0];
  const lv = new Array(F.length + 1).fill(0) as number[];
  let n = 0;
  for (let a = 0; a < NR; a++) for (let b = a + 1; b < NR; b++) for (let d = 0; d < ND; d++) {
    if (signatures[a]![b * ND + d] !== "+" || signatures[b]![a * ND + d] !== "+") continue;
    for (let c = 0; c < NR; c++) {
      if (fam(rules[c]!) === fam(rules[a]!) || fam(rules[c]!) === fam(rules[b]!)) continue;
      const x = opposition[a]![c * ND + d]!, y = opposition[b]![c * ND + d]!;
      if (!/\d/.test(x) || !/\d/.test(y)) continue;
      n++; lv[Math.max(+x, +y)]!++;
    }
  }
  say(`Opportunity cost: of ${n} (shared rise, third rule) cases, the share opposed at each fraction of a climber's gain: ${F.map((f, i) => `${f}: ${(lv.slice(i + 1).reduce((t, v) => t + v, 0) / n).toFixed(2)}`).join(", ")}.`);
  const bySig: Record<string, number[]> = {};
  for (let a = 0; a < NR; a++) for (let c = 0; c < NR; c++) for (let d = 0; d < ND; d++) {
    const sg = signatures[a]![c * ND + d]!, x = opposition[a]![c * ND + d]!;
    if (sg === " " || !/\d/.test(x)) continue;
    (bySig[sg] ??= new Array(F.length + 1).fill(0) as number[])[+x]!++;
  }
  for (const [sg, l] of Object.entries(bySig)) {
    const t = l.reduce((u, v) => u + v, 0);
    say(`  signature "${sg}" (${t}): ${F.map((f, i) => `≥ ${f}: ${(l.slice(i + 1).reduce((u, v) => u + v, 0) / t).toFixed(2)}`).join(", ")}`);
  }
}
for (const l of ladders) {
  const up = l.gains.map((g, i) => [g, i] as const).filter(([g]) => g >= 0.05).sort((x, y) => y[0] - x[0]);
  const down = l.gains.map((g, i) => [g, i] as const).filter(([g]) => g <= -0.05);
  const cmax = l.cost.map((c, i) => [c, i] as const).sort((x, y) => y[0] - x[0]).slice(0, 3);
  say(`${l.id}: largest opportunity costs per doubling ${cmax.map(([c, i]) => `${rules[i]} ${f3(c)}`).join(", ")}; risers' doubling gains ${up.map(([, i]) => `${rules[i]} ${f3(l.doubling[i]!)}`).join(", ")}`);
  say(`${l.id}: rising ${up.map(([g, i]) => `${rules[i]} ${f3(g)}`).join(", ") || "none"}; falling ${down.map(([g, i]) => `${rules[i]} ${f3(g)}`).join(", ") || "none"}`);
}

// ---------------------------------------------------------------- write

const out = `// Generated by lib/v2-agents/scripts/gen-tension.ts (pnpm --filter @workspace/v2-agents gen-tension). Do not edit.
/**
 * Per variant: the dealt rules, the cheap directions (one call, mean fee ≤ 12 bits), and for unopposedDirections
 * (src/unopposed.ts):
 *   signatures[a]: for every rule b, one character per cheap direction (at b · directions + d): climbing a along d
 *     raises b ("+"), lowers it ("-"), leaves it ("0"), mixed ("~"), too few climbs ("."); " " not measured (the same
 *     rule or family). From scripts/tension.ts.
 *   gains[a][d]: rule a's bits per energy along d repeated ${res.steps} times from sampled states (over the raising runs, Δbits over
 *     the price of the moves); 0 when fewer than ${MIN} runs raise it.
 *   opportunityFractions, opposition[a]: for every rule c, one character per cheap direction (at c · directions + d):
 *     how many of the fractions c's opportunity cost reaches, as a share of a's gain, in at least half of a's rising
 *     runs along d (c's cost: its best bits one move from the start, or staying, less its bits at the run's end);
 *     " " not measured, "." too few runs. From scripts/tension.ts.
 *   ladders: constructed families of lines around a prime p; gains[a]: rule a's bits per bit of read length as p
 *     grows; doubling[a]: its median gain as p doubles; cost[c]: c's median opportunity cost over that doubling.
 *   reference: the 247k case (y = −2x + 734 on the first ladder), its two rising rules and joint gain.
 */
export interface TensionDirection { readonly id: string; readonly mutator: string; readonly args: Readonly<Record<string, string>>; readonly fee: number }
export interface TensionLadder { readonly id: string; readonly gains: readonly number[]; readonly doubling: readonly number[]; readonly cost: readonly number[] }
export interface TensionTable {
  readonly rules: readonly string[];
  readonly directions: readonly TensionDirection[];
  readonly signatures: readonly string[];
  readonly opportunityFractions: readonly number[];
  readonly opposition: readonly string[];
  readonly gains: readonly (readonly number[])[];
  readonly ladders: readonly TensionLadder[];
  readonly reference: { readonly ladder: string; readonly rules: readonly string[]; readonly perRule: readonly number[]; readonly gainPerEnergy: number };
}

export const TENSION: Readonly<Record<string, TensionTable>> = {
  "line-q": {
    rules: ${JSON.stringify(rules)},
    directions: [
${dirs.map(d => `      ${JSON.stringify({ id: d.id, mutator: d.mutator, args: d.args, fee: round(d.fee) })},`).join("\n")}
    ],
    signatures: [
${signatures.map(s => `      ${JSON.stringify(s.join(""))},`).join("\n")}
    ],
    opportunityFractions: ${JSON.stringify(res.opportunityFractions)},
    opposition: [
${opposition.map(x => `      ${JSON.stringify(x)},`).join("\n")}
    ],
    gains: [
${gains.map(g => `      ${JSON.stringify(g)},`).join("\n")}
    ],
    ladders: [
${ladders.map(l => `      ${JSON.stringify(l)},`).join("\n")}
    ],
    reference: ${JSON.stringify(reference)},
  },
};
`;
const file = join(import.meta.dirname, "..", "src", "tension.gen.ts");
writeFileSync(file, out);
console.error(`wrote ${file}`);

// ---------------------------------------------------------------- the opponent table (lib/v2-linear opponents.gen.ts)

/**
 * Family B opposes family A along a cheap direction d where A climbs (gain > 0 from ≥ MIN raising runs) when, for some
 * dealt rule b of B, climbing A along d lowers b ("-") or b's opportunity cost along A's climbs reaches
 * OPPORTUNITY_FRACTION of A's gain (src/unopposed.ts's two tests). B's share of A's climbs: over every (rule a of A,
 * direction d) where a climbs, the mean share of B's dealt rules that oppose it (an opportunity cost counting at
 * OPPONENT_FRACTION). Named: every family at OPPONENT_SHARE or more, and the strongest OPPONENT_TOP when they reach
 * OPPONENT_FLOOR (most families have none at the share: one move opposes few of another's rules). B is a named opponent of A when its share reaches OPPONENT_SHARE.
 */
const OPPONENT_SHARE = 0.5, OPPONENT_TOP = 3, OPPONENT_FLOOR = 0.2;
/** An opportunity cost counts when it reaches this multiple of the climber's gain (twice unopposed.ts's OPPORTUNITY_FRACTION). */
const OPPONENT_FRACTION = 2 * OPPORTUNITY_FRACTION;
const level = res.opportunityFractions!.findIndex(f => f >= OPPONENT_FRACTION) + 1;
const fam = (x: string) => x.split("/")[0]!;
const families = [...new Set(rules.map(fam))];
const shares: Record<string, Record<string, number>> = {};
for (const A of families) {
  const climbs: [number, number][] = [];
  for (let a = 0; a < NR; a++) if (fam(rules[a]!) === A) for (let d = 0; d < ND; d++) if (gains[a]![d]! > 0) climbs.push([a, d]);
  shares[A] = {};
  for (const B of families) {
    if (B === A || climbs.length === 0) continue;
    // Each climb counts the share of B's dealt rules that oppose it (so a family dealt in many instances is not favoured).
    const bs = rules.map((r, b) => (fam(r) === B ? b : -1)).filter(b => b >= 0);
    let n = 0;
    for (const [a, d] of climbs) {
      n += bs.filter(b => signatures[a]![b * ND + d] === "-" || +(opposition[a]![b * ND + d]!.replace(/\D/, "0")) >= level).length / bs.length;
    }
    shares[A]![B] = round(n / climbs.length);
  }
}
say();
say(`Opponents (share of a family's climbs another family opposes; named at ≥ ${OPPONENT_SHARE}, or the top ${OPPONENT_TOP} at ≥ ${OPPONENT_FLOOR}):`);
for (const A of families) say(`  ${A}: ${Object.entries(shares[A]!).sort((x, y) => y[1] - x[1]).map(([B, s]) => `${B} ${s.toFixed(2)}`).join(", ") || "no measured climbs"}`);
const localNamed = Object.fromEntries(families.map(A => {
  const ranked = Object.entries(shares[A]!).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  return [A, ranked.filter(([, s], i) => s >= OPPONENT_SHARE || (i < OPPONENT_TOP && s >= OPPONENT_FLOOR)).map(([B]) => B)];
}));
/**
 * Exclusion (the coordinator, 15 Nov; scripts/tension.ts): over the measured (rule a of A, rule b of B) pairs, the share
 * where b stays at its floor on a's high ground. B is an excluding opponent of A when that share reaches
 * OPPONENT_SHARE. The two kinds are kept apart (contest along a climb, exclusion on one object); a family is named
 * when either holds.
 */
if (!res.exclusion) throw new Error(`${o.json} has no exclusion measure: rerun scripts/tension.ts with --json`);
const exShares: Record<string, Record<string, number>> = {};
for (const A of families) {
  exShares[A] = {};
  for (const B of families) {
    if (B === A) continue;
    let n = 0, k = 0;
    for (let a = 0; a < NR; a++) if (fam(rules[a]!) === A) for (let b = 0; b < NR; b++) if (fam(rules[b]!) === B) {
      const ch = res.exclusion[a]![b]!;
      if (ch === "1" || ch === "0") { n++; if (ch === "1") k++; }
    }
    if (n) exShares[A]![B] = round(k / n);
  }
}
say();
say(`Exclusion (share of measured rule pairs where B stays at its floor on A's high ground; named at ≥ ${OPPONENT_SHARE}):`);
for (const A of families) say(`  ${A}: ${Object.entries(exShares[A]!).sort((x, y) => y[1] - x[1]).map(([B, s]) => `${B} ${s.toFixed(2)}`).join(", ") || "not measured"}`);
const excluding = Object.fromEntries(families.map(A => [A, Object.entries(exShares[A]!).filter(([, s]) => s >= OPPONENT_SHARE).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([B]) => B)]));
const named = Object.fromEntries(families.map(A => [A, [...new Set([...localNamed[A]!, ...excluding[A]!])]]));
say();
say("Named opponents (contest along a climb, then exclusion):");
for (const A of families) say(`  ${A}: ${named[A]!.join(", ") || "none"}`);
const namedBy = families.filter(B => !families.some(A => named[A]!.includes(B)));
say(`Families no one names: ${namedBy.join(", ") || "none"}`);
const opp = `// Generated by lib/v2-agents/scripts/gen-tension.ts (pnpm --filter @workspace/v2-agents gen-tension). Do not edit.
/**
 * Named opponents among the dealt line families on line-q (owner decision 30: adversaries to the climb), for the
 * seating rule that an unbounded family has at least one named opponent at its table when the pool has one.
 *
 * Family B opposes family A along a cheap direction where A climbs when climbing A lowers one of B's dealt rules, or
 * costs it at least ${OPPONENT_FRACTION} × A's gain in what it could reach one move away (lib/v2-agents unopposed.ts's tests,
 * from scripts/tension.ts, seed ${res.seed}). LINE_OPPONENT_SHARES[A][B]: over A's climbs (rule, direction), the mean share of B's dealt rules that oppose it.
 * By contest: the families whose share reaches ${OPPONENT_SHARE}, or failing that A's ${OPPONENT_TOP} strongest at
 * ${OPPONENT_FLOOR} or more, strongest first. LINE_OPPONENTS adds the families that exclude A. A family missing from the
 * table was not dealt (or had no measured climbs) when it was generated; it may be partial while families are redesigned.
 */
export const LINE_OPPONENT_SHARES: Readonly<Record<string, Readonly<Record<string, number>>>> = ${JSON.stringify(shares, null, 2)};

/** Contest along a climb only (the shares above): the families named by it. */
export const LINE_CONTEST_OPPONENTS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(localNamed, null, 2)};

/**
 * Exclusion (scripts/tension.ts, the coordinator's 15 Nov definition): LINE_EXCLUSION_SHARES[A][B], over the measured
 * pairs of A's and B's dealt rules, the share where B, climbed greedily for a few cheap moves that keep A high, stays
 * within 1 bit of its floor on A's sampled high states (A ≥ 8 bits). Two such rules cannot both be high on one object.
 */
export const LINE_EXCLUSION_SHARES: Readonly<Record<string, Readonly<Record<string, number>>>> = ${JSON.stringify(exShares, null, 2)};

/** Named opponents: by contest along a climb (LINE_CONTEST_OPPONENTS) or by exclusion (share ≥ ${OPPONENT_SHARE}), contest first. */
export const LINE_OPPONENTS: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(named, null, 2)};
`;
const oppFile = join(root, "lib", "v2-linear", "src", "opponents.gen.ts");
writeFileSync(oppFile, opp);
console.error(`wrote ${oppFile}`);
