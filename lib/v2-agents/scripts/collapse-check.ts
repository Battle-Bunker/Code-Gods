/**
 * The standing collapse check (docs/engine-v2/landscape-analysis.md §4): five tests per variant and per β (the act charge
 * is W + β·W²), one table per variant, then "collapse check: N failures". It reports; it never gates: the exit code is 0
 * whatever it finds (a crash is still a crash). Analysis only: nothing here changes game behaviour.
 *
 *   pnpm --filter @workspace/v2-agents collapse-check [-- --variant line-q,line-z,grid-4-d10] [--tests 1,2,3,4,5]
 *     [--beta 0.02,0.05,0.1] [--tables 8] [--grid-tables 3] [--evals 100000] [--ref-mult 10] [--ramp-evals 30000]
 *     [--games 3] [--seconds 300] [--objects 10] [--births 0.05] [--old-row yes|no] [--reach-births 2] [--direction-starts 60] [--jobs 3] [--json]
 *
 * Tests (thresholds in src/collapse.ts):
 *   1 joint rise     per dealt table (owner decision 30, thresholds set 14 Nov): directions (one call, repeated 8 times;
 *                    every call up to 12 bits plus, on lines, the shortcut climber's moves) from distinct births along
 *                    which two seated rules' bits rise together; fails when one does so from ≥ 25% of the starts with no
 *                    third rule falling comparably (an adversary). β-independent. Single-rule ramps (top at W's edge,
 *                    growing > 10% to 2W, tail tracking read length) are reported as information
 *   2 cheap optimum  per dealt 3-seat table: a searcher with the rules and B evaluations in W (enumerates when W ≤ B, else
 *                    anneals with 10 restarts) against a reference (W enumerated, or ref-mult·B of annealing); a table
 *                    fails at ≥ 95%, the variant when more than a quarter do
 *   3 single answer  per table: the best 24 distinct states in W keep ≥ 70% of 24 × the best and lie in one closed form
 *   4 dynamics       the plain starters and, on lines, the shortcut climber (scripts/climbers.ts) play 300 s under
 *                    unique objects at this β, at --objects starting objects and --births a second (the presets' 10 and
 *                    0.05; one comparison row at the old 24 and 0.1, middle β, not counted). Fails on (a) < 25% of
 *                    objects changing in the last minute under the plain starters, (b) a shortcut search finding no
 *                    improving move on > half the final objects, (c) gains stopping by the midpoint for every climber.
 *                    Idle shares are reported, not failed
 *   5 disclosure     H4: probes until the others' rules are identified from the others' sums blurred as the server
 *                    blurs them (8 bits, keyed per state; convex/v2/disclose.ts). Exact sums: a comparison row, not counted
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
  CHEAP, DISCLOSE, RAMP, SINGLE, cheapFails, discloseFails, dynamicsFailures, failureCount, oneClosedForm, rampFails,
  singleFails, stalled, tableCheap, TOGETHER, togetherFails, type Verdict,
} from "../src/collapse.ts";
import { gridStartersFor } from "../src/grid-starters.ts";
import { births, sandboxes, startersFor } from "../src/index.ts";
import type { Program } from "../src/act.ts";
import { callsUpTo, directions, frozenShare, lineShortcutMoves, lineStarter, playTable, SHORTCUT, type Played } from "./climbers.ts";
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
  "direction-starts": { type: "string", default: "60" },
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
  let together: { verdict: Verdict; note: string } | null = null;   // test 1 does not depend on β
  let fullRow: { beta: number; verdicts: Record<string, Verdict>; notes: Record<string, string> } | null = null;
  const rows: Row[] = [];
  const stateKey = (x: readonly number[]) => x.join(",");
  log(`${v}: ${rules.length} rules (${pool.skipped.length} without a value function), E = ${f1(E)} ⚡, ${tables.length} tables`);

  // Test 5 does not depend on β: once.
  // At the server's noise (DISCLOSE.sigma, keyed per state) it counts; exact sums are a comparison row.
  let disclose: { verdict: Verdict; note: string } | null = null, exact: { verdict: Verdict; note: string } | null = null;
  if (tests.has(5)) {
    const t0 = performance.now();
    const probes = births(space.type, space.variant, "probe", 3000);
    const at = (sigma: number) => {
      const res = identify(rules, r => space.bits(r), probes, 40, sigma, v, 3000, s => space.type.encode(s));
      const m = median(res.need);
      return { verdict: (discloseFails(m) ? "FAIL" : "PASS") as Verdict, note: `σ = ${sigma} bits: median ${Number.isFinite(m) ? m : "> 3000"} probes (floor ${DISCLOSE.floor}), ${res.unidentified}/${res.need.length} unidentified in 3,000` };
    };
    disclose = at(DISCLOSE.sigma); exact = at(0);
    log(`  ${v} test 5: ${disclose.note}; exact: ${exact.note} (${f1((performance.now() - t0) / 1000)} s)`);
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
      together ??= togetherTest(v, space, tables, details);
      row.verdicts["1"] = together.verdict;
      row.notes["1"] = `${together.note}; information: ${failing.length}/${rules.length} single rules ramp, ${atEdge} with their top at W's edge`;
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
      const r4 = await dynamics(v, space, rules, tables, beta, OBJECTS, BIRTHS_PER_SECOND);
      row.verdicts["4"] = r4.verdict; row.notes["4"] = r4.note;
    }
    if (disclose) { row.verdicts["5"] = disclose.verdict; row.notes["5"] = disclose.note; }
    rows.push(row);
    if (exact && beta === betas[0]) rows.push({ variant: v, beta, E, comparison: "exact disclosure, σ = 0", verdicts: { "5": exact.verdict }, notes: { "5": exact.note } });
    // One comparison row at the old preset numbers (24 objects, 0.1 births a second), test 4 only, at the middle β.
    if (tests.has(4) && o["old-row"] === "yes" && beta === betas[Math.floor(betas.length / 2)]) {
      const r4 = await dynamics(v, space, rules, tables, beta, 24, 0.1);
      rows.push({ variant: v, beta, E, comparison: "24 objects, 0.1 births/s", verdicts: { "4": r4.verdict }, notes: { "4": r4.note } });
    }
  }
  return { variant: v, preset: pool.preset, rules: rules.length, skipped: pool.skipped, rows, details };
}

/**
 * Test 1: per dealt table, the directions (one call repeated) along which two seated rules rise together with no
 * adversary, from births. Calls: every call up to 12 bits, plus on lines the shortcut climber's moves.
 */
function togetherTest(v: VariantId, space: Space<any>, tables: readonly Rule[][], details: string[]): { verdict: Verdict; note: string } {
  const grid = v === "grid-4-d10";
  const base = callsUpTo(space.type, space.variant, 12);
  // Distinct births (most births sit at the centre; counting each copy would weigh the centre many times).
  const starts = [...new Map(births(space.type, space.variant, "directions", Number(o["direction-starts"])).map(s => [space.type.encode(s), s] as const)).values()];
  let failing = 0, opposed = 0;
  for (const [t, table] of tables.entries()) {
    const keys = new Set(base.map(c => `${c.mutator} ${JSON.stringify(c.args)}`));
    const calls = (s: any) => (grid ? base : [...base, ...lineShortcutMoves(space.variant, table[0]!, s).filter(c => !keys.has(`${c.mutator} ${JSON.stringify(c.args)}`))]);
    const found = directions({ type: space.type, variant: space.variant, rules: table, bits: r => space.bits(r), starts, calls });
    const worst = found[0];
    const fails = !!worst && togetherFails(worst.unopposed, starts.length);
    if (fails) failing++;
    else if (found.some(f => f.together >= TOGETHER.starts * starts.length)) opposed++;
    details.push(`${v} test 1 table ${t} (${table.map(ruleName).join(", ")}): ${found.length} directions raise two rules together from some start; ${worst ? `most unopposed: ${worst.key} from ${worst.unopposed}/${starts.length} starts (together from ${worst.together})${worst.example ? `, e.g. ${worst.example.from} → ${worst.example.to}, gains ${worst.example.gains.map(f1).join(" / ")}` : ""}` : "none"}${fails ? " — FAIL" : ""}`);
  }
  return {
    verdict: failing ? "FAIL" : "PASS",
    note: `${failing}/${tables.length} tables have an unopposed direction raising two rules together${opposed ? `; ${opposed} more have one an adversary opposes` : ""}`,
  };
}

/**
 * Test 4, dynamics: the plain starters, and on lines the shortcut climber (scripts/climbers.ts), play `games` games each
 * under unique objects. Fails on (a) fewer than DYNAMICS.movingPerMinute of objects changing in the last minute under
 * the plain starters, (b) a shortcut search finding no improving move on more than DYNAMICS.frozenShare of the final
 * objects (the shortcut climber's boards on lines, the plain starters' on grids, every grid call up to 12 bits), or
 * (c) the table's gains stalling before the midpoint for every climber. Idle shares are reported, never failed.
 */
async function dynamics(v: VariantId, space: Space<any>, rules: readonly Rule[], tables: readonly Rule[][], beta: number, objects0: number, birthsPerSecond: number): Promise<{ verdict: Verdict; note: string }> {
  const t0 = performance.now();
  const grid = v === "grid-4-d10";
  const names = PLAYED[grid ? "grid" : "lines"]!;
  const chosen = names.every(n => rules.some(r => ruleName(r) === n)) ? names.map(n => rules.find(r => ruleName(r) === n)!) : tables[0]!;
  const economy = grid ? GRIDS_BEGINNER_ECONOMY : LINES_BEGINNER_ECONOMY;
  const plain = (rule: Rule) => { const a = (grid ? gridStartersFor(rule.family, "typescript", rule.tieBreaker) : startersFor(rule.family, "typescript")).find(x => x.kind === "simple")!; return { language: a.language, source: a.source }; };
  const kinds: { name: string; program: (r: Rule) => Program }[] = [{ name: "plain", program: plain }, ...(grid ? [] : [{ name: "shortcut", program: (r: Rule) => lineStarter(r.family, SHORTCUT) }])];
  const gridCalls = grid ? callsUpTo(space.type, space.variant, 12) : [];
  const moves = (s: any) => (grid ? gridCalls : lineShortcutMoves(space.variant, chosen[0]!, s));
  const boxes = sandboxes();
  const per: Record<string, { played: Played<any>[]; frozen: number[] }> = {};
  for (const k of kinds) {
    per[k.name] = { played: [], frozen: [] };
    for (let g = 0; g < Number(o.games); g++) {
      const p = await playTable(boxes, {
        type: space.type, variant: space.variant, seats: chosen.map(rule => ({ rule, program: k.program(rule) })), bits: r => space.bits(r), beta,
        objects: objects0, birthsPerSecond, seconds: Number(o.seconds), seed: `collapse-g${g}`, economy, summonCap: economy.startingEnergy,
      });
      const fz = frozenShare({ type: space.type, variant: space.variant, rules: chosen, bits: r => space.bits(r), beta, final: p.final, moves, fullCharge: economy.powerPerSecond * economy.fullChargeSeconds });
      per[k.name]!.played.push(p); per[k.name]!.frozen.push(fz);
      log(`  ${v} β ${beta} test 4 (${objects0} objects, ${birthsPerSecond}/s) ${k.name} game ${g}: objects ${p.objects.start} → ${p.objects.end}, idle ${pct(p.idle)}, ${pct(p.movingLastMinute)} changed in the last minute, gains by mid ${f1(p.gainedByMid)} of ${f1(p.gainedByEnd)}, frozen ${pct(fz)} (${f1((performance.now() - t0) / 1000)} s)`);
    }
  }
  await boxes.close();
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const of = (k: string) => {
    const x = per[k]!;
    return {
      idle: mean(x.played.map(p => p.idle)), moving: mean(x.played.map(p => p.movingLastMinute)), frozen: mean(x.frozen),
      stalled: stalled({ gainedByMid: x.played.reduce((t, p) => t + p.gainedByMid, 0), gainedByEnd: x.played.reduce((t, p) => t + p.gainedByEnd, 0) }),
      afterMid: (() => { const e = x.played.reduce((t, p) => t + p.gainedByEnd, 0), m = x.played.reduce((t, p) => t + p.gainedByMid, 0); return e ? (e - m) / Math.abs(e) : 0; })(),
      ends: x.played.map(p => p.objects.end).join("/"),
    };
  };
  const pl = of("plain"), climber = of(grid ? "plain" : "shortcut");
  const failing = dynamicsFailures({ movingPerMinute: pl.moving, frozenShare: climber.frozen, stalledEvery: kinds.every(k => of(k.name).stalled) });
  const kindNotes = kinds.map(k => { const x = of(k.name); return `${k.name}: idle ${pct(x.idle)}, ${pct(x.moving)} of objects change in the last minute, ${pct(x.afterMid)} of gains after the midpoint${grid || k.name === "shortcut" ? `, frozen ${pct(x.frozen)}` : ""}`; });
  return {
    verdict: failing.length ? "FAIL" : "PASS",
    note: `${failing.length ? `fails (${failing.join(", ")}); ` : ""}${kindNotes.join("; ")}; objects ${objects0} → ${pl.ends} (${Number(o.games)} games each, ${chosen.map(ruleName).join(", ")})`,
  };
}

// ---------------------------------------------------------------- report

const TEST_NAMES: Record<string, string> = { "1": "1 no unopposed joint rise", "2": "2 no cheap optimum", "3": "3 no single answer", "4": "4 dynamics", "5": "5 disclosure" };
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
