/**
 * The measurement agents that play to win (scripts/competitive-agents.ts, docs/engine-v2/competitive-play.md) and the
 * table's scripted player turns. What would break: a measurement row whose "vandal" never knocks or whose agents fail
 * to run (the row would measure the naive game under another name), or player edits that are free.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rng } from "@workspace/v2-core";
import { gridPresets, gridType, grid4, type GridState } from "@workspace/v2-grid";
import { lineQ, lineType, presets } from "@workspace/v2-linear";
import { runAct } from "../src/act.ts";
import { valuer } from "../src/harness.ts";
import { births } from "../src/births.ts";
import { check } from "../src/check.ts";
import { sandboxes, startersFor } from "../src/index.ts";
import { runTable } from "../src/table.ts";
import { competitive } from "../scripts/competitive-agents.ts";

const boxes = sandboxes();
after(() => boxes.close());
const simple = (family: string) => startersFor(family, "typescript").find(x => x.kind === "simple")!.source;

test("every competitive kind is built for every family the beginner pools deal, and runs", async () => {
  const pools = [
    { type: lineType, variant: lineQ, rules: presets.find(p => p.id === "lines-beginner")!.rules, kinds: ["mixed", "vandal", "defender", "rank", "lookahead"] as const },
    { type: gridType, variant: grid4, rules: gridPresets.find(p => p.id === "grids-beginner")!.rules, kinds: ["mixed", "vandal", "defender", "rank"] as const },
  ];
  const box = await boxes.get("typescript");
  for (const p of pools) {
    for (const r of p.rules) for (const kind of p.kinds) assert.match(competitive(simple(r.family), kind, 2), kind === "lookahead" ? /const two = climb/ : /return compete\(offer, options/, `${r.family} ${kind}`);
    // Every one runs in the sandbox without failing (check: two sample objects, nothing spent).
    const samples = births(p.type as never, p.variant, "competitive-check", 2).map((s, i) => ({ objectId: String(i), state: s }));
    for (const r of p.rules) for (const kind of p.kinds) {
      const rule = { family: r.family, params: r.params as Record<string, unknown>, tieBreaker: r.tieBreakers[0]! };
      const rep = await check(box, { type: p.type as never, variant: p.variant, rule, program: { language: "typescript", source: competitive(simple(r.family), kind, 2) }, samples, energy: 500 });
      assert.notEqual(rep.verdict, "fails", `${r.family} ${kind}: ${rep.summary}`);
      assert.notEqual(rep.verdict, "rejected", `${r.family} ${kind}: ${rep.summary}`);
    }
  }
});

test("the vandal knocks a board the others score high on, and pays for it", async () => {
  const pool = gridPresets.find(p => p.id === "grids-beginner")!.rules;
  const rules = pool.slice(0, 3).map(r => ({ family: r.family, params: r.params as Record<string, unknown>, tieBreaker: r.tieBreakers[0]! }));
  const v = rules.map(rule => valuer(gridType, grid4, rule));
  // A board the second and third rules both like: a short hill climb on their bits added up.
  const r = rng("competitive-test");
  let b: GridState = { cells: Array.from({ length: 16 }, () => r.below(10)) };
  const both = (s: GridState) => v[1]!.bits(s) + v[2]!.bits(s);
  for (let improved = true; improved;) {
    improved = false;
    for (let i = 0; i < 16; i++) for (let d = 0; d < 10; d++) {
      const t = { cells: b.cells.map((x, j) => (j === i ? d : x)) };
      if (both(t) > both(b) + 1e-9) { b = t; improved = true; }
    }
  }
  const others = both(b);
  assert.ok(others >= 8, `the others hold ${others} bits: enough to be a target`);
  const { record, state } = await runAct(await boxes.get("typescript"), {
    type: gridType, variant: grid4, state: b, rule: rules[0]!, program: { language: "typescript", source: competitive(simple(rules[0]!.family), "vandal", 2) },
    seed: "1", energy: 400, income: 4, value: { mine: v[0]!.bits(b), others, points: v[0]!.bits(b) * others },
    values: v[0]!.values!, others: [1, 2].map(j => ({ rule: rules[j]!, values: v[j]!.values! })),
  });
  assert.equal(record.outcome, "committed", record.reason);
  assert.ok(both(state) <= 0.75 * others, `a knock of at least a quarter: ${others} → ${both(state)}`);
  assert.ok(record.charge > 0);
});

test("a scripted player's turn sees the standings and pays the edit price for a rewrite", async () => {
  const pool = presets.find(p => p.id === "lines-beginner")!.rules;
  const seats = pool.slice(0, 3).map((r, i) => ({ name: `P${i}`, kind: "starter" as const, rule: { family: r.family, params: r.params as Record<string, unknown>, tieBreaker: r.tieBreakers[0]! }, program: { language: "typescript" as const, source: simple(r.family) } }));
  const seen: number[][] = [];
  const rep = await runTable(boxes, {
    type: lineType, variant: lineQ, seats, lines: 3, seed: "turns", seconds: 30, unique: true,
    playerTurns: { every: 10, seats: [0], turn: (_i, api) => { seen.push([...api.standings]); if (seen.length === 1) assert.ok((api.replace(api.agents[0]!.id, api.agents[0]!.source.replace("function agent(offer) {", "function agent(offer) {\n  if (offer.object === 99) return null;")) ?? 0) > 0); } },
  });
  assert.equal(seen.length, 2);   // at 10 s and 20 s (the game ends at 30 s)
  assert.equal(rep.seats[0]!.replaced, 1);
  assert.ok(rep.seats[0]!.spent.edits > 0, "the edit is paid");
});
