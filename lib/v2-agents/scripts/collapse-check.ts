/**
 * The standing collapse check (docs/engine-v2/landscape-analysis.md §4): five tests per variant and per β (the act charge
 * is W + β·W²), one table per variant, then "collapse check: N failures". It reports; it never gates: the exit code is 0
 * whatever it finds (a crash is still a crash). Analysis only: nothing here changes game behaviour.
 *
 *   pnpm --filter @workspace/v2-agents collapse-check [-- --variant line-q,line-z,grid-4-d10] [--tests 1,2,3,4,5]
 *     [--beta 0.02,0.05,0.1] [--tables 8] [--grid-tables 3] [--evals 100000] [--ref-mult 10] [--ramp-evals 30000]
 *     [--games 3] [--seconds 300] [--objects 10] [--births 0.05] [--old-row yes|no] [--reach-births 2] [--jobs 3] [--json]
 *
 * Tests (thresholds in src/collapse.ts):
 *   1 no ramp        per dealable rule: its top in the energy-reachable window W (a line's share of a 3-seat game) and in
 *                    2W; fails when the top is at W's edge, grows > 10%, and tail bits track read length (corr > 0.9)
 *   2 cheap optimum  per dealt 3-seat table: a searcher with the rules and B evaluations in W (enumerates when W ≤ B, else
 *                    anneals with 10 restarts) against a reference (W enumerated, or ref-mult·B of annealing); a table
 *                    fails at ≥ 95%, the variant when more than a quarter do
 *   3 single answer  per table: the best 24 distinct states in W keep ≥ 70% of 24 × the best and lie in one closed form
 *   4 convergence    scripted starter seats (no model seats) on the beginner economy at this β, 300 s: over the last
 *                    100 s, "no move found" (acts that returned no calls), objects changing state per minute, and the
 *                    largest share of objects within one unit move of one state family; at --objects starting objects and
 *                    --births a second (the beginner presets' new 10 and 0.05), plus one comparison row at the old 24 and
 *                    0.1 (middle β; shown, not counted)
 *   5 disclosure     H4: probes until the others' rules are identified from exact disclosed sums (β-independent)
 *
 * The energy-reachable set uses the real prices (v2-core applyPriced fees and surcharges) with one call per act and
 * jumps of up to K, moving one coordinate at a time (scripts/landscape-lib.ts): a subset of what is truly reachable.
 */
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { rng } from "@workspace/v2-core";
import { GRIDS_BEGINNER_ECONOMY, KAPPA, LINES_BEGINNER_ECONOMY } from "@workspace/v2-economy";
import {
  CHEAP, CONVERGE, DISCLOSE, RAMP, SINGLE, cheapFails, convergeFails, discloseFails, failureCount, oneClosedForm, rampFails,
  singleFails, tableCheap, type Verdict,
} from "../src/collapse.ts";
import { gridStartersFor } from "../src/grid-starters.ts";
import { births, sandboxes, startersFor } from "../src/index.ts";
import { runTable, type TableSeat } from "../src/table.ts";
import {
  anneal, corr, costAt, countWithin, enumerate, identify, median, poolOf, reach, ruleName, sample, spaceOf, total, VARIANTS,
  type Reach, type Rule, type Space, type VariantId,
} from "./landscape-lib.ts";

const { values: o } = parseArgs({ options: {
  variant: { type: "string", default: VARIANTS.join(",") },
  tests: { type: "string", default: "1,2,3,4,5" },
  beta: { type: "string", default: "0.02,0.05,0.1" },
  tables: { type: "string", default: "8" },
  "grid-tables": { type: "string", default: "3" },
  evals: { type: "string", default: String(CHEAP.evals) },
  "ref-mult": { type: "string", default: "10" },
  "ramp-evals": { type: "string", default: "30000" },
  "enum-cap": { type: "string", default: "300000" },
  games: { type: "string", default: "3" },
  seconds: { type: "string", default: "300" },
  "reach-births": { type: "string", default: "2" },
  objects: { type: "string", default: "10" },
  births: { type: "string", default: "0.05" },
  "old-row": { type: "string", default: "yes" },
  jobs: { type: "string", default: String(Math.min(3, availableParallelism())) },
  json: { type: "boolean", default: false },
  child: { type: "boolean", default: false },
} });
const variants = o.variant.split(",") as VariantId[];
for (const v of variants) if (!VARIANTS.includes(v)) throw new Error(`--variant takes ${VARIANTS.join(", ")}, not ${v}`);
const tests = new Set(o.tests.split(",").map(Number));
const betas = o.beta.split(",").map(Number);
const B = Number(o.evals), REF = Number(o["ref-mult"]), RAMP_EVALS = Number(o["ramp-evals"]), ENUM_CAP = Number(o["enum-cap"]);
const OBJECTS = Number(o.objects), BIRTHS_PER_SECOND = Number(o.births);
const log = (s: string) => console.error(s);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : String(x)), f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const pct = (x: number) => `${Math.round(100 * x)}%`;

interface Row {
  variant: VariantId; beta: number; E: number;
  /** A comparison row (test 4 at other preset numbers): shown, not counted. */
  comparison?: string;
  verdicts: Record<string, Verdict>;
  notes: Record<string, string>;
}
interface VariantResult { variant: VariantId; preset: string; rules: number; skipped: string[]; rows: Row[]; details: string[] }

// ---------------------------------------------------------------- one variant

/** A line's (or board's) share of a 3-seat game's energy: (start + power · seconds) · 3 / 24. */
function shareOfGame(v: VariantId, seconds: number) {
  const e = v === "grid-4-d10" ? GRIDS_BEGINNER_ECONOMY : LINES_BEGINNER_ECONOMY;
  return ((e.startingEnergy + e.powerPerSecond * seconds) * 3) / 24;
}

/** Tables of three rules from three different families, dealt by a seeded draw. */
function deal(rules: readonly Rule[], n: number, seed: string): Rule[][] {
  const r = rng("collapse-tables", seed), out: Rule[][] = [];
  const fams = [...new Set(rules.map(x => x.family))];
  if (fams.length < 3) return out;
  while (out.length < n) {
    const f = fams.slice(), pick: Rule[] = [];
    for (let k = 0; k < 3; k++) { const fam = f.splice(r.below(f.length), 1)[0]!; const of = rules.filter(x => x.family === fam); pick.push(of[r.below(of.length)]!); }
    out.push(pick);
  }
  return out;
}

/** The scripted table for test 4: the mixed tables the seats played (scripts/table.ts), when the pool deals them. */
const PLAYED: Record<string, string[]> = {
  lines: ["prime-landing/big-prime", "treasure/prime-terms", "whole-crossing/k-spf"],
  grid: ["magic-eighteen/primes", "opposite-nines/primes", "mirrormancer/middle"],
};

async function runVariant(v: VariantId): Promise<VariantResult> {
  const space = spaceOf(v) as Space<any>;
  const pool = poolOf(v);
  const rules = pool.rules, E = shareOfGame(v, Number(o.seconds));
  const nTables = Number(v === "grid-4-d10" ? o["grid-tables"] : o.tables);
  const tables = deal(rules, nTables, v);
  const birthXs = births(space.type, space.variant, "collapse", Number(o["reach-births"])).map(s => space.coords(s));
  const details: string[] = [];
  let fullRow: { beta: number; verdicts: Record<string, Verdict>; notes: Record<string, string> } | null = null;
  const rows: Row[] = [];
  const stateKey = (x: readonly number[]) => x.join(",");
  log(`${v}: ${rules.length} rules (${pool.skipped.length} without a value function), E = ${f1(E)} ⚡, ${tables.length} tables`);

  // Test 5 does not depend on β: once.
  let disclose: { verdict: Verdict; note: string } | null = null;
  if (tests.has(5)) {
    const t0 = performance.now();
    const probes = births(space.type, space.variant, "probe", 3000);
    const res = identify(rules, r => space.bits(r), probes, 40, 0, v);
    const m = median(res.need);
    disclose = { verdict: discloseFails(m) ? "FAIL" : "PASS", note: `median ${Number.isFinite(m) ? m : "> 3000"} probes (floor ${DISCLOSE.floor}), ${res.unidentified}/${res.need.length} unidentified` };
    log(`  ${v} test 5: ${disclose.note} (${f1((performance.now() - t0) / 1000)} s)`);
  }

  for (const beta of betas) {
    const row: Row = { variant: v, beta, E, verdicts: {}, notes: {} };
    const reaches = birthXs.map(x => ({ E: reach(space, x, beta, E), E2: reach(space, x, beta, 2 * E) }));
    // When every state is reachable within W at this β (grids), W and 2W are the whole space, as at any other such β:
    // tests 1–3 are then measured once and their rows repeated.
    const isFull = (r: Reach) => space.bounds.every(b => b !== null) && r.per.every((l, d) => l.length === space.bounds[d]![1] - space.bounds[d]![0] + 1)
      && r.per.reduce((t, l) => t + Math.max(...l.map(p => p.e)), 0) <= r.E;
    const full = reaches.every(r => isFull(r.E) && isFull(r.E2));
    const reused = full && fullRow !== null;
    if (reused) for (const t of ["1", "2", "3"]) if (fullRow!.verdicts[t]) { row.verdicts[t] = fullRow!.verdicts[t]!; row.notes[t] = `${fullRow!.notes[t]} (as at β ${fullRow!.beta}: every state is reachable)`; }

    // ------------------------------------------------ test 1: no ramp
    if (tests.has(1) && !reused) {
      const t0 = performance.now();
      const failing: string[] = [];
      let atEdge = 0;
      const r1 = reaches[0]!;
      // The tail's correlation is measured on a uniform sample of 2W (on the annealer's states when the sample has
      // too few tail states).
      const uniform = sample(space, r1.E2, 2 * E, 40_000, `${v}:${beta}`).map(x => ({ x, len: space.type.readLength(space.state(x)!, space.variant) }));
      for (const rule of rules) {
        const b = space.bits(rule);
        const f = (x: number[]) => b(space.state(x)!);
        const w1 = anneal(space, r1.E, f, RAMP_EVALS, 3, `${v}:${beta}:${ruleName(rule)}:W`);
        let tail: number[] = [], len: number[] = [];
        for (const u of uniform) { const val = f(u.x); if (val >= RAMP.tailBits) { tail.push(val); len.push(u.len); } }
        const fromSample = tail.length >= 50;
        if (!fromSample) { tail = []; len = []; }
        const w2 = anneal(space, r1.E2, f, RAMP_EVALS, 3, `${v}:${beta}:${ruleName(rule)}:2W`, (x, val) => {
          if (!fromSample && val >= RAMP.tailBits && tail.length < 50_000) { tail.push(val); len.push(space.type.readLength(space.state(x)!, space.variant)); }
        });
        // The top in W: the W search's, or the 2W search's when it lies inside W.
        const in2 = costAt(r1.E, w2.at) <= E && w2.best > w1.best;
        const top1 = in2 ? w2.best : w1.best, topAt = in2 ? w2.at : w1.at, top2 = Math.max(w1.best, w2.best);
        const m = { topCostShare: costAt(r1.E, topAt) / E, growth: top1 > 0 ? top2 / top1 - 1 : top2 > 0 ? Infinity : 0, corr: corr(tail, len) };
        if (m.topCostShare > RAMP.edgeShare) atEdge++;
        if (rampFails(m)) failing.push(ruleName(rule));
        details.push(`${v} β ${beta} test 1 ${ruleName(rule)}: top W ${f1(top1)} bits at (${topAt.join(", ")}) costing ${pct(m.topCostShare)} of E, 2W ${f1(top2)} (+${pct(m.growth)}), tail corr(bits, read length) ${f2(m.corr)} over ${tail.length} ${fromSample ? "sampled" : "searched"} states${rampFails(m) ? " — RAMP" : ""}`);
      }
      row.verdicts["1"] = failing.length ? "FAIL" : "PASS";
      row.notes["1"] = `${failing.length}/${rules.length} rules ramp; ${atEdge} top at W's edge`;
      log(`  ${v} β ${beta} test 1: ${row.notes["1"]} (${f1((performance.now() - t0) / 1000)} s)`);
    }

    // ------------------------------------------------ tests 2 and 3: per dealt table
    if ((tests.has(2) || tests.has(3)) && !reused) {
      const t0 = performance.now();
      let cheap = 0, single = 0;
      const ratios: number[] = [], keeps: number[] = [], sizes: number[] = [];
      const enumCache = new Map<number, { xs: number[][] } | null>();
      for (const [t, table] of tables.entries()) {
        const bi = t % reaches.length, r = reaches[bi]!.E;
        const bs = table.map(rule => space.bits(rule));
        const F = (x: number[]) => { const s = space.state(x)!; return total(bs.map(b => b(s))); };
        const size = countWithin(r, E);
        sizes.push(size);
        let refBest: number, top: { x: number[]; v: number }[];
        let set = enumCache.get(bi);
        if (set === undefined) { set = size <= ENUM_CAP ? { xs: [] } : null; if (set) enumerate(space, r, E, x => set!.xs.push(x)); enumCache.set(bi, set); }
        if (set) {
          const all = set.xs.map(x => ({ x, v: F(x) })).sort((a, b) => b.v - a.v);
          refBest = all[0]?.v ?? 0; top = all.slice(0, SINGLE.n);
        } else {
          const seen = new Map<string, { x: number[]; v: number }>();
          let floor = -Infinity;
          const res = anneal(space, r, F, REF * B, 10, `${v}:${beta}:${t}:ref`, (x, val) => {
            if (val < floor) return;
            seen.set(stateKey(x), { x, v: val });
            if (seen.size > 20_000) { const keep = [...seen.values()].sort((a, b) => b.v - a.v).slice(0, 1000); floor = keep.at(-1)!.v; seen.clear(); for (const k of keep) seen.set(stateKey(k.x), k); }
          });
          refBest = res.best; top = [...seen.values()].sort((a, b) => b.v - a.v).slice(0, SINGLE.n);
        }
        const searched = size <= B && set ? refBest : anneal(space, r, F, B, 10, `${v}:${beta}:${t}:B`).best;
        const isCheap = tableCheap(searched, refBest);
        if (isCheap) cheap++;
        ratios.push(refBest > 0 ? searched / refBest : 1);
        const keep = refBest > 0 && top.length === SINGLE.n ? top.reduce((a, s) => a + s.v, 0) / (SINGLE.n * refBest) : top.length < SINGLE.n ? 1 : 0;
        const closed = oneClosedForm(top.map(s => s.x));
        keeps.push(keep);
        if (singleFails({ keep, closedForm: closed })) single++;
        details.push(`${v} β ${beta} table ${t} (${table.map(ruleName).join(", ")}): W ≈ ${size.toExponential(1)} states${set ? " (enumerated)" : ""}, best F ${f1(refBest)} at (${top[0]?.x.join(", ")}), B-search ${f1(searched)} (${pct(searched / (refBest || 1))})${isCheap ? " CHEAP" : ""}; 24 best keep ${pct(keep)}${closed ? ", one closed form" : ""}; top 3 ${top.slice(0, 3).map(s => `(${s.x.join(", ")})`).join(" ")}`);
      }
      if (tests.has(2)) {
        row.verdicts["2"] = cheapFails(cheap, tables.length) ? "FAIL" : "PASS";
        row.notes["2"] = `${cheap}/${tables.length} tables cheap; B-search median ${pct(median(ratios))} of best; W ≈ ${median(sizes).toExponential(1)}`;
      }
      if (tests.has(3)) {
        row.verdicts["3"] = single > CHEAP.tablesShare * tables.length ? "FAIL" : "PASS";
        row.notes["3"] = `${single}/${tables.length} tables one answer; 24 best keep median ${pct(median(keeps))}`;
      }
      log(`  ${v} β ${beta} tests 2/3: ${row.notes["2"] ?? ""} | ${row.notes["3"] ?? ""} (${f1((performance.now() - t0) / 1000)} s)`);
    }

    if (full && !reused) fullRow = { beta, verdicts: { ...row.verdicts }, notes: { ...row.notes } };

    // ------------------------------------------------ test 4: convergence in play
    if (tests.has(4)) {
      const r4 = await converge(v, space, rules, tables, beta, OBJECTS, BIRTHS_PER_SECOND);
      row.verdicts["4"] = r4.verdict; row.notes["4"] = r4.note;
    }
    if (disclose) { row.verdicts["5"] = disclose.verdict; row.notes["5"] = disclose.note; }
    rows.push(row);
    // One comparison row at the old preset numbers (24 objects, 0.1 births a second), test 4 only, at the middle β.
    if (tests.has(4) && o["old-row"] === "yes" && beta === betas[Math.floor(betas.length / 2)]) {
      const r4 = await converge(v, space, rules, tables, beta, 24, 0.1);
      rows.push({ variant: v, beta, E, comparison: "24 objects, 0.1 births/s", verdicts: { "4": r4.verdict }, notes: { "4": r4.note } });
    }
  }
  return { variant: v, preset: pool.preset, rules: rules.length, skipped: pool.skipped, rows, details };
}

/** Test 4: scripted starter seats (no model seats) play `games` games; metrics over the last CONVERGE.window seconds. */
async function converge(v: VariantId, space: Space<any>, rules: readonly Rule[], tables: readonly Rule[][], beta: number, objects0: number, birthsPerSecond: number): Promise<{ verdict: Verdict; note: string }> {
  const t0 = performance.now();
  const grid = v === "grid-4-d10";
  const names = PLAYED[grid ? "grid" : "lines"]!;
  const chosen = names.every(n => rules.some(r => ruleName(r) === n)) ? names.map(n => rules.find(r => ruleName(r) === n)!) : tables[0]!;
  const seats: TableSeat[] = chosen.map((rule, k) => {
    const a = (grid ? gridStartersFor(rule.family, "typescript", rule.tieBreaker) : startersFor(rule.family, "typescript")).find(x => x.kind === "simple")!;
    return { name: ["Ada", "Bo", "Cy"][k]!, kind: "starter", rule, program: { language: a.language, source: a.source } };
  });
  const seconds = Number(o.seconds), from = seconds - CONVERGE.window;
  const games: { noMove: number; moving: number; family: number; end: number }[] = [];
  const boxes = sandboxes();
  for (let g = 0; g < Number(o.games); g++) {
    const seed = `collapse-g${g}`;
    // The table's lines: its births, then one birth per new object (src/table.ts draws them the same way).
    const states: number[][] = births(space.type, space.variant, seed, objects0).map(s => space.coords(s));
    const grow = (n: number) => { while (states.length < n) states.push(space.coords(births(space.type, space.variant, `${seed}:${states.length + 1}`, 1)[0]!)); };
    let acts = 0, skipped = 0, snapshot: number[][] | null = null;
    const changed = new Set<number>();
    const report = await runTable(boxes, {
      type: space.type, variant: space.variant, ...(grid ? { economy: GRIDS_BEGINNER_ECONOMY } : {}), lines: objects0, birthsPerSecond, seed, seconds, seats,
      actEconomy: { kappa: KAPPA, beta },
      onAct: e => {
        grow(e.objects);
        if (e.at > from && !snapshot) snapshot = states.map(x => x.slice());
        if (e.committed) states[e.object] = space.coords(e.state);
        if (e.at <= from) return;
        acts++;
        if (e.outcome === "skipped") skipped++;
        if (e.committed) changed.add(e.object);
      },
    });
    grow(report.objects);
    const fam = Math.min(familyShare(snapshot ?? states), familyShare(states));
    games.push({ noMove: acts ? skipped / acts : 0, moving: (changed.size / report.objects) * (60 / CONVERGE.window), family: fam, end: report.objects });
    log(`  ${v} β ${beta} test 4 (${objects0} objects, ${birthsPerSecond}/s) game ${g}: ${report.objects} objects at the end, no move found ${pct(games.at(-1)!.noMove)}, moving ${pct(games.at(-1)!.moving)}/min, family ${pct(fam)} (${f1((performance.now() - t0) / 1000)} s)`);
  }
  await boxes.close();
  const mean = (k: "noMove" | "moving" | "family") => games.reduce((t, x) => t + x[k], 0) / games.length;
  const m = { familyShare: mean("family"), movingPerMinute: mean("moving") };
  return {
    verdict: convergeFails(m) ? "FAIL" : "PASS",
    note: `objects ${objects0} at the start, ${games.map(x => x.end).join("/")} at the end; no move found ${pct(mean("noMove"))} of late acts; ${pct(m.movingPerMinute)} of objects change a minute; ${pct(m.familyShare)} in one family (${games.length} games, ${chosen.map(ruleName).join(", ")})`,
  };
}

/** The largest share of objects within one unit move (L1 ≤ 1 on coordinates up to sign) of one object's state. */
function familyShare(xs: readonly (readonly number[])[]): number {
  if (!xs.length) return 0;
  const abs = xs.map(x => x.map(Math.abs));
  let best = 0;
  for (const c of abs) {
    let n = 0;
    for (const y of abs) { let d = 0; for (let k = 0; k < c.length && d <= 1; k++) d += Math.abs(y[k]! - c[k]!); if (d <= 1) n++; }
    best = Math.max(best, n);
  }
  return best / xs.length;
}

// ---------------------------------------------------------------- report

const TEST_NAMES: Record<string, string> = { "1": "1 no ramp", "2": "2 no cheap optimum", "3": "3 no single answer", "4": "4 no convergence in play", "5": "5 disclosure" };
function report(results: VariantResult[]): string {
  const out: string[] = [];
  for (const r of results) {
    out.push(`### ${r.variant} (preset ${r.preset}: ${r.rules} rules with value functions${r.skipped.length ? `; ${r.skipped.length} skipped without one: ${r.skipped.join(", ")}` : "; none skipped"})`, "");
    const ts = [...tests].sort().map(String).filter(t => r.rows.some(x => x.verdicts[t]));
    out.push(`| β | W (⚡) | ${ts.map(t => TEST_NAMES[t]).join(" | ")} |`, `|--:|--:|${ts.map(() => "---").join("|")}|`);
    for (const row of r.rows) out.push(`| ${row.beta}${row.comparison ? ` (${row.comparison}; not counted)` : ""} | ${Math.round(row.E)} | ${ts.map(t => (row.verdicts[t] ? `**${row.verdicts[t]}**: ${row.notes[t]}` : "–")).join(" | ")} |`);
    out.push("");
  }
  const all = results.flatMap(r => r.rows).filter(r => !r.comparison);
  out.push(`collapse check: ${failureCount(all)} failures`);
  return out.join("\n");
}

// ---------------------------------------------------------------- main

let results: VariantResult[];
if (!o.child && variants.length > 1 && Number(o.jobs) > 1) {
  // One process per variant (on 4 cores the three run side by side); each prints its result as JSON.
  const passOn = process.argv.slice(2).filter((a, i, all) => a !== "--json" && a !== "--variant" && all[i - 1] !== "--variant" && !a.startsWith("--variant="));
  const queue = variants.slice(), done: VariantResult[] = [];
  const worker = async () => {
    for (let v = queue.shift(); v; v = queue.shift()) {
      const child = spawn(process.execPath, [...process.execArgv, import.meta.filename, ...passOn, "--variant", v, "--child"], { stdio: ["ignore", "pipe", "inherit"] });
      let text = "";
      child.stdout.on("data", d => { text += d; });
      const code: number = await new Promise(res => child.on("close", res));
      if (code !== 0) throw new Error(`collapse check for ${v} exited with ${code}`);
      done.push(...(JSON.parse(text) as VariantResult[]));
    }
  };
  await Promise.all(Array.from({ length: Math.min(Number(o.jobs), variants.length) }, worker));
  results = variants.map(v => done.find(r => r.variant === v)!);
} else {
  results = [];
  for (const v of variants) results.push(await runVariant(v));
}

if (o.child) console.log(JSON.stringify(results));
else if (o.json) console.log(JSON.stringify({ results, failures: failureCount(results.flatMap(r => r.rows).filter(r => !r.comparison)) }, null, 2));
else {
  for (const r of results) for (const d of r.details) log(d);
  console.log(report(results));
}
process.exitCode = 0;
