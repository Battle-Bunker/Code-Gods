/** The plain score lines (src/core/panels/score-line.ts): "Your points now", and what one act of your agent did. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { actLine, describeChange, latestOwnActs, pointsNowText, ruleScoreChange, ruleScoreText, signed } from "../src/core/panels/score-line.ts";

test("a change is said in plain words", () => {
  assert.equal(describeChange("1R,2R/3R,4R", "1R,2R/4R,4R", "grid"), "changed 3 to 4 at row 2, column 1");
  assert.equal(describeChange("1R,2R/3R,4R", "1R,2R/3G,4R", "grid"), "changed the 3 at row 2, column 1 from red to green");
  assert.equal(describeChange("1R,2R/3R,4R", "1R,2R/5G,4R", "grid"), "changed red 3 to green 5 at row 2, column 1");
  assert.equal(describeChange("1R,2R/3R,4R", "2R,2R/3R,5R", "grid"), "changed 2 cells of a grid");
  assert.equal(describeChange("1R,2R/3R,4R", "1R,2R/3R,4R", "grid"), "left a grid as it was");
  assert.equal(describeChange(12, 13, "number"), "changed 12 to 13");
  assert.equal(describeChange("abc", "abd", "string"), "changed “abc” to “abd”");
  assert.equal(describeChange("x".repeat(60), "y".repeat(60), "string"), "changed a string");
});

test("rule scores and their change", () => {
  assert.equal(ruleScoreText(3), "3");
  assert.equal(ruleScoreText([3, -5]), "(3, −5)");
  assert.equal(ruleScoreText(null), "–");
  assert.equal(signed(1), "+1");
  assert.equal(signed(-2.26), "−2.3");
  assert.equal(signed(0), "+0");
  assert.equal(ruleScoreChange(4, 5), "your rule score +1 (4 → 5)");
  assert.equal(ruleScoreChange(5, 3), "your rule score −2 (5 → 3)");
  assert.equal(ruleScoreChange(5, 5), "your rule score stayed 5");
  assert.equal(ruleScoreChange([1, 4], [2, 1]), "your rule score (1, 4) → (2, 1)");
  assert.equal(ruleScoreChange(null, 5), null);
});

test("the line after an act: the change, the rule score, the points", () => {
  const base = { agent: "Nudger", before: "1R,2R/3R,4R", after: "1R,2R/4R,4R", noun: "grid" };
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 10.1, pointsAfter: 22.4 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5), points +12.3 (10.1 → 22.4).");
  // Without the grid's points before the act (it fell out of the recent events), say what it gives now.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsAfter: 22.4 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5); this grid now gives you 22.4 points.");
  // A higher rule score on a grid nobody else wants: the honest zero.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 0, pointsAfter: 0 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5), points +0 (the others do not want this grid).");
  assert.equal(actLine({ ...base, ruleBefore: null, ruleAfter: null }), "Your agent Nudger changed 3 to 4 at row 2, column 1.");
  assert.equal(actLine({ ...base, ruleBefore: 5, ruleAfter: 4, pointsBefore: 22.4, pointsAfter: 10.1 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score −1 (5 → 4), points −12.3 (22.4 → 10.1).");
});

test("your points now", () => {
  assert.equal(pointsNowText(12.34), "12.3");
  assert.equal(pointsNowText(1234.5), "1,235");
  assert.equal(pointsNowText(-3), "−3.0");
  assert.equal(pointsNowText(undefined), "–");
});

test("the latest act of each of your agents, with the object's points before it when the events still hold them", () => {
  const scored = (payoff: number) => ({ own: { netBits: 1 }, peerNetBits: 1, peerCare: 1, payoff });
  const events = [
    { type: "object.spawned", objectId: "o1", value: "A", version: 0, worldSeconds: 0, ...scored(3) },
    { type: "object.transformed", objectId: "o1", before: "A", value: "B", version: 1, worldSeconds: 1, mine: true, agentId: "a1", ...scored(5) },
    { type: "object.transformed", objectId: "o2", before: "P", value: "Q", version: 4, worldSeconds: 2, mine: true, agentId: "a2", ...scored(7) },
    { type: "object.transformed", objectId: "o1", before: "B", value: "C", version: 2, worldSeconds: 3, mine: false, ...scored(6) },
    { type: "object.transformed", objectId: "o1", before: "C", value: "D", version: 3, worldSeconds: 4, mine: true, agentId: "a1", ...scored(9) },
    { type: "agent.skipped", objectId: "o1", agentId: "a1", worldSeconds: 5 },
  ];
  const acts = latestOwnActs(events);
  assert.deepEqual(acts.get("a1"), { agentId: "a1", objectId: "o1", before: "C", after: "D", world: 4, pointsBefore: 6, pointsAfter: 9 });
  assert.deepEqual(acts.get("a2"), { agentId: "a2", objectId: "o2", before: "P", after: "Q", world: 2, pointsAfter: 7 });
  assert.equal(acts.latest?.agentId, "a1");
  assert.equal(latestOwnActs([]).latest, undefined);
});
