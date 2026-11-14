/** The dynamic directory and the generated surfaces: what each offers, how it reads, how the CLI parses. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRINCIPALS, assistantTools, availableAffordances, cliCommands, mcpTools, paletteFor, parseCli, refusal, searchPalette,
  AFFORDANCES, type AffordanceContext,
} from "../src/index.ts";

const ctx = (context: AffordanceContext["context"], who: keyof typeof PRINCIPALS, more: Partial<AffordanceContext> = {}): AffordanceContext =>
  ({ context, principal: PRINCIPALS[who]!, ...more });
const ids = (c: AffordanceContext) => availableAffordances(c).map(o => o.affordance.id);

test("what is offered follows the context and the caller", () => {
  assert.ok(ids(ctx("live", "seated")).includes("agent.summon"));
  assert.ok(!ids(ctx("live", "member")).includes("agent.summon"), "a spectator cannot summon");
  assert.ok(!ids(ctx("ended", "seated")).includes("agent.summon"), "nobody summons after the end");
  assert.ok(ids(ctx("room", "owner")).includes("game.start"));
  assert.ok(!ids(ctx("room", "seated")).includes("game.start"));
  assert.deepEqual(ids(ctx("signedOut", "visitor")).sort(), ["account.signIn", "view.showGlossary"]);
  assert.ok(ids(ctx("replay", "member")).includes("replay.step"));
  assert.ok(!ids(ctx("live", "member")).includes("replay.step"));
});

test("a credential's grant narrows the offer", () => {
  const read = ids(ctx("live", "seatedOwner", { grant: "read" }));
  assert.ok(read.includes("object.read") && !read.includes("agent.summon") && !read.includes("game.end"));
  const act = ids(ctx("live", "seatedOwner", { grant: "act" }));
  assert.ok(act.includes("agent.summon") && !act.includes("game.end"));
});

test("dynamic checks dim an affordance with a reason and a fix", () => {
  const summon = availableAffordances(ctx("live", "seated", { game: { phase: "live", energy: 0 } })).find(o => o.affordance.id === "agent.summon")!;
  assert.deepEqual(summon.availability, { ok: false, reason: "You have no energy left; it accrues over time." });
  const start = availableAffordances(ctx("room", "owner", { game: { phase: "planning", players: 1, minPlayers: 3 } })).find(o => o.affordance.id === "game.start")!;
  assert.deepEqual(start.availability, { ok: false, reason: "Needs 3 players; 1 seated.", fix: "seats.fillPracticePartners" });
  assert.equal(refusal(AFFORDANCES["game.pause"], ctx("live", "seated", { game: { phase: "live", pauseUsed: true } }))?.reason, "You have used your one pause.");
  assert.equal(refusal(AFFORDANCES["game.end"], ctx("live", "seated"))?.reason, "Only the room owner can do this.");
  assert.equal(refusal(AFFORDANCES["agent.summon"], ctx("ended", "seated"))?.reason, "Not available after the game.");
  assert.equal(refusal(AFFORDANCES["agent.summon"], ctx("live", "seated")), null);
});

test("the assistant's tools: model-safe names, JSON Schema, spending and destruction spelled out", () => {
  const tools = assistantTools(ctx("live", "seatedOwner"));
  const summon = tools.find(t => t.name === "agent_summon")!;
  assert.match(summon.description, /ask before calling/);
  assert.deepEqual((summon.input_schema as { required: string[] }).required.sort(), ["language", "source"]);
  assert.match(tools.find(t => t.name === "game_end")!.description, /Cannot be undone/);
  assert.match(tools.find(t => t.name === "view_pinRepresentation")!.description, /Changes what the human sees/);
  for (const t of tools) assert.match(t.name, /^[a-zA-Z0-9_-]{1,64}$/);
  assert.ok(!tools.some(t => t.name === "account_approveConnection"), "consent is a human's click");
});

test("MCP tools: annotations from the declaration, results wrapped as untrusted", () => {
  const tools = mcpTools(ctx("live", "seatedOwner"));
  const read = tools.find(t => t.name === "object_read")!;
  assert.deepEqual([read.annotations.readOnlyHint, read.annotations.destructiveHint, read.annotations.idempotentHint], [true, false, true]);
  const destroy = tools.find(t => t.name === "agent_destroy")!;
  assert.deepEqual([destroy.annotations.readOnlyHint, destroy.annotations.destructiveHint, destroy.annotations.idempotentHint], [false, true, true]);
  const out = read.outputSchema as { properties: Record<string, { const?: unknown }>; required: string[] };
  assert.equal(out.properties.untrusted!.const, true);
  assert.deepEqual(out.required.sort(), ["data", "notice", "untrusted"]);
});

test("the CLI: one command per affordance, flags from the schema", () => {
  const summon = cliCommands().find(c => c.id === "agent.summon")!;
  assert.deepEqual(summon.words, ["agent", "summon"]);
  assert.match(summon.usage, /^agent summon --language <string> --source <string> \[--name <string>\]/);
  assert.ok(cliCommands().some(c => c.words.join(" ") === "view pin-representation"));
  assert.ok(!cliCommands().some(c => c.id === "account.signIn"));
});

test("the CLI parses flags and JSON and validates with the affordance's schema", () => {
  assert.deepEqual(parseCli(["agent", "summon", "--language", "python", "--source=def agent(o): return None", "--share", "0.5"]),
    { ok: true, id: "agent.summon", args: { language: "python", source: "def agent(o): return None", share: 0.5 } });
  assert.deepEqual(parseCli(["room", "set-spectator", "--no-spectator"]), { ok: true, id: "room.setSpectator", args: { spectator: false } });
  assert.deepEqual(parseCli(["call", "object.read", '{"objectId":"o1","rep":"si"}']), { ok: true, id: "object.read", args: { objectId: "o1", rep: "si" } });
  assert.deepEqual(parseCli(["objects", "list"]), { ok: true, id: "objects.list", args: { sort: "points", limit: 20 } });
  const bad = parseCli(["agent", "summon", "--language", "cobol", "--source", "x"]);
  assert.ok(!bad.ok && /language/.test(bad.error));
  assert.deepEqual(parseCli(["agent", "summon", "--colour", "red"]), { ok: false, error: "Unknown flag --colour for agent summon" });
  assert.deepEqual(parseCli(["call", "account.approveConnection", "{}"]), { ok: false, error: "Unknown affordance: account.approveConnection" });
});

test("the palette: entries with search text, aliases find them, available rows first", () => {
  const entries = paletteFor(ctx("room", "owner", { game: { phase: "planning", players: 1, minPlayers: 3 } }));
  assert.equal(searchPalette(entries, "kick bot")[0]!.id, "seats.removeAi");
  const start = searchPalette(entries, "start");
  assert.equal(start[start.length - 1]!.id, "game.start", "dimmed rows rank last");
  assert.ok(entries.find(e => e.id === "game.start")!.searchText.includes("deal"));
  assert.equal(entries.find(e => e.id === "game.start")!.needsInput, false);
  assert.equal(entries.find(e => e.id === "seats.removeAi")!.needsInput, true);
  assert.ok(paletteFor(ctx("home", "signedIn")).some(e => e.id === "account.approveConnection"), "consent is on the palette: a human's click");
});
