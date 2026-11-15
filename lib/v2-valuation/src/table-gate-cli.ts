/**
 * pnpm --filter @workspace/v2-valuation table-gate -- [--preset grids-more-rules] [--k 3] [--tables 100] [--climbs 8] [--anneals 3] [--seed s]
 *
 * The table gate on grids (the metastable-ecosystem instruction, CLAUDE.md; grids.md §6.3): a table deals k rules
 * (family, params, tie-breaker, from k different families) on one board, and a board's joint score is the sum of the
 * points each rule pays, π_i = n_i · Σ_{j≠i} n_j, with n_i the rule's bits from its committed value function. Three
 * searchers look for the joint peak: climbers from π boards (±1 on a cell, a swap, and the representations' shortcuts
 * by 1 unless --no-shortcuts; steepest ascent),
 * simulated annealing with restarts (from π boards and from the best written-down board), and a fixed list of boards a player could write down (uniform, checkerboards,
 * stripes, ramps). Best = the highest any of them found. A table is easy when a written-down board reaches 90% of the
 * best, or most climbs end within 90% of it. Prints one line per table, then each family's share of easy tables.
 * With --tops [--runs n]: each rule alone, its top as found, the top's bits, how often a run reaches it, and
 * how many of its top boards are degenerate (uniform, constant rows or columns, symmetric).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, evaluateSite, hashHex, rng, scoreToWire, type RuleFamily } from "@workspace/v2-core";
import { grid4, gridPresets, gridType, type GridState } from "@workspace/v2-grid";
import { valueLookup, type ValueFunction } from "./value.ts";
import { drawFromPi } from "./value-grid.ts";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]!; };
const preset = gridPresets.find(p => p.id === opt("preset", "grids-more-rules"));
if (!preset) throw new Error(`No grid preset ${opt("preset", "")}`);
const SHORTCUTS = !args.includes("--no-shortcuts");
const K = Number(opt("k", "3")), TABLES = Number(opt("tables", "100")), CLIMBS = Number(opt("climbs", "8")), ANNEALS = Number(opt("anneals", "3"));
const r = rng("table-gate", opt("seed", "v2"), preset.id, String(K));
const draw = drawFromPi(grid4, r);

interface Rule { name: string; family: RuleFamily<GridState, unknown>; params: unknown; tb: string; bits: (cells: number[]) => number }
const VALUES = join(import.meta.dirname, "..", "values", grid4.id);
const rules: Rule[] = [];
for (const pr of preset.rules) {
  const family = gridType.families.find(f => f.id === pr.family) as RuleFamily<GridState, unknown>;
  for (const tb of pr.tieBreakers) {
    const file = join(VALUES, pr.family, `${hashHex(canonicalJson(pr.params))}-${tb}.json`);
    if (!existsSync(file)) continue;
    const look = valueLookup(JSON.parse(readFileSync(file, "utf8")) as ValueFunction);
    rules.push({
      name: `${pr.family}${Object.keys(pr.params as object).length ? canonicalJson(pr.params) : ""}+${tb}`, family, params: pr.params, tb,
      bits: cells => look(evaluateSite(gridType, family, pr.params, { cells }, grid4, 0, tb).score).bits,
    });
  }
}
const families = [...new Set(rules.map(x => x.family.id))];
if (families.length < K) throw new Error(`${preset.id}: rules with value functions in only ${families.length} families`);

const joint = (table: Rule[]) => (b: number[]) => {
  const n = table.map(t => t.bits(b)), tot = n.reduce((a, c) => a + c, 0);
  return n.reduce((a, x) => a + x * (tot - x), 0);
};
/** Every unit change (±1 on a cell, a swap of two cells), plus the representations' shortcuts by 1: a row or column
 * ±1, a row or column tilted by ±1 per cell, a corner box ±1, and 1 moved between a cell and its half-turn opposite. */
const ROWS = [0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => 4 * r + c)), COLS = [0, 1, 2, 3].map(c => [0, 1, 2, 3].map(r => 4 * r + c));
const BOXES = [0, 2, 8, 10].map(t => [t, t + 1, t + 4, t + 5]);
function moves(b: number[]): number[][] {
  const out: number[][] = [];
  const shift = (cells: readonly number[], by: (j: number) => number) => {
    const x = b.slice();
    for (const [j, i] of cells.entries()) { x[i] = b[i]! + by(j); if (x[i]! < 0 || x[i]! > 9) return; }
    out.push(x);
  };
  for (let i = 0; i < 16; i++) for (const d of [-1, 1]) shift([i], () => d);
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) if (b[i] !== b[j]) { const x = b.slice(); x[i] = b[j]!; x[j] = b[i]!; out.push(x); }
  if (SHORTCUTS) for (const d of [-1, 1]) {
    for (const u of [...ROWS, ...COLS]) { shift(u, () => d); shift(u, j => d * j); }
    for (const u of BOXES) shift(u, () => d);
    for (let i = 0; i < 8; i++) shift([i, 15 - i], j => (j ? -d : d));
  }
  return out;
}
function climb(f: (b: number[]) => number, b: number[]) {
  let v = f(b), k = 0;
  for (; k < 300; k++) {
    let best: number[] | null = null, bv = v;
    for (const x of moves(b)) { const xv = f(x); if (xv > bv + 1e-9) { bv = xv; best = x; } }
    if (!best) break;
    b = best; v = bv;
  }
  return { b, v, k };
}
/** From `start`, with the temperature falling from a tenth of `ref` (the best the other searchers found) to 0.05. */
function anneal(f: (b: number[]) => number, start: number[], ref: number, iters = 20000) {
  let b = start, v = f(b), best = b, bv = v;
  const t0 = Math.max(1, ref / 10), t1 = 0.05;
  for (let k = 0; k < iters; k++) {
    const T = t0 * (t1 / t0) ** (k / iters);
    const ms = moves(b), x = ms[Math.floor(r.unit() * ms.length)]!;
    const xv = f(x);
    if (xv >= v || r.unit() < Math.exp((xv - v) / T)) { b = x; v = xv; if (v > bv) { bv = v; best = b; } }
  }
  return { b: best, v: bv };
}
const PATTERNS = (() => {
  const out: number[][] = [], idx = [...Array(16).keys()];
  for (let a = 0; a < 10; a++) for (let c = 0; c < 10; c++) {
    out.push(idx.map(i => (((i >> 2) + (i & 3)) % 2 ? c : a)), idx.map(i => ((i >> 2) % 2 ? c : a)), idx.map(i => ((i & 3) % 2 ? c : a)));
  }
  for (let a = 0; a <= 6; a++) for (const d of [1, 2]) if (a + 3 * d <= 9) out.push(idx.map(i => a + d * (i & 3)), idx.map(i => a + d * (i >> 2)), idx.map(i => a + d * (3 - (i & 3))), idx.map(i => a + d * (3 - (i >> 2))));
  for (let a = 0; a <= 3; a++) out.push(idx.map(i => a + (i >> 2) + (i & 3)), idx.map(i => a + (i >> 2) + 3 - (i & 3)));
  return out;
})();
/** A written-down kind of board: every cell equal, every row equal, every column equal, or symmetric under a half turn or either mirror. */
function degenerateOf(b: number[]): boolean {
  const at = (r: number, c: number) => b[4 * r + c]!, all = (f: (r: number, c: number) => boolean) => [0, 1, 2, 3].every(r => [0, 1, 2, 3].every(c => f(r, c)));
  return all((r, c) => at(r, c) === at(0, 0)) || all((r, c) => at(r, c) === at(0, c)) || all((r, c) => at(r, c) === at(r, 0)) ||
    all((r, c) => at(r, c) === at(3 - r, 3 - c)) || all((r, c) => at(r, c) === at(r, 3 - c)) || all((r, c) => at(r, c) === at(3 - r, c));
}
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]!; };

// --tops: each rule alone. Its top as the searchers find it (annealing on the rule's own score, from π boards and
// from every written-down board), the top's bits, and how often a single annealing run from π reaches it.
if (args.includes("--tops")) {
  const RUNS = Number(opt("runs", "10"));
  console.log(`TOPS ${preset.id}: rule, best score found, its bits (beyond: extrapolated past the sampled knots), runs from π reaching it, distinct boards at it`);
  for (const rule of rules) {
    const score = (b: number[]) => evaluateSite(gridType, rule.family, rule.params, { cells: b }, grid4, 0, rule.tb).score;
    const f = (b: number[]) => rule.bits(b);
    const runs = Array.from({ length: RUNS }, () => anneal(f, draw(), 20));
    const fromPatterns = PATTERNS.map(p => ({ b: p, v: f(p) }));
    const all = [...runs, ...fromPatterns];
    const top = Math.max(...all.map(x => x.v));
    const at = all.find(x => x.v === top)!.b;
    const boards = new Set(all.filter(x => x.v === top).map(x => x.b.join("")));
    const degenerate = [...boards].filter(d => degenerateOf(d.split("").map(Number))).length;
    console.log(`${rule.name.padEnd(48)} ${JSON.stringify(scoreToWire(score(at))).padEnd(28)} ${top.toFixed(1).padStart(5)} bits  ${runs.filter(x => x.v === top).length}/${RUNS} runs  ${boards.size} boards (${degenerate} degenerate)  e.g. ${at.join("")}`);
  }
  process.exit(0);
}

const per = new Map(families.map(f => [f, { tables: 0, easy: 0 }]));
const tally = { easy: 0, annealRatio: [] as number[], patternRatio: [] as number[], climbRatio: [] as number[], p90: [] as number[] };
console.log(`TABLE GATE ${preset.id}: ${rules.length} rules in ${families.length} families; ${TABLES} tables of ${K}, ${CLIMBS} climbs, ${ANNEALS} anneals each`);
for (let t = 0; t < TABLES; t++) {
  const pick: Rule[] = [];
  while (pick.length < K) { const x = rules[Math.floor(r.unit() * rules.length)]!; if (!pick.some(p => p.family.id === x.family.id)) pick.push(x); }
  const J = joint(pick);
  const ends = Array.from({ length: CLIMBS }, () => climb(J, draw()));
  const pv = PATTERNS.map(p => ({ p, v: J(p) }));
  const pattern = Math.max(...pv.map(x => x.v));
  // Restarts: from π boards, and once from the best written-down board.
  const ref = Math.max(pattern, ...ends.map(e => e.v)), top = pv.reduce((a, x) => (x.v > a.v ? x : a)).p;
  const ann = [...Array.from({ length: ANNEALS }, () => anneal(J, draw(), ref)), anneal(J, top, ref)];
  const annBest = Math.max(...ann.map(a => a.v));
  const best = Math.max(pattern, annBest, ...ends.map(e => e.v));
  const p90 = new Set(pv.filter(x => x.v >= 0.9 * best).map(x => x.p.join(""))).size;
  const medEnd = med(ends.map(e => e.v));
  const easy = pattern >= 0.9 * best || ends.filter(e => e.v >= 0.9 * best).length / CLIMBS >= 0.5;
  for (const p of pick) { const s = per.get(p.family.id)!; s.tables++; if (easy) s.easy++; }
  if (easy) tally.easy++;
  tally.annealRatio.push(annBest / best); tally.patternRatio.push(pattern / best); tally.climbRatio.push(medEnd / best); tally.p90.push(p90);
  console.log(`${easy ? "EASY" : "ok  "} ${pick.map(p => p.name).join(" + ").padEnd(90)} best ${best.toFixed(0).padStart(5)}  anneal ${(annBest / best).toFixed(2)}  pattern ${(pattern / best).toFixed(2)}  patterns90 ${String(p90).padStart(3)}  climbEnd ${(medEnd / best).toFixed(2)}`);
}
console.log(`\nSUMMARY ${preset.id} k=${K}: easy ${tally.easy}/${TABLES}; median anneal/best ${med(tally.annealRatio).toFixed(2)}, pattern/best ${med(tally.patternRatio).toFixed(2)}, climb end/best ${med(tally.climbRatio).toFixed(2)}; ` +
  `tables with ≥1 pattern at 90%: ${tally.p90.filter(x => x >= 1).length}, ≥10: ${tally.p90.filter(x => x >= 10).length}`);
console.log("PER FAMILY (easy tables / tables):", [...per].sort((a, b) => a[1].easy / Math.max(1, a[1].tables) - b[1].easy / Math.max(1, b[1].tables)).map(([f, s]) => `${f} ${s.easy}/${s.tables}`).join(", "));
