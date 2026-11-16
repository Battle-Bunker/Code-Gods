/**
 * The interaction census (docs/engine-v2/interaction-census.md): how randomly drawn rules interact, by structure, not by
 * simulated play. For many random draws of two and of three rules from a candidate pool, on a bounded grid of lines:
 *
 * - each rule's grid rarity of every line: bits = −log2(share of the grid's lines scoring at least as well), its score
 *   compared in full (main part, then the dealt layers);
 * - jointly good places: the lines where every drawn rule has at least T bits, grouped into places (connected under the
 *   grid's cheap moves: one step of the gradient or of the y-intercept); how many, and how far apart;
 * - valleys: between two places, the best path's worst joint bits (a bottleneck), so whether moving from one to the
 *   next means passing through a worse state for someone;
 * - cheap moves: from sampled lines, each rule's improving one-step moves, and what each does to the others (helps,
 *   neutral, harms);
 * - alliances: where one rule's main part is high, whether another rule's later layer rises with it;
 * - dull draws (independent: no interaction) and hopeless ones (no jointly good place on the grid).
 *
 * What it is NOT (labelled for the reader): grid rarity is not the game's law (the law weighs short codes, so small
 * numbers are commoner than here); the grid's cheap moves are not the game's priced mutators (shortcuts such as a
 * stretch or a reflection are missing); the grid is bounded. Every result is "seen in a narrow test" under these
 * assumptions.
 *
 *   node --experimental-strip-types scripts/census.ts [--draws 60] [--threshold 5] [--seed s] [--json out.json]
 */
import { writeFileSync } from "node:fs";
import { evaluateSite, Qn, q, rng, type Q, type RuleFamily, type TieBreaker } from "@workspace/v2-core";
import { fromMC, lineQ, lineType, mcOf, rarityHeight, type LineState } from "../src/index.ts";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]!; };
const DRAWS = Number(opt("draws", "60")), T = Number(opt("threshold", "5")), SEED = opt("seed", "census-1");
const POOL = opt("pool", "all");
/** "grid": every line of the grid counts the same. "trial": a line counts its chance under the scoring trial's law, 2^−H
 * (trial-rarity.ts rarityHeight), so big numbers are as rare as the trial makes them. */
const LAW = opt("law", "grid");

// ---------------------------------------------------------------- the grid

/** Fractions with these bottoms, |x| ≤ max, sorted and distinct. */
function values(max: number, bottoms: number[]): Q[] {
  const seen = new Map<string, Q>();
  for (const b of bottoms) for (let a = -max * b; a <= max * b; a++) { const x = q(BigInt(a), BigInt(b)); seen.set(Qn.toWire(x), x); }
  return [...seen.values()].sort((x, y) => Qn.cmp(x, y));
}
const MS = values(Number(opt("m-max", "40")), [1, 2, 3]), CS = values(Number(opt("c-max", "160")), [1, 2]);
const NM = MS.length, NC = CS.length, N = NM * NC;
const at = (i: number, j: number) => i * NC + j;

// ---------------------------------------------------------------- the candidate pool

type AnyFamily = RuleFamily<LineState, unknown>;
interface Rule { family: AnyFamily; params: unknown; chain: TieBreaker; label: string }
const byId = new Map(lineType.families.map(f => [f.id, f as AnyFamily]));
/** Family ids in the candidate pool: the dealt beginner families and the tree families (undealt). */
const DEALT = ["prime-gradient", "prime-landing", "smooth-intercept", "square-area", "whole-crossing", "treasure", "same-on-both-rulers", "ruler", "pythagorean-area"];
const TREE = lineType.families.filter(f => (f as AnyFamily).valuation === "tree").map(f => f.id);
const IDS = POOL === "dealt" ? DEALT : POOL === "tree" ? TREE : [...DEALT, ...TREE];

function drawRule(r: ReturnType<typeof rng>): Rule {
  const family = byId.get(IDS[r.below(IDS.length)]!)!;
  const params = family.space ? family.space.draw(r) : (() => { const d = family.dealable(lineQ); return d[r.below(d.length)]; })();
  const chains = family.chains ?? (family.valuation === "tree" ? [family.tieBreakers.map(t => t.id).join(">")] : family.tieBreakers.map(t => t.id));
  const chain = chains.length ? chains[r.below(chains.length)]! : null;
  const pl = family.space ? family.space.label(params) : JSON.stringify(params);
  return { family, params, chain, label: `${family.id}(${pl})${chain ? ` [${chain}]` : ""}` };
}

// ---------------------------------------------------------------- scoring a rule on the grid

interface Scored { bits: Float32Array; main: Float64Array; layers: Float64Array[] }
const cache = new Map<string, Scored>();
const STATES: LineState[] = [];
for (let i = 0; i < NM; i++) for (let j = 0; j < NC; j++) STATES.push({ lines: [fromMC(MS[i]!, CS[j]!)] });
/** Each line's weight, summing to 1. */
const WEIGHT = new Float64Array(N);
{
  let total = 0;
  for (let k = 0; k < N; k++) { const mc = mcOf(STATES[k]!.lines[0]!); WEIGHT[k] = LAW === "trial" ? 2 ** -rarityHeight(mc!) : 1; total += WEIGHT[k]!; }
  for (let k = 0; k < N; k++) WEIGHT[k]! /= total;
}

function scoreRule(rule: Rule): Scored {
  const hit = cache.get(rule.label);
  if (hit) return hit;
  const depth = 1 + (rule.chain ? rule.chain.split(">").length : 0);
  const vec = Array.from({ length: depth }, () => new Float64Array(N));
  for (let k = 0; k < N; k++) {
    let s: readonly unknown[] | null = null;
    try { s = evaluateSite(lineType, rule.family, rule.params, STATES[k]!, lineQ, 0, rule.chain).score as never; } catch { s = null; }
    for (let d = 0; d < depth; d++) {
      const v = s && s[d] !== undefined ? s[d] : null;
      vec[d]![k] = v && typeof v === "object" && "n" in (v as object) ? Qn.toNumber(v as Q) : -Infinity;
    }
  }
  // Rarity on the grid: the share at least as good, lexicographically.
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => { for (let d = 0; d < depth; d++) { const x = vec[d]![b]! - vec[d]![a]!; if (x) return x > 0 ? 1 : -1; } return 0; });
  const bits = new Float32Array(N);
  let start = 0, mass = 0;
  for (let r = 0; r < N; r++) {
    mass += WEIGHT[order[r]!]!;
    const same = r + 1 < N && vec.every(v => v[order[r]!] === v[order[r + 1]!]);
    if (same) continue;
    const share = Math.min(1, mass);   // every line in the tie block [start, r] has this much weight at least as good
    for (let t = start; t <= r; t++) bits[order[t]!] = -Math.log2(share);
    start = r + 1;
  }
  const out = { bits, main: vec[0]!, layers: vec.slice(1) };
  cache.set(rule.label, out);
  return out;
}

// ---------------------------------------------------------------- one draw

const neighbours = (k: number): number[] => {
  const i = Math.floor(k / NC), j = k % NC, out: number[] = [];
  if (i > 0) out.push(at(i - 1, j)); if (i < NM - 1) out.push(at(i + 1, j));
  if (j > 0) out.push(at(i, j - 1)); if (j < NC - 1) out.push(at(i, j + 1));
  return out;
};
const lineText = (k: number) => `y = ${Qn.toWire(MS[Math.floor(k / NC)]!)}x + ${Qn.toWire(CS[k % NC]!)}`;

interface DrawResult {
  rules: string[];
  goodLines: number; places: number; placeBest: string[];
  spread: number;                 // the largest grid distance (steps of m plus steps of c) between two places' best lines
  valleys: number[];              // for each merge of two good places, T minus the bottleneck's joint bits
  pmi: number;                    // log2 of P(all ≥ T) / Π P(each ≥ T)
  moves: { help: number; neutral: number; harm: number };
  alliance: { rule: string; layer: string; with: string; rho: number } | null;
  verdict: "rich" | "dull" | "hopeless" | "conflict";
}

function draw(rules: Rule[]): DrawResult {
  const sc = rules.map(scoreRule);
  // Each rule's own bar: T bits, or just under its best on the grid when its ties are coarser than that (a rule reading
  // one rounded number has few distinct scores on a bounded grid). Joint bits are each rule's bits over its bar, times T.
  const bar = sc.map(s => Math.min(T, s.bits.reduce((a, b) => Math.max(a, b), 0) - 0.5));
  const joint = new Float32Array(N);
  for (let k = 0; k < N; k++) { let m = Infinity; for (let i = 0; i < sc.length; i++) m = Math.min(m, (sc[i]!.bits[k]! / bar[i]!) * T); joint[k] = m; }
  // Places: union-find in descending joint bits (a Kruskal bottleneck tree); a merge of two components that each
  // already hold a good line is a valley between two places.
  const parent = new Int32Array(N).fill(-1), best = new Int32Array(N);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => joint[b]! - joint[a]!);
  const valleys: number[] = [];
  const isGood = (k: number) => joint[best[find(k)]!]! >= T;
  for (const k of order) {
    parent[k] = k; best[k] = k;
    for (const n of neighbours(k)) {
      if (parent[n] === -1) continue;
      const a = find(k), b = find(n);
      if (a === b) continue;
      if (joint[best[a]!]! >= T && joint[best[b]!]! >= T && joint[k]! < T) valleys.push(T - joint[k]!);
      const keep = joint[best[a]!]! >= joint[best[b]!]! ? best[a]! : best[b]!;
      parent[b] = a; best[a] = keep;
    }
  }
  // Places at threshold T: components of good lines.
  const comp = new Int32Array(N).fill(-1);
  const placeBestK: number[] = [];
  for (let k = 0; k < N; k++) {
    if (joint[k]! < T || comp[k] !== -1) continue;
    const id = placeBestK.length, stack = [k];
    let top = k;
    comp[k] = id;
    while (stack.length) { const x = stack.pop()!; if (joint[x]! > joint[top]!) top = x; for (const n of neighbours(x)) if (comp[n] === -1 && joint[n]! >= T) { comp[n] = id; stack.push(n); } }
    placeBestK.push(top);
  }
  let spread = 0;
  for (const a of placeBestK) for (const b of placeBestK) spread = Math.max(spread, Math.abs(Math.floor(a / NC) - Math.floor(b / NC)) + Math.abs(a % NC - b % NC));
  const goodLines = joint.reduce((s, v) => s + (v >= T ? 1 : 0), 0);
  const goodMass = joint.reduce((s, v, k) => s + (v >= T ? WEIGHT[k]! : 0), 0);
  const each = sc.map((s, i) => s.bits.reduce((n, v, k) => n + (v >= bar[i]! ? WEIGHT[k]! : 0), 0));
  const pmi = goodLines ? Math.log2(goodMass / each.reduce((a, b) => a * b, 1)) : -Infinity;

  // Cheap moves: from sampled lines, each rule's improving steps, and their effect on the other rules.
  const r = rng(`${SEED}:moves:${rules.map(x => x.label).join("|")}`);
  const moves = { help: 0, neutral: 0, harm: 0 };
  for (let t = 0; t < 1500; t++) {
    const k = r.below(N);
    for (let a = 0; a < sc.length; a++) for (const n of neighbours(k)) {
      if (sc[a]!.bits[n]! <= sc[a]!.bits[k]! + 0.25) continue;
      for (let b = 0; b < sc.length; b++) {
        if (b === a) continue;
        const d = sc[b]!.bits[n]! - sc[b]!.bits[k]!;
        if (d > 0.25) moves.help++; else if (d < -0.25) moves.harm++; else moves.neutral++;
      }
    }
  }
  const total = moves.help + moves.neutral + moves.harm || 1;
  const share = { help: moves.help / total, neutral: moves.neutral / total, harm: moves.harm / total };

  // Alliances: among the lines where rule A's main part is in its top 1/32, does another rule's main part rise with
  // A's last layer? Spearman's rank correlation, the strongest pair reported.
  let alliance: DrawResult["alliance"] = null;
  for (let a = 0; a < sc.length; a++) {
    const L = sc[a]!.layers;
    if (L.length < 2) continue;
    const third = L[L.length - 1]!;
    const cut = [...sc[a]!.bits].sort((x, y) => y - x)[Math.floor(N / 32)]!;
    const region: number[] = [];
    for (let k = 0; k < N; k++) if (sc[a]!.bits[k]! >= cut && Number.isFinite(third[k]!)) region.push(k);
    if (region.length < 30) continue;
    for (let b = 0; b < sc.length; b++) {
      if (b === a) continue;
      const rho = spearman(region.map(k => third[k]!), region.map(k => sc[b]!.main[k]!));
      if (!alliance || Math.abs(rho) > Math.abs(alliance.rho)) alliance = { rule: rules[a]!.label, layer: rules[a]!.chain!.split(">").at(-1)!, with: rules[b]!.label, rho };
    }
  }
  // Verdicts (the census's own definitions, documented in interaction-census.md): hopeless, no line good for all; dull,
  // the rules ignore each other (good places as often as chance, and under 1 in 10 cheap moves touching another rule);
  // conflict, good places much rarer than chance and harm well above help; rich, the rest with two or more places.
  const verdict: DrawResult["verdict"] = goodLines === 0 ? "hopeless"
    : Math.abs(pmi) < 0.5 && share.help + share.harm < 0.1 ? "dull"
    : pmi < -1 && share.harm > 2 * share.help ? "conflict" : placeBestK.length >= 2 ? "rich" : "dull";
  return {
    rules: rules.map(x => x.label), goodLines, places: placeBestK.length,
    placeBest: [...placeBestK].sort((x, y) => joint[y]! - joint[x]!).slice(0, 4).map(k => `${lineText(k)} (${joint[k]!.toFixed(1)})`),
    spread, valleys, pmi, moves: share, alliance, verdict,
  };
}

function spearman(x: number[], y: number[]): number {
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array<number>(v.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1]![0] === o[i]![0]) j++; for (let t = i; t <= j; t++) r[o[t]![1]] = (i + j) / 2; i = j + 1; } return r; };
  const a = rank(x), b = rank(y), n = a.length, ma = (n - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i]! - ma) * (b[i]! - ma); da += (a[i]! - ma) ** 2; db += (b[i]! - ma) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

// ---------------------------------------------------------------- the census

const R = rng(SEED);
const results: (DrawResult & { size: number })[] = [];
const t0 = Date.now();
for (const size of [2, 3]) for (let d = 0; d < DRAWS; d++) {
  const rules: Rule[] = [];
  while (rules.length < size) { const x = drawRule(R); if (!rules.some(y => y.label === x.label)) rules.push(x); }
  results.push({ size, ...draw(rules) });
}
console.error(`${results.length} draws on ${N.toLocaleString("en")} lines (${NM} gradients × ${NC} intercepts), ${cache.size} rules scored, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (args.includes("--json")) writeFileSync(opt("json", "census.json"), JSON.stringify(results, null, 1));

// Where the good places sit: the median over draws of the best place's |m| and |c| (the grid-edge question).
const edge = results.filter(r => r.placeBest.length).map(r => { const m = /y = (-?[\d/]+)x \+ (-?[\d/]+)/.exec(r.placeBest[0]!); const v = (x: string) => { const [a, b = "1"] = x.split("/"); return Math.abs(Number(a) / Number(b)); }; return m ? [v(m[1]!), v(m[2]!)] : [NaN, NaN]; });
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };
for (const size of [2, 3]) {
  const rs = results.filter(r => r.size === size);
  const by = (v: string) => rs.filter(r => r.verdict === v).length;
  console.log(`\n## Draws of ${size} rules (${rs.length}; threshold ${T} bits each, grid rarity)\n`);
  console.log(`- rich ${by("rich")}, dull ${by("dull")}, conflict ${by("conflict")}, hopeless ${by("hopeless")}`);
  console.log(`- jointly good places per draw: median ${median(rs.map(r => r.places))}, share with 2 or more ${(rs.filter(r => r.places >= 2).length / rs.length * 100).toFixed(0)}%`);
  console.log(`- of draws with 2 or more places, share where every route between some two passes through a worse state: ${(rs.filter(r => r.places >= 2 && r.valleys.length).length / Math.max(1, rs.filter(r => r.places >= 2).length) * 100).toFixed(0)}%; median valley depth ${median(rs.flatMap(r => r.valleys)).toFixed(1)} bits`);
  console.log(`- cheap improving moves, effect on the other rules: help ${(median(rs.map(r => r.moves.help)) * 100).toFixed(0)}%, neutral ${(median(rs.map(r => r.moves.neutral)) * 100).toFixed(0)}%, harm ${(median(rs.map(r => r.moves.harm)) * 100).toFixed(0)}% (medians over draws)`);
  console.log(`- alliances (|ρ| ≥ 0.3 between one rule's last layer and another's main part, where the first's main part is high): ${rs.filter(r => r.alliance && Math.abs(r.alliance.rho) >= 0.3).length} of ${rs.filter(r => r.alliance).length} draws with a layered rule`);
  console.log(`\n| rules | good lines | places | spread | valleys | PMI | help / neutral / harm | best places | verdict |\n|---|---|---|---|---|---|---|---|---|`);
  for (const r of rs) console.log(`| ${r.rules.join("<br>")} | ${r.goodLines} | ${r.places} | ${r.spread} | ${r.valleys.length ? `${r.valleys.length} (max ${Math.max(...r.valleys).toFixed(1)})` : "0"} | ${Number.isFinite(r.pmi) ? r.pmi.toFixed(1) : "—"} | ${(r.moves.help * 100).toFixed(0)} / ${(r.moves.neutral * 100).toFixed(0)} / ${(r.moves.harm * 100).toFixed(0)} | ${r.placeBest.slice(0, 2).join("<br>")} | ${r.verdict} |`);
}
// Per family: how often a draw containing it is rich, dull, hopeless.
console.log(`\n## By family\n\n| family | draws | rich | dull | conflict | hopeless | median help | median harm |\n|---|---|---|---|---|---|---|---|`);
for (const id of IDS) {
  const rs = results.filter(r => r.rules.some(x => x.startsWith(`${id}(`)));
  if (!rs.length) continue;
  const c = (v: string) => rs.filter(r => r.verdict === v).length;
  console.log(`| ${id} | ${rs.length} | ${c("rich")} | ${c("dull")} | ${c("conflict")} | ${c("hopeless")} | ${(median(rs.map(r => r.moves.help)) * 100).toFixed(0)}% | ${(median(rs.map(r => r.moves.harm)) * 100).toFixed(0)}% |`);
}

// Pairs of families: the verdicts of draws of two that hold both.
console.log(`\n## Pairs (draws of two)\n\n| pair | verdicts |\n|---|---|`);
const pairs = new Map<string, string[]>();
for (const r of results.filter(x => x.size === 2)) { const k = r.rules.map(x => x.slice(0, x.indexOf("("))).sort().join(" + "); pairs.set(k, [...(pairs.get(k) ?? []), r.verdict]); }
for (const [k, v] of [...pairs].sort()) console.log(`| ${k} | ${v.join(", ")} |`);

console.log(`\n## Where the best place sits (law: ${LAW})\n\n- median |m| ${median(edge.map(e => e[0]!))}, median |c| ${median(edge.map(e => e[1]!))}; on the grid's edge (|c| = ${Qn.toNumber(CS.at(-1)!)} or |m| = ${Qn.toNumber(MS.at(-1)!)}): ${edge.filter(e => e[1] === Qn.toNumber(CS.at(-1)!) || e[0] === Qn.toNumber(MS.at(-1)!)).length} of ${edge.length}`);
