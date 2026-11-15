/** The My agents pane's words (src/panes/agents-words.ts) and the results headline (src/panes/results-headline.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEBT_TEXT, debtText, destroyConfirm, energyExact, energyWords, percent, powerSentence, shareText, workText } from "../src/panes/agents-words.ts";
import { finishPlace, resultsHeadline, type StandingRow } from "../src/panes/results-headline.ts";

test("energy a little below zero reads about 0 energy, with the exact figure for the tooltip (ux 3.9)", () => {
  // Catches: "Energy −8.9 energy" read as broken.
  assert.equal(energyWords(-8.9), "about 0 energy");
  assert.match(energyExact(-8.9)!, /^Exactly −8\.90 energy/);
  assert.equal(energyWords(517.24), "517.24 energy");
  assert.equal(energyExact(517.24), null);
  assert.equal(energyWords(-120), "−120.00 energy", "a real debt is not hidden");
  assert.equal(energyWords(-0.01), "about 0 energy");
});

test("power is explained in the same breath as the share (ux 3.7)", () => {
  assert.equal(powerSentence(25, [0.7]),
    "Your power is the energy you earn each second: 25.00 energy a second. 70% of it goes to your agent, which spends it on moves; you keep 7.50 energy a second, saved up for replacing it or adding another.");
  assert.equal(powerSentence(25, [0.5, 0.25]),
    "Your power is the energy you earn each second: 25.00 energy a second. 75% of it goes to your agents, which spend it on moves; you keep 6.25 energy a second, saved up for replacing one or adding another.");
  assert.match(powerSentence(25, []), /It all goes to your own energy until you summon an agent/);
  assert.match(powerSentence(25, [0.6, 0.4]), /All of it goes to your agents.*you keep none/);
  assert.equal(percent(0.125), "12.5%");
  assert.equal(shareText(0.7, 25), "Share of your power 70% (17.50 energy a second)");
});

test("what an agent did, in one line", () => {
  assert.equal(workText({ acts: 12, skips: 3, failures: 1, spend: 84, pointsGained: 36.54 }), "12 moves · 3 skipped · 1 failed · 84.00 energy spent · +36.54 points from its moves");
  assert.equal(workText({ acts: 1, skips: 0, failures: 0, spend: 0, pointsGained: -2 }), "1 move · 0 skipped · 0 failed · 0.00 energy spent · −2.00 points from its moves");
});

test("a destroy confirmation says what comes back (ux 3.8)", () => {
  assert.equal(destroyConfirm("Tank-1", 517.4), "Tank-1 stops for good and makes no more moves. The 517 energy it holds comes back to you.");
  assert.equal(destroyConfirm("Tank-1", 1.2), "Tank-1 stops for good and makes no more moves. The 1 energy it holds comes back to you.");
  assert.equal(destroyConfirm("Tank-1", -8), "Tank-1 stops for good and makes no more moves. It owes 8 energy: that debt moves to your own store.");
  assert.equal(destroyConfirm("Tank-1", -0.4), "Tank-1 stops for good and makes no more moves. It holds no energy now, so none comes back.");
  assert.equal(destroyConfirm("Tank-1", undefined), "Tank-1 stops for good and makes no more moves. The energy it holds comes back to you.");
});

const rows: StandingRow[] = [
  { memberId: "b", name: "Bo", net: 120, handicap: 0, rank: 2 },
  { memberId: "a", name: "Ada", net: 412.54, handicap: 0, rank: 1 },
  { memberId: "c", name: "Cy", net: 3, handicap: 10, rank: 3 },
];

test("the end leads with the result: where you finished, of how many, with how many points (ux 2.9)", () => {
  assert.equal(resultsHeadline(rows, "a"), "You finished 1st of 3 with 412.54 points.");
  assert.equal(resultsHeadline(rows, "b"), "You finished 2nd of 3 with 120.00 points.");
  assert.equal(resultsHeadline(rows, "c"), "You finished 3rd of 3 with 3.00 points (after your bid's 10% handicap).");
  assert.equal(resultsHeadline(rows, "a", false), "So far you are 1st of 3 with 412.54 points.");
});

test("a spectator is told who won; ties are said as ties", () => {
  assert.equal(resultsHeadline(rows, null), "Ada won with 412.54 points.");
  const tied = [{ ...rows[1]! }, { ...rows[0]!, net: 412.54, rank: 1 }, rows[2]!];
  assert.equal(resultsHeadline(tied, null), "Ada and Bo tied for first with 412.54 points.");
  assert.equal(resultsHeadline(tied, "b"), "You finished tied for 1st of 3 with 412.54 points.");
  assert.equal(finishPlace(tied, tied[2]!), "3rd");
  assert.equal(resultsHeadline(rows, null, false), "Ada leads with 412.54 points so far.");
});

test("no standings have their own sentence", () => {
  assert.equal(resultsHeadline(null, "a"), "The game ended before any scores were counted.");
  assert.equal(resultsHeadline([], "a", false), "No scores yet: they appear once the world runs.");
  assert.equal(resultsHeadline([{ memberId: "a", name: "Ada", net: 1, handicap: 0, rank: 1 }], "a"), "You finished 1st of 1 with 1.00 point.");
});

test("an agent in debt says so, with the server's own explanation (energy-model §7.2; coordinator)", () => {
  assert.equal(debtText(-326.4), "Owes 326.40 energy, borrowed to finish a change.");
  assert.equal(debtText(-8.9), null, "a sliver below 0 is 'about 0' (working), not debt");
  assert.equal(debtText(12), null);
  assert.match(DEBT_TEXT, /^An agent may borrow up to one full store of energy to finish a change; its own income repays the debt within a full-charge time, and while it owes it gets no new opportunities\. If you lower its power or remove it, the debt moves with the power to your own store\.$/);
  assert.equal(destroyConfirm("Tank", -326.4), "Tank stops for good and makes no more moves. It owes 326 energy: that debt moves to your own store.");
});
