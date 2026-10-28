/**
 * Cross-check against lib/grid-lab: for a few (family, params, GridType) cases, the shipped table's surprisal of a
 * grid x must match grid-lab's `survival(draw, gtype).surprisal(ordinal(x))` for the same x (same grids, not the
 * same ordinal values: the parity tests guarantee the same order, magnitudes may differ).
 *
 * grid-lab runs through python3 (numpy) and caches its tables in lib/grid-lab/.cache/survival; the test is
 * skipped when python3 or numpy is missing. Where grid-lab has an exact tail (seed3, conqueror, homebody) it is
 * the ground truth; elsewhere both sides are estimates with ~0.3–0.6 bits of noise at 40–60 bits.
 *
 * Tolerance per grid: 1 bit + 6% of the surprisal, compared only where both tables measured the value (at most
 * our deepest level); the median absolute difference must also stay under 0.5 bits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { instantiate, objectType, seededRng, type TypeArgs } from "@workspace/game-types";
import { context, evaluator, family } from "../src/catalog.ts";
import { surprisal, tableFor } from "../src/calibration.ts";

const LAB = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "grid-lab");

const PY = String.raw`
import json, sys
sys.path.insert(0, ".")
import numpy as np
from gridlab.core import GridType, Grid
from gridlab.family import Draw
from gridlab.rules import by_id
from gridlab.calibrate import survival
DIG = "0123456789ABCDEF"; RANKS = "A23456789TJQK"
LET = {"red": "R", "orange": "O", "yellow": "Y", "green": "G", "blue": "B", "violet": "V"}
out = []
for r in json.load(sys.stdin):
    n, s, c = r["gtype"]
    gt = GridType(n, s, c)
    inv = {LET[nm]: i for i, nm in enumerate(gt.colour_names)}
    d = Draw(by_id(r["family"]), r["params"])
    T = survival(d, gt)
    bits = []
    for w in r["wires"]:
        rows = [row.split(",") for row in w.split("/")]
        sym = [[(RANKS.index(t[0]) + 13 * "SHDC".index(t[1])) if s == "cards" else DIG.index(t[0]) for t in row] for row in rows]
        col = [[inv[t[-1]] for t in row] for row in rows]
        bits.append(float(T.surprisal(d.ordinal(Grid(np.array(sym), np.array(col)), gt))))
    out.append({"bits": bits, "exact": T.exact is not None, "max": float(T.max_observed_bits)})
print(json.dumps(out))
`;

const CASES: { family: string; grid: TypeArgs }[] = [
  { family: "seed3_green_ones", grid: { size: 5, symbols: "base10", colours: "rgby" } },
  { family: "conqueror", grid: { size: 5, symbols: "base10", colours: "rgby" } },
  { family: "homebody", grid: { size: 5, symbols: "cards", colours: "rainbow6" } },
  { family: "seed1_line_painter", grid: { size: 4, symbols: "base12", colours: "rgby" } },
  { family: "rainbow_road", grid: { size: 5, symbols: "base10", colours: "rgb" } },
];

const hasPython = (() => {
  const r = spawnSync("python3", ["-c", "import numpy"], { cwd: LAB });
  return r.status === 0;
})();

test("cross-check: shipped tables agree with lib/grid-lab's survival on the same grids", { skip: !hasPython && "python3 with numpy not available", timeout: 600_000 }, () => {
  const requests: unknown[] = [], ours: { where: string; bits: number[]; top: number }[] = [];
  for (const c of CASES) {
    const inst = instantiate("Grid", c.grid), T = objectType("Grid"), codec = T.codec(inst), ctx = context(inst);
    const f = family(c.family), params = f.canonical(f.support(ctx)[0], ctx);
    const table = tableFor(f.id, params, inst);
    assert.ok(table, `${c.family} on ${inst.key}: no shipped table`);
    const rng = seededRng(`gridlab-cross:${f.id}:${inst.key}`);
    const values = Array.from({ length: 120 }, () => T.spawn(inst, rng));
    if (f.exemplar) {
      const ex = codec.decode(f.exemplar(params, ctx));
      for (let k = 0; k <= 60; k += 2) {
        let v = ex;
        for (let i = 0; i < k; i++) v = T.propose(v, inst, rng);
        values.push(v);
      }
    }
    const wires = values.map(v => codec.encode(v) as string);
    const ev = evaluator({ familyId: f.id, params }, inst);
    ours.push({ where: `${f.id} ${JSON.stringify(params)} on ${inst.key}`, bits: wires.map(w => surprisal(table!, ev(w))), top: table!.meta.maxBits });
    requests.push({ gtype: [c.grid.size, c.grid.symbols, c.grid.colours], family: f.id, params, wires });
  }
  const lab = JSON.parse(execFileSync("python3", ["-c", PY], { cwd: LAB, input: JSON.stringify(requests), maxBuffer: 1 << 26 }).toString()) as
    { bits: number[]; exact: boolean; max: number }[];
  const report: string[] = [];
  for (let i = 0; i < CASES.length; i++) {
    const o = ours[i], l = lab[i];
    const diffs: number[] = [];
    for (let j = 0; j < o.bits.length; j++) {
      const a = o.bits[j], b = l.bits[j];
      if (a > o.top || (!l.exact && b > l.max)) continue; // extrapolated on one side
      const d = Math.abs(a - b);
      diffs.push(d);
      assert.ok(d <= 1 + 0.06 * Math.max(a, b), `${o.where}: ours ${a.toFixed(2)} vs grid-lab ${b.toFixed(2)} bits${l.exact ? " (exact)" : ""}`);
    }
    diffs.sort((x, y) => x - y);
    const med = diffs[diffs.length >> 1], max = diffs[diffs.length - 1];
    report.push(`${o.where}: ${diffs.length} grids, median |Δ| ${med.toFixed(3)}, max ${max.toFixed(2)} bits, top ${Math.max(...o.bits).toFixed(1)}${l.exact ? " (grid-lab exact)" : ""}`);
    assert.ok(med <= 0.5, `${o.where}: median |Δ| ${med}`);
    assert.ok(diffs.length >= 100, `${o.where}: only ${diffs.length} comparable grids`);
  }
  console.log(report.join("\n"));
});
