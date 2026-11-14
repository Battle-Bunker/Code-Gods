/**
 * The rule gallery's model (integration plan §1.1): pages generated from the v2 rule families and the line type, with
 * the board, parameters and tie-breaker in the URL. What would break: a family missing from the gallery or shown on a
 * board that never deals it, a family page whose choices are not the family's dealable ones, a link that does not
 * open the same rule again, a bad URL crashing the page instead of falling back.
 */
import { test } from "node:test";
import { objectLadder } from "@workspace/v2-core";
import assert from "node:assert/strict";
import { beginnerFamilies, lineType, lineZ } from "@workspace/v2-linear";
import { BOARDS, familyPage, galleryFamilies, gallerySearch, galleryRarities, setupFromSearch } from "../src/site/lib/rule-gallery.ts";

test("the gallery lists every family the board deals, the beginner pool first, and nothing it does not deal", () => {
  const g = galleryFamilies("line-z");
  assert.deepEqual(g.beginner.map(e => e.id), beginnerFamilies.filter(f => f.dealable(lineZ).length).map(f => f.id));
  const all = [...g.beginner, ...g.more].map(e => e.id).sort();
  assert.deepEqual(all, lineType.families.filter(f => f.dealable(lineZ).length).map(f => f.id).sort());
  const tri = g.more.find(e => e.id === "triangle-area")!;
  assert.equal(tri.title, "Triangle Area");
  assert.match(tri.sentence, /triangle/);
  assert.equal(tri.choices, 5, "five areas to deal: 4, 6, 8, 12, 18");
});

test("a beginner family says which presets deal it on that board", () => {
  const g = galleryFamilies("line-z");
  const e = g.beginner[0]!;
  assert.ok(e.presets.includes("Lines · beginner"), e.presets.join(", "));
  assert.ok(!e.presets.includes("Lines · rational"), "rational deals on fraction lines, not this board");
});

test("every board the gallery offers is a variant of the line type", () => {
  for (const b of BOARDS) assert.ok(lineType.variants.some(v => v.id === b.id), b.id);
});

test("a family page offers the family's dealable parameters and tie-breakers, and its card follows the choice", () => {
  const p = familyPage("triangle-area", setupFromSearch("?board=line-z&params=2&tb=even"))!;
  assert.deepEqual(p.params.map(c => c.label), ["A = 4", "A = 6", "A = 8", "A = 12", "A = 18"]);
  assert.equal(p.setup.params, 2);
  assert.deepEqual(p.rule.params, { A: 8 });
  assert.equal(p.rule.tieBreaker, "even");
  assert.deepEqual(p.tieBreakers.map(t => t.id), ["legs", "even"]);
  assert.match(p.card, /area as close as possible to 8\. Tie-breaker: make the two legs as close to equal/);
  assert.deepEqual(p.reads, ["the triangle with the axes", "the line on the plane", "slope-intercept"]);
});

test("a family without parameters says so; one with none to deal on this board has no page", () => {
  const p = familyPage("m-meets-c", setupFromSearch(""))!;
  assert.deepEqual(p.params, [{ index: 0, label: "Nothing to choose: this rule has no numbers of its own." }]);
  assert.equal(familyPage("no-such-family", setupFromSearch("")), null);
});

test("an unknown board, a parameter past the end or an unknown tie-breaker falls back to the first", () => {
  const p = familyPage("triangle-area", setupFromSearch("?board=grid&params=99&tb=zzz"))!;
  assert.equal(p.setup.board, "line-z");
  assert.equal(p.setup.params, 0);
  assert.equal(p.rule.tieBreaker, "legs");
});

test("the URL of a choice opens the same rule again", () => {
  const s = { board: "line-q", params: 3, tb: "even" };
  assert.equal(gallerySearch(s), "?board=line-q&params=3&tb=even");
  assert.deepEqual(setupFromSearch(gallerySearch(s)), s);
  assert.equal(gallerySearch({ board: "line-z", params: 0, tb: null }), "");
});

test("a family page asks the server for a preset that deals it and prices its own rule's rungs from that rule's value points", () => {
  const page = familyPage(beginnerFamilies[0]!.id, setupFromSearch(""))!;
  const want = galleryRarities(page, undefined);
  assert.ok(want.query, "a beginner family on the default board is dealt by some preset");
  assert.equal(want.rarities, null, "nothing until the rows arrive");
  // Two points: the worst (0 bits) and a main score of 1 (4 bits). Rungs below it sit between the two (their mean, 2);
  // rungs at or above it read 4 (beyond the best point, a gallery row has no tail to climb).
  const mine = { ruleKey: want.key, points: [{ score: null, bits: 0 }, { score: ["1"], bits: 4 }] };
  const other = { ruleKey: "something/else", points: [{ score: null, bits: 9 }] };
  const got = galleryRarities(page, [other, mine]).rarities!;
  const rungs = objectLadder(page.rule.type, page.rule.family, page.rule.params, page.rule.variant, page.rule.tieBreaker ?? undefined);
  assert.deepEqual(got, rungs.map(r => r.score === null ? 0 : r.score[0] === null ? 2 : 4));
  assert.equal(galleryRarities(page, [other]).rarities, null, "a rule the preset does not deal shows no rarities");
});
