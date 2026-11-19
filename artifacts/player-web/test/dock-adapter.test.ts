/** The dock's arrangement to dockview's JSON and back (src/dock/adapter.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DOCKS, formatDock, parseDock } from "@workspace/v2-affordances";
import { fromDockview, toDockview } from "../src/dock/adapter.ts";

test("every default arrangement and a tabbed, nested one survive the trip through dockview at any size that fits them", () => {
  const texts = [...Object.values(DEFAULT_DOCKS), "row(column(objects 45, object 55) 60, column(feed|*race 50, my-card|agents|panel:mine 50) 40)", "column(objects 70, row(feed, race) 30)", "objects|*feed"];
  for (const text of texts) {
    // (Shorter, a pane below its least height is drawn taller: the next test.)
    for (const size of [{ width: 1440, height: 820 }, { width: 1280, height: 1000 }]) {
      const back = fromDockview(toDockview(parseDock(text), size));
      assert.equal(formatDock(back!), formatDock(parseDock(text)), `${text} at ${size.width}`);
    }
  }
});

test("a stored panel and the assistant keep their content mounted; panes are titled", () => {
  const json = toDockview(parseDock("row(objects, panel:mine|assistant)"), undefined, p => p.toUpperCase());
  assert.equal(json.panels["panel:mine"]!.renderer, "always");
  assert.equal(json.panels.assistant!.renderer, "always");
  assert.equal(json.panels.objects!.renderer, undefined);
  assert.equal(json.panels.objects!.title, "OBJECTS");
});

test("panes dockview no longer holds are left out; an empty dock reads back as nothing", () => {
  const json = toDockview(parseDock("row(objects, feed|race)"));
  delete json.panels.race;
  assert.equal(formatDock(fromDockview(json)!), "row(objects 50, feed 50)");
  delete json.panels.objects; delete json.panels.feed;
  assert.equal(fromDockview(json), null);
});

test("a short dock keeps the goal and the leaderboard usable: the bottom row gives way, down to its own least height", async () => {
  // Catches (the coordinator, 1280×720): the goal over the leaderboard got 168 px each above a full-width bottom row.
  const { columnHeights, minHeight, MIN_PANE_PX, MIN_BOTTOM_PX } = await import("../src/dock/adapter.ts");
  const { parseDock } = await import("@workspace/v2-affordances");
  const tree = parseDock("column(row(column(my-card 50, race 50) 33, objects 37, agents 30) 67, timeline 33)");
  if (!("children" in tree)) throw new Error("a split");
  assert.equal(minHeight(tree.children[0]!), 2 * MIN_PANE_PX, "the goal over the leaderboard");
  assert.equal(minHeight(tree.children[1]!), MIN_BOTTOM_PX);
  const [top, bottom] = columnHeights(tree.children, tree.sizes, 505);
  assert.ok(top! >= 2 * MIN_PANE_PX && bottom! >= MIN_BOTTOM_PX, `${top} over ${bottom}`);
  assert.ok(Math.abs(top! + bottom! - 505) < 1e-9, "the column is filled");
  // Tall enough already (1920×1080): the shares stand.
  assert.deepEqual(columnHeights(tree.children, tree.sizes, 900).map(Math.round), [603, 297]);
  // Too short for every least height: the shares stand too.
  assert.deepEqual(columnHeights(tree.children, tree.sizes, 400).map(Math.round), [268, 132]);
});
