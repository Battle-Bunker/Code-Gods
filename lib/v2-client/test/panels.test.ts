import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_VIEW } from "@workspace/v2-affordances";
import { columns, defaultPanes, MAX_PANES, openPlan, readingOrder, shownPanes } from "../src/panels.ts";

test("an empty view follows the phase's defaults; an own arrangement is kept", () => {
  assert.deepEqual(shownPanes(EMPTY_VIEW, "planning"), defaultPanes("planning"));
  const own = { panes: [{ pane: "objects", place: "main" as const }] };
  assert.deepEqual(shownPanes(own, "live"), own.panes);
});

test("after the end the results are shown first even when not open", () => {
  const own = { panes: [{ pane: "objects", place: "main" as const }] };
  assert.equal(shownPanes(own, "ended")[0]!.pane, "results");
});

test("opening a pane on an empty view keeps the defaults first", () => {
  const plan = openPlan(EMPTY_VIEW, "planning", "public-chat");
  assert.deepEqual(plan.ops.map(o => o.args.pane), [...defaultPanes("planning").map(p => p.pane), "public-chat"]);
  assert.equal(plan.replaced, null);
});

test("opening beyond the maximum replaces the oldest and says which (ux 5.4)", () => {
  const full = { panes: defaultPanes("live") };
  assert.equal(full.panes.length, MAX_PANES);
  const plan = openPlan(full, "live", "public-chat");
  assert.equal(plan.replaced, "objects");
  assert.deepEqual(plan.ops.map(o => o.id), ["view.closePane", "view.openPane"]);
});

test("an open pane is not opened twice", () => {
  assert.deepEqual(openPlan({ panes: [{ pane: "feed", place: "right" }] }, "live", "feed").ops, []);
});

test("the middle is never empty, and a phone reads main first", () => {
  const c = columns([{ pane: "feed", place: "right" }, { pane: "agents", place: "bottom" }]);
  assert.deepEqual(c.main, ["feed"]);
  assert.deepEqual(readingOrder(defaultPanes("live")), ["objects", "my-card", "feed", "agents", "race"]);
});
