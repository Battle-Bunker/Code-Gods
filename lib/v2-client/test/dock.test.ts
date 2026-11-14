/** The desktop dock a phase shows (panels.ts dockFor): defaults, panes joining, arrangements kept, stale ids dropped. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_VIEW, PRINCIPALS, applyView, dockGroups, dockPanes, formatDock, parseDock, type AffordanceContext, type ViewState } from "@workspace/v2-affordances";
import { defaultPanes, dockFor, openPlan, type GamePhase } from "../src/panels.ts";

const ctx = (context: AffordanceContext["context"]): AffordanceContext => ({ context, principal: PRINCIPALS.seated! });
/** The panes in front (one per group: what is on screen). */
const visible = (view: Pick<ViewState, "panes" | "dock">, phase: GamePhase) => dockGroups(dockFor(view, phase)!).map(l => l.group.active);
const run = (v: ViewState, ops: { id: string; args: Record<string, unknown> }[], context: AffordanceContext["context"]) => {
  for (const op of ops) { const r = applyView(v, op.id, op.args, ctx(context)); assert.ok(r.outcome.ok, JSON.stringify(r.outcome)); v = r.view; }
  return v;
};

test("each phase's default shows its panes side by side, none behind a tab", () => {
  for (const phase of ["planning", "live", "ended", "replay"] as const) {
    const panes = defaultPanes(phase).map(p => p.pane);
    assert.deepEqual(visible(EMPTY_VIEW, phase).sort(), [...panes].sort(), phase);
  }
  assert.deepEqual(visible(EMPTY_VIEW, "live").sort(), ["agents", "feed", "my-card", "objects", "race"]);
  // Usable sizes: at 1280 px every column is at least a quarter of the width, every pane at least half the height.
  for (const phase of ["planning", "live", "ended", "replay"] as const) {
    for (const l of dockGroups(dockFor(EMPTY_VIEW, phase)!)) assert.ok(l.rect.w >= 0.25 && l.rect.h >= 0.5, `${phase} ${l.group.active}`);
  }
});

test("opening One line keeps What just changed and the lines in view; opening more adds tabs, never evicts", () => {
  let v = run(EMPTY_VIEW, openPlan(EMPTY_VIEW, "live", "object"), "live");
  assert.deepEqual(visible(v, "live").sort(), ["agents", "feed", "my-card", "object", "objects", "race"]);
  for (const pane of ["public-chat", "rules", "assistant", "others-care"]) v = run(v, openPlan(v, "live", pane), "live");
  const tree = dockFor(v, "live")!;
  for (const pane of ["objects", "object", "my-card", "feed", "agents", "race", "public-chat", "rules", "assistant", "others-care"]) assert.ok(dockPanes(tree).includes(pane), pane);
  assert.ok(visible(v, "live").includes("feed") || visible(v, "live").includes("object"), formatDock(tree));
  assert.ok(visible(v, "live").includes("others-care"), "the pane just opened is in front");
  assert.equal(dockGroups(tree).length, 6, "tabs, not more and more groups");
});

test("an arrangement round-trips through the view state and survives the next game; other screens keep theirs", () => {
  const text = "row(column(objects 60, object 40) 60, column(feed|*race 50, my-card|agents 50) 40)";
  let v = run(EMPTY_VIEW, [{ id: "view.arrangeDock", args: { dock: text } }], "live");
  assert.equal(formatDock(dockFor(v, "live")!), text.replace(", object 40", "").replace("column(objects 60) 60", "objects 60"), "the one line is not open, so it is left out");
  v = run(v, [{ id: "view.openObject", args: { objectId: "o1" } }], "live");
  assert.equal(formatDock(dockFor(v, "live")!), text, "the one line opens where the human put it");
  // The next game: planning has its own default (no squeezed rows carried in), and the live screen comes back.
  assert.equal(formatDock(dockFor(v, "planning")!), formatDock(dockFor(EMPTY_VIEW, "planning")!));
  assert.equal(formatDock(dockFor(v, "paused")!), formatDock(dockFor(v, "live")!));
});

test("stale or unknown pane ids in an arrangement are dropped; panes it lacks join at their place behind the tab there", () => {
  const view: ViewState = { ...EMPTY_VIEW, dock: { live: parseDock("row(gone-pane|objects 50, column(feed 50, panel:old 50) 50)") } };
  const tree = dockFor(view, "live")!;
  assert.ok(!dockPanes(tree).includes("gone-pane") && !dockPanes(tree).includes("panel:old"));
  assert.deepEqual(visible(view, "live"), ["objects", "feed"], "my-card, agents and race join as tabs, the arranged panes stay in front");
  assert.deepEqual(dockPanes(tree).sort(), ["agents", "feed", "my-card", "objects", "race"]);
});

test("panes carried over from planning never cover the live screen's panes", () => {
  // Catches: "Summon my first agent" in planning stores the planning panes; at the start of the game they covered the lines.
  const planning = run(EMPTY_VIEW, openPlan(EMPTY_VIEW, "planning", "forge"), "planning");
  assert.ok(planning.panes.length >= 3);
  assert.deepEqual(visible(planning, "live").sort(), ["agents", "feed", "my-card", "objects", "race"]);
});

test("opening a pane already shown behind a tab brings it to the front", () => {
  const view: ViewState = { ...EMPTY_VIEW, dock: { live: parseDock("row(objects|race 50, column(my-card, agents, feed) 50)") } };
  assert.ok(!visible(view, "live").includes("race"));
  assert.ok(visible(run(view, openPlan(view, "live", "race"), "live"), "live").includes("race"));
  // A pane carried over from planning (a tab nobody arranged) comes to the front too.
  const planning = run(EMPTY_VIEW, openPlan(EMPTY_VIEW, "planning", "forge"), "planning");
  assert.ok(visible(run(planning, openPlan(planning, "live", "forge"), "live"), "live").includes("forge"));
});
