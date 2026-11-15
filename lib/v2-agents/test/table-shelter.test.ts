/**
 * Shelter targeting in the agents' table (v1's objectSelection, restored; lib/v2-economy selection.ts): with "shelter"
 * the lines offered are, on average, less salient (fewer of every seat's bits on them) than with "uniform", and a
 * uniform table replays exactly as before (it draws as it always did).
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { lineQ, lineType, presets } from "@workspace/v2-linear";
import { sandboxes, startersFor } from "../src/index.ts";
import { valuer } from "../src/harness.ts";
import { runTable, type TableSeat } from "../src/table.ts";

const boxes = sandboxes();
after(() => boxes.close());
const beginner = presets.find(p => p.id === "lines-whole")!.rules;
const seat = (name: string, family: string, tieBreaker: string): TableSeat => {
  const params = beginner.find(r => r.family === family)!.params as Record<string, unknown>;
  const a = startersFor(family, "typescript").find(x => x.kind === "simple")!;
  return { name, kind: "starter", rule: { family, params, tieBreaker }, program: { language: a.language, source: a.source } };
};
const seats = [seat("A", "prime-landing", "shared-factor"), seat("B", "treasure", "shared-factor"), seat("C", "whole-crossing", "shared-factor")];
const vals = seats.map(s => valuer(lineType, lineQ, s.rule));
const salience = (s: unknown) => vals.reduce((t, v) => t + v.bits(s as never), 0);

async function offered(mode?: "uniform" | "shelter") {
  const sal: number[] = [], objects: number[] = [];
  await runTable(boxes, {
    type: lineType, variant: lineQ, lines: 6, seed: "shelter", seconds: 120, unique: true, seats,
    ...(mode ? { objectSelection: mode } : {}),
    onAct: e => { sal.push(salience(e.before)); objects.push(e.object); },
  });
  return { mean: sal.reduce((a, b) => a + b, 0) / sal.length, objects, n: sal.length };
}

test("shelter offers less salient lines than uniform; uniform replays as the default", async () => {
  const [plain, uniform, shelter] = [await offered(), await offered("uniform"), await offered("shelter")];
  assert.deepEqual(uniform.objects, plain.objects, "uniform draws exactly as the table always did");
  assert.ok(plain.n > 50 && shelter.n > 50, `${plain.n}, ${shelter.n} acts`);
  assert.ok(shelter.mean < plain.mean, `mean salience offered: shelter ${shelter.mean.toFixed(2)}, uniform ${plain.mean.toFixed(2)}`);
});
