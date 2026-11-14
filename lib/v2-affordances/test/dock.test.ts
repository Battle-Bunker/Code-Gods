/** The dock's arrangement in the view state: its text form and `view.arrangeDock` (dock.ts, layout.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_VIEW, PRINCIPALS, applyView, defaultDock, dockPanes, formatDock, parseDock, type AffordanceContext, type ViewState } from "../src/index.ts";

const live: AffordanceContext = { context: "live", principal: PRINCIPALS.seated! };
const TEXT = "row(column(my-card 50, agents 50) 28, column(objects 45, object 55) 42, column(feed|*public-chat 55, race 45) 30)";

test("the text form reads into a tree and back to the same text", () => {
  const tree = parseDock(TEXT);
  assert.equal(formatDock(tree), TEXT);
  assert.deepEqual(dockPanes(tree), ["my-card", "agents", "objects", "object", "feed", "public-chat", "race"]);
  assert.deepEqual(parseDock(formatDock(tree)), tree);
});

test("the text form is forgiving where it can be and says what is wrong where it cannot", () => {
  // Missing weights are equal shares; weights become shares of 100; a one-child split is its child; a nested split of
  // the same direction merges; a repeated pane keeps its first place; an active tab defaults to the first.
  assert.equal(formatDock(parseDock("row(a, b)")), "row(a 50, b 50)");
  assert.equal(formatDock(parseDock("row(a 1, b 3)")), "row(a 25, b 75)");
  assert.equal(formatDock(parseDock("column(row(a, b))")), "row(a 50, b 50)");
  assert.equal(formatDock(parseDock("row(a 50, row(b, c) 50)")), "row(a 50, b 25, c 25)");
  assert.equal(formatDock(parseDock("row(a|b, b|c)")), "row(a|b 50, c 50)");
  assert.equal(formatDock(parseDock("panel:my-stats|*rules")), "panel:my-stats|*rules");
  for (const bad of ["row(a, b", "row()", "a b", "", "row(a,, b)", `row(${Array.from({ length: 30 }, (_, k) => `p${k}`).join(",")})`]) {
    assert.throws(() => parseDock(bad), (e: Error) => e.name === "Error" && /at character|More than|No panes/.test(e.message), bad);
  }
});

test("view.arrangeDock keeps one arrangement per game screen; empty text restores the default", () => {
  const ok = (r: ReturnType<typeof applyView>) => { assert.ok(r.outcome.ok, JSON.stringify(r.outcome)); return r.view; };
  let v = ok(applyView(EMPTY_VIEW, "view.arrangeDock", { dock: "row(objects 60, feed 40)" }, live));
  assert.equal(formatDock(v.dock.live!), "row(objects 60, feed 40)");
  v = ok(applyView(v, "view.arrangeDock", { dock: "row(my-card, forge)", phase: "planning" }, live));
  assert.deepEqual(Object.keys(v.dock).sort(), ["live", "planning"]);
  const paused = ok(applyView(v, "view.arrangeDock", { dock: "objects" }, { ...live, context: "paused" }));
  assert.equal(formatDock(paused.dock.live!), "objects", "a paused game arranges the live screen");
  v = ok(applyView(v, "view.arrangeDock", { dock: "" }, live));
  assert.deepEqual(Object.keys(v.dock), ["planning"]);
  const bad = applyView(v, "view.arrangeDock", { dock: "row(a" }, live);
  assert.equal(bad.outcome.ok, false);
  assert.match((bad.outcome as { ok: false; error: { message: string } }).error.message, /Expected/);
  assert.equal(applyView(v, "view.arrangeDock", { dock: "a" }, { ...live, context: "room" }).outcome.ok, false, "the room page has no dock");
});

test("moving or closing a pane takes it out of every arrangement; reopening an open pane brings its tab forward", () => {
  // Catches: a pane moved with the menu (or by an assistant) staying where the arrangement put it.
  const base: ViewState = { ...EMPTY_VIEW, panes: [{ pane: "feed", place: "right" }, { pane: "race", place: "right" }], dock: { live: parseDock("row(objects 60, feed|race 40)"), ended: parseDock("row(results, race)") } };
  const moved = applyView(base, "view.movePane", { pane: "race", place: "left" }, live).view;
  assert.equal(formatDock(moved.dock.live!), "row(objects|*race 60, feed 40)", "placed at the left on the screen in view");
  assert.equal(formatDock(moved.dock.ended!), "results", "and out of the other screens' arrangements, to join at its place there");
  const closed = applyView(base, "view.closePane", { pane: "feed" }, live).view;
  assert.equal(formatDock(closed.dock.live!), "row(objects 60, race 40)");
  const front = applyView(base, "view.openPane", { pane: "race" }, live).view;
  assert.equal(formatDock(front.dock.live!), "row(objects 60, feed|*race 40)");
  assert.equal(formatDock(applyView(base, "view.openPane", { pane: "race", place: "main" }, live).view.dock.live!), "row(objects|*race 60, feed 40)");
});

test("opening a pane shows it on the screen in view and takes nothing away; one line opens below the lines", () => {
  // Catches: opening a pane evicting another (round 1: One line evicted What just changed).
  let v = applyView(EMPTY_VIEW, "view.openPane", { pane: "public-chat", place: "right" }, live).view;
  const tree = v.dock.live!;
  assert.deepEqual(dockPanes(tree).filter(p => p !== "public-chat"), dockPanes(defaultDock("live")), "every default pane stays");
  assert.equal(formatDock(tree), "row(column(my-card 45, agents 55) 30, objects 40, column(feed 50, race|*public-chat 50) 30)");
  v = applyView(v, "view.openObject", { objectId: "o1" }, live).view;
  assert.equal(formatDock(v.dock.live!), "row(column(my-card 45, agents 55) 30, column(objects 45, object 55) 40, column(feed 50, race|*public-chat 50) 30)");
  const room = applyView(EMPTY_VIEW, "view.openPane", { pane: "rules" }, { ...live, context: "room" }).view;
  assert.deepEqual(room.dock, {}, "the room page has no dock: the pane joins when a game shows it");
});

test("a view stored before the dock existed still reduces, and a no-op stays a no-op", () => {
  const { dock: _, ...old } = { ...EMPTY_VIEW, version: 2, panes: [{ pane: "feed", place: "right" as const }] };
  const same = applyView(old as ViewState, "view.openPane", { pane: "feed" }, live);
  assert.deepEqual([same.outcome.ok, same.changed], [true, false]);
  const r = applyView(old as ViewState, "view.closePane", { pane: "feed" }, live);
  assert.deepEqual(r.view.dock, {});
});

test("a pane opened for the human never covers the assistant's conversation while another group can take it", () => {
  const v: ViewState = { ...EMPTY_VIEW, panes: [{ pane: "assistant", place: "right" }], dock: { planning: parseDock("row(overview 26, my-card 34, forge|*assistant 40)") } };
  const r = applyView(v, "view.openPane", { pane: "rules" }, { ...live, context: "planning" });
  assert.equal(formatDock(r.view.dock.planning!), "row(overview 26, my-card|*rules 34, forge|*assistant 40)");
});
