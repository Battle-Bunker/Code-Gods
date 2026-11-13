/** The plain score lines (src/core/panels/score-line.ts): "Your points now", and what one act of your agent did. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORE_LINES, scoreMovesLine } from "@workspace/ui-kit/core";
import { pointsBeforeAgent, accumulateFirstMoves, actLine, agentEarnings, earningsLine, fresherPoints, othersWantClause, ruleDirection, asOfText, describeChange, latestOwnActs, pointsNowText, ruleScoreChange, ruleScoreText, signed } from "../src/core/panels/score-line.ts";

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
  // A rule score with parts names them once ("(6, −8)" alone read as jargon).
  assert.equal(ruleScoreChange([1, 4], [2, 1]), "your rule score (primary, secondary) (1, 4) → (2, 1)");
  assert.equal(ruleScoreChange([6, -8], [6, -8]), "your rule score (primary, secondary) stayed (6, −8)");
  assert.equal(ruleScoreChange([1, 2, 3], [1, 2, 4]), "your rule score (primary, secondary, tertiary) (1, 2, 3) → (1, 2, 4)");
  assert.equal(ruleScoreChange(null, 5), null);
});

test("the line after an act: the change, the rule score, the points", () => {
  const base = { agent: "Nudger", before: "1R,2R/3R,4R", after: "1R,2R/4R,4R", noun: "grid" };
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 10.1, pointsAfter: 22.4 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5), this grid's points +12.3 (10.1 → 22.4).");
  // Without the grid's points before the act (it fell out of the recent events), say what it gives now.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsAfter: 22.4 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5); this grid now gives you 22.4 points.");
  // A higher rule score on a grid nobody else wants: the honest zero.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 0, pointsAfter: 0, ownAfter: 2.5, othersAfter: 0 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5), this grid's points +0 (the others do not want this grid).");
  // The others want it, but your own rarity is 0 (a real line: rule score (0, 0) → (0, 1), still as common as chance).
  assert.equal(actLine({ ...base, ruleBefore: [0, 0], ruleAfter: [0, 1], pointsBefore: 0, pointsAfter: 0, ownAfter: 0, othersAfter: 3.2 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score (primary, secondary) (0, 0) → (0, 1), this grid's points +0 (this grid is not rare by your rule yet).");
  // Neither side known to be 0: no reason is made up.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 0, pointsAfter: 0 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score +1 (4 → 5), this grid's points +0.");
  // Seen as another player (a replay): the third person.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsAfter: 22.4, third: true }),
    "Their agent Nudger changed 3 to 4 at row 2, column 1: their rule score +1 (4 → 5); this grid now gives them 22.4 points.");
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 0, pointsAfter: 0, ownAfter: 0, othersAfter: 2, third: true }),
    "Their agent Nudger changed 3 to 4 at row 2, column 1: their rule score +1 (4 → 5), this grid's points +0 (this grid is not rare by their rule yet).");
  assert.equal(actLine({ ...base, ruleBefore: null, ruleAfter: null }), "Your agent Nudger changed 3 to 4 at row 2, column 1.");
  assert.equal(actLine({ ...base, ruleBefore: 5, ruleAfter: 4, pointsBefore: 22.4, pointsAfter: 10.1 }),
    "Your agent Nudger changed 3 to 4 at row 2, column 1: your rule score −1 (5 → 4), this grid's points −12.3 (22.4 → 10.1).");
});

test("when the points and the rule score disagree, the line names the factor that moved, from the event's own figures", () => {
  const base = { agent: "Keeper", before: "1R,2R/3R,4R", after: "1R,2R/4R,4R", noun: "grid" };
  const head = "Your agent Keeper changed 3 to 4 at row 2, column 1: ";
  // A real line: (4, −6) → (5, −5), points −3.6 (102.1 → 98.4). Points = ✨ rarity × the others' side: 25.525 × 4 = 102.1, 25.9 × 3.8 = 98.42.
  assert.equal(actLine({ ...base, ruleBefore: [4, -6], ruleAfter: [5, -5], pointsBefore: 102.1, pointsAfter: 98.42, ownBefore: 25.525, othersBefore: 4, ownAfter: 25.9, othersAfter: 3.8 }),
    `${head}your rule score went up ((4, −6) → (5, −5), primary first), but this grid's points fell 3.7 (102.1 → 98.4) because the others want this grid less now (4.0 → 3.8).`);
  // The player's own rarity fell although the rule score rose: 30 × 4 = 120, 25 × 4 = 100.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 120, pointsAfter: 100, ownBefore: 30, othersBefore: 4, ownAfter: 25, othersAfter: 4 }),
    `${head}your rule score went up (4 → 5), but this grid's points fell 20 (120.0 → 100.0) because a higher rule score is not rarer here (your ✨ rarity 30.0 → 25.0).`);
  // Both sides fell: 30 × 4 = 120, 25 × 3 = 75.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 120, pointsAfter: 75, ownBefore: 30, othersBefore: 4, ownAfter: 25, othersAfter: 3 }),
    `${head}your rule score went up (4 → 5), but this grid's points fell 45 (120.0 → 75.0) because the others want this grid less now (4.0 → 3.0) and a higher rule score is not rarer here (your ✨ rarity 30.0 → 25.0).`);
  // The rule score did not move, the points did: 10 × 2 = 20, 10 × 2.5 = 25.
  assert.equal(actLine({ ...base, ruleBefore: 5, ruleAfter: 5, pointsBefore: 20, pointsAfter: 25, ownBefore: 10, othersBefore: 2, ownAfter: 10, othersAfter: 2.5 }),
    `${head}your rule score stayed 5, but this grid's points rose 5 (20.0 → 25.0) because the others want this grid more now (2.0 → 2.5).`);
  // The rule score fell and the points rose: 10 × 2 = 20, 9 × 3 = 27 (the rarity fell with the rule score; only the others' side explains the rise).
  assert.equal(actLine({ ...base, ruleBefore: 5, ruleAfter: 4, pointsBefore: 20, pointsAfter: 27, ownBefore: 10, othersBefore: 2, ownAfter: 9, othersAfter: 3 }),
    `${head}your rule score went down (5 → 4), but this grid's points rose 7 (20.0 → 27.0) because the others want this grid more now (2.0 → 3.0).`);
  // The same rule score, a rarer grid by the rule (the table changed around it): 10 × 2 = 20, 12 × 2 = 24.
  assert.equal(actLine({ ...base, ruleBefore: 5, ruleAfter: 5, pointsBefore: 20, pointsAfter: 24, ownBefore: 10, othersBefore: 2, ownAfter: 12, othersAfter: 2 }),
    `${head}your rule score stayed 5, but this grid's points rose 4 (20.0 → 24.0) because this grid is rarer by your rule now (your ✨ rarity 10.0 → 12.0).`);
  // A room that blurs the others' side (an estimate): the others are named as the cause only when their move accounts
  // for at least half of the points' move. 30 × 4 = 120, 25 × 3.9 = 97.5: the others explain 30 × −0.1 = −3 of −22.5.
  const blurred = { ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 120, pointsAfter: 97.5, ownBefore: 30, othersBefore: 4, ownAfter: 25, othersAfter: 3.9 };
  assert.equal(actLine({ ...blurred, estimate: true }),
    `${head}your rule score went up (4 → 5), but this grid's points fell 22.5 (120.0 → 97.5) because a higher rule score is not rarer here (your ✨ rarity 30.0 → 25.0).`);
  assert.equal(actLine(blurred),
    `${head}your rule score went up (4 → 5), but this grid's points fell 22.5 (120.0 → 97.5) because the others want this grid less now (4.0 → 3.9) and a higher rule score is not rarer here (your ✨ rarity 30.0 → 25.0).`, "an exact room names both");
  // Blurred, and the others' move is most of it: 10 × 2 = 20, 10 × 2.5 = 25.
  assert.equal(actLine({ ...base, ruleBefore: 5, ruleAfter: 5, pointsBefore: 20, pointsAfter: 25, ownBefore: 10, othersBefore: 2, ownAfter: 10, othersAfter: 2.5, estimate: true }),
    `${head}your rule score stayed 5, but this grid's points rose 5 (20.0 → 25.0) because the others want this grid more now (2.0 → 2.5).`);
  // The figures before the act are not in the window: say what is known, never a guessed cause.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 102.1, pointsAfter: 98.4, ownAfter: 25.9, othersAfter: 3.8 }),
    `${head}your rule score went up (4 → 5), but this grid's points fell 3.7 (102.1 → 98.4). A grid's points are your ✨ rarity for it × how much the others want it, not the rule score alone.`);
  // Neither side explains the move (figures that do not multiply out): no cause either.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 50, pointsAfter: 40, ownBefore: 10, othersBefore: 4, ownAfter: 10, othersAfter: 4 }),
    `${head}your rule score went up (4 → 5), but this grid's points fell 10 (50.0 → 40.0). A grid's points are your ✨ rarity for it × how much the others want it, not the rule score alone.`);
  // Both moved the same way: the short line stands.
  assert.equal(actLine({ ...base, ruleBefore: [3, -11], ruleAfter: [2, -11], pointsBefore: 20, pointsAfter: 13, ownBefore: 5, othersBefore: 4, ownAfter: 3.25, othersAfter: 4 }),
    `${head}your rule score (primary, secondary) (3, −11) → (2, −11), this grid's points −7 (20.0 → 13.0; how much the others want this grid: 4.0).`);
  // The third person.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, pointsBefore: 120, pointsAfter: 100, ownBefore: 30, othersBefore: 4, ownAfter: 25, othersAfter: 4, third: true }),
    "Their agent Keeper changed 3 to 4 at row 2, column 1: their rule score went up (4 → 5), but this grid's points fell 20 (120.0 → 100.0) because a higher rule score is not rarer here (their ✨ rarity 30.0 → 25.0).");
});

test("how much the others want a grid is always said when the event gives it", () => {
  assert.equal(othersWantClause(12, "grid"), "the others want this grid a lot: 12.0");
  assert.equal(othersWantClause(8, "grid"), "the others want this grid a lot: 8.0");
  assert.equal(othersWantClause(7.9, "grid"), "how much the others want this grid: 7.9");
  assert.equal(othersWantClause(1, "grid"), "how much the others want this grid: 1.0");
  assert.equal(othersWantClause(0.1, "grid"), "the others barely want this grid: 0.1");
  assert.equal(othersWantClause(0, "grid"), "the others do not want this grid");
  assert.equal(othersWantClause(-1.2, "grid"), "the others would rather not have this grid: −1.2");
  assert.equal(othersWantClause(undefined, "grid"), null);
  // A figure that shows as 0.0 is none: never "barely … 0.0" or "would rather not … 0.0".
  assert.equal(othersWantClause(0.04, "grid"), "the others do not want this grid");
  assert.equal(othersWantClause(-0.04, "grid"), "the others do not want this grid");
  assert.equal(othersWantClause(0.05, "grid"), "the others barely want this grid: 0.1");
  // The same (3, 7) → (4, 8) step on two grids: +41.6 once and +0.4 another time.
  const base = { agent: "Keeper", before: "1R,2R/3R,4R", after: "1R,2R/4R,4R", noun: "grid", ruleBefore: [3, 7], ruleAfter: [4, 8] };
  assert.equal(actLine({ ...base, pointsBefore: 100, pointsAfter: 141.6, othersAfter: 12 }),
    "Your agent Keeper changed 3 to 4 at row 2, column 1: your rule score (primary, secondary) (3, 7) → (4, 8), this grid's points +41.6 (100.0 → 141.6; the others want this grid a lot: 12.0).");
  assert.equal(actLine({ ...base, pointsBefore: 1, pointsAfter: 1.4, othersAfter: 0.1 }),
    "Your agent Keeper changed 3 to 4 at row 2, column 1: your rule score (primary, secondary) (3, 7) → (4, 8), this grid's points +0.4 (1.0 → 1.4; the others barely want this grid: 0.1).");
  assert.equal(actLine({ ...base, pointsAfter: 1.4, othersAfter: 0.1 }),
    "Your agent Keeper changed 3 to 4 at row 2, column 1: your rule score (primary, secondary) (3, 7) → (4, 8); this grid now gives you 1.4 points (the others barely want this grid: 0.1).");
  assert.equal(ruleDirection([4, -6], [5, -5]), 1);
  assert.equal(ruleDirection([4, -6], [4, -7]), -1);
  assert.equal(ruleDirection(5, 5), 0);
  assert.equal(ruleDirection(null, 5), null);
  assert.equal(ruleDirection(5, [5]), null);
});

test("your points now is the fresher of the counts the page holds, so it never trails the leaderboard beside it", () => {
  assert.deepEqual(fresherPoints([{ score: 2890, world: 100 }, { score: 3002, world: 115 }, { score: 2700 }]), { score: 3002, world: 115 });
  assert.deepEqual(fresherPoints([{ score: 3050, world: 120 }, { score: 3002, world: 115 }]), { score: 3050, world: 120 });
  assert.deepEqual(fresherPoints([undefined, null, { score: 2700 }]), { score: 2700 }, "an undated count only while no dated one has loaded");
  assert.deepEqual(fresherPoints([{ score: 2700 }, { score: 2890, world: 100 }]), { score: 2890, world: 100 });
  assert.equal(fresherPoints([undefined, { score: undefined }]), null);
});

test("the act line gives the rarity move beside the rule score when the player's table gives it", () => {
  const base = { agent: "Keeper", before: "1R,2R/3R,4R", after: "1R,2R/4R,4R", noun: "grid" };
  const head = "Your agent Keeper changed 3 to 4 at row 2, column 1: ";
  assert.equal(actLine({ ...base, ruleBefore: [3, -26], ruleAfter: [4, -21], rarityBefore: 9.1, rarityAfter: 12.42, pointsBefore: 36.4, pointsAfter: 49.6 }),
    `${head}your rule score (primary, secondary) (3, −26) → (4, −21): ✨ 9.1 → 12.4, this grid's points +13.2 (36.4 → 49.6).`);
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, rarityBefore: 2, rarityAfter: 3.5, pointsAfter: 22.4 }),
    `${head}your rule score +1 (4 → 5): ✨ 2.0 → 3.5; this grid now gives you 22.4 points.`);
  // The same ✨ to one decimal, a rule score that stayed, or one side unknown: the tuple alone.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, rarityBefore: 2.01, rarityAfter: 2.04, pointsAfter: 22.4 }), `${head}your rule score +1 (4 → 5); this grid now gives you 22.4 points.`);
  assert.equal(actLine({ ...base, ruleBefore: 5, ruleAfter: 5, rarityBefore: 2, rarityAfter: 2 }), `${head}your rule score stayed 5.`);
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, rarityAfter: 3.5 }), `${head}your rule score +1 (4 → 5).`);
  // Against the points: the rarity move is said with the rule score there too.
  assert.equal(actLine({ ...base, ruleBefore: 4, ruleAfter: 5, rarityBefore: 2, rarityAfter: 3.5, pointsBefore: 120, pointsAfter: 100 }),
    `${head}your rule score went up (4 → 5: ✨ 2.0 → 3.5), but this grid's points fell 20 (120.0 → 100.0). A grid's points are your ✨ rarity for it × how much the others want it, not the rule score alone.`);
});

test("what each agent's moves earned, counted from the events the pane holds, with the window said", () => {
  const scored = (payoff: number) => ({ own: { netBits: 1 }, peerCare: 1, payoff });
  const events = [
    { type: "object.spawned", objectId: "o1", worldSeconds: 0, ...scored(10) },
    { type: "object.transformed", objectId: "o1", before: "A", value: "B", worldSeconds: 1, mine: true, agentId: "a1", ...scored(60) },    // +50
    { type: "object.transformed", objectId: "o2", before: "P", value: "Q", worldSeconds: 2, mine: true, agentId: "a1", ...scored(7) },     // before unknown: not counted
    { type: "object.transformed", objectId: "o1", before: "B", value: "C", worldSeconds: 3, mine: false, ...scored(40) },                   // another player's move
    { type: "object.transformed", objectId: "o1", before: "C", value: "D", worldSeconds: 4, mine: true, agentId: "a2", ...scored(30) },    // −10
    { type: "object.transformed", objectId: "o2", before: "Q", value: "R", worldSeconds: 5, mine: true, agentId: "a1", ...scored(65) },    // +58
  ];
  const earned = agentEarnings(events);
  assert.deepEqual(earned.get("a1"), { moves: 2, points: 108, objects: 2 });
  assert.deepEqual(earned.get("a2"), { moves: 1, points: -10, objects: 1 });
  // N is the number of moves counted (a move whose grid's points just before it are not among the events is not one of them).
  assert.equal(earningsLine(earned.get("a1"), "grid"), "2 of its latest moves, counted here: +108 points on 2 grids (+54 a move). Only the latest events are counted, not the whole game.");
  assert.equal(earningsLine(earned.get("a2"), "grid"), "1 of its latest moves, counted here: −10 points on 1 grid. Only the latest events are counted, not the whole game.");
  assert.equal(earningsLine(undefined, "grid"), null);
  // A replace keeps the agent's id: only the moves of its current program count (after its agent.replaced event, or after a known boundary).
  const replacedMid = [...events.slice(0, 2), { type: "agent.replaced", agentId: "a1", worldSeconds: 1.5 }, ...events.slice(2)];
  assert.deepEqual(agentEarnings(replacedMid).get("a1"), { moves: 1, points: 58, objects: 1 }, "the +50 was the old program's");
  assert.deepEqual(agentEarnings(events, new Map([["a1", 1]])).get("a1"), { moves: 1, points: 58, objects: 1 }, "the same from a boundary, when the event is not among them");
  assert.deepEqual(agentEarnings(events, new Map([["a1", 1]])).get("a2"), { moves: 1, points: -10, objects: 1 }, "another agent is untouched");
  assert.equal(earningsLine({ moves: 1234, points: 1240.4, objects: 23 }, "grid"), "1,234 of its latest moves, counted here: +1,240.4 points on 23 grids (+1 a move). Only the latest events are counted, not the whole game.");
  assert.equal(earningsLine({ moves: 2, points: 108, objects: 2 }, "grid", { third: true }), "2 of their agent's latest moves, counted here: +108 points on 2 grids (+54 a move). Only the latest events are counted, not the whole game.");
  // A room that blurs the others' side: the points are an estimate, and the line says "about".
  assert.equal(earningsLine({ moves: 12, points: 648, objects: 9 }, "grid", { estimate: true }), "12 of its latest moves, counted here: about +648 points on 9 grids (about +54 a move). Only the latest events are counted, not the whole game, and live points are an estimate.");
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
  assert.deepEqual(acts.get("a1"), { agentId: "a1", objectId: "o1", before: "C", after: "D", world: 4, pointsBefore: 6, pointsAfter: 9, ownAfter: 1, othersAfter: 1, ownBefore: 1, othersBefore: 1 });
  assert.deepEqual(acts.get("a2"), { agentId: "a2", objectId: "o2", before: "P", after: "Q", world: 2, pointsAfter: 7, ownAfter: 1, othersAfter: 1 });
  assert.equal(acts.latest?.agentId, "a1");
  assert.equal(latestOwnActs([]).latest, undefined);
});

test("the figure says how old it is instead of promising a live total", () => {
  assert.equal(asOfText(120, 119.2), "counted just now");
  assert.equal(asOfText(120, 112), "counted 8 s ago");
  assert.equal(asOfText(300, 120), "counted 3 min ago");
  assert.equal(asOfText(120, undefined), null, "unknown age: say nothing");
  assert.equal(asOfText(undefined, 100), null);
  assert.equal(asOfText(100, 120), "counted just now", "never a negative age");
});

test("why your points move before you have done anything: one plain clause, in the table's own noun", () => {
  assert.equal(SCORE_LINES.moves, "Every object on the table gives you points when it is rare by your rule and the others want it too, so this moves when anyone changes an object.");
  assert.equal(scoreMovesLine("grid"), "Every grid on the table gives you points when it is rare by your rule and the others want it too, so this moves when anyone changes a grid.");
  assert.equal(scoreMovesLine("object"), SCORE_LINES.moves);
  assert.ok(!SCORE_LINES.moves.includes("—"));
});

test("an agent's first counted moves are accumulated as they arrive and frozen at the limit: never a rolling window", () => {
  const scored = (payoff: number) => ({ own: { netBits: 1 }, peerCare: 1, payoff });
  const move = (id: number, objectId: string, payoff: number, agentId = "a9") => ({ id, type: "object.transformed", objectId, before: "A", value: "B", mine: true, agentId, worldSeconds: id, ...scored(payoff) });
  const spawn = (id: number, objectId: string, payoff: number) => ({ id, type: "object.spawned", objectId, worldSeconds: id, ...scored(payoff) });
  // First batch: o1 spawned at 10, moved to 40 (+30), then to 45 (+5); another agent's move does not count.
  const first = [spawn(1, "o1", 10), move(2, "o1", 40), move(3, "o1", 45), move(4, "o1", 50, "other")];
  const a = accumulateFirstMoves(undefined, first, "a9", 4);
  assert.deepEqual({ moves: a.moves, points: a.points, frozen: a.frozen }, { moves: 2, points: 35, frozen: false });
  assert.equal(accumulateFirstMoves(a, first, "a9", 4), a, "the same events again: nothing is counted twice (the same object back)");
  // The window moved on: events 1 and 2 dropped out, two new moves arrived. Nothing counted is lost, nothing doubled.
  const second = [move(3, "o1", 45), move(4, "o1", 50, "other"), move(5, "o1", 70), move(6, "o1", 60)];
  const b = accumulateFirstMoves(a, second, "a9", 4);
  assert.deepEqual({ moves: b.moves, points: b.points, frozen: b.frozen }, { moves: 4, points: 35 + 20 - 10, frozen: true });
  // Frozen: later moves never change it.
  assert.equal(accumulateFirstMoves(b, [move(6, "o1", 60), move(7, "o1", 500)], "a9", 4), b);
  // A replace keeps the agent's id: only the moves after it are the new program's (events 2 and 3 are at world 2 and 3).
  const since = accumulateFirstMoves(undefined, first, "a9", 4, 2);
  assert.deepEqual({ moves: since.moves, points: since.points }, { moves: 1, points: 5 }, "the move at world 3 only");
  // The limit is never passed inside one batch either.
  const many = [spawn(1, "o1", 0), ...Array.from({ length: 30 }, (_, i) => move(i + 2, "o1", i + 1))];
  assert.equal(accumulateFirstMoves(undefined, many, "a9").moves, 20);
  assert.equal(accumulateFirstMoves(undefined, many, "a9").points, 20, "the first 20 moves, +1 each");
});

test("before the first agent, one short clause says why there are points already", () => {
  assert.equal(pointsBeforeAgent("grid"), "Every grid already gives everyone some points; your agent's job is to raise yours.");
});
