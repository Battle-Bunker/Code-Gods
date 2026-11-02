/**
 * The dock adapter (src/dock/adapter.ts): our library-independent DockLayout ⇄ dockview's serialised JSON. A layout
 * must survive the round trip exactly (the dock re-applies the store's layout whenever the two differ, so a lossy
 * adapter would fight every drag), floating and pop-out groups fold back into the tree, and dockview JSON that names
 * no pane of ours is dropped rather than invented.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT, PRESET_LAYOUTS, openPane, panelPanesOf, parseLayout, type DockLayout } from "@workspace/player-client/layout";
import { SINGLE_LAYOUT } from "./single-layout.ts";
import { fromDockview, toDockview } from "../src/dock/adapter.ts";

const ctx = { phase: "running" as const, storedSlugs: ["race-plus"] };
/** Two panels and a stored panel stacked on the left, the assistant on the right. */
function fixture(): DockLayout {
  let layout = PRESET_LAYOUTS["two-panels"](SINGLE_LAYOUT);
  layout = openPane(layout, { id: "", kind: "stored-panel", slug: "race-plus" }, { relativeTo: "p1", direction: "below" }).layout;
  return parseLayout(layout, ctx).layout;
}
const panelOf = (id: string, panelId = "race") => ({ id, kind: "panel" as const, panelId: panelId as never, params: {}, setBy: "human" as const });

test("DEFAULT_LAYOUT round-trips exactly", () => {
  const layout = DEFAULT_LAYOUT("lobby");
  assert.deepEqual(fromDockview(toDockview(layout)), layout);
});

test("a three-pane layout with a stored panel round-trips exactly, at any container size", () => {
  const layout = fixture();
  assert.deepEqual(fromDockview(toDockview(layout)), layout);
  assert.deepEqual(fromDockview(toDockview(layout, { width: 1337, height: 641 })), layout);
});

test("the dockview JSON: orientation from the root split, pixel sizes from the weights, one single-view group per pane", () => {
  const layout: DockLayout = { version: 1, root: { type: "split", direction: "row", sizes: [62, 38], children: [
    { type: "split", direction: "column", sizes: [50, 50], children: [{ type: "pane", id: "p1" }, { type: "pane", id: "p3" }] }, { type: "pane", id: "p2" }] },
    panes: { p1: panelOf("p1"), p3: { id: "p3", kind: "stored-panel", slug: "race-plus" }, p2: { id: "p2", kind: "assistant" } } };
  const json = toDockview(layout, { width: 1000, height: 800 });
  assert.equal(json.grid.orientation, "HORIZONTAL", "the root row");
  assert.equal(json.grid.width, 1000);
  const root = json.grid.root;
  assert.equal(root.type, "branch");
  const [left, right] = root.data as { type: string; size: number; data: unknown }[];
  assert.equal(left.type, "branch", "the panel column");
  assert.equal(left.size, 620);
  assert.equal(right.type, "leaf", "the assistant's group");
  assert.equal(right.size, 380);
  const [top, bottom] = left.data as { type: string; size: number; data: { views: string[]; activeView?: string } }[];
  assert.equal(top.size, 400);
  assert.deepEqual(top.data.views, ["p1"], "one view per group: panes have no tabs");
  assert.deepEqual(bottom.data.views, ["p3"]);
  assert.deepEqual(Object.keys(json.panels).sort(), ["p1", "p2", "p3"]);
  const assistant = Object.values(json.panels).find(p => p.contentComponent === "assistant")!;
  assert.equal(assistant.renderer, "always", "the chat keeps its draft and stream while hidden");
  assert.equal(json.panels.p3.contentComponent, "stored-panel");
  assert.equal(json.panels.p3.renderer, "always", "a panel's frame never moves in the DOM: a moved iframe reloads, which reads as a navigation");
  assert.equal(json.panels.p1.renderer, undefined, "panels render only while visible");
  assert.equal(json.panels.p1.tabComponent, "panel");
});

test("a root that is a single pane becomes a one-leaf branch, and comes back as the pane", () => {
  const layout: DockLayout = { version: 1, root: { type: "pane", id: "a" }, panes: { a: panelOf("a") } };
  const json = toDockview(layout);
  assert.equal(json.grid.root.type, "branch");
  assert.equal((json.grid.root.data as unknown[]).length, 1);
  assert.deepEqual(fromDockview(json), layout);
});

test("a drop on a pane's centre replaces its panel: dockview puts both in one group, the dropped (active) one stays", () => {
  const layout: DockLayout = { version: 1, root: { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: "a" }, { type: "pane", id: "b" }] },
    panes: { a: panelOf("a", "race"), b: panelOf("b", "feed") } };
  const json = toDockview(layout);
  // Dragging b onto a's centre: b joins a's group and becomes its active view; b's old group is emptied.
  const [first, second] = (json.grid.root.data as { data: { views: string[]; activeView?: string } }[]);
  first.data.views = ["a", "b"]; first.data.activeView = "b";
  second.data.views = [];
  const back = fromDockview(json);
  assert.deepEqual(back.root, { type: "pane", id: "b" });
  assert.deepEqual(Object.keys(back.panes), ["b"], "the replaced panel is removed (reopen it from the panel menu)");
  assert.deepEqual(panelPanesOf(parseLayout(back, ctx).layout).map(p => p.id), ["b"], "the dropped panel survives parsing");
});

test("a drop that leaves two views in a group never yields a tab: the active view wins, and a stale active view falls back to the first", () => {
  const layout: DockLayout = { version: 1, root: { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: "a" }, { type: "pane", id: "b" }] },
    panes: { a: panelOf("a", "race"), b: panelOf("b", "feed") } };
  const json = toDockview(layout);
  const first = (json.grid.root.data as { data: { views: string[]; activeView?: string } }[])[0];
  first.data.views = ["a", "b"]; first.data.activeView = "gone";
  const back = fromDockview(json);
  assert.equal(JSON.stringify(back.root).includes("tabs"), false);
  assert.deepEqual(back.root.type === "split" && back.root.children[0], { type: "pane", id: "a" });
});

test("a split whose direction repeats its parent's is nested under a one-child branch (dockview alternates)", () => {
  const layout: DockLayout = { version: 1, panes: {
    a: { id: "a", kind: "panel", panelId: "race", params: {}, setBy: "human" }, b: { id: "b", kind: "assistant" }, c: { id: "c", kind: "panel", panelId: "feed", params: {}, setBy: "human" },
  }, root: { type: "split", direction: "row", sizes: [50, 50], children: [
    { type: "pane", id: "a" },
    { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: "b" }, { type: "pane", id: "c" }] },
  ] } };
  const back = fromDockview(toDockview(layout));
  assert.deepEqual(back.panes, layout.panes);
  assert.deepEqual(back.root, { type: "split", direction: "row", sizes: [50, 50], children: [
    { type: "pane", id: "a" },
    { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: "b" }, { type: "pane", id: "c" }] },
  ] }, "the shape survives, so parseLayout can flatten it");
});

test("floating and pop-out groups fold back into the tree as panes on the right", () => {
  const layout = SINGLE_LAYOUT;
  const json = toDockview(layout);
  json.panels.f1 = { id: "f1", contentComponent: "panel", params: { pane: { id: "f1", kind: "panel", panelId: "race", params: {}, setBy: "human" } } };
  json.panels.w1 = { id: "w1", contentComponent: "panel", params: { pane: { id: "w1", kind: "panel", panelId: "feed", params: {}, setBy: "human" } } };
  json.floatingGroups = [{ data: { id: "g-f", views: ["f1"], activeView: "f1" }, position: { top: 0, left: 0, width: 100, height: 100 } }];
  json.popoutGroups = [{ data: { id: "g-w", views: ["w1"], activeView: "w1" }, position: null }];
  const back = fromDockview(json);
  assert.deepEqual(Object.keys(back.panes).sort(), ["f1", "p1", "p2", "w1"]);
  assert.equal(back.root.type, "split");
  if (back.root.type !== "split") return;
  assert.equal(back.root.direction, "row");
  assert.deepEqual(back.root.children.slice(1), [{ type: "pane", id: "f1" }, { type: "pane", id: "w1" }]);
  assert.equal(Math.round(back.root.sizes.reduce((a, b) => a + b, 0)), 100);
  assert.equal(parseLayout(back, ctx).warnings.length, 0, "the folded layout is valid as it stands");
});

test("panels without one of our panes are dropped, and a pane's id always follows the panel's", () => {
  const json = toDockview(SINGLE_LAYOUT);
  json.panels.p1 = { id: "p1", contentComponent: "panel", params: { pane: { id: "other", kind: "panel", panelId: "race", params: {}, setBy: "human" } } };
  json.panels.p2 = { id: "p2", contentComponent: "assistant" };
  const back = fromDockview(json);
  assert.deepEqual(back.panes, { p1: { id: "p1", kind: "panel", panelId: "race", params: {}, setBy: "human" } });
  assert.deepEqual(back.root, { type: "pane", id: "p1" }, "the emptied group is gone");
});
