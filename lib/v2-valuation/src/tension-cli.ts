/**
 * pnpm --filter @workspace/v2-valuation tension -- [--presets grids-beginner,grids-more-rules] [--boards 30] [--seed s] [--json]
 *
 * The alignment/tension matrix of the grid pools (owner decision 30: few rule pairs aligned, many in tension, some
 * neutral). For every dealt rule A (family, its first dealt params, one tie-breaker) and every rule B of another family:
 * from boards on the way up A's landscape (π boards, each climbed a random 0–12 steps by A), take every move that raises
 * A's score (±1 on a cell, a swap, and the representations' shortcuts by 1) and see what it does to B's score. The
 * cell is (raised − lowered) / moves: near +1 aligned (climbing A climbs B), near −1 in tension, near 0 neutral.
 * Scores compare as the engine compares them (main part, then the tie-breaker), so no value function is needed.
 */
import { compareScores, evaluateSite, rng, type RuleFamily, type Score } from "@workspace/v2-core";
import { grid4, gridPresets, gridType, type GridState } from "@workspace/v2-grid";
import { drawFromPi } from "./value-grid.ts";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]!; };
const presetIds = opt("presets", "grids-beginner,grids-more-rules").split(",");
const BOARDS = Number(opt("boards", "30")), ALIGNED = 0.25;
const r = rng("tension", opt("seed", "v2"));
const draw = drawFromPi(grid4, r);

interface Rule { name: string; family: string; score: (b: number[]) => Score }
const rules: Rule[] = [];
for (const id of presetIds) {
  const preset = gridPresets.find(p => p.id === id);
  if (!preset) throw new Error(`No grid preset ${id}`);
  const seen = new Set<string>();
  for (const pr of preset.rules) {
    if (seen.has(pr.family)) continue;   // the family's first dealt params stand for it
    seen.add(pr.family);
    const family = gridType.families.find(f => f.id === pr.family) as RuleFamily<GridState, unknown>;
    for (const tb of pr.tieBreakers) rules.push({ name: `${pr.family}+${tb}`, family: pr.family, score: b => evaluateSite(gridType, family, pr.params, { cells: b }, grid4, 0, tb).score });
  }
}

const ROWS = [0, 1, 2, 3].map(q => [0, 1, 2, 3].map(c => 4 * q + c)), COLS = [0, 1, 2, 3].map(c => [0, 1, 2, 3].map(q => 4 * q + c));
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
  for (const d of [-1, 1]) {
    for (const u of [...ROWS, ...COLS]) { shift(u, () => d); shift(u, j => d * j); }
    for (const u of BOXES) shift(u, () => d);
    for (let i = 0; i < 8; i++) shift([i, 15 - i], j => (j ? -d : d));
  }
  return out;
}

// For each rule A: the boards on its way up, and each A-raising move from them.
const ups = rules.map(A => {
  const pairs: { from: number[]; to: number[] }[] = [];
  for (let k = 0; k < BOARDS; k++) {
    let b = draw();
    const steps = Math.floor(r.unit() * 13);
    for (let s = 0; s <= steps; s++) {
      const sa = A.score(b), up = moves(b).filter(x => compareScores(A.score(x), sa) > 0);
      if (!up.length) break;
      if (s === steps) { for (const to of up) pairs.push({ from: b, to }); break; }
      b = up[Math.floor(r.unit() * up.length)]!;
    }
  }
  return pairs;
});

const cell: number[][] = rules.map(() => rules.map(() => NaN));
for (const [a, A] of rules.entries()) for (const [c, B] of rules.entries()) {
  if (A.family === B.family) continue;
  let raised = 0, lowered = 0;
  for (const { from, to } of ups[a]!) { const d = compareScores(B.score(to), B.score(from)); if (d > 0) raised++; else if (d < 0) lowered++; }
  cell[a]![c] = ups[a]!.length ? (raised - lowered) / ups[a]!.length : 0;
}

if (args.includes("--json")) { console.log(JSON.stringify({ rules: rules.map(x => x.name), cell })); process.exit(0); }
const kind = (v: number) => (v >= ALIGNED ? "aligned" : v <= -ALIGNED ? "tension" : "neutral");
// Family pairs (unordered): the mean over their tie-breakers, both ways.
const fams = [...new Set(rules.map(x => x.family))];
const famCell = (f: string, g: string) => {
  const vs: number[] = [];
  for (const [a, A] of rules.entries()) for (const [c, B] of rules.entries()) if ((A.family === f && B.family === g) || (A.family === g && B.family === f)) vs.push(cell[a]![c]!);
  return vs.reduce((t, v) => t + v, 0) / vs.length;
};
const counts = { aligned: 0, tension: 0, neutral: 0 };
for (const [a] of rules.entries()) for (const [c] of rules.entries()) if (!Number.isNaN(cell[a]![c]!)) counts[kind(cell[a]![c]!)]++;
console.log(`TENSION ${presetIds.join(" + ")}: ${rules.length} rules, ${BOARDS} boards per rule. Ordered rule pairs (A climbs → B): aligned ${counts.aligned}, tension ${counts.tension}, neutral ${counts.neutral} (|cell| ≥ ${ALIGNED} decides)`);
console.log("\nFAMILY PAIRS (mean over tie-breakers, both ways; + aligned, − tension):");
const short = (f: string) => f.slice(0, 6);
console.log("".padEnd(20) + fams.map(f => short(f).padStart(7)).join(""));
for (const f of fams) console.log(f.padEnd(20) + fams.map(g => (f === g ? "      ·" : famCell(f, g).toFixed(2).padStart(7))).join(""));
console.log("\nRULES (row A climbs; most aligned and most in tension partners):");
for (const [a, A] of rules.entries()) {
  const row = rules.map((B, c) => ({ B: B.name, v: cell[a]![c]! })).filter(x => !Number.isNaN(x.v)).sort((x, y) => y.v - x.v);
  const n = { aligned: row.filter(x => kind(x.v) === "aligned").length, tension: row.filter(x => kind(x.v) === "tension").length };
  console.log(`${A.name.padEnd(42)} aligned ${String(n.aligned).padStart(2)} tension ${String(n.tension).padStart(2)} | top ${row.slice(0, 2).map(x => `${x.B} ${x.v.toFixed(2)}`).join(", ")} | bottom ${row.slice(-2).map(x => `${x.B} ${x.v.toFixed(2)}`).join(", ")}`);
}
