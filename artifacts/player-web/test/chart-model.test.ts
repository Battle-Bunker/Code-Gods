/** The charts' pure parts (src/panes/chart-model.ts) and the rules pane's words (src/panes/rules-words.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axisNumber, careCounts, careKind, carePoints, careTitle, drawable, raceSeries, riseAndFall, scale, seriesOf, ticks, timeDomain,
  timeTicks, valueDomain, valuesAt,
} from "../src/panes/chart-model.ts";
import { duration, rulesFacts, rulesParagraphs, type RulesInput } from "../src/panes/rules-words.ts";

test("a value axis starts at zero and never pads below it (ux 2.9)", () => {
  // Catches: an axis padded to −50 under totals that never went negative.
  assert.deepEqual(valueDomain([3, 120, 249]), { lo: 0, hi: 300 });
  assert.deepEqual(valueDomain([]), { lo: 0, hi: 1 });
  assert.deepEqual(valueDomain([0, 0]), { lo: 0, hi: 1 });
  // A value below zero reaches only as far as that value.
  assert.deepEqual(valueDomain([-12.5, 40]), { lo: -12.5, hi: 40 });
  assert.deepEqual(ticks(valueDomain([3, 120, 249])), [0, 100, 200, 300]);
});

test("round numbers for the axis, the top one labelled", () => {
  for (const max of [0.7, 6.3, 41, 79, 81, 101, 157, 249, 1234, 98765]) {
    const d = valueDomain([0, max]);
    assert.ok(d.hi >= max && d.hi <= max * 2, `${max} → ${d.hi}`);
    assert.equal(ticks(d).at(-1), d.hi, `the top gridline of ${max} has a label`);
  }
  assert.deepEqual(valueDomain([6.3]), { lo: 0, hi: 8 });
  assert.deepEqual(ticks({ lo: 0, hi: 250 }, 4), [0, 100, 200]);
  assert.deepEqual(ticks({ lo: 0, hi: 1 }, 4), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(ticks({ lo: -12.5, hi: 50 }, 4), [0, 20, 40], "no tick below the lowest value");
  assert.deepEqual(ticks({ lo: -25, hi: 50 }, 3), [-25, 0, 25, 50]);
  assert.deepEqual([0, 250, 1500, 12000, 2_500_000].map(axisNumber), ["0", "250", "1,500", "12K", "2.5M"]);
  assert.equal(axisNumber(-10), "−10");
});

test("time runs from the world's start and ticks read as m:ss steps", () => {
  assert.deepEqual(timeDomain([10, 20, 290]), { lo: 0, hi: 290 });
  assert.deepEqual(timeDomain([0]), { lo: 0, hi: 1 });
  assert.deepEqual(timeTicks({ lo: 0, hi: 300 }, 4), [0, 120, 240]);
  assert.deepEqual(timeTicks({ lo: 0, hi: 40 }, 4), [0, 10, 20, 30, 40]);
  const s = scale({ lo: 0, hi: 100 }, 10, 110);
  assert.equal(s(50), 60);
  assert.equal(scale({ lo: 0, hi: 10 }, 100, 0)(10), 0, "an inverted range for y");
});

const history = [
  { seq: 1, worldSeconds: 10, totals: [{ memberId: "a", net: 5 }, { memberId: "b", net: 8 }] },
  { seq: 0, worldSeconds: 0, totals: [{ memberId: "a", net: 0 }, { memberId: "b", net: 0 }] },
  { seq: 2, worldSeconds: 20, totals: [{ memberId: "a", net: 12 }, { memberId: "b", net: 6 }, { memberId: "c", net: 1 }] },
];
const roster = [{ memberId: "b", name: "Bo" }, { memberId: "a", name: "Ada" }, { memberId: "c", name: "Cy" }];

test("one series per player from the standings history, in time order, coloured by roster place", () => {
  assert.deepEqual(seriesOf(history, "a"), [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 12 }]);
  const race = raceSeries(history, roster, "a");
  assert.deepEqual(race.map(s => [s.key, s.label, s.you, s.slot]), [["b", "Bo", false, 0], ["a", "You", true, 1], ["c", "Cy", false, 2]]);
  assert.deepEqual(race[2]!.points, [{ x: 20, y: 1 }], "a player counted from a later publication starts there");
  assert.equal(raceSeries([], roster, "a").length, 0);
  assert.equal(raceSeries(history, roster, null).some(s => s.you), false, "a spectator has no 'You'");
});

test("the hover read-out takes the publication nearest the pointer", () => {
  const race = raceSeries(history, roster, "a");
  const r = valuesAt(race, 13);
  assert.equal(r.at, 10);
  assert.deepEqual(r.rows.map(x => [x.series.key, x.y]), [["b", 8], ["a", 5]]);
});

test("the caption always says points rise and fall, and names a peak above the last value (ux 2.9)", () => {
  // Catches: "your best object gave you 127 points" beside a chart peaking at 249, read as a mismatch.
  const flat = riseAndFall([{ x: 0, y: 0 }, { x: 10, y: 5 }], { you: true, ended: true });
  assert.match(flat, /^Points rise and fall/);
  assert.doesNotMatch(flat, /highest/);
  const peak = riseAndFall([{ x: 0, y: 0 }, { x: 130, y: 249 }, { x: 300, y: 127 }], { you: true, ended: true });
  assert.match(peak, /Your highest was 249\.00 points at 2:10; you ended with 127\.00 points\.$/);
  assert.match(riseAndFall([{ x: 0, y: 9 }, { x: 5, y: 1 }], { you: true, ended: false }), /you have 1.00 point now\.$/);
  for (const s of [flat, peak]) assert.doesNotMatch(s, /\b(bits|payoff|object|grid)\b/i);
});

test("the others-care scatter reads the packed digest, and the corners say who cares", () => {
  const pts = carePoints([1, 3, 4, 2, 0, 5, 3, 2, 0, 4, 0, 0, 5, 1]);
  assert.equal(pts.length, 4, "a trailing partial triple is ignored");
  assert.deepEqual(pts.map(p => [p.number, p.points, p.kind]), [[1, 12, "both"], [2, 0, "others"], [3, 0, "mine"], [4, 0, "none"]]);
  assert.deepEqual(careCounts(pts), { both: 1, others: 1, mine: 1, none: 1 });
  assert.equal(careKind(-1, 2), "others", "a stray negative counts as no rarity");
  assert.deepEqual(carePoints(null), []);
  assert.equal(careTitle(pts[0]!), "Line 1: your 3.00 bits × others' 4.00 bits = 12.00 points");
  assert.equal(careTitle(pts[2]!), "Line 3: your 2.00 bits × others' 0.00 bits = 0.00 points. Only you care about this line, so it scores nothing yet: it needs someone else to find it rare too.");
});

const BEGINNER: RulesInput = {
  title: "Lines · beginner", minPlayers: 3, planningSeconds: 60, worldSeconds: 300, startingEnergy: 600,
  powerPerSecond: 64, fullChargeSeconds: 30, bid: null,
};

test("the rules say the game on lines in player words, with this game's values", () => {
  const text = rulesParagraphs(BEGINNER).join("\n");
  for (const want of ["the more energy it holds", "your bits for it × the others' bits", "energy", "600.00 energy", "64.00 energy a second", "1 minute of planning", "runs for 5 minutes", "only you want gives you 0 points", "30 seconds"])
    assert.ok(text.includes(want), want);
  assert.doesNotMatch(text, /\b(payoff|objects?|grids?)\b/i);
  assert.doesNotMatch(text, /bidding/, "no bid phase in this preset");
  const bid = rulesParagraphs({ ...BEGINNER, bid: { seconds: 45 } }).join("\n");
  assert.match(bid, /First comes 45 seconds of bidding.*Then 1 minute of planning/);
  assert.deepEqual(rulesFacts(BEGINNER).map(([k]) => k), ["Game", "Players", "Planning", "The world runs", "Starting energy", "Power", "Energy fills in", "Totals counted", "Others' bits"]);
  assert.deepEqual(rulesFacts({ ...BEGINNER, bid: { seconds: 45 } })[2], ["Bidding", "45 seconds"]);
});

test("a half-life game's rules say its end is hidden and random; the facts say the counting interval and the noise", () => {
  const text = rulesParagraphs({ ...BEGINNER, durationMode: "halfLife" }).join("\n");
  assert.match(text, /ends at a hidden random moment: half of games end within 5 minutes of the world starting/);
  assert.doesNotMatch(text, /runs for 5 minutes and the game ends/);
  const facts = Object.fromEntries(rulesFacts({ ...BEGINNER, durationMode: "halfLife", scoreIntervalSeconds: 30, peerNoiseBits: 0 }));
  assert.equal(facts["The world runs"], "a hidden random time (half-life 5 minutes)");
  assert.equal(facts["Totals counted"], "every 30 seconds");
  assert.equal(facts["Others' bits"], "exact");
  assert.equal(Object.fromEntries(rulesFacts(BEGINNER))["Others' bits"], "blurred while live (about 8 bits); totals exact");
});

test("the rules say looking costs energy at the room's weight, or is free (owner decision 35)", () => {
  assert.equal(Object.fromEntries(rulesFacts({ ...BEGINNER, readPriceWeight: 3 }))["Looking"], "costs energy (3× the read price); you see each one as you last looked");
  assert.equal(Object.fromEntries(rulesFacts({ ...BEGINNER, readPriceWeight: 0 }))["Looking"], "free: you see everything as it is");
});

test("the rules say how often a rule gets new numbers (call 18), and nothing when it never does", () => {
  assert.equal(Object.fromEntries(rulesFacts({ ...BEGINNER, driftSeconds: 120 }))["Rules' numbers"], "may change every 2 minutes: the same kind of rule, a new target (a rule with one set of numbers keeps it)");
  assert.equal(Object.fromEntries(rulesFacts({ ...BEGINNER, driftSeconds: 0 }))["Rules' numbers"], undefined);
});

test("durations in words", () => {
  assert.deepEqual([0, 1, 45, 60, 150, 300].map(duration), ["0 seconds", "1 second", "45 seconds", "1 minute", "2 minutes 30 seconds", "5 minutes"]);
});

test("the rise-and-fall caption speaks the game's noun", () => {
  const s = riseAndFall([{ x: 0, y: 0 }, { x: 10, y: 5 }], { you: true, ended: true, one: "grid" });
  assert.match(s, /a grid's points change whenever an agent changes it/);
  assert.doesNotMatch(s, /\bline\b/);
});

test("lead changes: the world times the leader changed, for the replay's race (v1's markers)", async () => {
  const { leadChanges } = await import("../src/panes/chart-model.ts");
  const s = (key: string, ys: number[]) => ({ key, label: key, you: false, slot: 0, points: ys.map((y, i) => ({ x: i * 10, y })) });
  assert.deepEqual(leadChanges([s("a", [1, 5, 5, 2]), s("b", [0, 3, 6, 9])]), [20]);
  assert.deepEqual(leadChanges([s("a", [1, 1]), s("b", [1, 1])]), [], "a tie is no change of leader");
  assert.deepEqual(leadChanges([]), []);
});

test("a chart draws only series with points: an empty one is left out, not read (the end page's crash)", () => {
  // Catches: "How the game went" failing with "reading 'x'" when one of your best lines had no moves loaded yet (the
  // chart read the last point of an empty series).
  const one = { key: "a", label: "#1", you: true, slot: 0, points: [{ x: 0, y: 1 }, { x: 5, y: 2 }] };
  const none = { key: "b", label: "#2", you: false, slot: 1, points: [] };
  assert.deepEqual(drawable([one, none]).map(s => s.key), ["a"]);
});
