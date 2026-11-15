/**
 * The rule gallery's model (integration plan §1.1): pages generated from the v2 rule families and the line type, with
 * the board, parameters and tie-breaker in the URL. What would break: a family missing from the gallery or shown on a
 * board that never deals it, a family page whose choices are not the family's dealable ones, a link that does not
 * open the same rule again, a bad URL crashing the page instead of falling back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { presetOf } from "@workspace/engine/convex/v2/presets.ts";
import { beginnerFamilies, lineQ, lineType, lineZ } from "@workspace/v2-linear";
import { beginnerGridFamilies, grid4, gridType } from "@workspace/v2-grid";
import { BOARDS, familyPage, galleryFamilies, gallerySearch, setupFromSearch } from "../src/site/lib/rule-gallery.ts";

test("the gallery lists every family the board deals, the beginner pool first, and nothing it does not deal", () => {
  const g = galleryFamilies("line-q");
  assert.deepEqual(g.beginner.map(e => e.id), beginnerFamilies.filter(f => f.dealable(lineQ).length).map(f => f.id));
  const all = [...g.beginner, ...g.more].map(e => e.id).sort();
  assert.deepEqual(all, lineType.families.filter(f => f.dealable(lineQ).length).map(f => f.id).sort());
  const tri = g.more.find(e => e.id === "triangle-area")!;
  assert.equal(tri.title, "Triangle Area");
  assert.match(tri.sentence, /triangle/);
  assert.equal(tri.choices, 5, "five areas to deal: 4, 6, 8, 12, 18");
});

test("a beginner family says which presets deal it on that board", () => {
  const e = galleryFamilies("line-q").beginner[0]!;
  assert.ok(e.presets.includes("Lines · beginner"), e.presets.join(", "));
  assert.deepEqual(galleryFamilies("line-z").beginner[0]!.presets, [], "no setup deals whole-number lines");
});

test("every board the gallery offers is a variant of a type the app draws, the grid's included", () => {
  for (const b of BOARDS) assert.ok([lineType, gridType].some(t => t.variants.some(v => v.id === b.id)), b.id);
  assert.ok(BOARDS.some(b => b.id === grid4.id), "the grid's board");
});

test("the grid board lists the grid's families (the beginner grid pool first), never a line's, and its pages are grids'", () => {
  const g = galleryFamilies(grid4.id);
  assert.deepEqual(g.beginner.map(e => e.id), beginnerGridFamilies(4).filter(f => f.dealable(grid4).length).map(f => f.id));
  const all = [...g.beginner, ...g.more].map(e => e.id).sort();
  assert.deepEqual(all, gridType.families.filter(f => f.dealable(grid4).length).map(f => f.id).sort());
  // A family the beginner grid deals today (the pool changes: the grids session's PMI clusters, decision 39) lists its setup.
  const dealt = presetOf("grids-beginner").families[0]!;
  assert.ok(g.beginner.find(e => e.id === dealt)!.presets.includes("Grids · beginner"), dealt);
  const p = familyPage("magic-eighteen", setupFromSearch(`?board=${grid4.id}`))!;
  assert.equal(p.rule.type, gridType);
  assert.equal(p.rule.variant.id, grid4.id);
  assert.match(p.main.sentence, /18/);
  assert.equal(familyPage("triangle-area", setupFromSearch(`?board=${grid4.id}`)), null, "a line family has no page on the grid board");
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
  assert.equal(p.setup.board, "line-q", "fraction lines are the default board (decision 2)");
  assert.equal(p.setup.params, 0);
  assert.equal(p.rule.tieBreaker, "legs");
});

test("the URL of a choice opens the same rule again", () => {
  const s = { board: "line-z", params: 3, tb: "even" };
  assert.equal(gallerySearch(s), "?board=line-z&params=3&tb=even");
  assert.deepEqual(setupFromSearch(gallerySearch(s)), s);
  assert.equal(gallerySearch({ board: "line-q", params: 0, tb: null }), "");
});
