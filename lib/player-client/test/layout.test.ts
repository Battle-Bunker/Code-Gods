/**
 * The dock layout (src/layout.ts): parseLayout degrades on every failure class and never throws; openPane's reuse
 * and placement rules; closePane's refusals; movePane; setPaneParams validation; presets; the carried layout; and
 * JSON round trips of the stored shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LAYOUT, LAYOUT_LIMITS, LayoutError, PRESET_LAYOUTS, assistantSide, carryLayout, closePane, describeLayout, followPhase, panelPanesOf,
  movePane, nextPaneId, openPane, paneOrder, panesOf, parseLayout, resetPanelParams, setPanePanel, setPaneParams, type DockLayout, type Node, type Pane,
} from "../src/layout.ts";

/** One default panel over the assistant (the former default shape): the mechanics below are easiest to read from one panel. */
const single = (phase: "lobby" | "running" | "ended"): DockLayout => ({
  version: 1,
  root: { type: "split", direction: "column", sizes: [50, 50], children: [{ type: "pane", id: "p1" }, { type: "pane", id: "p2" }] },
  panes: { p1: { id: "p1", kind: "panel", panelId: phase === "ended" ? "results" : "objects", params: phase === "ended" ? {} : { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "default" }, p2: { id: "p2", kind: "assistant" } },
});

test("the first built-in panel follows the phase only while nobody chose it; a new game resets parameters but keeps choices; what-if cannot survive a reset", () => {
  const base = single("running");
  // Nobody chose p1: at the end of the game it shows the results, in the engine's parse and the client's alike.
  const ended = parseLayout(base, { phase: "ended", storedSlugs: [] }).layout;
  assert.equal(panelPanesOf(ended)[0].panelId, "results");
  assert.equal(panelPanesOf(followPhase(base, "ended"))[0].panelId, "results");
  // The player chose objects: it stays through every phase.
  const chosen = setPanePanel(base, "p1", "objects", "human", { limit: 5 });
  assert.equal(panelPanesOf(parseLayout(chosen, { phase: "ended", storedSlugs: [] }).layout)[0].panelId, "objects");
  // Only the first built-in panel follows; a second default pane keeps its panel.
  const two = openPane(ended, { id: "", kind: "panel", panelId: "race", params: {}, setBy: "default" }, { relativeTo: "p1", direction: "right" }).layout;
  assert.deepEqual(panelPanesOf(parseLayout(two, { phase: "lobby", storedSlugs: [] }).layout).map(p => p.panelId), ["objects", "race"]);
  // A new game: parameters reset, the choice and who made it stay; what-if becomes the overview.
  const whatIf = openPane(chosen, { id: "", kind: "panel", panelId: "what-if", params: { objectId: "o1", calls: [["add", { k: 1 }]] }, setBy: "assistant" }, { relativeTo: "p1", direction: "right" }).layout;
  const reset = resetPanelParams(whatIf);
  const [first, second] = panelPanesOf(reset);
  assert.deepEqual([first.panelId, first.setBy], ["objects", "human"]);
  assert.notEqual((first.params as { limit?: number }).limit, 5, "parameters are back to the defaults");
  assert.deepEqual([second.panelId, second.setBy], ["overview", "assistant"]);
  // Carried into another room: the chosen panel and who chose it stay, the what-if pane becomes the overview, and it
  // parses without warnings whatever that room's phase.
  const carried = parseLayout(carryLayout(whatIf), { phase: "ended", storedSlugs: [] });
  assert.deepEqual(carried.warnings, []);
  assert.deepEqual(panelPanesOf(carried.layout).map(p => [p.panelId, p.setBy]), [["objects", "human"], ["overview", "assistant"]]);
  // A never-chosen first pane carried into a lobby shows that lobby's default.
  assert.equal(panelPanesOf(parseLayout(carryLayout(single("ended")), { phase: "lobby", storedSlugs: [] }).layout)[0].panelId, "objects");
});

const ctx = { phase: "running" as const, storedSlugs: ["mine"] };
const panel = (id: string, panelId = "objects", params: Record<string, unknown> = {}): Pane => ({ id, kind: "panel", panelId: panelId as never, params, setBy: "assistant" });
const sumOf = (sizes: number[]) => sizes.reduce((a, b) => a + b, 0);
/** Every split's weights sum to 100 and match its children; every pane is one leaf. */
function wellFormed(layout: DockLayout) {
  const seen: string[] = [];
  const walk = (node: Node) => {
    if (node.type === "pane") { seen.push(node.id); return; }
    assert.ok(node.children.length >= 2, "no single-child splits");
    assert.equal(node.sizes.length, node.children.length);
    assert.ok(Math.abs(sumOf(node.sizes) - 100) < 0.01, `sizes sum to 100, got ${node.sizes}`);
    for (const c of node.children) { assert.ok(!(c.type === "split" && c.direction === node.direction), "no nested same-direction splits"); walk(c); }
  };
  walk(layout.root);
  assert.deepEqual([...seen].sort(), Object.keys(layout.panes).sort(), "every pane is placed exactly once");
}

test("the default layout: the goal (3 best examples) left, objects by payoff over my agents right, the assistant across the bottom", () => {
  const layout = DEFAULT_LAYOUT("running");
  wellFormed(layout);
  const tabsOf = (id: string): Node => ({ type: "pane", id });
  assert.deepEqual(layout.root, { type: "split", direction: "column", sizes: [76, 24], children: [
    { type: "split", direction: "row", sizes: [50, 50], children: [tabsOf("p1"), { type: "split", direction: "column", sizes: [58, 42], children: [tabsOf("p2"), tabsOf("p3")] }] },
    tabsOf("p4"),
  ] });
  const shown = (id: string) => { const p = layout.panes[id]; return p.kind === "panel" ? [p.panelId, p.params] : p.kind; };
  assert.deepEqual(shown("p1"), ["my-card", { examples: 3, showSource: false, exampleSort: "best" }]);
  assert.deepEqual(shown("p2"), ["objects", { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }]);
  assert.deepEqual(shown("p3"), ["agents", { agentIds: [], window: 120, showSource: false, showCosts: false }]);
  assert.equal(shown("p4"), "assistant");
  assert.equal(assistantSide(layout), "column");
  assert.deepEqual(parseLayout(layout, ctx), { layout, warnings: [] });
  for (const phase of ["lobby", "running", "ended"] as const) {
    const parsed = parseLayout(DEFAULT_LAYOUT(phase), { phase, storedSlugs: [] });
    assert.deepEqual(parsed.warnings, [], phase);
    assert.equal(panelPanesOf(parsed.layout)[0].panelId, "my-card", `the goal panel does not follow the phase (${phase})`);
  }
  assert.deepEqual(parseLayout(JSON.parse(JSON.stringify(layout)), ctx).layout, layout, "survives a JSON round trip");
});

test("a stored layout is untouched by the new default", () => {
  const stored = single("running");
  assert.deepEqual(parseLayout(stored, ctx), { layout: stored, warnings: [] });
});

test("parseLayout never throws: each failure class degrades and is named in warnings", () => {
  const base = single("running");
  for (const garbage of [undefined, null, 42, "x", [], {}, { version: 2 }, { version: 1, root: { type: "weird" }, panes: {} }]) {
    const { layout, warnings } = parseLayout(garbage, ctx);
    assert.deepEqual(layout, DEFAULT_LAYOUT("running"), `garbage ${JSON.stringify(garbage)} resets`);
    assert.match(warnings[0], /^layout reset:/);
  }
  // Unknown panel → the phase's default panel; invalid params → defaults; bad setBy → default.
  const odd = { ...base, panes: { ...base.panes, p1: { id: "p1", kind: "panel", panelId: "stored", params: { nope: 1 }, setBy: "robot" } } };
  const fixed = parseLayout(odd, ctx);
  assert.deepEqual(fixed.layout.panes.p1, { id: "p1", kind: "panel", panelId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "default" });
  assert.match(fixed.warnings.join("\n"), /unknown panel "stored"/);
  const badParams = parseLayout({ ...base, panes: { ...base.panes, p1: { id: "p1", kind: "panel", panelId: "objects", params: { limit: 9999 }, setBy: "assistant" } } }, ctx);
  assert.equal(badParams.layout.panes.p1.kind === "panel" && badParams.layout.panes.p1.params.limit, 12);
  assert.match(badParams.warnings[0], /invalid objects parameters/);
  // what-if without its required params cannot show anything: the default panel takes its place.
  const whatIf = parseLayout({ ...base, panes: { ...base.panes, p1: { id: "p1", kind: "panel", panelId: "what-if", params: {}, setBy: "human" } } }, ctx);
  assert.equal(whatIf.layout.panes.p1.kind === "panel" && whatIf.layout.panes.p1.panelId, "objects");
  // Unknown stored panel or file panel → dropped; a missing assistant or panel → added.
  const panels: DockLayout = { version: 1, root: { type: "split", direction: "row", sizes: [1, 1, 1], children: [
    { type: "pane", id: "s1" }, { type: "pane", id: "s2" }, { type: "pane", id: "f1" }] },
    panes: { s1: { id: "s1", kind: "stored-panel", slug: "mine" }, s2: { id: "s2", kind: "stored-panel", slug: "theirs" }, f1: { id: "f1", kind: "file-panel", fileId: "gone" } } };
  const repaired = parseLayout(panels, { ...ctx, fileIds: ["kept"] });
  wellFormed(repaired.layout);
  assert.deepEqual(panesOf(repaired.layout).map(p => p.kind).sort(), ["assistant", "panel", "stored-panel"]);
  assert.match(repaired.warnings.join("\n"), /no stored panel "theirs"/);
  assert.match(repaired.warnings.join("\n"), /no file panel "gone"/);
  assert.match(repaired.warnings.join("\n"), /no assistant pane/);
  assert.match(repaired.warnings.join("\n"), /no built-in panel/);
  // Without fileIds, file panels are trusted (the engine does not know a dev container's files).
  assert.equal(panesOf(parseLayout(panels, ctx).layout).some(p => p.kind === "file-panel"), true);
  // Duplicates and dangling references.
  const dupes = parseLayout({ version: 1, root: { type: "split", direction: "column", sizes: [50, 50], children: [
    { type: "pane", id: "p1" }, { type: "pane", id: "p1" }, { type: "pane", id: "ghost" }, { type: "pane", id: "p2" }, { type: "pane", id: "p3" }] },
    panes: { ...base.panes, p3: { id: "p3", kind: "assistant" }, orphan: { id: "orphan", kind: "assistant" } } }, ctx);
  wellFormed(dupes.layout);
  assert.deepEqual(paneOrder(dupes.layout.root), ["p1", "p2"]);
  assert.match(dupes.warnings.join("\n"), /ghost: not defined/);
  assert.match(dupes.warnings.join("\n"), /p3: a second assistant pane/);
  assert.match(dupes.warnings.join("\n"), /orphan: not placed/);
  // Too many built-in panels → the extras go; too deep or too large → reset.
  let many = base;
  for (let i = 0; i < 6; i++) many = { ...many, root: { type: "split", direction: i % 2 ? "row" : "column", sizes: [50, 50], children: [many.root, { type: "pane", id: `x${i}` }] }, panes: { ...many.panes, [`x${i}`]: panel(`x${i}`) } };
  const trimmed = parseLayout({ ...many, root: { type: "split", direction: "row", sizes: [], children: Object.keys(many.panes).map(id => ({ type: "pane" as const, id })) } }, ctx);
  assert.equal(panelPanesOf(trimmed.layout).length, LAYOUT_LIMITS.panelPanes);
  assert.match(trimmed.warnings.join("\n"), /more than 4 built-in panels/);
  assert.match(parseLayout(many, ctx).warnings[0], /^layout reset: deeper/);
  const huge = { ...base, panes: { ...base.panes, p1: { ...base.panes.p1, params: { highlight: ["x".repeat(40_000)] } } } };
  assert.match(parseLayout(huge, ctx).warnings[0], /^layout reset: larger/);
  // Nested same-direction splits merge; sizes renormalise.
  const nested: DockLayout = { version: 1, root: { type: "split", direction: "column", sizes: [2, 2], children: [
    { type: "split", direction: "column", sizes: [1, 1], children: [{ type: "pane", id: "p1" }, { type: "pane", id: "a" }] }, { type: "pane", id: "p2" }] },
    panes: { ...base.panes, a: panel("a", "race") } };
  const merged = parseLayout(nested, ctx).layout;
  wellFormed(merged);
  assert.equal(merged.root.type === "split" && merged.root.children.length, 3);
  assert.deepEqual(merged.root.type === "split" && merged.root.sizes, [25, 25, 50]);
});

test("openPane: default placement, the reuse rule is the caller's, a 5th panel is refused, limits are refused", () => {
  const base = single("running");
  // The assistant is below: a new panel goes to the RIGHT of the last panel.
  const one = openPane(base, panel("", "race"));
  wellFormed(one.layout);
  assert.equal(one.paneId, "p3");
  assert.deepEqual(paneOrder(one.layout.root), ["p1", "p3", "p2"]);
  const top = (one.layout.root as Extract<Node, { type: "split" }>).children[0];
  assert.equal(top.type === "split" && top.direction, "row");
  // Side by side: the assistant is beside the panels, so a new panel goes BELOW the last panel.
  const side = PRESET_LAYOUTS["side-by-side"](base);
  assert.equal(assistantSide(side), "row");
  const below = openPane(side, panel("", "race"));
  const left = (below.layout.root as Extract<Node, { type: "split" }>).children[0];
  assert.equal(left.type === "split" && left.direction, "column");
  // Explicit placement: an edge of an existing pane splits it (there is no way to put two panels in one pane).
  const beside = openPane(base, panel("", "feed"), { relativeTo: "p1", direction: "left" });
  const group = (beside.layout.root as Extract<Node, { type: "split" }>).children[0];
  assert.deepEqual(group, { type: "split", direction: "row", sizes: [50, 50], children: [{ type: "pane", id: beside.paneId }, { type: "pane", id: "p1" }] });
  wellFormed(beside.layout);
  assert.throws(() => openPane(base, panel("", "feed"), { relativeTo: "nope", direction: "below" }), (e: LayoutError) => e.code === "NOT_FOUND");
  // Four panels then a fifth: refused (parseLayout would drop it later), so the caller changes a panel instead.
  let four = base;
  for (const id of ["race", "feed", "agents"]) four = openPane(four, panel("", id)).layout;
  assert.equal(panelPanesOf(four).length, 4);
  assert.throws(() => openPane(four, panel("", "rules"), { relativeTo: "p1", direction: "below" }), (e: LayoutError) => e.code === "CONFLICT" && /At most 4 panels/.test(e.message));
  assert.throws(() => openPane(four, panel("", "rules")), (e: LayoutError) => e.code === "CONFLICT");
  assert.deepEqual(parseLayout(four, { phase: "running", storedSlugs: [] }).warnings, [], "four built-in panels parse without warnings");
  // One assistant pane, at most 12 panes.
  assert.throws(() => openPane(base, { id: "", kind: "assistant" }), (e: LayoutError) => e.code === "CONFLICT");
  let full = base;
  for (let i = 0; i < LAYOUT_LIMITS.panes - 2; i++) full = openPane(full, { id: "", kind: "stored-panel", slug: `s${i}` }).layout;
  assert.throws(() => openPane(full, { id: "", kind: "stored-panel", slug: "more" }), (e: LayoutError) => e.code === "CONFLICT");
  // A given id is kept when free; a taken id gets a fresh one.
  assert.equal(openPane(base, panel("mine", "race")).paneId, "mine");
  assert.equal(openPane(base, panel("p1", "race")).paneId, "p3");
  assert.equal(nextPaneId(base), "p3");
});

test("closePane refuses the assistant and the last panel; movePane relocates; setPaneParams validates", () => {
  const base = single("running");
  assert.throws(() => closePane(base, "p2"), (e: LayoutError) => e.code === "CONFLICT" && /assistant/.test(e.message));
  assert.throws(() => closePane(base, "p1"), (e: LayoutError) => e.code === "CONFLICT" && /last panel/.test(e.message));
  assert.throws(() => closePane(base, "zz"), (e: LayoutError) => e.code === "NOT_FOUND");
  const two = openPane(base, panel("", "race")).layout;
  const closed = closePane(two, "p3");
  assert.deepEqual(closed, base, "closing the second panel restores the default shape");
  // Move the assistant to the right: the root becomes a row split with the assistant last.
  const moved = movePane(base, "p2", { relativeTo: "p1", direction: "right" });
  wellFormed(moved);
  assert.equal(moved.root.type === "split" && moved.root.direction, "row");
  assert.deepEqual(paneOrder(moved.root), ["p1", "p2"]);
  assert.equal(assistantSide(moved), "row");
  assert.throws(() => movePane(base, "p1", { relativeTo: "p1", direction: "left" }), (e: LayoutError) => e.code === "BAD_REQUEST");
  assert.throws(() => movePane(base, "nope", { relativeTo: "p1", direction: "left" }), (e: LayoutError) => e.code === "NOT_FOUND");
  // Parameters: defaults filled, setBy recorded, invalid refused with the issues, non-panel refused.
  const set = setPaneParams(base, "p1", { limit: 5 }, "assistant");
  assert.deepEqual(set.panes.p1, { id: "p1", kind: "panel", panelId: "objects", params: { sortBy: "payoff", filter: "all", limit: 5, highlight: [], layout: "list" }, setBy: "assistant" });
  assert.throws(() => setPaneParams(base, "p1", { limit: 1000 }, "assistant"), (e: LayoutError) => e.code === "BAD_REQUEST" && /limit/.test(e.message));
  assert.throws(() => setPaneParams(base, "p2", {}, "assistant"), (e: LayoutError) => e.code === "BAD_REQUEST");
  const swapped = setPanePanel(base, "p1", "overview", "human");
  assert.deepEqual(swapped.panes.p1, { id: "p1", kind: "panel", panelId: "overview", params: { focus: "auto" }, setBy: "human" });
});

test("presets keep every built-in panel; carried layouts reset parameters; the briefing lines name panes", () => {
  const base = openPane(single("running"), panel("", "objects", { limit: 5 })).layout;  // p1: the default objects panel, p3: chosen
  for (const name of ["stacked", "side-by-side", "two-panels"] as const) {
    const preset = PRESET_LAYOUTS[name](base);
    wellFormed(preset);
    assert.equal(panelPanesOf(preset).length, 2, `${name} keeps both panels`);
    assert.ok(preset.panes.p2.kind === "assistant");
  }
  assert.equal(assistantSide(PRESET_LAYOUTS.stacked(base)), "column");
  assert.equal(assistantSide(PRESET_LAYOUTS["side-by-side"](base)), "row");
  const two = PRESET_LAYOUTS["two-panels"](single("running"));
  assert.equal(panelPanesOf(two).length, 2, "a second panel is opened when there is only one");
  assert.equal(assistantSide(two), "row");
  const carried = carryLayout(setPaneParams(base, "p3", { limit: 3, highlight: ["o1"] }, "assistant"));
  assert.deepEqual(carried.panes.p3, { id: "p3", kind: "panel", panelId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "assistant" }, "parameters reset; the panel and who chose it stay");
  assert.deepEqual(carried.root, base.root, "the arrangement is kept");
  const lines = describeLayout(setPaneParams(base, "p3", { limit: 3 }, "assistant"));
  assert.deepEqual(lines, ["[p1] objects — Top 12 by payoff (default)", "[p3] objects — Top 3 by payoff (set by you)", "[p2] this conversation (below the panels)"]);
});

test("a stored layout with tab groups keeps only each group's active tab; the pane model has no tabs", () => {
  const stored = { version: 1, root: { type: "split", direction: "column", sizes: [50, 50], children: [
    { type: "tabs", panes: ["p1", "p3", "p4"], active: "p3" }, { type: "tabs", panes: ["p2"], active: "p2" }] },
    panes: { p1: panel("p1", "objects"), p3: panel("p3", "race"), p4: { id: "p4", kind: "stored-panel", slug: "mine" }, p2: { id: "p2", kind: "assistant" } } };
  const { layout, warnings } = parseLayout(stored, ctx);
  wellFormed(layout);
  assert.deepEqual(paneOrder(layout.root), ["p3", "p2"]);
  assert.deepEqual(Object.keys(layout.panes).sort(), ["p2", "p3"]);
  assert.match(warnings.join("\n"), /p1: a hidden tab of an old layout/);
  assert.match(warnings.join("\n"), /p4: a hidden tab of an old layout/);
  // An active tab that is not in the group falls back to the first; an emptied group is dropped.
  const odd = parseLayout({ ...stored, root: { type: "split", direction: "column", sizes: [1, 1, 1], children: [
    { type: "tabs", panes: ["p1", "p3"], active: "zz" }, { type: "tabs", panes: [], active: "" }, { type: "tabs", panes: ["p2"], active: "p2" }] } }, ctx);
  assert.deepEqual(paneOrder(odd.layout.root), ["p1", "p2"]);
  // Already migrated layouts parse without warnings and are unchanged.
  const again = parseLayout(layout, ctx);
  assert.deepEqual(again.layout, layout);
  assert.deepEqual(again.warnings, []);
  // The model has no tab placement, and the default layout has no tab nodes.
  assert.equal(JSON.stringify(DEFAULT_LAYOUT("running")).includes("tabs"), false);
});
