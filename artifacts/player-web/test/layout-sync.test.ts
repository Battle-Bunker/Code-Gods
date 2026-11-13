/**
 * The dock's sync decisions (src/dock/layout-sync.ts), pure: when a server layout is applied (between gestures,
 * never during a drag or over an unpushed local change), what is pushed and with which `ifUpdatedAt`, and that a
 * CONFLICT adopts the server's version. Plus the panel-1 phase rule, the layout comparison the dock uses to avoid
 * re-applying its own state, and the per-pane history behind the pane header's ‹ and ↺.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LAYOUT, assistantSide, closePane, paneExtents, panelPanesOf, paneOrder, panesOf, movePane, openPane, parseLayout, setPanePanel, setPaneParams, type DockLayout } from "@workspace/player-client/layout";
import { SINGLE_LAYOUT } from "./single-layout.ts";
import {
  effectiveLayout, initialSync, keepAssistantPane, pushPlan, sameLayout, syncReducer, withResultsFirst, withTimeline, withoutAssistant, type SyncState,
} from "../src/dock/layout-sync.ts";
import { back, canUndo, lastParams, observe, emptyHistory, resetView } from "../src/dock/history.ts";
import { EDITOR_MIN, dockAssistant, showPanel } from "../src/dock/operations.ts";

const base = SINGLE_LAYOUT;
const withRace = openPane(base, { id: "", kind: "panel", panelId: "race", params: {}, setBy: "human" }).layout;
const sideBySide = movePane(base, "p2", { relativeTo: "p1", direction: "right" });
const run = (state: SyncState, ...events: Parameters<typeof syncReducer>[1][]) => events.reduce(syncReducer, state);
const loaded = (layout = base, updatedAt = 100) => run(initialSync(SINGLE_LAYOUT), { type: "server", layout, updatedAt });

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

test("a pane the player closed stays closed through a CONFLICT: the close is replayed on the server's version and pushed", () => {
  // Catches: the closed pane coming back because a CONFLICT adopted the server's version (the assistant opened a
  // panel while the player closed another).
  const closed = closePane(base, "p2");
  const s = run(loaded(), { type: "edit", layout: closed }, { type: "push-start" }, { type: "server", layout: withRace, updatedAt: 200 }, { type: "push-conflict" });
  assert.deepEqual(s.local, closePane(withRace, "p2"), "the server's change kept, the player's close replayed on it");
  assert.deepEqual(pushPlan(s), { layout: closePane(withRace, "p2"), ifUpdatedAt: 200 });
  // A conflict before the newer version has arrived: the close stays on screen and is pushed again once it has.
  const early = run(loaded(), { type: "edit", layout: closed }, { type: "push-start" }, { type: "push-conflict" });
  assert.deepEqual(early.local, closed);
  const later = run(early, { type: "server", layout: withRace, updatedAt: 200 });
  assert.deepEqual(later.local, closePane(withRace, "p2"));
  assert.deepEqual(pushPlan(later), { layout: closePane(withRace, "p2"), ifUpdatedAt: 200 });
});

test("a close replayed after a CONFLICT: never the last panel, never a pane reopened or now showing something else, never on a stale version", () => {
  // The last panel: the player closed p1 while the server closed p3, leaving p1 its only panel (closePane refuses).
  const lastPanel = run(loaded(withRace), { type: "edit", layout: closePane(withRace, "p1") }, { type: "push-start" },
    { type: "server", layout: base, updatedAt: 200 }, { type: "push-conflict" });
  assert.deepEqual(lastPanel.local, base, "the server's version, unchanged");
  assert.equal(pushPlan(lastPanel), null);
  // Reopened by the player before the newer version arrived: the reopened pane stays.
  const reopened = run(loaded(), { type: "edit", layout: closePane(base, "p2") }, { type: "push-start" }, { type: "push-conflict" },
    { type: "edit", layout: base }, { type: "server", layout: withRace, updatedAt: 200 }, { type: "push-start" }, { type: "push-conflict" });
  assert.equal(reopened.local.panes.p2?.kind, "assistant");
  // The id now names another pane on the server (the assistant put a feed where the race was): left alone.
  const feedAtP3 = setPanePanel(withRace, Object.keys(withRace.panes).find(id => !(id in base.panes))!, "feed", "assistant");
  const raceId = Object.keys(withRace.panes).find(id => !(id in base.panes))!;
  const reused = run(loaded(withRace), { type: "edit", layout: closePane(withRace, raceId) }, { type: "push-start" }, { type: "push-conflict" },
    { type: "server", layout: feedAtP3, updatedAt: 300 });
  assert.deepEqual(reused.local, feedAtP3);
  assert.equal(pushPlan(reused), null);
  // The same version delivered again is not the one that moved the row: the close stays on screen, nothing is pushed.
  const stale = run(loaded(), { type: "edit", layout: closePane(base, "p2") }, { type: "push-start" }, { type: "push-conflict" },
    { type: "server", layout: base, updatedAt: 100 });
  assert.deepEqual(stale.local, closePane(base, "p2"));
  assert.equal(pushPlan(stale), null);
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

test("a read-only sync (safe mode, a replay) applies server layouts and never pushes, also after a local edit", () => {
  const s = run(initialSync(base, { canWrite: false }), { type: "server", layout: base, updatedAt: 1 }, { type: "edit", layout: sideBySide });
  assert.deepEqual(s.local, sideBySide);
  assert.equal(pushPlan(s), null);
  // Catches: the local edit (a replay's own Timeline pane) left "unpushed" for good, so every later server layout
  // (the assistant opening a panel) was queued behind it and never shown.
  const next = run(s, { type: "server", layout: withRace, updatedAt: 2 });
  assert.deepEqual(next.local, withRace);
  assert.equal(next.queued, false);
});

test("the first panel nobody chose follows the phase", () => {
  const ended = effectiveLayout(base, "ended");
  assert.equal(ended.panes.p1.kind === "panel" && ended.panes.p1.panelId, "results");
  assert.equal(effectiveLayout(base, "running"), base, "unchanged when it already shows the phase's panel");
  const chosen = setPanePanel(base, "p1", "race", "human");
  assert.equal(effectiveLayout(chosen, "ended"), chosen);
  const assisted = setPanePanel(base, "p1", "objects", "assistant");
  assert.equal(effectiveLayout(assisted, "ended"), assisted);
  const second = setPanePanel(openPane(chosen, { id: "", kind: "panel", panelId: "overview", params: {}, setBy: "default" }).layout, "p1", "race", "human");
  const p3 = effectiveLayout(second, "ended").panes.p3;
  assert.equal(p3.kind === "panel" && p3.panelId, "results", "the first panel nobody chose follows, wherever it is");
  const both = setPanePanel(openPane(base, { id: "", kind: "panel", panelId: "overview", params: {}, setBy: "default" }).layout, "p1", "objects", "default");
  const followed = effectiveLayout(both, "ended");
  assert.deepEqual(panelPanesOf(followed).map(p => p.kind === "panel" && p.panelId), ["results", "overview"], "only the first of them");
  // The default dock (the goal card is the player's): objects become the results at the end, and back in a replay.
  const dock = DEFAULT_LAYOUT("running");
  assert.deepEqual(panelPanesOf(effectiveLayout(dock, "ended")).map(p => p.kind === "panel" && p.panelId), ["my-card", "results", "agents", "race"]);
  assert.deepEqual(panelPanesOf(effectiveLayout(effectiveLayout(dock, "ended"), "running")).map(p => p.kind === "panel" && p.panelId), ["my-card", "objects", "agents", "race"]);
});

test("sameLayout ignores sub-pixel size drift but not structure, panels or a real resize", () => {
  const nudged: DockLayout = { ...base, root: { ...base.root, sizes: [50.4, 49.6] } as DockLayout["root"] };
  assert.ok(sameLayout(base, nudged));
  const resized: DockLayout = { ...base, root: { ...base.root, sizes: [60, 40] } as DockLayout["root"] };
  assert.ok(!sameLayout(base, resized));
  assert.ok(!sameLayout(base, sideBySide));
  assert.ok(!sameLayout(base, setPanePanel(base, "p1", "race", "human")));
  assert.ok(!sameLayout(base, setPaneParams(base, "p1", { limit: 5 }, "assistant")));
});

test("history: an assistant change can be undone (‹) and reset (↺); a human change or a first view cannot", () => {
  const assisted = setPaneParams(setPanePanel(base, "p1", "objects", "assistant"), "p1", { filter: "contested" }, "assistant");
  let h = observe(emptyHistory, null, base);
  assert.ok(!canUndo(h, base.panes.p1));
  h = observe(h, base, assisted);
  assert.ok(canUndo(h, assisted.panes.p1));
  const undone = back(h, "p1");
  assert.ok(undone);
  assert.deepEqual(undone.view, { panelId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "default" });
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
  for (const id of ["race", "feed", "agents"] as const) layout = parseLayout(showPanel(layout, id).layout, ctx).layout;
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
  assert.deepEqual(right.root.type === "split" && [right.root.direction, right.root.children.map(c => c.type === "split" ? c.direction : c.id)],
    ["row", ["column", "p2"]], "panels in a column, the assistant on the right");
  const bottom = parseLayout(dockAssistant(right, "bottom"), ctx).layout;
  assert.equal(assistantSide(bottom), "column");
  assert.deepEqual(bottom.root.type === "split" && [bottom.root.direction, bottom.root.children.map(c => c.type === "split" ? c.direction : c.id)],
    ["column", ["row", "p2"]]);
  const left = parseLayout(dockAssistant(twoInARow, "left"), ctx).layout;
  assert.deepEqual(left.root.type === "split" && left.root.children[0], { type: "pane", id: "p2" });
});

test("a replay's Timeline is shown once, even in a full dock (four panels, twelve panes); a live layout is untouched", () => {
  const shown = withTimeline(base);
  assert.equal(panelPanesOf(shown).filter(p => p.panelId === "timeline").length, 1);
  assert.equal(withTimeline(shown), shown, "already there");
  let full = DEFAULT_LAYOUT("ended");
  for (const panelId of ["race", "feed", "agents", "rules"] as const) {
    if (panelPanesOf(full).length < 4) full = openPane(full, { id: "", kind: "panel", panelId, params: {}, setBy: "human" }).layout;
  }
  assert.equal(panelPanesOf(full).length, 4);
  const replaced = withTimeline(full);
  assert.equal(panelPanesOf(replaced).filter(p => p.panelId === "timeline").length, 1, "four panels + assistant: the Timeline replaces the assistant");
  assert.equal(panelPanesOf(replaced).length, 5);
  assert.ok(Object.values(replaced.panes).every(p => p.kind !== "assistant"));
  const noAssistant = withTimeline(withoutAssistant(full));
  assert.equal(panelPanesOf(noAssistant).length, 5, "four panels, no assistant: added");
  assert.ok(noAssistant.root.type === "split" && noAssistant.root.direction === "column" && noAssistant.root.sizes.join() === "50,50"
    && (noAssistant.root.children.at(-1) as { id: string }).id === Object.values(noAssistant.panes).find(p => p.kind === "panel" && p.panelId === "timeline")!.id, "the bottom half");
  assert.equal(withTimeline(noAssistant), noAssistant, "a layout with a Timeline is unchanged");
});

test("a replay's Timeline takes the assistant's slot; with no assistant it is the full-width bottom half; a live layout is untouched", () => {
  const stored = DEFAULT_LAYOUT("running");
  const assistant = Object.values(stored.panes).find(p => p.kind === "assistant")!;
  const before = panelPanesOf(stored).length;
  const shown = withTimeline(stored);
  assert.equal(shown.panes[assistant.id].kind, "panel", "the assistant's pane now holds the Timeline");
  assert.equal(panelPanesOf(shown).filter(p => p.panelId === "timeline").length, 1, "once, not also in the top row");
  assert.equal(panelPanesOf(shown).length, before + 1);
  assert.deepEqual(shown.root, stored.root, "same slot");
  assert.equal(stored.panes[assistant.id].kind, "assistant", "the input is not changed");
  // No assistant: a full-width bottom half under everything.
  const none = withTimeline(withoutAssistant(stored));
  const timelineId = Object.values(none.panes).find(p => p.kind === "panel" && p.panelId === "timeline")!.id;
  assert.ok(none.root.type === "split" && none.root.direction === "column" && none.root.children.at(-1)?.type === "pane"
    && (none.root.children.at(-1) as { id: string }).id === timelineId && none.root.sizes.join() === "50,50");
});

test("a room with no assistant shows the layout without its assistant pane; the stored layout is untouched", () => {
  const stored = DEFAULT_LAYOUT("running");
  assert.ok(Object.values(stored.panes).some(p => p.kind === "assistant"), "the default has an assistant");
  const shown = withoutAssistant(stored);
  assert.ok(Object.values(shown.panes).every(p => p.kind !== "assistant"));
  assert.ok(panelPanesOf(shown).length >= 1, "the panels stay");
  assert.ok(Object.values(stored.panes).some(p => p.kind === "assistant"), "the input is not changed");
  assert.equal(withoutAssistant(shown), shown, "nothing to remove");
});

test("an edit made while the assistant is hidden keeps its stored pane in the saved layout", () => {
  const stored = DEFAULT_LAYOUT("live");
  const hidden = withoutAssistant(stored);
  const pane = panelPanesOf(hidden)[0]!;
  const edited = keepAssistantPane(setPanePanel(hidden, pane.id, "rules"), stored);
  const assistant = (l: DockLayout) => Object.values(l.panes).find(p => p.kind === "assistant");
  assert.deepEqual(assistant(edited), assistant(stored), "the assistant pane is back");
  assert.equal(panelPanesOf(edited).find(p => p.id === pane.id)?.panelId, "rules", "the edit is kept");
  assert.equal(keepAssistantPane(hidden, hidden), hidden, "no stored assistant: unchanged");
});

test("the default dock without an assistant: my agents and the race share the bottom row, their divider under the top row's", () => {
  const shown = withoutAssistant(DEFAULT_LAYOUT("running"));
  assert.deepEqual(shown.root, { type: "split", direction: "column", sizes: [53, 47], children: [
    { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: "p1" }, { type: "pane", id: "p2" }] },
    { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: "p3" }, { type: "pane", id: "p5" }] },
  ] });
});

test("the default dock's replay: the Timeline bottom left in the assistant's place, the results top right", () => {
  const shown = withTimeline(effectiveLayout(DEFAULT_LAYOUT("ended"), "ended"));
  assert.deepEqual(paneOrder(shown.root), ["p1", "p2", "p4", "p3", "p5"]);
  assert.deepEqual(panesOf(shown).map(p => p.kind === "panel" ? p.panelId : p.kind), ["my-card", "results", "timeline", "agents", "race"]);
  const none = withTimeline(withoutAssistant(effectiveLayout(DEFAULT_LAYOUT("ended"), "ended")));
  assert.equal(panelPanesOf(none).filter(p => p.panelId === "timeline").length, 1, "no assistant: still one Timeline");
});

test("an edit in a room without an assistant puts its stored pane back where it was, not beside the last panel", () => {
  const stored = DEFAULT_LAYOUT("running");
  const edited = keepAssistantPane(setPanePanel(withoutAssistant(stored), "p2", "feed", "human"), stored);
  assert.deepEqual(paneOrder(edited.root), ["p1", "p2", "p4", "p3", "p5"], "bottom left again");
  const bottom = edited.root.type === "split" ? edited.root.children[1] : null;
  assert.ok(bottom?.type === "split" && bottom.direction === "row" && bottom.children.length === 3, "in the bottom row");
});

test("the agent editor in the full default dock takes the largest panel nobody chose (objects), unless a panel is focused", () => {
  const dock = DEFAULT_LAYOUT("running");
  for (const focused of [null, "p4"]) {
    const r = showPanel(dock, "forge", undefined, focused);
    assert.ok(r.replaced);
    assert.equal(r.paneId, "p2", `objects, top right (focused ${focused})`);
  }
  assert.equal(showPanel(dock, "forge", undefined, "p5").paneId, "p2", "a focused pane a quarter wide is too small for the editor");
  assert.equal(showPanel(dock, "public-chat", undefined, "p5").paneId, "p5", "any other panel: the focused pane, as before");
});

test("an ended game shows its results first: the results pane across the top, everything else below", () => {
  const ended = withTimeline(DEFAULT_LAYOUT("ended"));
  const shown = withResultsFirst(ended);
  const first = panesOf(shown)[0];
  assert.ok(first.kind === "panel" && first.panelId === "results", "the results come first in reading order (the phone stacks panes in this order)");
  assert.ok(shown.root.type === "split" && shown.root.direction === "column" && shown.root.children[0].type === "pane", "a full-width top row");
  assert.ok(shown.root.type === "split" && shown.root.sizes[0] >= 45, "about half the dock, so the headline and the standings need no scrolling");
  assert.deepEqual(Object.keys(shown.panes).sort(), Object.keys(ended.panes).sort(), "the same panes: nothing added or lost");
  assert.equal(panelPanesOf(shown).filter(p => p.panelId === "results").length, 1);
  assert.equal(withResultsFirst(shown), shown, "already first: unchanged");
  assert.ok(shown.root.type === "split" && shown.root.children.every(c => c.type !== "split" || c.direction === "row"), "no column inside the column");
  assert.ok(shown.root.type === "split" && Math.abs(shown.root.sizes.reduce((a, b) => a + b, 0) - 100) < 1e-9, "the weights sum to 100");
  assert.equal(parseLayout(shown, { phase: "ended", storedSlugs: [], fileIds: [] }).warnings.filter(w => /reset/.test(w)).length, 0, "a valid layout");
  // A layout with no results pane gets one (derived for display, like the Timeline).
  const none = withTimeline(setPanePanel(DEFAULT_LAYOUT("ended"), "p2", "objects", "human"));
  const added = withResultsFirst(none);
  const top = panesOf(added)[0];
  assert.ok(top.kind === "panel" && top.panelId === "results");
  assert.equal(Object.keys(added.panes).length, Object.keys(none.panes).length + 1);
  // A dock that only shows the results is left alone.
  const only: DockLayout = { version: 1, root: { type: "pane", id: "p1" }, panes: { p1: { id: "p1", kind: "panel", panelId: "results", params: {}, setBy: "human" } } };
  assert.equal(withResultsFirst(only), only);
});

test("hidden assistant: changes never shrink its neighbour (the editor once ended as a sliver after a few clicks)", () => {
  const stored = DEFAULT_LAYOUT("planning");
  let saved = stored;
  for (const panel of ["forge", "agents", "forge", "rules"] as const) {
    const shown = withoutAssistant(saved);
    const pane = panelPanesOf(shown).find(p => p.id === "p3")!;
    saved = keepAssistantPane(parseLayout(setPanePanel(shown, pane.id, panel), { phase: "planning", storedSlugs: [] }).layout, saved);
    assert.ok(sameLayout(saved, { ...stored, panes: saved.panes }), `the stored arrangement keeps its sizes after showing ${panel}`);
    assert.ok(Math.abs(paneExtents(withoutAssistant(saved).root).p3.width - 0.5) < 0.02, "My agents' pane keeps half the row");
  }
});

test("the agent editor always opens with room to work: never the goal card, never a sliver", () => {
  const usable = (layout: DockLayout, id: string) => { const e = paneExtents(layout.root)[id]; return e.width >= EDITOR_MIN.width && e.height >= EDITOR_MIN.height; };
  // The default dock with the assistant: My agents (a quarter wide) is focused, the objects (top right) show the editor.
  const admin = showPanel(DEFAULT_LAYOUT("planning"), "forge", undefined, "p3");
  assert.equal(admin.paneId, "p2");
  assert.ok(usable(admin.layout, admin.paneId));
  // No assistant: the leaderboard the button was clicked in has the room, and shows it.
  const alice = showPanel(withoutAssistant(DEFAULT_LAYOUT("planning")), "forge", undefined, "p5");
  assert.equal(alice.paneId, "p5");
  assert.ok(usable(alice.layout, alice.paneId));
  // Clicked in My agents: that pane stays (it tells what the new agent does) while another has the room.
  const fromAgents = showPanel(withoutAssistant(DEFAULT_LAYOUT("planning")), "forge", undefined, "p3");
  assert.notEqual(fromAgents.paneId, "p3");
  assert.notEqual(fromAgents.paneId, "p1", "the goal card stays");
  assert.ok(usable(fromAgents.layout, fromAgents.paneId));
  // Clicked in the goal card: the goal stays.
  assert.notEqual(showPanel(DEFAULT_LAYOUT("planning"), "forge", undefined, "p1").paneId, "p1");
  // Fewer than four panels: a pane is split only when both halves stay usable, else one shows the editor.
  const two = parseLayout(closePane(closePane(withoutAssistant(DEFAULT_LAYOUT("planning")), "p5"), "p2"), { phase: "planning", storedSlugs: [] }).layout;
  const split = showPanel(two, "forge", undefined, "p1");
  assert.ok(!split.replaced, "a full-width pane has room for two");
  assert.ok(usable(split.layout, split.paneId));
  const three = parseLayout(closePane(DEFAULT_LAYOUT("planning"), "p5"), { phase: "planning", storedSlugs: [] }).layout;
  const tight = showPanel(three, "forge", undefined, "p3");
  assert.ok(usable(tight.layout, tight.paneId), "no half of a small pane");
  assert.equal(panelPanesOf(tight.layout).find(p => p.panelId === "my-card")?.id, "p1");
});

test("an editor left as a sliver (an arrangement carried from another room) gets room when it is opened again", () => {
  const usable = (layout: DockLayout, id: string) => { const e = paneExtents(layout.root)[id]; return e.width >= EDITOR_MIN.width && e.height >= EDITOR_MIN.height; };
  const sliver: DockLayout = {
    version: 1,
    root: { type: "split", direction: "column", sizes: [53, 47], children: [
      { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: "p1" }, { type: "pane", id: "p2" }] },
      { type: "split", direction: "row", sizes: [7, 93], children: [{ type: "pane", id: "p3" }, { type: "pane", id: "p5" }] }] },
    panes: { ...withoutAssistant(DEFAULT_LAYOUT("planning")).panes, p3: { id: "p3", kind: "panel", panelId: "forge", params: { showHelpers: false }, setBy: "human" } },
  };
  assert.ok(!usable(sliver, "p3"));
  const shown = showPanel(sliver, "forge", undefined, "p5");
  assert.equal(shown.paneId, "p3", "the same pane");
  assert.ok(usable(shown.layout, "p3"));
  assert.ok(usable(parseLayout(shown.layout, { phase: "planning", storedSlugs: [] }).layout, "p3"), "and parseLayout keeps it");
  const fine = showPanel(DEFAULT_LAYOUT("planning"), "forge", undefined, null).layout;
  assert.equal(showPanel(fine, "forge").layout, fine, "an editor with room is left alone");
});
