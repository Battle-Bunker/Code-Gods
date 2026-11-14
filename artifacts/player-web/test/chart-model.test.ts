/** The charts' pure parts (src/panes/chart-model.ts) and the rules pane's words (src/panes/rules-words.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axisNumber, careCounts, careKind, carePoints, careTitle, raceSeries, riseAndFall, scale, seriesOf, ticks, timeDomain,
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
  assert.match(peak, /Your highest was 249\.0 points at 2:10; you ended with 127\.0 points\.$/);
  assert.match(riseAndFall([{ x: 0, y: 9 }, { x: 5, y: 1 }], { you: true, ended: false }), /you have 1\.0 point now\.$/);
  for (const s of [flat, peak]) assert.doesNotMatch(s, /\b(bits|payoff|object|grid)\b/i);
});

test("the others-care scatter reads the packed digest, and the corners say who cares", () => {
  const pts = carePoints([1, 3, 4, 2, 0, 5, 3, 2, 0, 4, 0, 0, 5, 1]);
  assert.equal(pts.length, 4, "a trailing partial triple is ignored");
  assert.deepEqual(pts.map(p => [p.number, p.points, p.kind]), [[1, 12, "both"], [2, 0, "others"], [3, 0, "mine"], [4, 0, "none"]]);
  assert.deepEqual(careCounts(pts), { both: 1, others: 1, mine: 1, none: 1 });
  assert.equal(careKind(-1, 2), "others", "a stray negative counts as no rarity");
  assert.deepEqual(carePoints(null), []);
  assert.equal(careTitle(pts[0]!), "Line 1: your ✨ rarity 3.0 × how much the others want it 4.0 = 12.0 points");
});

const BEGINNER: RulesInput = {
  title: "Lines · beginner", minPlayers: 3, planningSeconds: 60, worldSeconds: 300, startingEnergy: 600,
  powerPerSecond: 64, fullChargeSeconds: 30, bid: null,
};

test("the rules say the game on lines in player words, with this game's values", () => {
  const text = rulesParagraphs(BEGINNER).join("\n");
  for (const want of ["✨ rarity", "⚡ energy", "600.0 ⚡", "64.0 ⚡ a second", "1 minute of planning", "runs for 5 minutes", "only you want gives you 0 points", "30 seconds"])
    assert.ok(text.includes(want), want);
  assert.doesNotMatch(text, /\b(bits|payoff|objects?|grids?)\b/i);
  assert.doesNotMatch(text, /bidding/, "no bid phase in this preset");
  const bid = rulesParagraphs({ ...BEGINNER, bid: { seconds: 45 } }).join("\n");
  assert.match(bid, /First comes 45 seconds of bidding.*Then 1 minute of planning/);
  assert.deepEqual(rulesFacts(BEGINNER).map(([k]) => k), ["Game", "Players", "Planning", "The world runs", "Starting energy", "Power", "Energy fills in"]);
  assert.deepEqual(rulesFacts({ ...BEGINNER, bid: { seconds: 45 } })[2], ["Bidding", "45 seconds"]);
});

test("durations in words", () => {
  assert.deepEqual([0, 1, 45, 60, 150, 300].map(duration), ["0 seconds", "1 second", "45 seconds", "1 minute", "2 minutes 30 seconds", "5 minutes"]);
});
