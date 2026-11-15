/**
 * pnpm --filter @workspace/v2-agents pmi -- [--variant line-q] [--draws 1000000] [--workers n] [--seed v2] [--depths 4,6,8,10,12] [--min-ess 30] [--dry]
 *
 * Independence of every pair of rules with a committed value function on a line variant (owner decision 39: "two other
 * players with 20 bits represents an object that's as rare and hard to reach as 40 bits"). For rules A, B and a depth t:
 *
 *   PMI(t) = log2 π(A ≥ t ∧ B ≥ t) − log2 π(A ≥ t) − log2 π(B ≥ t)   (= bits_A + bits_B − bits_joint at matched levels),
 *
 * where "A ≥ t" is the set of lines whose bits under A's committed value function are at least t, all three read on the
 * same draws: the variant's law (lineLaw(variant).draw) under v2-valuation's tilted mixture (VALUE_CONFIG.tilts, `--draws`
 * per tilt), weights p/q_mix self-normalised, exactly as value.ts's sampled oracle. A depth is read only when the joint
 * set holds at least `--min-ess` effective draws. Headline: the mean PMI over the depths read (src/pmi-estimate.ts).
 *
 * Rules: every value file under lib/v2-valuation/values/<variant> (the dealt beginner pool and the undealt candidates,
 * adversaries included), so a regeneration of the values is picked up as is. Rules are evaluated in parallel workers (one
 * rule per task). Writes, unless --dry:
 *   docs/engine-v2/scripts/pmi-<variant>.json   every rule pair, per depth (bits, effective draws, PMI, its error);
 *   lib/v2-agents/src/pmi.gen.ts                 per variant, "family/tieBreaker" keys and the depth-averaged PMI and class;
 *   docs/engine-v2/pmi-matrix.md                 the measured tables, between the <!-- pmi:<variant> --> markers.
 * About 5 minutes on 4 cores at the default 1,000,000 draws per tilt.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { canonicalJson, mixedIntLog2Norm, rng } from "@workspace/v2-core";
import { lineLaw, lineType, presets, type LineState } from "@workspace/v2-linear";
import { findVariant, valuesVariant, VALUE_CONFIG } from "@workspace/v2-valuation";
import { valuer } from "../src/harness.ts";
import { BOUND_FACTOR, headline, readDepth, upperSet, ess, type DepthReading, type UpperSet } from "../src/pmi-estimate.ts";
import { CLASS_CHAR, pmiClass, type PmiClass } from "../src/pmi.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const VALUES = join(ROOT, "lib", "v2-valuation", "values");

interface RuleFile { family: string; params: unknown; tieBreaker: string }
interface Job { variant: string; seed: string; draws: number; rules: RuleFile[] }

/** The draws of the tilted mixture, in a fixed order: accepted states and their self-normalisable weights p/q_mix. */
function drawAll(job: Job): { states: LineState[]; weights: Float64Array; total: number } {
  const { variant } = findVariant(job.variant);
  const law = lineLaw(variant);
  const tilts = VALUE_CONFIG.tilts;
  const norms = tilts.map(t => mixedIntLog2Norm(t));
  const states: LineState[] = [], w: number[] = [];
  let total = 0;
  for (const t of tilts) {
    const r = rng("pmi", job.seed, job.variant, t);
    for (let i = 0; i < job.draws; i++) {
      const d = law.draw(r, t);
      total++;
      if (d.state === null) continue;
      let mix = 0;
      tilts.forEach((tk, k) => { mix += 2 ** ((1 - tk) * d.bits - d.coords * norms[k]!); });
      states.push(d.state);
      w.push(tilts.length / mix);
    }
  }
  return { states, weights: Float64Array.from(w), total };
}

// ---------------------------------------------------------------- worker: draw once, then evaluate rules on request

if (!isMainThread) {
  const job = workerData as Job & { sendWeights: boolean };
  const { variant } = findVariant(job.variant);
  const { states, weights, total } = drawAll(job);
  parentPort!.postMessage({ kind: "ready", total, weights: job.sendWeights ? weights : null });
  parentPort!.on("message", (m: { rule: number } | { done: true }) => {
    if ("done" in m) { process.exit(0); }
    const r = job.rules[m.rule]!;
    const v = valuer(lineType, variant, { family: r.family, params: r.params as Record<string, unknown>, tieBreaker: r.tieBreaker });
    const bits = new Float32Array(states.length);
    for (let k = 0; k < states.length; k++) bits[k] = v.bits(states[k]!);
    parentPort!.postMessage({ kind: "bits", rule: m.rule, bits }, [bits.buffer]);
  });
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2).filter(a => a !== "--");
  const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]!; };
  const variantId = opt("variant", "line-q");
  const DRAWS = Number(opt("draws", "1000000")), SEED = opt("seed", "v2"), MIN_ESS = Number(opt("min-ess", "30"));
  const DEPTHS = opt("depths", "4,6,8,10,12").split(",").map(Number);
  const WORKERS = Number(opt("workers", String(Math.max(1, availableParallelism()))));
  const dry = args.includes("--dry");
  const { type, variant } = findVariant(variantId);
  if (type.id !== "line") throw new Error(`pmi reads line variants (grids: pnpm --filter @workspace/v2-valuation pmi); ${variantId} is a ${type.id}`);
  const valuesId = valuesVariant(type, variant).id;
  const t0 = Date.now();
  const say = (s = "") => console.log(s);

  // Rules: every committed value file, sorted by family, tie-breaker, params.
  const dir = join(VALUES, valuesId);
  const rules: RuleFile[] = [];
  for (const fam of readdirSync(dir).sort()) for (const f of readdirSync(join(dir, fam)).sort()) {
    const v = JSON.parse(readFileSync(join(dir, fam, f), "utf8")) as RuleFile;
    rules.push({ family: v.family, params: v.params, tieBreaker: v.tieBreaker });
  }
  rules.sort((a, b) => a.family.localeCompare(b.family) || a.tieBreaker.localeCompare(b.tieBreaker) || canonicalJson(a.params).localeCompare(canonicalJson(b.params)));
  const multi = new Set([...new Set(rules.map(r => r.family))].filter(f => new Set(rules.filter(r => r.family === f).map(r => canonicalJson(r.params))).size > 1));
  const keyOf = (r: RuleFile) => `${r.family}/${r.tieBreaker}`;
  const nameOf = (r: RuleFile) => (multi.has(r.family) ? `${r.family}${canonicalJson(r.params)}/${r.tieBreaker}` : keyOf(r));
  const pool = presets.find(p => p.variant === variantId || p.variant === valuesId);
  const dealt = new Set((pool?.rules ?? []).flatMap(r => r.tieBreakers.map(tb => `${r.family}/${canonicalJson(r.params)}/${tb}`)));
  const isDealt = (r: RuleFile) => dealt.has(`${r.family}/${canonicalJson(r.params)}/${r.tieBreaker}`);
  const N = rules.length;
  say(`PMI on ${variantId} (values of ${valuesId}): ${N} rules (${rules.filter(isDealt).length} dealt in ${pool?.id ?? "no preset"}), ${DRAWS.toLocaleString("en")} draws per tilt × ${VALUE_CONFIG.tilts.length} tilts, ${WORKERS} workers`);

  // Workers: each draws the same states, then evaluates rules one task at a time.
  const bits: Float32Array[] = new Array(N);
  let weights: Float64Array | null = null, total = 0;
  {
    let next = 0, done = 0;
    await new Promise<void>((resolve, reject) => {
      for (let w = 0; w < Math.min(WORKERS, N); w++) {
        const worker = new Worker(new URL(import.meta.url), { workerData: { variant: variantId, seed: SEED, draws: DRAWS, rules, sendWeights: w === 0 } });
        const feed = () => { if (next < N) worker.postMessage({ rule: next++ }); else worker.postMessage({ done: true }); };
        worker.on("message", (m: { kind: "ready"; total: number; weights: Float64Array | null } | { kind: "bits"; rule: number; bits: Float32Array }) => {
          if (m.kind === "ready") { if (m.weights) { weights = m.weights; total = m.total; } feed(); return; }
          bits[m.rule] = m.bits;
          done++;
          if (done % 10 === 0 || done === N) process.stdout.write(`  ${done}/${N} rules evaluated (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
          if (done === N) resolve();
          feed();
        });
        worker.on("error", reject);
      }
    });
  }
  const w = weights! as Float64Array;
  let W = 0, W2 = 0;
  for (const x of w) { W += x; W2 += x * x; }
  const ESS = ess(W, W2);
  say(`draws: ${total.toLocaleString("en")}, accepted ${w.length.toLocaleString("en")}, effective ${Math.round(ESS).toLocaleString("en")} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  // Upper sets and pairs.
  const uppers: UpperSet[][] = bits.map(b => DEPTHS.map(t => upperSet(b, w, t)));
  const marginal = rules.map((_, i) => DEPTHS.map((t, l) => ({ t, bits: uppers[i]![l]!.w > 0 ? -Math.log2(uppers[i]![l]!.w / W) : null, ess: ess(uppers[i]![l]!.w, uppers[i]![l]!.w2) })));
  interface Pair { i: number; j: number; depths: DepthReading[]; pmi: number | null }
  const pairs: Pair[] = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const depths = DEPTHS.map((t, l) => readDepth(t, uppers[i]![l]!, uppers[j]![l]!, w, W, W2, MIN_ESS));
    pairs.push({ i, j, depths, pmi: headline(depths) });
  }
  say(`${pairs.length} pairs read (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const pairOf = (a: number, b: number) => pairs.find(p => p.i === Math.min(a, b) && p.j === Math.max(a, b))!;

  // Keys ("family/tieBreaker"): the mean over parameter sets.
  const keys = [...new Set(rules.map(keyOf))];
  const keyIdx = new Map(keys.map((k, i) => [k, i]));
  const keySum = keys.map(() => keys.map(() => ({ s: 0, n: 0 })));
  for (const p of pairs) {
    if (p.pmi === null) continue;
    const a = keyIdx.get(keyOf(rules[p.i]!))!, b = keyIdx.get(keyOf(rules[p.j]!))!;
    if (a === b) continue;
    for (const [x, y] of [[a, b], [b, a]] as const) { keySum[x]![y]!.s += p.pmi; keySum[x]![y]!.n++; }
  }
  const keyPmi = (a: number, b: number) => (keySum[a]![b]!.n ? keySum[a]![b]!.s / keySum[a]![b]!.n : null);
  const r2 = (x: number) => Math.round(x * 100) / 100;

  // Families: the mean over tie-breakers (and params) of the rule pairs' headlines.
  const fams = [...new Set(rules.map(r => r.family))];
  const famIdx = new Map(fams.map((f, i) => [f, i]));
  const famSum = fams.map(() => fams.map(() => ({ s: 0, n: 0 })));
  for (const p of pairs) {
    if (p.pmi === null) continue;
    const a = famIdx.get(rules[p.i]!.family)!, b = famIdx.get(rules[p.j]!.family)!;
    famSum[a]![b]!.s += p.pmi; famSum[a]![b]!.n++;
    if (a !== b) { famSum[b]![a]!.s += p.pmi; famSum[b]![a]!.n++; }
  }
  const famPmi = (a: number, b: number) => (famSum[a]![b]!.n ? famSum[a]![b]!.s / famSum[a]![b]!.n : null);
  const code = abbreviations(fams);

  // ---------------------------------------------------------------- the report (markdown)

  const fmt = (x: number | null, d = 1) => (x === null ? "" : x.toFixed(d));
  const out: string[] = [];
  const md = (s = "") => out.push(s);
  const classCount = (xs: (number | null)[]) => {
    const c: Record<PmiClass | "unread", number> = { independent: 0, mild: 0, "mild-anti": 0, aligned: 0, "anti-aligned": 0, unread: 0 };
    for (const x of xs) c[x === null ? "unread" : pmiClass(x)]++;
    return c;
  };
  const cross = pairs.filter(p => rules[p.i]!.family !== rules[p.j]!.family);
  const cc = classCount(cross.map(p => p.pmi));
  md(`Measured by \`pnpm --filter @workspace/v2-agents pmi -- --variant ${variantId}\` (lib/v2-agents/scripts/pmi.ts), ${new Date().toISOString().slice(0, 10)}: ` +
    `${N} rules (every committed value function of ${valuesId}; ${rules.filter(isDealt).length} dealt in ${pool?.id}), ${total.toLocaleString("en")} draws of the ${variantId} law ` +
    `(tilts ${VALUE_CONFIG.tilts.join(", ")}, ${DRAWS.toLocaleString("en")} each), ${w.length.toLocaleString("en")} accepted, effective sample size ${Math.round(ESS).toLocaleString("en")}. ` +
    `Depths ${DEPTHS.join(", ")} bits; a depth is read when the joint upper set holds at least ${MIN_ESS} effective draws; ` +
    `a depth not read where independence would put at least ${BOUND_FACTOR * MIN_ESS} effective draws in the joint set is an exclusion, shown "≤ bound" (PMI ≤ log2(${MIN_ESS} / expected)). ` +
    `Headline: the mean over the depths read (exclusions as their bound). Cells: PMI per depth.`);
  md();
  md(`Pairs of different families: ${cross.length}. Independent (|PMI| ≤ 1): **${cc.independent}**; mild (1 to 2): ${cc.mild}; mild anti (−2 to −1): ${cc["mild-anti"]}; ` +
    `aligned (> 2): **${cc.aligned}**; anti-aligned (< −2): **${cc["anti-aligned"]}**; unread: ${cc.unread}.`);
  const depthRead = DEPTHS.map((t, l) => cross.filter(p => p.depths[l]!.pmi !== null).length);
  const depthBound = DEPTHS.map((t, l) => cross.filter(p => p.depths[l]!.bound !== null).length);
  md(`Pairs read at each depth (and exclusions): ${DEPTHS.map((t, l) => `${t} bits ${depthRead[l]} (${depthBound[l]})`).join(", ")}. A pair unread at a depth is one whose joint upper set is too thin at the sample size; ` +
    `for an independent pair the joint set at t bits has mass 2^(−2t), so depths past about 8 are read only for aligned pairs, and the headline of an aligned pair averages more (and deeper) depths.`);
  md();

  md(`### Family matrix (headline PMI, mean over tie-breakers and parameter sets; diagonal: two tie-breakers of one family)`);
  md();
  md(`| | ${fams.map(f => code.get(f)).join(" | ")} |`);
  md(`|---|${fams.map(() => "---:").join("|")}|`);
  for (const [a, f] of fams.entries()) md(`| **${code.get(f)}** ${f} | ${fams.map((_, b) => fmt(famPmi(a, b))).join(" | ")} |`);
  md();

  md(`### Families by independence (pairs with other families)`);
  md();
  md(`| Family | dealt | rules | pairs read | independent | mild ± | aligned | anti-aligned | mean PMI | mean |PMI| |`);
  md(`|---|---|---:|---:|---:|---:|---:|---:|---:|---:|`);
  const famStats = fams.map(f => {
    const ps = cross.filter(p => rules[p.i]!.family === f || rules[p.j]!.family === f);
    const xs = ps.map(p => p.pmi).filter((x): x is number => x !== null);
    const c = classCount(ps.map(p => p.pmi));
    return { f, c, read: xs.length, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0, abs: xs.length ? xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length : 0, share: xs.length ? c.independent / xs.length : 0 };
  }).sort((a, b) => b.share - a.share || a.abs - b.abs);
  for (const s of famStats) {
    const n = rules.filter(r => r.family === s.f).length, nd = rules.filter(r => r.family === s.f && isDealt(r)).length;
    md(`| ${s.f} | ${nd ? `${nd}/${n}` : "no"} | ${n} | ${s.read} | ${s.c.independent} (${Math.round(100 * s.share)}%) | ${s.c.mild + s.c["mild-anti"]} | ${s.c.aligned} | ${s.c["anti-aligned"]} | ${s.mean.toFixed(2)} | ${s.abs.toFixed(2)} |`);
  }
  md();

  // Calibration: a value function made from this law has π(A ≥ t) ≤ 2^−t (bits are survival), so −log2 π(A ≥ t) ≥ t up to
  // sampling error and knot spacing. A rule well under that is not calibrated to the law these draws come from.
  const miscal = rules.map((r, i) => ({ r, worst: Math.min(...marginal[i]!.filter(m => m.bits !== null && m.ess >= MIN_ESS).map(m => m.bits! - m.t)) }))
    .filter(x => x.worst < -1).sort((a, b) => a.worst - b.worst);
  md(`### Calibration of the value functions against these draws`);
  md();
  md(miscal.length
    ? `A value function made from the ${variantId} law has −log2 π(A ≥ t) ≥ t (bits are survival). These rules fall more than 1 bit short at some depth: their committed values ` +
      `overstate rarity under the current law, so their upper sets (and PMIs) are not at the nominal depths; regenerate their values. ` +
      miscal.map(x => `${nameOf(x.r)} (${x.worst.toFixed(1)} bits; at ${DEPTHS.join("/")}: ${marginal[rules.indexOf(x.r)]!.map(m => fmt(m.bits)).join("/")})`).join("; ") + "."
    : `Every rule's upper sets are within 1 bit of their nominal depth or rarer.`);
  md();

  const pairRow = (p: Pair) => `| ${nameOf(rules[p.i]!)} | ${nameOf(rules[p.j]!)} | ${isDealt(rules[p.i]!) && isDealt(rules[p.j]!) ? "both" : isDealt(rules[p.i]!) || isDealt(rules[p.j]!) ? "one" : "neither"} | ${p.pmi === null ? "" : `**${p.pmi.toFixed(2)}**`} | ${p.depths.map(d => (d.pmi !== null ? d.pmi.toFixed(1) : d.bound !== null ? `≤${d.bound.toFixed(1)}` : "")).join(" | ")} | ${Math.round(p.depths[0]!.essJoint)} |`;
  const pairHead = () => { md(`| A | B | dealt | headline | ${DEPTHS.map(t => `${t} b`).join(" | ")} | joint ESS at ${DEPTHS[0]} b |`); md(`|---|---|---|---:|${DEPTHS.map(() => "---:").join("|")}|---:|`); };

  md(`### The 367 rules (Square Area/spf, Whole Crossing/k-spf, Prime Landing/big-prime)`);
  md();
  const find = (k: string) => rules.map((r, i) => (keyOf(r) === k ? i : -1)).filter(i => i >= 0);
  const trio = ["square-area/spf", "whole-crossing/k-spf", "prime-landing/big-prime"].flatMap(find);
  pairHead();
  for (let a = 0; a < trio.length; a++) for (let b = a + 1; b < trio.length; b++) md(pairRow(pairOf(trio[a]!, trio[b]!)));
  md();
  const ADV = ["smooth-crossing", "smooth-intercept", "smooth-gradient", "smooth-square", "steep-and-tall", "sunken-intercept"];
  const adv = rules.map((r, i) => (ADV.includes(r.family) ? i : -1)).filter(i => i >= 0);
  md(`### The six adversaries against each other (rule design measured 6–8.5 bits at depth 8 for several of these pairs, line-rules-v3-proposals.md §A10)`);
  md();
  pairHead();
  for (let a = 0; a < adv.length; a++) for (let b = a + 1; b < adv.length; b++) md(pairRow(pairOf(adv[a]!, adv[b]!)));
  md();
  md(`### The six adversaries against the 367 rules`);
  md();
  pairHead();
  for (const a of adv) for (const b of trio) md(pairRow(pairOf(a, b)));
  md();

  md(`### Pairs that read the same prime of the same number`);
  md();
  md(`Each rule's prime readings (hand-listed in scripts/pmi.ts READS: the number read, and which prime of it). Pairs of different families sharing a reading:`);
  md();
  pairHead();
  const readsOf = (r: RuleFile) => READS[keyOf(r)] ?? [];
  const same = cross.filter(p => readsOf(rules[p.i]!).some(x => readsOf(rules[p.j]!).includes(x)));
  for (const p of same.sort((x, y) => (y.pmi ?? -99) - (x.pmi ?? -99))) md(pairRow(p));
  md();

  const ranked = cross.filter(p => p.pmi !== null).sort((x, y) => y.pmi! - x.pmi!);
  md(`### Aligned pairs (headline > 2), different families`);
  md();
  pairHead();
  for (const p of ranked.filter(p => p.pmi! > 2)) md(pairRow(p));
  md();
  md(`### Anti-aligned pairs (headline < −2), different families`);
  md();
  pairHead();
  for (const p of ranked.filter(p => p.pmi! < -2).reverse()) md(pairRow(p));
  md();
  md(`### Two tie-breakers of one family (aligned through the shared primary; never seat a family twice)`);
  md();
  md(`| Family | pairs | mean headline | min | max |`);
  md(`|---|---:|---:|---:|---:|`);
  for (const f of fams) {
    const xs = pairs.filter(p => rules[p.i]!.family === f && rules[p.j]!.family === f && p.pmi !== null).map(p => p.pmi!);
    if (xs.length) md(`| ${f} | ${xs.length} | ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)} | ${Math.min(...xs).toFixed(2)} | ${Math.max(...xs).toFixed(2)} |`);
  }
  md();
  md(`### Rules: marginal bits of each upper set (−log2 π(A ≥ t); blank: empty) and effective draws in it`);
  md();
  md(`| Rule | dealt | ${DEPTHS.map(t => `${t} b`).join(" | ")} | ESS at ${DEPTHS[0]} b | ESS at ${DEPTHS[DEPTHS.length - 1]} b |`);
  md(`|---|---|${DEPTHS.map(() => "---:").join("|")}|---:|---:|`);
  for (const [i, r] of rules.entries()) md(`| ${nameOf(r)} | ${isDealt(r) ? "yes" : ""} | ${marginal[i]!.map(m => fmt(m.bits)).join(" | ")} | ${Math.round(marginal[i]![0]!.ess)} | ${Math.round(marginal[i]![DEPTHS.length - 1]!.ess)} |`);
  const report = out.join("\n");

  say();
  say(`Family codes: ${fams.map(f => `${code.get(f)} ${f}`).join(", ")}`);
  say(`different-family pairs: ${cross.length}; independent ${cc.independent}, mild ${cc.mild}, mild-anti ${cc["mild-anti"]}, aligned ${cc.aligned}, anti-aligned ${cc["anti-aligned"]}, unread ${cc.unread}`);
  say(`not calibrated to the law (−log2 π(A ≥ t) < t − 1): ${miscal.map(x => `${nameOf(x.r)} ${x.worst.toFixed(1)}`).join(", ") || "none"}`);
  say(`most aligned: ${ranked.slice(0, 10).map(p => `${nameOf(rules[p.i]!)} × ${nameOf(rules[p.j]!)} ${p.pmi!.toFixed(2)}`).join("; ")}`);
  say(`most anti-aligned: ${ranked.slice(-6).map(p => `${nameOf(rules[p.i]!)} × ${nameOf(rules[p.j]!)} ${p.pmi!.toFixed(2)}`).join("; ")}`);

  if (dry) { say(report); return; }

  // ---------------------------------------------------------------- outputs

  const json = {
    variant: variantId, valuesVariant: valuesId, seed: SEED, drawsPerTilt: DRAWS, tilts: VALUE_CONFIG.tilts, draws: total, accepted: w.length, ess: Math.round(ESS),
    depths: DEPTHS, minEss: MIN_ESS,
    rules: rules.map((r, i) => ({ name: nameOf(r), key: keyOf(r), family: r.family, params: r.params, tieBreaker: r.tieBreaker, dealt: isDealt(r),
      marginal: marginal[i]!.map(m => ({ t: m.t, bits: m.bits === null ? null : r2(m.bits), ess: Math.round(m.ess) })) })),
    pairs: pairs.map(p => ({ a: nameOf(rules[p.i]!), b: nameOf(rules[p.j]!), pmi: p.pmi === null ? null : r2(p.pmi), class: p.pmi === null ? null : pmiClass(p.pmi),
      depths: p.depths.map(d => [d.t, d.pmi === null ? null : r2(d.pmi), d.bound === null ? null : r2(d.bound), Math.round(d.essJoint), d.se === null ? null : r2(d.se), d.bitsJoint === null ? null : r2(d.bitsJoint)]) })),
    depthColumns: ["t", "pmi", "bound (PMI ≤ this where no joint draws but independence expected many)", "essJoint", "se", "bitsJoint"],
  };
  const jsonPath = join(ROOT, "docs", "engine-v2", "scripts", `pmi-${variantId}.json`);
  writeFileSync(jsonPath, JSON.stringify(json) + "\n");

  // The generated table: every variant's entry kept, this variant's replaced.
  const genPath = join(import.meta.dirname, "..", "src", "pmi.gen.ts");
  const { PMI_TABLES } = await import("../src/pmi.gen.ts");
  const tri: (number | null)[] = [];
  let classes = "";
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    const x = keyPmi(a, b);
    tri.push(x === null ? null : r2(x));
    classes += x === null ? "." : CLASS_CHAR[pmiClass(r2(x))];
  }
  const tables = { ...PMI_TABLES, [variantId]: { rules: keys, depths: DEPTHS, draws: total, ess: Math.round(ESS), pmi: tri, classes } };
  const body = Object.entries(tables).sort(([a], [b]) => a.localeCompare(b)).map(([v, t]) =>
    `  ${JSON.stringify(v)}: {\n    rules: ${JSON.stringify(t.rules)},\n    depths: ${JSON.stringify(t.depths)}, draws: ${t.draws}, ess: ${t.ess},\n    pmi: ${JSON.stringify(t.pmi)},\n    classes: ${JSON.stringify(t.classes)},\n  },`).join("\n");
  writeFileSync(genPath, `// Generated by lib/v2-agents/scripts/pmi.ts (pnpm --filter @workspace/v2-agents pmi). Do not edit.
/**
 * Per variant: the rules ("family/tieBreaker"; a family with several parameter sets carries the mean over them), and for
 * every pair i < j (row by row over the upper triangle, src/pmi.ts pairIndex) the depth-averaged PMI of their upper sets in
 * bits (null: no depth read) and its class, one character per pair: i independent, m mild, n mild anti, A aligned,
 * X anti-aligned, . unread. Read through pairPmi (src/pmi.ts).
 */
export interface PmiTable {
  readonly rules: readonly string[];
  readonly depths: readonly number[];
  readonly draws: number;
  readonly ess: number;
  readonly pmi: readonly (number | null)[];
  readonly classes: string;
}

export const PMI_TABLES: Readonly<Record<string, PmiTable>> = {
${body}
};
`);

  // The doc's measured block for this variant.
  const docPath = join(ROOT, "docs", "engine-v2", "pmi-matrix.md");
  const begin = `<!-- pmi:${variantId} begin (generated by lib/v2-agents/scripts/pmi.ts; do not edit by hand) -->`, end = `<!-- pmi:${variantId} end -->`;
  const block = `${begin}\n\n${report}\n\n${end}`;
  let doc = existsSync(docPath) ? readFileSync(docPath, "utf8") : `# PMI matrix of the rules\n\n## Measured: ${variantId}\n\n${begin}\n${end}\n`;
  const i0 = doc.indexOf(begin), i1 = doc.indexOf(end);
  doc = i0 >= 0 && i1 > i0 ? doc.slice(0, i0) + block + doc.slice(i1 + end.length) : `${doc.trimEnd()}\n\n## Measured: ${variantId}\n\n${block}\n`;
  writeFileSync(docPath, doc);
  say(`wrote ${jsonPath}, ${genPath}, ${docPath} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

/** Short codes for families: initials, lengthened from the last word until unique. */
function abbreviations(fams: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const f of fams) {
    const words = f.split("-");
    const base = words.map(w => w[0]!.toUpperCase()).join("");
    let c = base, k = 1;
    while (used.has(c)) { const last = words[words.length - 1]!; c = base + (last.slice(1, 1 + k) || String(k)); k++; }
    used.add(c);
    out.set(f, c);
  }
  return out;
}

/**
 * Which prime of which number each rule reads (beside its main term), for "pairs that read the same prime of the same
 * number". Numbers: c (the y-intercept, or its nearest whole number), m (the gradient, or its top), x0 (the x-intercept's
 * nearest whole number), root (the root of the square nearest the area), y1 (y(1) = m + c). Readings: spf, gpf (smallest,
 * largest prime factor), prime (close to, or the size of, a nearby prime), omega (prime factors counted).
 */
const READS: Readonly<Record<string, readonly string[]>> = {
  "prime-landing/big-prime": ["c:prime"], "prime-landing/m-spf": ["c:prime", "m:spf"], "prime-landing/m-gpf": ["c:prime", "m:gpf"],
  "prime-landing/prime-gradient": ["c:prime", "m:prime"], "prime-landing/next-prime": ["c:prime", "y1:prime"],
  "prime-gradient/prime": ["m:prime"], "prime-gradient/cPrime": ["m:prime", "c:prime"], "prime-gradient/c-spf": ["m:prime", "c:spf"], "prime-gradient/c-gpf": ["m:prime", "c:gpf"],
  "whole-intercept/spf": ["c:spf"], "whole-intercept/omega": ["c:omega"], "whole-intercept/mc-spf": ["c:spf", "m:spf"],
  "whole-crossing/k-spf": ["x0:spf"], "whole-crossing/k-gpf": ["x0:gpf"], "whole-crossing/m-spf": ["m:spf"],
  "square-area/spf": ["root:spf"], "square-area/lpf": ["root:gpf"], "square-area/omega": ["root:omega"],
  "divisibility-ladder/m-spf": ["m:spf"], "divisibility-ladder/m-gpf": ["m:gpf"], "divisibility-ladder/m-prime": ["m:prime"],
  "treasure/m-spf": ["m:spf"], "treasure/m-gpf": ["m:gpf"], "treasure/prime-gradient": ["m:prime"],
  "same-on-both-rulers/m-spf": ["m:spf"], "same-on-both-rulers/m-gpf": ["m:gpf"], "same-on-both-rulers/prime-start": ["c:prime"],
  "ruler/prime-gradient": ["m:prime"], "pythagorean-area/prime-height": ["c:prime"],
  "prime-staircase/first-prime": ["c:prime"],
  "long-division/m-bottom-spf": ["m.d:spf"],
};

if (isMainThread) await main();
