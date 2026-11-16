/**
 * The Watcher: it reads the whole object (so the server tells its owner the object) and changes nothing, in both
 * languages and on both object types, and it is cheap to summon.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { grid4, gridType } from "@workspace/v2-grid";
import { lineQ, lineType, lineZ } from "@workspace/v2-linear";
import { pairQ, pairType } from "@workspace/v2-pair";
import { births, runAct, sandboxes, summonBits, watcherFor, type WatcherType } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());

const CASES = [
  { type: "lines" as WatcherType, objectType: lineType, variant: lineQ, rule: { family: "power-hug", params: { k: 3 } } },
  { type: "lines" as WatcherType, objectType: lineType, variant: lineZ, rule: { family: "power-hug", params: { k: 3 } } },
  { type: "grids" as WatcherType, objectType: gridType, variant: grid4, rule: { family: gridType.families[0]!.id, params: {} } },
  { type: "pairs" as WatcherType, objectType: pairType, variant: pairQ, rule: { family: "whole-answer", params: {} } },
];

test("a Watcher reads the whole object it is offered (a full read: its owner is told it) and changes nothing", async () => {
  for (const c of CASES) for (const language of ["typescript", "python"] as const) {
    const w = watcherFor(c.type, language);
    assert.equal(w.source.match(/Try this:/g)?.length, 1);
    for (const state of births(c.objectType as never, c.variant as never, "watch", 4)) {
      const { record } = await runAct(await boxes.get(language), {
        type: c.objectType as never, variant: c.variant as never, state, rule: c.rule as never, program: { language, source: w.source }, seed: "1", energy: 100,
      });
      const phi = (c.objectType as { readLength: (s: unknown, v: unknown) => number }).readLength(state, c.variant);
      assert.equal(record.outcome, "skipped", `${c.variant.id} ${language}: ${record.reason}`);
      assert.equal(record.calls.length, 0);
      assert.ok(record.readBits >= phi - 1e-9, `${c.variant.id} ${language}: read ${record.readBits} of ${phi} bits`);
    }
  }
});

test("a Watcher is cheap to summon: well under a tenth of a line starter's 600 energy", () => {
  for (const type of ["lines", "grids", "pairs"] as const) for (const language of ["typescript", "python"] as const) {
    const w = watcherFor(type, language);
    assert.ok(summonBits(language, w.source).energy < 60, `${type} ${language}: ${summonBits(language, w.source).energy}`);
  }
});
