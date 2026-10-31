/**
 * The lens catalogue (src/lenses.ts): the 13 ids, parameters that always default (so a lens is useful with the
 * assistant off) except what-if's required ones, strict schemas, the pane captions, the default lens per phase and
 * the JSON-Schema catalogue the layout tools hand to the model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LENSES, LENS_IDS, defaultLensFor, defaultLensParams, isLensId, lensCatalog, lensSummary, parseLensParams } from "../src/lenses.ts";

test("thirteen lenses, each with a title, a blurb, phases and a strict parameter schema", () => {
  assert.equal(LENS_IDS.length, 13);
  assert.deepEqual([...LENS_IDS].sort(), Object.keys(LENSES).sort());
  for (const id of LENS_IDS) {
    const l = LENSES[id];
    assert.equal(l.id, id);
    assert.ok(l.title.length > 2 && l.title.length <= 40, `${id} title`);
    assert.ok(l.blurb.length > 10 && l.blurb.length <= 120, `${id} blurb`);
    assert.ok(l.phases.length > 0, `${id} phases`);
    assert.equal(l.params.safeParse({ unknownKey: 1 }).success, false, `${id} refuses unknown parameters`);
  }
});

test("every parameter is optional with a default, except what-if's objectId and calls", () => {
  for (const id of LENS_IDS) {
    const defaults = defaultLensParams(id);
    if (id === "what-if") { assert.equal(defaults, null); continue; }
    assert.ok(defaults, `${id} has defaults`);
    assert.deepEqual(parseLensParams(id, undefined), { ok: true, params: defaults }, `${id}: no params means the defaults`);
  }
  assert.equal(parseLensParams("what-if", { objectId: "o1" }).ok, false, "calls are required");
  const ok = parseLensParams("what-if", { objectId: "o1", calls: [["swap", [1, 2]]] });
  assert.ok(ok.ok && ok.params.compare === undefined);
  const bad = parseLensParams("objects", { limit: 1000, sortBy: "nope" });
  assert.ok(!bad.ok && bad.issues.some(i => i.startsWith("limit")) && bad.issues.some(i => i.startsWith("sortBy")));
  assert.deepEqual(parseLensParams("objects", { limit: 5 }), { ok: true, params: { sortBy: "payoff", filter: "all", limit: 5, highlight: [], layout: "list" } }, "partial params fill the rest with defaults");
  assert.equal(parseLensParams("forge", { source: "x".repeat(16385) }).ok, false, "a draft is bounded like an agent source");
  assert.equal(parseLensParams("objects", { highlight: Array.from({ length: 9 }, (_, i) => `o${i}`) }).ok, false, "≤ 8 highlighted objects");
});

test("summaries read as pane captions", () => {
  assert.equal(lensSummary("objects", {}), "Top 12 by payoff");
  assert.equal(lensSummary("objects", { limit: 5, filter: "chips", layout: "grid" }), "Top 5 by payoff · only ones others care about · grid");
  assert.equal(lensSummary("race", {}), "Everyone · total payoff · last 300 s");
  assert.equal(lensSummary("bits-over-time", { objects: "ids", ids: ["a", "b"] }), "Payoff · 2 chosen objects");
  assert.equal(lensSummary("forge", { source: "def agent(x): return []", language: "python" }), "A draft · python");
  assert.equal(lensSummary("what-if", { objectId: "o", calls: [["add", [1]]], compare: [["add", [2]]] }), "1 move on one object · vs an alternative");
  assert.equal(lensSummary("objects", { limit: "many" }), "Objects by payoff", "invalid params fall back to the title");
  assert.equal(lensSummary("overview", {}), "Situation, standing, next step");
});

test("the default lens is overview everywhere except after the game ends; ids are checked", () => {
  for (const phase of ["lobby", "planning", "running", "paused"] as const) assert.equal(defaultLensFor(phase), "overview");
  assert.equal(defaultLensFor("ended"), "results");
  assert.equal(isLensId("objects"), true);
  assert.equal(isLensId("stored"), false);
  assert.equal(isLensId(3), false);
});

test("the catalogue carries a JSON Schema per lens for the model", () => {
  const catalog = lensCatalog();
  assert.deepEqual(catalog.map(c => c.id), [...LENS_IDS]);
  const objects = catalog.find(c => c.id === "objects")!.paramsSchema as { type: string; properties: Record<string, { default?: unknown }>; additionalProperties?: boolean; $schema?: string };
  assert.equal(objects.type, "object");
  assert.equal(objects.additionalProperties, false);
  assert.equal(objects.properties.limit.default, 12);
  assert.equal(objects.$schema, undefined);
  const whatIf = catalog.find(c => c.id === "what-if")!.paramsSchema as { required?: string[] };
  assert.deepEqual(whatIf.required, ["objectId", "calls"]);
  assert.ok(JSON.stringify(catalog).length < 20_000, "small enough to ride in a tool result");
});
