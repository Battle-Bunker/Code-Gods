/** The dock's arrangement to dockview's JSON and back (src/dock/adapter.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DOCKS, formatDock, parseDock } from "@workspace/v2-affordances";
import { fromDockview, toDockview } from "../src/dock/adapter.ts";

test("every default arrangement and a tabbed, nested one survive the trip through dockview at any size", () => {
  const texts = [...Object.values(DEFAULT_DOCKS), "row(column(objects 45, object 55) 60, column(feed|*race 50, my-card|agents|panel:mine 50) 40)", "column(objects 70, row(feed, race) 30)", "objects|*feed"];
  for (const text of texts) {
    for (const size of [{ width: 1440, height: 820 }, { width: 1280, height: 600 }]) {
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
