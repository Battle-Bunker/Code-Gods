/** The "add p/q" helper: the whole-number moves it expands into commit as one turn, the same in both languages. */
import { lineQ } from "./config.ts";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { lineType } from "@workspace/v2-linear";
import { runAct, sandboxes } from "../src/index.ts";

const boxes = sandboxes();
after(() => boxes.close());
const state = lineType.decode("-4,2,-1");   // y = 2x + 1/2
const rule = { family: "long-run", params: { b: 7, d: 3, on: "y-intercept top" }, tieBreaker: null };
const source = {
  typescript: `function agent(offer) { return addFraction("mc", 2, 1, 2, 1, 3); }`,
  python: `def agent(offer):\n    return add_fraction("mc", 2, 1, 2, 1, 3)\n`,
};

for (const language of ["typescript", "python"] as const) {
  test(`${language}: adding 1/3 to y = 2x + 1/2 multiplies the bottom by 3 and adds 4 to the top: y = 2x + 5/6`, async () => {
    const { record } = await runAct(await boxes.get(language), { type: lineType, variant: lineQ, state, rule, program: { language, source: source[language] }, seed: "1", energy: 100 });
    assert.equal(record.outcome, "committed", record.reason);
    assert.equal(record.after, "-12,6,-5");
    assert.deepEqual(record.calls.map(c => c.mutator), ["mul", "add"]);
  });
}
