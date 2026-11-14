import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_VIEW } from "@workspace/v2-affordances";
import { closePlan, columns, defaultPanes, MAX_PANES, openPlan, PANE_IDS, PANES, readingOrder, shownPanes } from "../src/panels.ts";

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

test("the others-care, points-over-time and rules panes are offered where they have something to show", () => {
  assert.deepEqual(PANES["others-care"].phases, ["live", "paused", "ended", "replay"]);
  assert.deepEqual(PANES["points-over-time"].phases, ["live", "paused", "ended", "replay"]);
  assert.deepEqual(PANES.rules.phases, ["planning", "live", "paused", "ended", "replay"]);
  for (const id of PANE_IDS) assert.doesNotMatch(`${PANES[id].title} ${PANES[id].blurb}`, /\b(bits|payoff|objects?|grids?)\b/i, id);
});

test("in a replay the replay's own entry is never drawn, the replay's defaults show, and the results do not lead", () => {
  // Catches: the replay pane (replay.open adds it) taking the whole screen, or the results pane covering the playhead.
  const opened = { panes: [{ pane: "replay", place: "main" as const }] };
  assert.deepEqual(shownPanes(opened, "replay"), defaultPanes("replay"));
  const panes = defaultPanes("replay").map(p => p.pane);
  assert.ok(panes.includes("objects") && panes.includes("feed") && panes.includes("race"), panes.join());
  const own = { panes: [{ pane: "replay", place: "main" as const }, { pane: "race", place: "main" as const }] };
  assert.deepEqual(shownPanes(own, "replay"), [{ pane: "race", place: "main" }]);
  for (const id of ["forge", "agents", "overview", "results"] as const) assert.ok(!PANES[id].phases.includes("replay"), `${id} has nothing to show in a replay`);
  assert.ok(!shownPanes({ panes: [{ pane: "results", place: "main" }] }, "replay").some(p => p.pane === "results"));
});

test("arranging panes in a replay keeps the replay open", () => {
  // Catches: keepShown closing the replay's entry (view.closePane "replay" ends the replay) when a pane is opened.
  const opened = { panes: [{ pane: "replay", place: "main" as const }] };
  for (const ops of [openPlan(opened, "replay", "public-chat").ops, closePlan(opened, "replay", "race")]) {
    assert.ok(!ops.some(o => o.args.pane === "replay"), JSON.stringify(ops));
  }
  const arranged = { panes: [{ pane: "replay", place: "main" as const }, ...defaultPanes("replay")] };
  assert.deepEqual(openPlan(arranged, "replay", "feed").ops, [], "an arrangement equal to what is shown needs no ops");
});

test("opening one line from a full screen keeps the list it was opened from", () => {
  const plan = openPlan({ panes: defaultPanes("live") }, "live", "object");
  assert.equal(plan.replaced, "my-card");
});
