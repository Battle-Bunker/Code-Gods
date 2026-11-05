/**
 * The hold-rarity check (docs/energy-model.md §8; a check, not a gate). For a few Grid families on 4×4 base10 rgb, at
 * each player count n = 2..4 (m = n − 1), it prints at several levels u:
 *   static   −log2 P(U ≥ u)                      (the shipped table)
 *   hold     −log2 P(U(x′) ≥ u | U ≥ u), m = n − 1  (what the engine adds)
 *   geo      the same with m geometric, P(m) = q(1−q)^m, q = 1/n (mean n − 1): the owner's share of mutation events
 *   contest  the share of time an object that starts at U ≥ u stays there when each event is, with probability q, the
 *            owner's best single elementary edit and otherwise one noise mutation (−log2, over 40 events)
 * so the m = n − 1 rule can be compared with the geometric average and with a small contest.
 *
 *   node --experimental-strip-types scripts/hold-check.ts [particles]
 */
import { GRID, instantiate, noise, seededRng, type GridValue } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import { cmpOrdinal, surprisal, tableFor } from "../src/calibration.ts";
import { shippedTables } from "../src/calibration-data.ts";
import type { Ordinal } from "../src/types.ts";
import { buildHoldTable, holdBits, type HoldBudget } from "./hold.ts";

const particles = Number(process.argv[2] ?? 200);
const budget: HoldBudget = { particles, targetBits: 24, p0: 0.5, maxStages: 60, maxStuck: 3, draws: 2 };
const inst = instantiate("Grid", { size: 4, symbols: "base10", colours: "rgb" }), codec = GRID.codec(inst);
const FAMILIES = ["seed1_line_painter", "chessmaster", "head_count"];

for (const id of FAMILIES) {
  const params = family(id).support(context(inst))[0];
  const ev = evaluator({ familyId: id, params }, inst), score = (v: GridValue): Ordinal => ev(codec.encode(v));
  const table = tableFor(shippedTables(inst.key), { familyId: id, params }, inst);
  console.log(`\n${id} ${JSON.stringify(params)}`);
  for (const n of [2, 3, 4]) {
    const m = n - 1, q = 1 / n;
    const hold = buildHoldTable(id, params, inst, m, `check:${id}:${n}`, budget);
    // Particles at a level: rejection from spawns is too rare high up, so reuse the hold table's levels and estimate the
    // geometric and contest numbers from fresh splitting particles of a second (m-agnostic) run.
    const geoTables = Array.from({ length: 8 }, (_, k) => buildHoldTable(id, params, inst, k + 1, `check:${id}:geo:${k}`, budget));
    const rng = seededRng(`contest:${id}:${n}`);
    const rows: string[] = [];
    for (const [level] of hold.levels.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 5)) === 0)) {
      const st = table ? surprisal(table, level) : NaN;
      // geo: P(hold) = Σ_m q(1−q)^m P(hold | m), m = 0 holds; truncated at m = 8 (the tail counts as the m = 8 value).
      let p = q;
      for (let k = 1; k <= 8; k++) p += (k < 8 ? q * (1 - q) ** k : (1 - q) ** 8) * 2 ** -holdBits(geoTables[k - 1], level);
      // contest: start from a value at the level (a spawn climbed by greedy edits), then 40 events.
      let x = GRID.spawn(inst, rng);
      for (let t = 0; t < 200 && cmpOrdinal(score(x), level) < 0; t++) x = greedy(x, score);
      let held = 0;
      for (let t = 0; t < 40; t++) { x = rng.int(n) === 0 ? greedy(x, score) : noise(inst, x, 1, rng); if (cmpOrdinal(score(x), level) >= 0) held++; }
      rows.push(`  n=${n} u=${JSON.stringify(level)}  static ${st.toFixed(2)}  hold ${holdBits(hold, level).toFixed(2)}  geo ${(-Math.log2(p)).toFixed(2)}  contest ${(-Math.log2(Math.max(held, 0.5) / 40)).toFixed(2)}`);
    }
    console.log(rows.join("\n"));
  }
}

/** The owner's best single elementary edit (one cell's colour or symbol), or the value itself when nothing improves. */
function greedy(x: GridValue, score: (v: GridValue) => Ordinal): GridValue {
  let best = x, bestScore = score(x);
  for (let i = 0; i < x.sym.length; i++) {
    for (let c = 0; c < 3; c++) if (c !== x.col[i]) { const y = { ...x, col: x.col.slice() }; y.col[i] = c; const s = score(y); if (cmpOrdinal(s, bestScore) > 0) { best = y; bestScore = s; } }
    for (let s0 = 0; s0 < 10; s0++) if (s0 !== x.sym[i]) { const y = { ...x, sym: x.sym.slice() }; y.sym[i] = s0; const s = score(y); if (cmpOrdinal(s, bestScore) > 0) { best = y; bestScore = s; } }
  }
  return best;
}
