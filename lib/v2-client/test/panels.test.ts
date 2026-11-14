import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_VIEW } from "@workspace/v2-affordances";
import { closePlan, columns, defaultPanes, MAX_PANES, openPlan, readingOrder, shownPanes } from "../src/panels.ts";

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
  assert.ok(plan.ops.every(o => o.id === "view.openPane"));
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

test("an arrangement made in planning meets the world's defaults when the world starts", () => {
  const planning = { panes: [{ pane: "forge", place: "main" as const }, { pane: "my-card", place: "left" as const }] };
  const live = shownPanes(planning, "live").map(p => p.pane);
  assert.ok(live.includes("objects") && live.includes("feed"), "the lines and the act log appear");
  assert.ok(live.includes("forge"), "the player's own pane stays");
  assert.ok(live.length <= MAX_PANES);
  assert.ok(!shownPanes(planning, "ended").some(p => p.pane === "forge"), "no forge after the end");
});

test("closing a default pane keeps the other defaults", () => {
  const ops = closePlan({ panes: [] }, "live", "race");
  assert.deepEqual(ops.at(-1), { id: "view.closePane", args: { pane: "race" } });
  assert.equal(ops.filter(o => o.id === "view.openPane").length, defaultPanes("live").length);
});

test("moving an open pane is one move", () => {
  const view = { panes: defaultPanes("live") };
  assert.deepEqual(openPlan(view, "live", "feed", "left").ops, [{ id: "view.movePane", args: { pane: "feed", place: "left" } }]);
});

test("opening one line from a full screen keeps the list it was opened from", () => {
  const plan = openPlan({ panes: defaultPanes("live") }, "live", "object");
  assert.equal(plan.replaced, "my-card");
});
