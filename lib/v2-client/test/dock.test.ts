/** The desktop dock a phase shows (panels.ts dockFor): defaults, panes joining, arrangements kept, stale ids dropped. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_VIEW, PRINCIPALS, applyView, dockGroups, dockPanes, formatDock, parseDock, type AffordanceContext, type ViewState } from "@workspace/v2-affordances";
import { closePlan, defaultPanes, dockFor, openPlan, type GamePhase } from "../src/panels.ts";

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
  // Usable sizes: at 1280 px every column is at least a quarter of the width, every pane at least 40 % of the height.
  for (const phase of ["planning", "live", "ended", "replay"] as const) {
    for (const l of dockGroups(dockFor(EMPTY_VIEW, phase)!)) assert.ok(l.rect.w >= 0.25 && l.rect.h >= 0.4, `${phase} ${l.group.active}`);
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
  // The next game: planning has its own default (no squeezed rows carried in; the one line, open, below the lines since
  // the board shows in planning), and the live screen comes back.
  assert.equal(formatDock(dockFor(v, "planning")!), "row(column(overview 45, my-card 55) 33, column(objects 45, object 55) 37, forge 30)");
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

test("a whole game of changes leaves the next planning screen as it was, the agent code in front", () => {
  // Catches: round 1's "the row layout carries into the next game's planning (code box squeezed)".
  let v = run(EMPTY_VIEW, openPlan(EMPTY_VIEW, "planning", "forge"), "planning");
  v = run(v, [{ id: "view.arrangeDock", args: { dock: "row(overview 20, my-card 30, forge 50)" } }], "planning");
  v = run(v, openPlan(v, "live", "public-chat"), "live");
  v = run(v, openPlan(v, "ended", "points-over-time"), "ended");
  // Panes opened during the game that planning can show join behind the tabs in front.
  assert.equal(formatDock(dockFor(v, "planning")!), "row(overview 20, my-card 30, forge|objects|agents|public-chat 50)");
});

test("after the end the results keep their full height: panes carried from the live screen join behind tabs", () => {
  const v = run(EMPTY_VIEW, openPlan(EMPTY_VIEW, "live", "object"), "live");
  const ended = dockFor(v, "ended")!;
  assert.deepEqual(visible(v, "ended").sort(), ["my-card", "race", "results"]);
  assert.equal(dockGroups(ended).length, 3, formatDock(ended));
});

test("a default closed in the next game's planning stays closed, and keeps its place on the live screen", () => {
  // Catches: the planning defaults rejoining for good once a live game stored its panes (review), and a close in one
  // screen erasing the pane's place in another.
  let v = run(EMPTY_VIEW, [{ id: "view.arrangeDock", args: { dock: "row(objects 50, feed|race 50)" } }], "live");
  v = run(v, openPlan(v, "live", "public-chat"), "live");
  v = run(v, closePlan(v, "planning", "overview"), "planning");
  assert.ok(!dockPanes(dockFor(v, "planning")).includes("overview"), formatDock(dockFor(v, "planning")!));
  assert.deepEqual(dockPanes(dockFor(v, "planning")).sort(), ["agents", "forge", "my-card", "objects", "public-chat"], "panes opened in the live game that planning can show stay");
  const live = formatDock(dockFor(v, "live")!);
  assert.ok(live.startsWith("row(objects") && /, feed\|race\|/.test(live) && visible(v, "live").includes("objects"), live);
});

test("opening a pane does not bring the screen's other panes in front of the tabs the human chose", () => {
  const v = run(EMPTY_VIEW, [{ id: "view.arrangeDock", args: { dock: "row(column(my-card, agents) 30, objects 40, column(race|*feed, public-chat) 30)" } }], "live");
  const after = run(v, openPlan(v, "live", "rules"), "live");
  assert.ok(visible(after, "live").includes("feed") && visible(after, "live").includes("rules"), formatDock(dockFor(after, "live")!));
});

test("a spectator's default is v1's: the leaderboard, the lines and public chat, side by side and usable (page-game-spectator)", async () => {
  const { viewerView, spectatorArrange } = await import("../src/panels.ts");
  for (const [phase, want] of [["live", ["objects", "public-chat", "race"]], ["paused", ["objects", "public-chat", "race"]], ["planning", ["objects", "public-chat", "rules"]], ["ended", ["public-chat", "race", "results"]]] as const) {
    const v = viewerView(EMPTY_VIEW, phase, false);
    assert.deepEqual(visible(v, phase).sort(), [...want], phase);
    for (const l of dockGroups(dockFor(v, phase)!)) assert.ok(l.rect.w >= 0.25 && l.rect.h >= 0.4, `${phase} ${l.group.active}`);
  }
  assert.equal(viewerView(EMPTY_VIEW, "live", true), EMPTY_VIEW, "a seated player keeps the player's defaults");
  const own = { ...EMPTY_VIEW, panes: [{ pane: "rules", place: "main" as const }] };
  assert.equal(viewerView(own, "live", false), own, "a spectator's own arrangement is kept");
  // Opening a pane keeps what the spectator sees (the ops are planned from the same view).
  const shown = viewerView(EMPTY_VIEW, "live", false);
  const opened = run(EMPTY_VIEW, [...spectatorArrange(EMPTY_VIEW, "live", false), ...openPlan(shown, "live", "rules")], "live");
  assert.equal(formatDock(dockFor(opened, "live")!), "row(race 28, objects|*rules 44, public-chat 28)", "the spectator's screen kept; the pane opened in front at its home");
  assert.deepEqual(spectatorArrange(opened, "live", false), [], "stored once");
});
