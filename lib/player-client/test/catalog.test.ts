/**
 * The catalogue of public Convex functions (src/catalog.ts): the rules the type system cannot state. What would
 * break: a player affordance the assistant cannot reach and nobody said why; a function with neither a palette
 * command nor a reason; a tool and an entry disagreeing about who reaches whom; a tooltip written as model
 * instructions; a Convex upgrade silently widening PublicFunctionPath (the regex walk of the committed api.d.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOG, CATALOG_LIMITS, CATALOG_PATHS, paletteEntries, type CatalogEntry, type PublicFunctionPath } from "../src/catalog.ts";
import { TOOLS, tool, toolsReaching } from "../src/tools.ts";
import { CATALOG_DOC_END, catalogMarkdown, withCatalogDoc } from "../src/catalog-doc.ts";

const engine = new URL("../../../artifacts/engine/convex/", import.meta.url);

/** Every public function in the engine's sources, as "module.path.export", walked from the generated module list. */
function walkPublicFunctions(): Map<string, "query" | "mutation" | "action"> {
  const api = readFileSync(new URL("_generated/api.d.ts", engine), "utf8");
  const block = api.slice(api.indexOf("declare const fullApi"), api.indexOf("}>;", api.indexOf("declare const fullApi")));
  const modules = [...block.matchAll(/^\s+"?([\w/]+)"?: typeof \w+;/gm)].map(m => m[1]);
  assert.ok(modules.length > 30, "the generated module list was found");
  const found = new Map<string, "query" | "mutation" | "action">();
  for (const module of modules) {
    const source = readFileSync(new URL(`${module}.ts`, engine), "utf8");
    for (const m of source.matchAll(/^export const (\w+) = (query|mutation|action)\(/gm)) found.set(`${module.replace(/\//g, ".")}.${m[1]}`, m[2] as "query" | "mutation" | "action");
  }
  return found;
}

test("the catalogue lists exactly the public functions in the engine's sources, with their kinds", () => {
  const found = walkPublicFunctions();
  assert.deepEqual([...CATALOG_PATHS].sort(), [...found.keys()].sort());
  for (const [path, kind] of found) assert.equal(CATALOG[path as keyof typeof CATALOG].kind, kind, `${path} is a ${kind}`);
  assert.equal(found.size, 73);
  assert.ok(found.has("layout.current") && found.has("layout.set") && !found.has("panels.place") && !found.has("panels.layout"));
});

test("every player or owner affordance reaches the assistant through a tool, or says why not; and has a palette command, or says why not", () => {
  for (const path of CATALOG_PATHS) {
    const e: CatalogEntry = CATALOG[path];
    if (e.audience !== "player" && e.audience !== "owner") continue;
    if (!e.tools.length) assert.ok(e.why && e.why.length > 20, `${path}: no tool and no why`);
    if (!e.palette) assert.ok(e.why && e.why.length > 20, `${path}: no palette command and no why`);
  }
  // The gaps the design names are the only ones without a tool among player/owner entries.
  const noTool = CATALOG_PATHS.filter(p => (CATALOG[p].audience === "player" || CATALOG[p].audience === "owner") && !CATALOG[p].tools.length).sort();
  assert.deepEqual(noTool, ["assistant.cancel", "assistant.confirm", "assistant.editQueued", "assistant.removeQueued", "assistant.send", "assistant.sendQueued", "assistant.setPrefs", "assistant.status", "assistant.thread", "assistant.threads", "assistant.transcript",
    "games.resolve", "games.view", "panels.setEnabled", "player.game", "rooms.create", "rooms.join", "rooms.leave", "rooms.list"]);
});

test("tools and entries agree in both directions; kinds match annotations", () => {
  for (const path of CATALOG_PATHS) {
    assert.deepEqual([...CATALOG[path].tools].sort(), toolsReaching(path).sort(), `${path}: entry.tools equals the tools whose functions name it`);
  }
  for (const t of TOOLS) {
    const functions = t.functions as readonly PublicFunctionPath[];
    for (const path of functions) assert.ok(CATALOG[path].tools.includes(t.name as never), `${t.name} is listed by ${path}`);
    // A tool wrapping only queries is read-only; a read-only tool wraps no mutation-only function (validate_agent is a read-only command).
    const kinds = functions.map(f => CATALOG[f].kind);
    if (kinds.length && kinds.every(k => k === "query")) assert.equal(t.annotations.readOnlyHint, true, `${t.name} wraps only queries`);
    if (t.annotations.readOnlyHint && kinds.length && t.name !== "validate_agent") assert.ok(kinds.some(k => k === "query") || t.functions.includes("manifest.get"), `${t.name} is read-only but reaches ${kinds}`);
  }
  // The registry covers every tool name the catalogue mentions.
  const mentioned = new Set(CATALOG_PATHS.flatMap(p => CATALOG[p].tools));
  for (const name of mentioned) assert.ok(tool(name), `${name} exists`);
  assert.equal(mentioned.size, TOOLS.length - 2, "every tool but evaluate_value and run_code (engine-internal) is reachable from an entry");
});

test("human text is short, verb-first and never model instructions; AI text is bounded; titles are unique", () => {
  const titles = new Map<string, string>();
  for (const path of CATALOG_PATHS) {
    const { human, ai } = CATALOG[path];
    assert.ok(human.title.length >= 4 && human.title.length <= CATALOG_LIMITS.title, `${path} title length`);
    assert.match(human.title, /^[A-Z][a-z]+ /, `${path}: the title starts with a verb ("${human.title}")`);
    assert.ok(human.tooltip.length >= 20 && human.tooltip.length <= CATALOG_LIMITS.tooltip, `${path} tooltip length`);
    assert.equal((human.tooltip.match(/[.!?](\s|$)/g) ?? []).length, 1, `${path}: one sentence ("${human.tooltip}")`);
    assert.doesNotMatch(human.tooltip, /commandId|requestId|resend|idempotent|cursor|\bnull\b/i, `${path}: no model instructions in the tooltip`);
    assert.ok(ai.description.length >= 30 && ai.description.length <= CATALOG_LIMITS.description, `${path} description length`);
    assert.equal(titles.get(human.title), undefined, `${path}: title "${human.title}" also used by ${titles.get(human.title)}`);
    titles.set(human.title, path);
  }
});

test("docs/engine-api.md carries the current generated catalogue table", () => {
  const doc = readFileSync(new URL("../../../docs/engine-api.md", import.meta.url), "utf8");
  assert.equal(doc, withCatalogDoc(doc), "docs/engine-api.md is stale: run `pnpm --filter @workspace/player-client gen:catalog` and commit it");
  assert.ok(doc.includes(CATALOG_DOC_END) && doc.includes("| `layout.set` |"));
  assert.equal(catalogMarkdown().split("\n").length, CATALOG_PATHS.length + 2);
});

test("palette specs name surfaces and groups; the engine UI never gets player-only commands", () => {
  for (const { path, palette } of [...paletteEntries("player"), ...paletteEntries("engine")]) {
    assert.ok(palette.label.length >= 4 && palette.label.length <= 40, `${path} label`);
    assert.ok(palette.surfaces.length > 0);
  }
  const engineLabels = paletteEntries("engine").map(e => e.palette.label);
  assert.ok(engineLabels.includes("Start the game") && engineLabels.includes("Create a room"));
  assert.ok(!engineLabels.includes("Make a panel…") && !engineLabels.includes("Arrange the dock…"), "panels and the dock are player-client affairs");
  const playerLabels = paletteEntries("player").map(e => e.palette.label);
  assert.ok(playerLabels.includes("Arrange the dock…") && playerLabels.includes("Ask the assistant…") && !playerLabels.includes("Create a room"));
  assert.equal(CATALOG["rooms.endActiveGame"].palette?.confirm, "modal");
  assert.equal(CATALOG["panels.remove"].palette?.confirm, "inline");
});
