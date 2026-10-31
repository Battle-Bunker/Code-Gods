/**
 * The panel catalogue (src/panels.ts): the 13 ids, parameters that always default (so a panel is useful with the
 * assistant off) except what-if's required ones, strict schemas, the pane captions, the default panel per phase and
 * the JSON-Schema catalogue the layout tools hand to the model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PANELS, PANEL_IDS, defaultPanelFor, defaultPanelParams, isPanelId, panelCatalog, panelSummary, parsePanelParams } from "../src/panels.ts";

test("thirteen panels, each with a title, a blurb, phases and a strict parameter schema", () => {
  assert.equal(PANEL_IDS.length, 13);
  assert.deepEqual([...PANEL_IDS].sort(), Object.keys(PANELS).sort());
  for (const id of PANEL_IDS) {
    const l = PANELS[id];
    assert.equal(l.id, id);
    assert.ok(l.title.length > 2 && l.title.length <= 40, `${id} title`);
    assert.ok(l.blurb.length > 10 && l.blurb.length <= 120, `${id} blurb`);
    assert.ok(l.phases.length > 0, `${id} phases`);
    assert.equal(l.params.safeParse({ unknownKey: 1 }).success, false, `${id} refuses unknown parameters`);
  }
});

test("every parameter is optional with a default, except what-if's objectId and calls", () => {
  for (const id of PANEL_IDS) {
    const defaults = defaultPanelParams(id);
    if (id === "what-if") { assert.equal(defaults, null); continue; }
    assert.ok(defaults, `${id} has defaults`);
    assert.deepEqual(parsePanelParams(id, undefined), { ok: true, params: defaults }, `${id}: no params means the defaults`);
  }
  assert.equal(parsePanelParams("what-if", { objectId: "o1" }).ok, false, "calls are required");
  assert.equal(parsePanelParams("what-if", { objectId: "o1", calls: [["swap", [1, 2]]] }).ok, false, "calls carry named arguments, as the engine's wire form does");
  const ok = parsePanelParams("what-if", { objectId: "o1", calls: [["swap", { a: 1, b: 2 }]] });
  assert.ok(ok.ok && ok.params.compare === undefined);
  const bad = parsePanelParams("objects", { limit: 1000, sortBy: "nope" });
  assert.ok(!bad.ok && bad.issues.some(i => i.startsWith("limit")) && bad.issues.some(i => i.startsWith("sortBy")));
  assert.deepEqual(parsePanelParams("objects", { limit: 5 }), { ok: true, params: { sortBy: "payoff", filter: "all", limit: 5, highlight: [], layout: "list", annotate: "mine" } }, "partial params fill the rest with defaults");
  assert.equal(parsePanelParams("forge", { source: "x".repeat(16385) }).ok, false, "a draft is bounded like an agent source");
  assert.equal(parsePanelParams("objects", { highlight: Array.from({ length: 9 }, (_, i) => `o${i}`) }).ok, false, "≤ 8 highlighted objects");
});

test("summaries read as pane captions", () => {
  assert.equal(panelSummary("objects", {}), "Top 12 by payoff");
  assert.equal(panelSummary("objects", { limit: 5, filter: "chips", layout: "grid" }), "Top 5 by payoff · only ones others care about · grid");
  assert.equal(panelSummary("objects", { annotate: "none" }), "Top 12 by payoff · no marks");
  assert.equal(parsePanelParams("objects", { annotate: "theirs" }).ok, false, "only your own utility can be annotated");
  assert.equal(panelSummary("race", {}), "Everyone · total payoff · last 300 s");
  assert.equal(panelSummary("bits-over-time", { objects: "ids", ids: ["a", "b"] }), "Payoff · 2 chosen objects");
  assert.equal(panelSummary("forge", { source: "def agent(x): return []", language: "python" }), "A draft · python");
  assert.equal(panelSummary("what-if", { objectId: "o", calls: [["add", { k: 1 }]], compare: [["add", { k: 2 }]] }), "1 move on one object · vs an alternative");
  assert.equal(panelSummary("objects", { limit: "many" }), "Objects by payoff", "invalid params fall back to the title");
  assert.equal(panelSummary("overview", {}), "Situation, standing, next step");
});

test("the default panel is the objects ranked by payoff everywhere except after the game ends; ids are checked", () => {
  for (const phase of ["lobby", "planning", "running", "paused"] as const) assert.equal(defaultPanelFor(phase), "objects");
  assert.equal(defaultPanelFor("ended"), "results");
  assert.equal(isPanelId("objects"), true);
  assert.equal(isPanelId("stored"), false);
  assert.equal(isPanelId(3), false);
});

test("the catalogue carries a JSON Schema per panel for the model", () => {
  const catalog = panelCatalog();
  assert.deepEqual(catalog.map(c => c.id), [...PANEL_IDS]);
  const objects = catalog.find(c => c.id === "objects")!.paramsSchema as { type: string; properties: Record<string, { default?: unknown }>; additionalProperties?: boolean; $schema?: string };
  assert.equal(objects.type, "object");
  assert.equal(objects.additionalProperties, false);
  assert.equal(objects.properties.limit.default, 12);
  assert.equal(objects.$schema, undefined);
  const whatIf = catalog.find(c => c.id === "what-if")!.paramsSchema as { required?: string[] };
  assert.deepEqual(whatIf.required, ["objectId", "calls"]);
  assert.ok(JSON.stringify(catalog).length < 20_000, "small enough to ride in a tool result");
});

test("an ended game stays inspectable: every built-in panel has data in the ended phase", () => {
  for (const id of PANEL_IDS) assert.ok(PANELS[id].phases.includes("ended"), `${id} goes blank when the game ends`);
  assert.equal(defaultPanelFor("ended"), "results", "results stays the default once the game is over");
});
