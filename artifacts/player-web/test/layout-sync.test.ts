/**
 * The dock's sync decisions (src/dock/layout-sync.ts), pure: when a server layout is applied (between gestures,
 * never during a drag or over an unpushed local change), what is pushed and with which `ifUpdatedAt`, and that a
 * CONFLICT adopts the server's version. Plus the panel-1 phase rule, the layout comparison the dock uses to avoid
 * re-applying its own state, and the per-pane history behind the pane header's ‹ and ↺.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT, assistantSide, panelPanesOf, movePane, openPane, parseLayout, setPanePanel, setPaneParams, type DockLayout } from "@workspace/player-client/layout";
import {
  effectiveLayout, initialSync, pushPlan, sameLayout, syncReducer, type SyncState,
} from "../src/dock/layout-sync.ts";
import { back, canUndo, lastParams, observe, emptyHistory, resetView } from "../src/dock/history.ts";
import { dockAssistant, showPanel } from "../src/dock/operations.ts";

const base = DEFAULT_LAYOUT("running");
const withRace = openPane(base, { id: "", kind: "panel", panelId: "race", params: {}, setBy: "human" }).layout;
const sideBySide = movePane(base, "p2", { relativeTo: "p1", direction: "right" });
const run = (state: SyncState, ...events: Parameters<typeof syncReducer>[1][]) => events.reduce(syncReducer, state);
const loaded = (layout = base, updatedAt = 100) => run(initialSync(DEFAULT_LAYOUT("running")), { type: "server", layout, updatedAt });

test("a server layout is applied when nothing local is pending", () => {
  const s = loaded(withRace, 100);
  assert.deepEqual(s.local, withRace);
  assert.equal(s.base, 100);
  assert.equal(pushPlan(s), null, "nothing to push");
  const next = run(s, { type: "server", layout: sideBySide, updatedAt: 200 });
  assert.deepEqual(next.local, sideBySide);
  assert.equal(next.base, 200);
});

test("during a drag a server layout is queued, then applied when the drag ends without a change", () => {
  const s = run(loaded(), { type: "gesture-start" }, { type: "server", layout: withRace, updatedAt: 200 });
  assert.deepEqual(s.local, base, "not applied mid-drag");
  assert.ok(s.queued);
  const ended = run(s, { type: "gesture-end" });
  assert.deepEqual(ended.local, withRace);
  assert.equal(ended.base, 200);
  assert.ok(!ended.queued);
});

test("a local edit is pushed with the server version it was based on, not while dragging, and not twice", () => {
  const s = run(loaded(), { type: "gesture-start" }, { type: "edit", layout: sideBySide });
  assert.equal(pushPlan(s), null, "never mid-gesture");
  const ended = run(s, { type: "gesture-end" });
  assert.deepEqual(pushPlan(ended), { layout: sideBySide, ifUpdatedAt: 100 });
  const flying = run(ended, { type: "push-start" });
  assert.equal(pushPlan(flying), null, "one push in flight at a time");
  const ok = run(flying, { type: "push-ok", layout: sideBySide, updatedAt: 300 });
  assert.equal(ok.base, 300);
  assert.equal(pushPlan(ok), null);
  const echo = run(ok, { type: "server", layout: sideBySide, updatedAt: 300 });
  assert.deepEqual(echo.local, sideBySide, "our own write coming back changes nothing");
});

test("a server layout arriving over an unpushed edit waits; a CONFLICT then adopts the server's version", () => {
  const s = run(loaded(), { type: "edit", layout: sideBySide }, { type: "server", layout: withRace, updatedAt: 200 });
  assert.deepEqual(s.local, sideBySide, "the player's edit stays on screen until the push resolves");
  assert.deepEqual(pushPlan(s), { layout: sideBySide, ifUpdatedAt: 100 });
  const conflict = run(s, { type: "push-start" }, { type: "push-conflict" });
  assert.deepEqual(conflict.local, withRace, "the server's version wins");
  assert.equal(conflict.base, 200);
  assert.equal(pushPlan(conflict), null);
});

test("an edit made while a push is in flight is pushed after it, based on the new version", () => {
  const s = run(loaded(), { type: "edit", layout: sideBySide }, { type: "push-start" }, { type: "edit", layout: withRace });
  assert.equal(pushPlan(s), null);
  const ok = run(s, { type: "push-ok", layout: sideBySide, updatedAt: 300 });
  assert.deepEqual(ok.local, withRace, "the newer edit stays");
  assert.deepEqual(pushPlan(ok), { layout: withRace, ifUpdatedAt: 300 });
});

test("a failed push (rate limit, network) keeps the edit and retries", () => {
  const s = run(loaded(), { type: "edit", layout: sideBySide }, { type: "push-start" }, { type: "push-failed" });
  assert.deepEqual(s.local, sideBySide);
  assert.deepEqual(pushPlan(s), { layout: sideBySide, ifUpdatedAt: 100 });
});

test("before the server's layout has loaded nothing is pushed; an early edit is then based on the loaded version", () => {
  const early = run(initialSync(base), { type: "edit", layout: sideBySide });
  assert.equal(pushPlan(early), null, "the server may hold a layout we have not seen");
  const s = run(early, { type: "server", layout: withRace, updatedAt: 500 });
  assert.deepEqual(s.local, sideBySide);
  assert.deepEqual(pushPlan(s), { layout: sideBySide, ifUpdatedAt: 500 });
  const fresh = run(initialSync(base), { type: "server", layout: base, updatedAt: null }, { type: "edit", layout: sideBySide });
  assert.deepEqual(pushPlan(fresh), { layout: sideBySide, ifUpdatedAt: undefined }, "no row yet: nothing to compare with");
});

test("a read-only sync (safe mode) applies server layouts and never pushes", () => {
  const s = run(initialSync(base, { canWrite: false }), { type: "server", layout: base, updatedAt: 1 }, { type: "edit", layout: sideBySide });
  assert.deepEqual(s.local, sideBySide);
  assert.equal(pushPlan(s), null);
});

test("panel 1 follows the phase only while nobody chose its panel", () => {
  const ended = effectiveLayout(base, "ended");
  assert.equal(ended.panes.p1.kind === "panel" && ended.panes.p1.panelId, "results");
  assert.equal(effectiveLayout(base, "running"), base, "unchanged when it already shows the phase's panel");
  const chosen = setPanePanel(base, "p1", "race", "human");
  assert.equal(effectiveLayout(chosen, "ended"), chosen);
  const assisted = setPanePanel(base, "p1", "objects", "assistant");
  assert.equal(effectiveLayout(assisted, "ended"), assisted);
  const second = setPanePanel(openPane(chosen, { id: "", kind: "panel", panelId: "overview", params: {}, setBy: "default" }).layout, "p1", "race", "human");
  const p3 = effectiveLayout(second, "ended").panes.p3;
  assert.equal(p3.kind === "panel" && p3.panelId, "overview", "only the first built-in panel follows");
});

test("sameLayout ignores sub-pixel size drift but not structure, panels or a real resize", () => {
  const nudged: DockLayout = { ...base, root: { ...base.root, sizes: [50.4, 49.6] } as DockLayout["root"] };
  assert.ok(sameLayout(base, nudged));
  const resized: DockLayout = { ...base, root: { ...base.root, sizes: [60, 40] } as DockLayout["root"] };
  assert.ok(!sameLayout(base, resized));
  assert.ok(!sameLayout(base, sideBySide));
  assert.ok(!sameLayout(base, setPanePanel(base, "p1", "race", "human")));
  assert.ok(!sameLayout(base, setPaneParams(base, "p1", { focus: "goal" }, "assistant")));
});

test("history: an assistant change can be undone (‹) and reset (↺); a human change or a first view cannot", () => {
  const assisted = setPaneParams(setPanePanel(base, "p1", "objects", "assistant"), "p1", { filter: "contested" }, "assistant");
  let h = observe(emptyHistory, null, base);
  assert.ok(!canUndo(h, base.panes.p1));
  h = observe(h, base, assisted);
  assert.ok(canUndo(h, assisted.panes.p1));
  const undone = back(h, "p1");
  assert.ok(undone);
  assert.deepEqual(undone.view, { panelId: "overview", params: { focus: "auto" }, setBy: "default" });
  assert.ok(!canUndo(undone.history, assisted.panes.p1), "one step of history");
  const human = setPanePanel(base, "p1", "race", "human");
  assert.ok(!canUndo(observe(emptyHistory, base, human), human.panes.p1), "the player's own choices have no ‹");
  assert.deepEqual(resetView(assisted.panes.p1), { panelId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "human" });
});

test("history: the dropdown restores the parameters last used for a panel in that pane", () => {
  const assisted = setPaneParams(setPanePanel(base, "p1", "objects", "assistant"), "p1", { limit: 5 }, "assistant");
  let h = observe(observe(emptyHistory, null, base), base, assisted);
  const away = setPanePanel(assisted, "p1", "race", "human");
  h = observe(h, assisted, away);
  assert.deepEqual(lastParams(h, "p1", "objects"), { sortBy: "payoff", filter: "all", limit: 5, highlight: [], layout: "list" });
  assert.equal(lastParams(h, "p1", "feed"), undefined);
  assert.equal(lastParams(h, "p9", "objects"), undefined);
});

const ctx = { phase: "running" as const, storedSlugs: [] };
test("showing a panel reuses its open pane, adds one otherwise, and at four panels the focused pane shows it instead", () => {
  const again = showPanel(withRace, "race");
  assert.equal(again.layout.panes.p3?.kind === "panel" && again.layout.panes.p3.panelId, "race");
  assert.equal(Object.keys(again.layout.panes).length, 3, "no second race pane");
  let layout = base;
  for (const id of ["race", "feed", "objects"] as const) layout = parseLayout(showPanel(layout, id).layout, ctx).layout;
  assert.equal(panelPanesOf(layout).length, 4);
  const full = showPanel(layout, "public-chat", undefined, "p3");
  assert.ok(full.replaced);
  assert.equal(full.paneId, "p3");
  const parsed = parseLayout(full.layout, ctx).layout;
  assert.equal(panelPanesOf(parsed).length, 4, "nothing parseLayout would drop");
  assert.ok(panelPanesOf(parsed).some(p => p.panelId === "public-chat"));
  assert.throws(() => showPanel(base, "what-if"), /assistant/, "a what-if needs the assistant's parameters");
});

test("moving the assistant to a side stacks the panels beside it; to the bottom puts them side by side", () => {
  const twoInARow = parseLayout(withRace, ctx).layout;
  const right = parseLayout(dockAssistant(twoInARow, "right"), ctx).layout;
  assert.equal(assistantSide(right), "row");
  assert.deepEqual(right.root.type === "split" && [right.root.direction, right.root.children.map(c => c.type === "split" ? c.direction : c.panes.join())],
    ["row", ["column", "p2"]], "panels in a column, the assistant on the right");
  const bottom = parseLayout(dockAssistant(right, "bottom"), ctx).layout;
  assert.equal(assistantSide(bottom), "column");
  assert.deepEqual(bottom.root.type === "split" && [bottom.root.direction, bottom.root.children.map(c => c.type === "split" ? c.direction : c.panes.join())],
    ["column", ["row", "p2"]]);
  const left = parseLayout(dockAssistant(twoInARow, "left"), ctx).layout;
  assert.deepEqual(left.root.type === "split" && left.root.children[0], { type: "tabs", panes: ["p2"], active: "p2" });
});
