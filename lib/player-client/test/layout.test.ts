/**
 * The dock layout (src/layout.ts): parseLayout degrades on every failure class and never throws; openPane's reuse
 * and placement rules; closePane's refusals; movePane; setPaneParams validation; presets; the carried layout; and
 * JSON round trips of the stored shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LAYOUT, LAYOUT_LIMITS, LayoutError, PRESET_LAYOUTS, activatePane, assistantSide, carryLayout, closePane, describeLayout, followPhase, lensPanesOf,
  movePane, nextPaneId, openPane, paneOrder, panesOf, parseLayout, resetLensParams, setPaneLens, setPaneParams, type DockLayout, type Node, type Pane,
} from "../src/layout.ts";

test("the first lens pane follows the phase only while nobody chose it; a new game resets parameters but keeps choices; what-if cannot survive a reset", () => {
  const base = DEFAULT_LAYOUT("running");
  // Nobody chose p1: at the end of the game it shows the results, in the engine's parse and the client's alike.
  const ended = parseLayout(base, { phase: "ended", storedSlugs: [] }).layout;
  assert.equal(lensPanesOf(ended)[0].lensId, "results");
  assert.equal(lensPanesOf(followPhase(base, "ended"))[0].lensId, "results");
  // The player chose objects: it stays through every phase.
  const chosen = setPaneLens(base, "p1", "objects", "human", { limit: 5 });
  assert.equal(lensPanesOf(parseLayout(chosen, { phase: "ended", storedSlugs: [] }).layout)[0].lensId, "objects");
  // Only the first lens pane follows; a second default pane keeps its lens.
  const two = openPane(ended, { id: "", kind: "lens", lensId: "race", params: {}, setBy: "default" }, { relativeTo: "p1", direction: "right" }).layout;
  assert.deepEqual(lensPanesOf(parseLayout(two, { phase: "lobby", storedSlugs: [] }).layout).map(p => p.lensId), ["overview", "race"]);
  // A new game: parameters reset, the choice and who made it stay; what-if becomes the overview.
  const whatIf = openPane(chosen, { id: "", kind: "lens", lensId: "what-if", params: { objectId: "o1", calls: [["add", { k: 1 }]] }, setBy: "assistant" }, { relativeTo: "p1", direction: "right" }).layout;
  const reset = resetLensParams(whatIf);
  const [first, second] = lensPanesOf(reset);
  assert.deepEqual([first.lensId, first.setBy], ["objects", "human"]);
  assert.notEqual((first.params as { limit?: number }).limit, 5, "parameters are back to the defaults");
  assert.deepEqual([second.lensId, second.setBy], ["overview", "assistant"]);
  // Carried into another room, nobody has chosen anything yet: the first pane follows that room's phase and the
  // what-if pane becomes the overview; it parses without warnings.
  const carried = parseLayout(carryLayout(whatIf), { phase: "ended", storedSlugs: [] });
  assert.deepEqual(carried.warnings, []);
  assert.deepEqual(lensPanesOf(carried.layout).map(p => [p.lensId, p.setBy]), [["results", "default"], ["overview", "default"]]);
});

const ctx = { phase: "running" as const, storedSlugs: ["mine"] };
const lens = (id: string, lensId = "objects", params: Record<string, unknown> = {}): Pane => ({ id, kind: "lens", lensId: lensId as never, params, setBy: "assistant" });
const sumOf = (sizes: number[]) => sizes.reduce((a, b) => a + b, 0);
/** Every split's weights sum to 100 and match its children; every tab group's active pane is one of its panes. */
function wellFormed(layout: DockLayout) {
  const seen: string[] = [];
  const walk = (node: Node) => {
    if (node.type === "tabs") { assert.ok(node.panes.length > 0, "no empty tab groups"); assert.ok(node.panes.includes(node.active), "active is a member"); seen.push(...node.panes); return; }
    assert.ok(node.children.length >= 2, "no single-child splits");
    assert.equal(node.sizes.length, node.children.length);
    assert.ok(Math.abs(sumOf(node.sizes) - 100) < 0.01, `sizes sum to 100, got ${node.sizes}`);
    for (const c of node.children) { assert.ok(!(c.type === "split" && c.direction === node.direction), "no nested same-direction splits"); walk(c); }
  };
  walk(layout.root);
  assert.deepEqual([...seen].sort(), Object.keys(layout.panes).sort(), "every pane is placed exactly once");
}

test("the default layout is one default lens over the assistant, 50/50, and parses as itself", () => {
  const layout = DEFAULT_LAYOUT("running");
  wellFormed(layout);
  assert.deepEqual(paneOrder(layout.root), ["p1", "p2"]);
  assert.deepEqual(layout.panes.p1, { id: "p1", kind: "lens", lensId: "overview", params: { focus: "auto" }, setBy: "default" });
  assert.equal(layout.panes.p2.kind, "assistant");
  assert.equal(assistantSide(layout), "column");
  assert.deepEqual(parseLayout(layout, ctx), { layout, warnings: [] });
  const ended = DEFAULT_LAYOUT("ended").panes.p1;
  assert.equal(ended.kind === "lens" ? ended.lensId : undefined, "results");
  assert.deepEqual(parseLayout(JSON.parse(JSON.stringify(layout)), ctx).layout, layout, "survives a JSON round trip");
});

test("parseLayout never throws: each failure class degrades and is named in warnings", () => {
  const base = DEFAULT_LAYOUT("running");
  for (const garbage of [undefined, null, 42, "x", [], {}, { version: 2 }, { version: 1, root: { type: "weird" }, panes: {} }]) {
    const { layout, warnings } = parseLayout(garbage, ctx);
    assert.deepEqual(layout, base, `garbage ${JSON.stringify(garbage)} resets`);
    assert.match(warnings[0], /^layout reset:/);
  }
  // Unknown lens → the phase's default lens; invalid params → defaults; bad setBy → default.
  const odd = { ...base, panes: { ...base.panes, p1: { id: "p1", kind: "lens", lensId: "stored", params: { nope: 1 }, setBy: "robot" } } };
  const fixed = parseLayout(odd, ctx);
  assert.deepEqual(fixed.layout.panes.p1, { id: "p1", kind: "lens", lensId: "overview", params: { focus: "auto" }, setBy: "default" });
  assert.match(fixed.warnings.join("\n"), /unknown lens "stored"/);
  const badParams = parseLayout({ ...base, panes: { ...base.panes, p1: { id: "p1", kind: "lens", lensId: "objects", params: { limit: 9999 }, setBy: "assistant" } } }, ctx);
  assert.equal(badParams.layout.panes.p1.kind === "lens" && badParams.layout.panes.p1.params.limit, 12);
  assert.match(badParams.warnings[0], /invalid objects parameters/);
  // what-if without its required params cannot show anything: the default lens takes its place.
  const whatIf = parseLayout({ ...base, panes: { ...base.panes, p1: { id: "p1", kind: "lens", lensId: "what-if", params: {}, setBy: "human" } } }, ctx);
  assert.equal(whatIf.layout.panes.p1.kind === "lens" && whatIf.layout.panes.p1.lensId, "overview");
  // Unknown stored panel or file panel → dropped; a missing assistant or lens → added.
  const panels: DockLayout = { version: 1, root: { type: "split", direction: "row", sizes: [1, 1, 1], children: [
    { type: "tabs", panes: ["s1"], active: "s1" }, { type: "tabs", panes: ["s2"], active: "s2" }, { type: "tabs", panes: ["f1"], active: "f1" }] },
    panes: { s1: { id: "s1", kind: "stored-panel", slug: "mine" }, s2: { id: "s2", kind: "stored-panel", slug: "theirs" }, f1: { id: "f1", kind: "file-panel", fileId: "gone" } } };
  const repaired = parseLayout(panels, { ...ctx, fileIds: ["kept"] });
  wellFormed(repaired.layout);
  assert.deepEqual(panesOf(repaired.layout).map(p => p.kind).sort(), ["assistant", "lens", "stored-panel"]);
  assert.match(repaired.warnings.join("\n"), /no stored panel "theirs"/);
  assert.match(repaired.warnings.join("\n"), /no file panel "gone"/);
  assert.match(repaired.warnings.join("\n"), /no assistant pane/);
  assert.match(repaired.warnings.join("\n"), /no lens pane/);
  // Without fileIds, file panels are trusted (the engine does not know a dev container's files).
  assert.equal(panesOf(parseLayout(panels, ctx).layout).some(p => p.kind === "file-panel"), true);
  // Duplicates and dangling references.
  const dupes = parseLayout({ version: 1, root: { type: "split", direction: "column", sizes: [50, 50], children: [
    { type: "tabs", panes: ["p1", "p1", "ghost"], active: "ghost" }, { type: "tabs", panes: ["p2", "p3"], active: "p2" }] },
    panes: { ...base.panes, p3: { id: "p3", kind: "assistant" }, orphan: { id: "orphan", kind: "assistant" } } }, ctx);
  wellFormed(dupes.layout);
  assert.deepEqual(paneOrder(dupes.layout.root), ["p1", "p2"]);
  assert.match(dupes.warnings.join("\n"), /ghost: not defined/);
  assert.match(dupes.warnings.join("\n"), /p3: a second assistant pane/);
  assert.match(dupes.warnings.join("\n"), /orphan: not placed/);
  // Too many lens panes → the extras go; too deep or too large → reset.
  let many = base;
  for (let i = 0; i < 6; i++) many = { ...many, root: { type: "split", direction: i % 2 ? "row" : "column", sizes: [50, 50], children: [many.root, { type: "tabs", panes: [`x${i}`], active: `x${i}` }] }, panes: { ...many.panes, [`x${i}`]: lens(`x${i}`) } };
  const trimmed = parseLayout({ ...many, root: { type: "split", direction: "row", sizes: [], children: Object.keys(many.panes).map(id => ({ type: "tabs" as const, panes: [id], active: id })) } }, ctx);
  assert.equal(lensPanesOf(trimmed.layout).length, LAYOUT_LIMITS.lensPanes);
  assert.match(trimmed.warnings.join("\n"), /more than 4 lens panes/);
  assert.match(parseLayout(many, ctx).warnings[0], /^layout reset: deeper/);
  const huge = { ...base, panes: { ...base.panes, p1: { ...base.panes.p1, params: { focus: "x".repeat(40_000) } } } };
  assert.match(parseLayout(huge, ctx).warnings[0], /^layout reset: larger/);
  // Nested same-direction splits merge; sizes renormalise.
  const nested: DockLayout = { version: 1, root: { type: "split", direction: "column", sizes: [2, 2], children: [
    { type: "split", direction: "column", sizes: [1, 1], children: [{ type: "tabs", panes: ["p1"], active: "p1" }, { type: "tabs", panes: ["a"], active: "a" }] }, { type: "tabs", panes: ["p2"], active: "p2" }] },
    panes: { ...base.panes, a: lens("a", "race") } };
  const merged = parseLayout(nested, ctx).layout;
  wellFormed(merged);
  assert.equal(merged.root.type === "split" && merged.root.children.length, 3);
  assert.deepEqual(merged.root.type === "split" && merged.root.sizes, [25, 25, 50]);
});

test("openPane: default placement, the reuse rule is the caller's, a 5th lens is refused, limits are refused", () => {
  const base = DEFAULT_LAYOUT("running");
  // The assistant is below: a new lens goes to the RIGHT of the last lens.
  const one = openPane(base, lens("", "race"));
  wellFormed(one.layout);
  assert.equal(one.paneId, "p3");
  assert.deepEqual(paneOrder(one.layout.root), ["p1", "p3", "p2"]);
  const top = (one.layout.root as Extract<Node, { type: "split" }>).children[0];
  assert.equal(top.type === "split" && top.direction, "row");
  // Side by side: the assistant is beside the lenses, so a new lens goes BELOW the last lens.
  const side = PRESET_LAYOUTS["side-by-side"](base);
  assert.equal(assistantSide(side), "row");
  const below = openPane(side, lens("", "race"));
  const left = (below.layout.root as Extract<Node, { type: "split" }>).children[0];
  assert.equal(left.type === "split" && left.direction, "column");
  // Explicit placement, including tabs.
  const tabbed = openPane(base, lens("", "feed"), { relativeTo: "p1", direction: "tab" });
  const group = (tabbed.layout.root as Extract<Node, { type: "split" }>).children[0];
  assert.deepEqual(group, { type: "tabs", panes: ["p1", tabbed.paneId], active: tabbed.paneId });
  assert.throws(() => openPane(base, lens("", "feed"), { relativeTo: "nope", direction: "below" }), (e: LayoutError) => e.code === "NOT_FOUND");
  // Four lenses then a fifth: refused (parseLayout would drop it later), so the caller changes a lens instead.
  let four = base;
  for (const id of ["race", "feed", "agents"]) four = openPane(four, lens("", id)).layout;
  assert.equal(lensPanesOf(four).length, 4);
  assert.throws(() => openPane(four, lens("", "rules"), { relativeTo: "p1", direction: "below" }), (e: LayoutError) => e.code === "CONFLICT" && /4 lens panes/.test(e.message));
  assert.throws(() => openPane(four, lens("", "rules")), (e: LayoutError) => e.code === "CONFLICT");
  assert.deepEqual(parseLayout(four, { phase: "running", storedSlugs: [] }).warnings, [], "four lens panes parse without warnings");
});

test("closePane refuses the assistant and the last lens; movePane relocates; setPaneParams validates", () => {
  const base = DEFAULT_LAYOUT("running");
  assert.throws(() => closePane(base, "p2"), (e: LayoutError) => e.code === "CONFLICT" && /assistant/.test(e.message));
  assert.throws(() => closePane(base, "p1"), (e: LayoutError) => e.code === "CONFLICT" && /last lens/.test(e.message));
  assert.throws(() => closePane(base, "zz"), (e: LayoutError) => e.code === "NOT_FOUND");
  const two = openPane(base, lens("", "race")).layout;
  const closed = closePane(two, "p3");
  assert.deepEqual(closed, base, "closing the second lens restores the default shape");
  // Move the assistant to the right: the root becomes a row split with the assistant last.
  const moved = movePane(base, "p2", { relativeTo: "p1", direction: "right" });
  wellFormed(moved);
  assert.equal(moved.root.type === "split" && moved.root.direction, "row");
  assert.deepEqual(paneOrder(moved.root), ["p1", "p2"]);
  assert.equal(assistantSide(moved), "row");
  assert.throws(() => movePane(base, "p1", { relativeTo: "p1", direction: "tab" }), (e: LayoutError) => e.code === "BAD_REQUEST");
  assert.throws(() => movePane(base, "nope", { relativeTo: "p1", direction: "tab" }), (e: LayoutError) => e.code === "NOT_FOUND");
  // Parameters: defaults filled, setBy recorded, invalid refused with the issues, non-lens refused.
  const set = setPaneParams(base, "p1", { focus: "goal" }, "assistant");
  assert.deepEqual(set.panes.p1, { id: "p1", kind: "lens", lensId: "overview", params: { focus: "goal" }, setBy: "assistant" });
  assert.throws(() => setPaneParams(base, "p1", { focus: "nope" }, "assistant"), (e: LayoutError) => e.code === "BAD_REQUEST" && /focus/.test(e.message));
  assert.throws(() => setPaneParams(base, "p2", {}, "assistant"), (e: LayoutError) => e.code === "BAD_REQUEST");
  const swapped = setPaneLens(base, "p1", "objects", "human");
  assert.deepEqual(swapped.panes.p1, { id: "p1", kind: "lens", lensId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "human" });
  const active = activatePane(openPane(base, lens("", "feed"), { relativeTo: "p1", direction: "tab" }).layout, "p1");
  assert.equal((active.root as Extract<Node, { type: "split" }>).children[0].type === "tabs" && ((active.root as Extract<Node, { type: "split" }>).children[0] as Extract<Node, { type: "tabs" }>).active, "p1");
});

test("presets keep every lens pane; carried layouts reset parameters; the briefing lines name panes", () => {
  const base = openPane(DEFAULT_LAYOUT("running"), lens("", "objects", { limit: 5 })).layout;
  for (const name of ["stacked", "side-by-side", "two-lenses"] as const) {
    const preset = PRESET_LAYOUTS[name](base);
    wellFormed(preset);
    assert.equal(lensPanesOf(preset).length, 2, `${name} keeps both lenses`);
    assert.ok(preset.panes.p2.kind === "assistant");
  }
  assert.equal(assistantSide(PRESET_LAYOUTS.stacked(base)), "column");
  assert.equal(assistantSide(PRESET_LAYOUTS["side-by-side"](base)), "row");
  const two = PRESET_LAYOUTS["two-lenses"](DEFAULT_LAYOUT("running"));
  assert.equal(lensPanesOf(two).length, 2, "a second lens is opened when there is only one");
  assert.equal(assistantSide(two), "row");
  const carried = carryLayout(setPaneParams(base, "p3", { limit: 3, highlight: ["o1"] }, "assistant"));
  assert.deepEqual(carried.panes.p3, { id: "p3", kind: "lens", lensId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "default" });
  assert.deepEqual(carried.root, base.root, "the arrangement is kept");
  const lines = describeLayout(setPaneParams(base, "p3", { limit: 3 }, "assistant"));
  assert.deepEqual(lines, ["[p1] overview — Situation, standing, next step (default)", "[p3] objects — Top 3 by payoff (set by you)", "[p2] this conversation (below the lenses)"]);
});
