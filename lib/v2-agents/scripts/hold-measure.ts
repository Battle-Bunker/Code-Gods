/**
 * Is "hold" (v1's hold rarity, docs/energy-model.md §8 on archive/engine-v1) already a function of a state's bits?
 * Measurements behind docs/engine-v2/hold-measurement.md. Analysis only: nothing here changes game behaviour.
 *
 *   node --experimental-strip-types scripts/hold-measure.ts [--part kernel,agents] [--variant line-q,line-z,grid-4-d10]
 *                                                           [--reps 64] [--perbin 16] [--rules 0 (all)] [--seed h1]
 *
 * kernel  For every dealt rule with a committed value function: states covering the bits range are drawn by subset
 *         simulation (π draws, then the walk restricted to {U ≥ u} for rising u, which leaves π conditioned on the upper
 *         set; within a 1-bit bin that lies inside the upper set the particles are π conditioned on the bin), up to
 *         `perbin` states per bin. For each state x: `reps` independent runs of m = 1, 2, 3 moves of the walk's own kernel
 *         (walk.ts walkStep: a uniform mutator, a uniform site, arguments ∝ 2^−price, the surcharge accepted with
 *         2^−max(0, Δφ); a "move" is the kernel run until the state changes), survival s_m(x) = P(U(x_m) ≥ U(x)) and
 *         hold_m(x) = −log2 s_m(x) (smoothed (k + ½)/(R + 1)). Then, per rule and m: Spearman / Pearson of hold vs bits,
 *         R² of hold on 1-bit bins of bits, the spread of hold within a bin, the Monte-Carlo noise share of that spread,
 *         R² on φ bins, and what φ adds beyond the bits bins (partial correlation within bins).
 * agents  Real perturbations: the same kind of states for a rule A, perturbed by one act of another rule's shipped
 *         "simple" starter (the TypeScript sandbox), against one kernel move.
 */
import { parseArgs } from "node:util";
import { compareScores, evaluateSite, hashHex, isInvalid, rng, variantMutators, walkStep, type ObjectType, type Rng, type Score, type Variant } from "@workspace/v2-core";
import { gridPresets, gridType, grid4, cellProbability, gridParams, type GridState } from "@workspace/v2-grid";
import { lineLaw, lineQ, lineType, lineZ, presets, type LineState } from "@workspace/v2-linear";
import { valueLookup } from "@workspace/v2-valuation";
import { findValues } from "../src/harness.ts";
import { runAct, sandboxes, startersFor } from "../src/index.ts";

const { values: o } = parseArgs({
  options: {
    part: { type: "string", default: "kernel,agents" }, variant: { type: "string", default: "line-q,line-z,grid-4-d10" },
    reps: { type: "string", default: "64" }, perbin: { type: "string", default: "16" }, rules: { type: "string", default: "0" },
    seed: { type: "string", default: "h1" },
  },
});
const PARTS = o.part!.split(","), VARIANTS = o.variant!.split(",");
const R = Number(o.reps), PERBIN = Number(o.perbin), MAXRULES = Number(o.rules), SEED = o.seed!;
const MS = [1, 2, 3] as const, MAXBIN = 18;
const say = (s = "") => console.log(s);
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "–"), f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");

type Rule = { family: string; params: Record<string, unknown>; tieBreaker: string };
const ruleName = (r: Rule) => `${r.family}/${r.tieBreaker}`;

interface Setup<S> {
  readonly label: string;
  readonly type: ObjectType<S>;
  readonly variant: Variant;
  readonly rules: Rule[];
  readonly draw: (r: Rng) => S;
}

function poolRules(rules: readonly { family: string; params: unknown; tieBreakers: readonly (string | null)[] }[], variant: string): Rule[] {
  return rules.flatMap(r => r.tieBreakers.map(t => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: t as string })))
    .filter(r => findValues(variant, r));
}
const lineSetup = (preset: string, variant: Variant): Setup<LineState> => {
  const law = lineLaw(variant);
  return {
    label: `${preset} on ${variant.id}`, type: lineType, variant, rules: poolRules(presets.find(p => p.id === preset)!.rules, variant.id),
    draw: r => { for (;;) { const d = law.draw(r, 1); if (d.state) return d.state; } },
  };
};
const gridSetup = (): Setup<GridState> => {
  const { size, cap } = gridParams(grid4);
  const cdf: number[] = []; let acc = 0;
  for (let x = 0; x <= cap; x++) { acc += cellProbability(x, grid4); cdf.push(acc); }
  return {
    label: `grids-beginner on ${grid4.id}`, type: gridType, variant: grid4, rules: poolRules(gridPresets[0].rules, grid4.id),
    draw: r => ({ cells: Array.from({ length: size * size }, () => { const u = r.unit() * acc; return cdf.findIndex(c => u < c); }) }),
  };
};
const SETUPS: Record<string, () => Setup<any>> = {
  "line-q": () => lineSetup("lines-beginner", lineQ),
  "line-z": () => lineSetup("lines-whole", lineZ),
  "grid-4-d10": gridSetup,
};

// ---------------------------------------------------------------- the kernel

/**
 * One step of the walk, exactly walkStep (v2-core walk.ts) but also reporting which mutator was proposed. Checked
 * against walkStep below on a shared random stream.
 */
function kernelStep<S>(type: ObjectType<S>, variant: Variant, state: S, r: Rng, accept?: (s: S) => boolean): { s: S; mutator: string } {
  const ms = variantMutators(type, variant);
  const m = ms[r.below(ms.length)]!;
  const site = m.perSite ? r.below(type.sites(state, variant)) : 0;
  const a = m.args(variant).sample(r);
  if (a === null) return { s: state, mutator: m.id };
  const x = m.apply(state, site, a, variant);
  if (isInvalid(x)) return { s: state, mutator: m.id };
  const grow = type.readLength(x, variant) - type.readLength(state, variant);
  if (grow > 0 && !r.chance(grow)) return { s: state, mutator: m.id };
  if (accept && !accept(x)) return { s: state, mutator: m.id };
  return { s: x, mutator: m.id };
}
function checkKernel<S>(st: Setup<S>) {
  const a = rng("kernel-check", st.variant.id), b = rng("kernel-check", st.variant.id);
  let x = st.draw(rng("kernel-check-start")), y = x;
  for (let i = 0; i < 500; i++) {
    x = walkStep(st.type, st.variant, x, a);
    y = kernelStep(st.type, st.variant, y, b).s;
    if (st.type.encode(x) !== st.type.encode(y)) throw new Error(`kernelStep diverges from walkStep at step ${i} on ${st.variant.id}`);
  }
}
/** One move: the kernel run until the state changes (a cap of 2,000 proposals). */
function move<S>(st: Setup<S>, s: S, r: Rng, accept?: (s: S) => boolean): { s: S; mutator: string } {
  const e = st.type.encode(s);
  for (let i = 0; i < 2000; i++) {
    const k = kernelStep(st.type, st.variant, s, r, accept);
    if (k.s !== s && st.type.encode(k.s) !== e) return k;
  }
  return { s, mutator: "none" };
}

// ---------------------------------------------------------------- statistics

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function quantile(xs: number[], p: number): number { const s = xs.slice().sort((a, b) => a - b); const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo]! + (s[Math.min(lo + 1, s.length - 1)]! - s[lo]!) * (i - lo); }
function pearson(x: number[], y: number[]): number {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i]! - mx) * (y[i]! - my); sxx += (x[i]! - mx) ** 2; syy += (y[i]! - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
function ranks(x: number[]): number[] {
  const idx = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]), r = new Array<number>(x.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++; for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2; i = j + 1; }
  return r;
}
const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));
/** R² of a group-means model, and the residuals. */
function groupR2(y: number[], g: number[]): { r2: number; res: number[] } {
  const sum = new Map<number, [number, number]>();
  y.forEach((v, i) => { const t = sum.get(g[i]!) ?? [0, 0]; t[0] += v; t[1]++; sum.set(g[i]!, t); });
  const m = mean(y); let tot = 0, rs = 0; const res: number[] = [];
  y.forEach((v, i) => { const [s, n] = sum.get(g[i]!)!; const e = v - s / n; res.push(e); rs += e * e; tot += (v - m) ** 2; });
  return { r2: tot ? 1 - rs / tot : NaN, res };
}

// ---------------------------------------------------------------- one rule

interface StateRow { enc: string; bits: number; phi: number; hold: number[]; surv: number[]; noiseVar: number[]; keptBy: Record<string, number>; movedBy: Record<string, number> }

function measureRule<S>(st: Setup<S>, rule: Rule): StateRow[] {
  const family = st.type.families.find(f => f.id === rule.family)!;
  const look = valueLookup(findValues(st.variant.id, rule)!);
  const scoreOf = (s: S): Score => evaluateSite(st.type, family, rule.params, s, st.variant, 0, rule.tieBreaker).score;
  const bitsOf = (u: Score) => look(u).bits;
  const r = rng("hold", SEED, st.variant.id, ruleName(rule));

  // Subset simulation: particles from π, then the walk restricted to {U ≥ u} for rising u.
  type P = { s: S; u: Score; bits: number };
  const N = 240, KEEP = 0.2, STEPS = 24;
  let parts: P[] = Array.from({ length: N }, () => { const s = st.draw(r), u = scoreOf(s); return { s, u, bits: bitsOf(u) }; });
  const pool: { p: P; floor: number }[] = parts.map(p => ({ p, floor: -Infinity }));
  for (let level = 0; level < 14; level++) {
    parts.sort((a, b) => compareScores(b.u, a.u));
    let u = parts[Math.floor(KEEP * N)]!.u;
    // A plateau: move the threshold up to the next distinct score when too many particles share it.
    if (parts.filter(p => compareScores(p.u, u) >= 0).length > 0.6 * N) {
      const higher = parts.find(p => compareScores(p.u, u) > 0);
      if (!higher) break;
      u = parts.filter(p => compareScores(p.u, u) > 0).at(-1)!.u;
    }
    const floor = bitsOf(u);
    const seeds = parts.filter(p => compareScores(p.u, u) >= 0);
    const accept = (s: S) => compareScores(scoreOf(s), u) >= 0;
    parts = Array.from({ length: N }, (_, i) => {
      let s = seeds[i % seeds.length]!.s;
      for (let k = 0; k < STEPS; k++) s = kernelStep(st.type, st.variant, s, r, accept).s;
      const su = scoreOf(s);
      return { s, u: su, bits: bitsOf(su) };
    });
    for (const p of parts) pool.push({ p, floor });
    if (floor >= MAXBIN + 1) break;
  }

  // Stratify by bits: up to PERBIN distinct states per 1-bit bin, from levels whose floor lies at or below the bin.
  const chosen: P[] = [];
  for (let b = 0; b <= MAXBIN; b++) {
    const seen = new Set<string>(), cand: P[] = [];
    for (const { p, floor } of pool) {
      const bin = Math.min(MAXBIN, Math.floor(p.bits));
      if (bin !== b || floor > b) continue;
      const e = st.type.encode(p.s); if (seen.has(e)) continue; seen.add(e); cand.push(p);
    }
    for (let i = cand.length - 1; i > 0; i--) { const j = r.below(i + 1); [cand[i], cand[j]] = [cand[j]!, cand[i]!]; }
    chosen.push(...cand.slice(0, PERBIN));
  }

  // Survival under m kernel moves.
  return chosen.map(p => {
    const kept = MS.map(() => 0), keptBy: Record<string, number> = {}, movedBy: Record<string, number> = {};
    for (let rep = 0; rep < R; rep++) {
      let s = p.s;
      for (let j = 0; j < MS.length; j++) {
        const mv = move(st, s, r); s = mv.s;
        const ok = compareScores(scoreOf(s), p.u) >= 0;
        if (ok) kept[j]! += 1;
        if (j === 0) { movedBy[mv.mutator] = (movedBy[mv.mutator] ?? 0) + 1; if (ok) keptBy[mv.mutator] = (keptBy[mv.mutator] ?? 0) + 1; }
      }
    }
    const surv = kept.map(k => k / R);
    const sm = kept.map(k => (k + 0.5) / (R + 1));
    return {
      enc: st.type.encode(p.s), bits: p.bits, phi: st.type.readLength(p.s, st.variant),
      surv, hold: sm.map(x => -Math.log2(x)),
      // Delta-method variance of −log2 p̂ from R Bernoulli draws.
      noiseVar: sm.map(x => (1 - x) / (R * x * Math.LN2 ** 2)),
      keptBy, movedBy,
    };
  });
}

interface RuleStats { rule: string; n: number; top: number; rho: number; r: number; r2bits: number; iqr: number; p1090: number; noise: number; r2phi: number; partialPhi: number; dR2phi: number; robust: number; robustN: number; meanByBin: number[] }
function stats(rule: string, rows: StateRow[], j: number): RuleStats {
  const bits = rows.map(x => x.bits), phi = rows.map(x => x.phi), hold = rows.map(x => x.hold[j]!);
  const bin = bits.map(b => Math.min(MAXBIN, Math.floor(b)));
  const { r2: r2bits, res } = groupR2(hold, bin);
  const byBin = new Map<number, number[]>(); hold.forEach((h, i) => { const l = byBin.get(bin[i]!) ?? []; l.push(h); byBin.set(bin[i]!, l); });
  const big = [...byBin.values()].filter(l => l.length >= 6);
  const iqr = big.length ? quantile(big.map(l => quantile(l, 0.75) - quantile(l, 0.25)), 0.5) : NaN;
  const p1090 = big.length ? quantile(big.map(l => quantile(l, 0.9) - quantile(l, 0.1)), 0.5) : NaN;
  const within = mean(res.map(e => e * e)), noise = mean(rows.map(x => x.noiseVar[j]!));
  const { r2: r2phi } = groupR2(hold, phi.map(p => Math.floor(p / 2)));
  const phiRes = groupR2(phi, bin).res;
  const partialPhi = pearson(res, phiRes);
  const meanByBin = Array.from({ length: MAXBIN + 1 }, (_, b) => { const l = byBin.get(b); return l && l.length >= 3 ? mean(l.map(h => 2 ** -h)) : NaN; });
  const tail = rows.filter(x => x.bits >= 10);
  return {
    rule, n: rows.length, top: Math.max(...bits), rho: spearman(hold, bits), r: pearson(hold, bits), r2bits, iqr, p1090,
    noise: within ? Math.min(1, noise / within) : NaN, r2phi, partialPhi, dR2phi: (partialPhi || 0) ** 2 * (1 - r2bits),
    robust: tail.filter(x => x.surv[j]! >= 0.9).length, robustN: tail.length, meanByBin,
  };
}

// ---------------------------------------------------------------- kernel part

const allRows = new Map<string, Map<string, StateRow[]>>();
if (PARTS.includes("kernel")) {
  say(`# Hold vs bits: ${R} kernel replicates per state, up to ${PERBIN} states per 1-bit bin (seed ${SEED})`);
  say();
  for (const vid of VARIANTS) {
    const st = SETUPS[vid]!();
    checkKernel(st);
    let rules = st.rules;
    if (MAXRULES > 0) { const rr = rng("subsample", SEED, vid); rules = rules.slice().sort(() => rr.unit() - 0.5).slice(0, MAXRULES).sort((a, b) => ruleName(a).localeCompare(ruleName(b))); }
    const t0 = performance.now();
    const rowsByRule = new Map<string, StateRow[]>();
    for (const rule of rules) rowsByRule.set(ruleName(rule), measureRule(st, rule));
    allRows.set(vid, rowsByRule);
    say(`## ${st.label}: ${rules.length} rules, ${[...rowsByRule.values()].reduce((a, l) => a + l.length, 0)} states, ${f1((performance.now() - t0) / 1000)} s`);
    say();
    for (const [j, m] of MS.entries()) {
      const ss = [...rowsByRule.entries()].map(([k, rows]) => stats(k, rows, j));
      say(`### m = ${m} move${m > 1 ? "s" : ""}`);
      say();
      say("| Rule | States (top bits) | Spearman ρ(hold, bits) | Pearson r | R² hold ~ bits bins | Within-bin IQR / 10–90% (hold bits) | MC-noise share of within-bin var | R² hold ~ φ bins | Partial r(hold, φ \\| bits) | ΔR² from φ | States ≥ 10 bits surviving ≥ 90% |");
      say("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
      for (const s of ss) say(`| ${s.rule} | ${s.n} (${f1(s.top)}) | ${f2(s.rho)} | ${f2(s.r)} | ${f2(s.r2bits)} | ${f2(s.iqr)} / ${f2(s.p1090)} | ${f2(s.noise)} | ${f2(s.r2phi)} | ${f2(s.partialPhi)} | ${f2(s.dR2phi)} | ${s.robust} of ${s.robustN} |`);
      const med = (k: keyof RuleStats) => f2(quantile(ss.map(s => s[k] as number).filter(Number.isFinite), 0.5));
      say(`| **median over rules** | | ${med("rho")} | ${med("r")} | ${med("r2bits")} | ${med("iqr")} / ${med("p1090")} | ${med("noise")} | ${med("r2phi")} | ${med("partialPhi")} | ${med("dR2phi")} | ${ss.reduce((a, s) => a + s.robust, 0)} of ${ss.reduce((a, s) => a + s.robustN, 0)} |`);
      say();
      // Mean survival by bits bin: median over rules, and the 10th–90th percentile across rules.
      const cols = Array.from({ length: MAXBIN + 1 }, (_, b) => ss.map(s => s.meanByBin[b]!).filter(Number.isFinite));
      say("Mean survival P(U(x′) ≥ U(x)) by bits bin (median over rules [10%–90% over rules], rules with ≥ 3 states in the bin):");
      say();
      say(`| Bits | ${cols.map((_, b) => (b === MAXBIN ? `${b}+` : `${b}`)).join(" | ")} |`);
      say(`|---|${cols.map(() => "--:").join("|")}|`);
      say(`| Survival | ${cols.map(c => (c.length ? `${f2(quantile(c, 0.5))} [${f2(quantile(c, 0.1))}–${f2(quantile(c, 0.9))}]` : "–")).join(" | ")} |`);
      say(`| Rules | ${cols.map(c => c.length).join(" | ")} |`);
      say();
    }
    // Examples: per rule, the most robust and the most fragile state at ≥ 10 bits (m = 1), with the mutators that kept it.
    say(`### Where hold does not follow bits (${st.variant.id}, m = 1): states ≥ 10 bits`);
    say();
    say("| Rule | Robust state (bits, φ, survival m=1/2/3; share kept by mutator) | Fragile state (bits, φ, survival m=1/2/3) |");
    say("|---|---|---|");
    for (const [k, rows] of rowsByRule) {
      const tail = rows.filter(x => x.bits >= 10);
      if (!tail.length) continue;
      const rob = tail.reduce((a, b) => (b.surv[0]! > a.surv[0]! || (b.surv[0] === a.surv[0] && b.bits > a.bits) ? b : a));
      const fra = tail.reduce((a, b) => (b.surv[0]! < a.surv[0]! || (b.surv[0] === a.surv[0] && b.bits > a.bits) ? b : a));
      const by = Object.entries(rob.movedBy).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${rob.keptBy[m] ?? 0}/${n}`).join(", ");
      const cell = (x: StateRow) => `\`${x.enc}\` (${f1(x.bits)}, ${f1(x.phi)}, ${x.surv.map(f2).join("/")})`;
      say(`| ${k} | ${cell(rob)}; ${by} | ${cell(fra)} |`);
    }
    say();
  }
}

// ---------------------------------------------------------------- agents part

if (PARTS.includes("agents")) {
  say("## Real perturbations: one act of another rule's shipped Simple starter vs one kernel move");
  say();
  say("| Variant | Measured rule A | Perturbing agent (rule B) | States | Acts committed | Survival, agent act (all / committed only) | Survival, one kernel move | Spearman ρ(agent survival, kernel survival) | Survival ≥ 10 bits: agent / kernel |");
  say("|---|---|---|--:|--:|--:|--:|--:|--:|");
  const boxes = sandboxes();
  const PAIRS: [string, string, string][] = [
    ["line-z", "prime-landing/big-prime", "treasure/prime-terms"],
    ["line-z", "whole-crossing/k-spf", "prime-landing/big-prime"],
    ["line-q", "square-area/spf", "prime-gradient/prime"],
    ["grid-4-d10", "magic-eighteen/first-column", "mirrormancer/middle"],
  ];
  for (const [vid, aName, bName] of PAIRS) {
    if (!VARIANTS.includes(vid)) continue;
    const st = SETUPS[vid]!();
    const pick = (n: string) => st.rules.find(x => ruleName(x) === n) ?? null;
    const A = pick(aName), B = pick(bName);
    if (!A || !B) { say(`| ${vid} | ${aName} | ${bName} | (rule not dealt) | | | | | |`); continue; }
    const agent = startersFor(B.family, "typescript", B.tieBreaker).find(x => x.kind === "simple");
    if (!agent) { say(`| ${vid} | ${ruleName(A)} | ${ruleName(B)} | (no simple starter) | | | | | |`); continue; }
    const rows = allRows.get(vid)?.get(ruleName(A)) ?? measureRule(st, A);
    const states = rows.filter((_, i) => i % Math.max(1, Math.ceil(rows.length / 240)) === 0);
    const fam = (r: Rule) => st.type.families.find(f => f.id === r.family)!;
    const scoreA = (s: unknown): Score => evaluateSite(st.type, fam(A), A.params, s, st.variant, 0, A.tieBreaker).score;
    const vfA = findValues(st.variant.id, A)!, vfB = findValues(st.variant.id, B)!;
    const lookA = valueLookup(vfA), lookB = valueLookup(vfB);
    const scoreB = (s: unknown): Score => evaluateSite(st.type, fam(B), B.params, s, st.variant, 0, B.tieBreaker).score;
    const box = await boxes.get("typescript");
    const SEEDS = 3;
    let committed = 0, acts = 0;
    const agentSurv: number[] = [], agentSurvC: number[] = [], kern: number[] = [], agentHi: number[] = [], kernHi: number[] = [];
    for (const row of states) {
      const x = st.type.decode(row.enc), u = scoreA(x);
      let kept = 0, keptC = 0, nC = 0;
      for (let k = 0; k < SEEDS; k++) {
        const nA = lookA(u).bits, nB = lookB(scoreB(x)).bits;
        const { record, state } = await runAct(box, {
          type: st.type, variant: st.variant, state: x, rule: B, program: { language: agent.language, source: agent.source },
          seed: BigInt(`0x${hashHex(`hold:${row.enc}:${k}`).slice(0, 15)}`), energy: 200, object: 0, liveObjects: 24,
          value: { mine: nB, others: nA, points: nB * nA }, history: [], values: { knots: vfB.knots, tail: vfB.tail },
          others: [{ rule: A, values: { knots: vfA.knots, tail: vfA.tail } }],
        });
        acts++;
        const ok = compareScores(scoreA(state), u) >= 0;
        if (ok) kept++;
        if (record.outcome === "committed") { committed++; nC++; if (ok) keptC++; }
      }
      agentSurv.push(kept / SEEDS); if (nC) agentSurvC.push(keptC / nC);
      kern.push(row.surv[0]!);
      if (row.bits >= 10) { agentHi.push(kept / SEEDS); kernHi.push(row.surv[0]!); }
    }
    say(`| ${vid} | ${ruleName(A)} | ${ruleName(B)} (simple) | ${states.length} | ${committed} of ${acts} | ${f2(mean(agentSurv))} / ${agentSurvC.length ? f2(mean(agentSurvC)) : "–"} | ${f2(mean(kern))} | ${f2(spearman(agentSurv, kern))} | ${agentHi.length ? `${f2(mean(agentHi))} / ${f2(mean(kernHi))} (${agentHi.length})` : "–"} |`);
  }
  await boxes.close();
  say();
}
