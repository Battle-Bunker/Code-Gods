/** The forge's first-minutes rules (ux-lessons §1.3–1.9, §3) on the real shipped agents. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineType } from "@workspace/v2-linear";
import { PRESETS } from "@workspace/engine/convex/v2/presets.ts";
import { affordLine, comparisonText, FIRST_SHARE, openingProgram, primaryAction, replacedText, summonPrice, summonedText } from "../src/panes/forge-model.ts";

const beginner = PRESETS.find(p => p.id === "lines-beginner")!;

test("every dealt family opens with a program that has one 'Try this:' and is payable from the starting energy (ux 1.3, 1.4)", () => {
  for (const id of beginner.families) {
    const f = lineType.families.find(x => x.id === id)!;
    for (const tb of [null, ...f.tieBreakers.map(t => t.id)]) for (const lang of ["typescript", "python"] as const) {
      const p = openingProgram(id, tb, lang);
      assert.ok(p, `${id}/${tb}/${lang} has a program`);
      assert.equal(p.source.match(/Try this:/g)?.length, 1, `${id}/${tb}/${lang}: one Try this`);
      assert.ok(summonPrice(lang, p.source) <= beginner.startingEnergy, `${id}/${tb}/${lang} costs ${summonPrice(lang, p.source)} > ${beginner.startingEnergy}`);
    }
  }
});

test("Replace comes first for a changed draft of a running agent (ux 3.2)", () => {
  assert.equal(primaryAction({ agents: 0, selected: false, draftChanged: true }), "summonFirst");
  assert.equal(primaryAction({ agents: 1, selected: true, draftChanged: true }), "replace");
  assert.equal(primaryAction({ agents: 1, selected: true, draftChanged: false }), null);
});

test("messages say what happened in plain words (ux 1.9, 3.3, 3.6, 3.7, 3.5)", () => {
  assert.match(summonedText({ name: "Simple", share: FIRST_SHARE, power: 2 }), /70% of it now goes to this agent.*you keep 0\.6 ⚡ a second/);
  assert.match(replacedText("Simple"), /keeps its stored ⚡ and its share of your power; the price came from your own energy/);
  assert.equal(affordLine({ price: 50, energy: 10, justRan: true }), null, "no stale price after a summon");
  assert.match(affordLine({ price: 50, energy: 10, justRan: false })!, /wait for your energy to grow/);
  assert.equal(comparisonText({ acts: 10, pointsGained: 210 }, { acts: 3, pointsGained: 3 }), "Before your change: +21.0 points a move. Since: +1.0 points a move. Early moves are a rough guide.");
});
