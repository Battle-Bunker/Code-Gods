/**
 * The dock adapter (src/dock/adapter.ts): our library-independent DockLayout ⇄ dockview's serialised JSON. A layout
 * must survive the round trip exactly (the dock re-applies the store's layout whenever the two differ, so a lossy
 * adapter would fight every drag), floating and pop-out groups fold back into the tree, and dockview JSON that names
 * no pane of ours is dropped rather than invented.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT, PRESET_LAYOUTS, openPane, parseLayout, type DockLayout } from "@workspace/player-client/layout";
import { fromDockview, toDockview } from "../src/dock/adapter.ts";

const ctx = { phase: "running" as const, storedSlugs: ["race-plus"] };
/** Two panels stacked on the left (the top one tabbed with a stored panel), the assistant on the right. */
function fixture(): DockLayout {
  let layout = PRESET_LAYOUTS["two-panels"](DEFAULT_LAYOUT("running"));
  layout = openPane(layout, { id: "", kind: "stored-panel", slug: "race-plus" }, { relativeTo: "p1", direction: "tab" }).layout;
  return parseLayout(layout, ctx).layout;
}

test("DEFAULT_LAYOUT round-trips exactly", () => {
  const layout = DEFAULT_LAYOUT("lobby");
  assert.deepEqual(fromDockview(toDockview(layout)), layout);
});

test("a three-pane layout with tabs and a stored panel round-trips exactly, at any container size", () => {
  const layout = fixture();
  assert.deepEqual(fromDockview(toDockview(layout)), layout);
  assert.deepEqual(fromDockview(toDockview(layout, { width: 1337, height: 641 })), layout);
});

test("the dockview JSON: orientation from the root split, pixel sizes from the weights, one group per tab node", () => {
  const layout = fixture();
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
  assert.deepEqual(top.data.views, ["p1", "p4"], "the stored panel is a tab of the first panel");
  assert.equal(top.data.activeView, "p4");
  assert.deepEqual(bottom.data.views, ["p3"], "the second panel");
  assert.deepEqual(Object.keys(json.panels).sort(), ["p1", "p2", "p3", "p4"]);
  const assistant = Object.values(json.panels).find(p => p.contentComponent === "assistant")!;
  assert.equal(assistant.renderer, "always", "the chat keeps its draft and stream while hidden");
  assert.equal(json.panels.p4.contentComponent, "stored-panel");
  assert.equal(json.panels.p4.renderer, "always", "a panel's frame never moves in the DOM: a moved iframe reloads, which reads as a navigation");
  assert.equal(json.panels.p1.renderer, undefined, "panels render only while visible");
  assert.equal(json.panels.p1.tabComponent, "panel");
});

test("a root that is a single tab group becomes a one-leaf branch, and comes back as the tab group", () => {
  const layout: DockLayout = { version: 1, root: { type: "tabs", panes: ["a", "b"], active: "b" },
    panes: { a: { id: "a", kind: "panel", panelId: "race", params: {}, setBy: "human" }, b: { id: "b", kind: "assistant" } } };
  const json = toDockview(layout);
  assert.equal(json.grid.root.type, "branch");
  assert.equal((json.grid.root.data as unknown[]).length, 1);
  assert.deepEqual(fromDockview(json), layout);
});

test("a split whose direction repeats its parent's is nested under a one-child branch (dockview alternates)", () => {
  const layout: DockLayout = { version: 1, panes: {
    a: { id: "a", kind: "panel", panelId: "race", params: {}, setBy: "human" }, b: { id: "b", kind: "assistant" }, c: { id: "c", kind: "panel", panelId: "feed", params: {}, setBy: "human" },
  }, root: { type: "split", direction: "row", sizes: [50, 50], children: [
    { type: "tabs", panes: ["a"], active: "a" },
    { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "tabs", panes: ["b"], active: "b" }, { type: "tabs", panes: ["c"], active: "c" }] },
  ] } };
  const back = fromDockview(toDockview(layout));
  assert.deepEqual(back.panes, layout.panes);
  assert.deepEqual(back.root, { type: "split", direction: "row", sizes: [50, 50], children: [
    { type: "tabs", panes: ["a"], active: "a" },
    { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "tabs", panes: ["b"], active: "b" }, { type: "tabs", panes: ["c"], active: "c" }] },
  ] }, "the shape survives, so parseLayout can flatten it");
});

test("floating and pop-out groups fold back into the tree as tab groups on the right", () => {
  const layout = DEFAULT_LAYOUT("running");
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
  assert.deepEqual(back.root.children.slice(1), [{ type: "tabs", panes: ["f1"], active: "f1" }, { type: "tabs", panes: ["w1"], active: "w1" }]);
  assert.equal(Math.round(back.root.sizes.reduce((a, b) => a + b, 0)), 100);
  assert.equal(parseLayout(back, ctx).warnings.length, 0, "the folded layout is valid as it stands");
});

test("panels without one of our panes are dropped, and a pane's id always follows the panel's", () => {
  const json = toDockview(DEFAULT_LAYOUT("running"));
  json.panels.p1 = { id: "p1", contentComponent: "panel", params: { pane: { id: "other", kind: "panel", panelId: "race", params: {}, setBy: "human" } } };
  json.panels.p2 = { id: "p2", contentComponent: "assistant" };
  const back = fromDockview(json);
  assert.deepEqual(back.panes, { p1: { id: "p1", kind: "panel", panelId: "race", params: {}, setBy: "human" } });
  assert.deepEqual(back.root, { type: "tabs", panes: ["p1"], active: "p1" }, "the emptied group is gone");
});
