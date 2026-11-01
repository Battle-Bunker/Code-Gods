/**
 * Unit tests of the agent tool registry (src/tools.ts): the committed JSON Schema snapshot, the permission
 * matrix, and the commandId / requestId rules every surface (MCP, CLI, in-client assistant) relies on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORE_TOOLS, SHORT_MAX, TOOLS, TOOL_NAMES, buildEnvelope, envelopeNeedsGame, mayUse, tool, toolJsonSchemas, toolsFor } from "../src/tools.ts";
import { CATALOG } from "../src/catalog.ts";
import { PANEL_IDS } from "../src/panels.ts";
import { Engine } from "../src/engine.ts";
import { journalPath, runAssistant } from "../src/assistant.ts";

const READ = ["whoami", "get_rules", "get_observation", "get_events", "get_trajectories", "list_games", "get_game_history", "get_my_utility",
  "evaluate_value", "get_chat", "get_receipt", "list_setups", "get_setup", "list_panels", "get_panel", "get_layout",
  "run_code", "get_code_run", "list_code_runs", "load_skill"];
const ACT = ["validate_agent", "summon_agent", "destroy_agent", "set_ready", "send_chat", "pause_game", "wake_engine",
  "save_setup", "duplicate_setup", "delete_setup", "save_panel", "rollback_panel", "delete_panel", "open_panel", "set_panel_params", "move_pane", "close_pane"];
const OWNER = ["get_room_state", "get_ai_catalog", "update_settings", "start_game", "resume_game", "end_game", "add_ai", "remove_ai"];
/** Tools whose executor reaches no public function: an engine-internal path (the sandbox, the skills). */
const ENGINE_INTERNAL = ["evaluate_value", "run_code"];
const uuid = "6a1f8b7e-3c2d-4e5f-8a9b-0c1d2e3f4a5b";

test("registry: exactly the planned tools, snake_case, each with title, description, annotations and permission", () => {
  assert.deepEqual([...TOOL_NAMES].sort(), [...READ, ...ACT, ...OWNER].sort());
  for (const t of TOOLS) {
    assert.match(t.name, /^[a-z]+(_[a-z]+)*$/);
    assert.ok(t.title.length > 2 && t.description.length > 20, t.name);
    assert.equal(typeof t.annotations.readOnlyHint, "boolean");
    assert.equal(typeof t.annotations.destructiveHint, "boolean");
  }
  for (const name of READ) assert.equal(tool(name).permission, "read", name);
  for (const name of ACT) assert.equal(tool(name).permission, "act", name);
  for (const name of OWNER) assert.equal(tool(name).permission, "owner", name);
  for (const name of READ) assert.equal(tool(name).annotations.readOnlyHint, true, `${name} is read-only`);
  for (const name of ["destroy_agent", "end_game", "remove_ai", "delete_panel", "delete_setup"]) assert.equal(tool(name).annotations.destructiveHint, true, name);
});

test("descriptions come from the catalogue unless a tool wraps a shared function and says its own about", () => {
  const shared = new Set(["commands.submit", "layout.set", "auth.user.me", "rooms.get"]);
  for (const t of TOOLS) {
    const first = t.functions[0];
    if (!first) { assert.ok(ENGINE_INTERNAL.includes(t.name), `${t.name}: only engine-internal tools reach no public function`); continue; }
    if (!shared.has(first)) assert.ok(t.description.startsWith(CATALOG[first as keyof typeof CATALOG].ai.description), `${t.name} starts with ${first}'s AI description`);
    else assert.ok(!t.description.startsWith(CATALOG[first as keyof typeof CATALOG].ai.description), `${t.name} describes itself, not the shared ${first}`);
    assert.ok(t.description.length >= 40 && t.description.length <= 700, `${t.name} description is bounded (${t.description.length})`);
  }
  assert.equal(tool("wake_engine").description, CATALOG["activity.touch"].ai.description, "a tool without a note is the catalogue text");
  assert.match(tool("summon_agent").description, /confirms first/);
  for (const t of TOOLS) assert.ok(t.title.length >= 3 && t.title.length <= 60, `${t.name} has a short title`);
});

test("every tool has a one-line short form for the index; the core set is a few existing tools including the skill loader", () => {
  const shorts = new Set<string>();
  for (const t of TOOLS) {
    assert.ok(t.short.length >= 20 && t.short.length <= SHORT_MAX, `${t.name}: short is 20..${SHORT_MAX} characters (${t.short.length})`);
    assert.match(t.short, /^[A-Z][^\n]*\.$/, `${t.name}: one sentence`);
    assert.doesNotMatch(t.short, /confirm/i, `${t.name}: the index adds "(confirmed)" itself`);
    assert.ok(!shorts.has(t.short), `${t.name}: short lines are distinct`);
    shorts.add(t.short);
  }
  assert.ok(CORE_TOOLS.length <= 6 && CORE_TOOLS.every(name => TOOL_NAMES.includes(name)) && CORE_TOOLS.includes("load_skill"));
  assert.ok(tool("open_panel").description.length <= 450, "a core tool's description is short; its guidance lives in the screen skill");
});

test("layout tools: open_panel takes a built-in panel id from the enum or a stored panel's slug; places are validated; ids are bounded", () => {
  const open = tool("open_panel");
  assert.deepEqual((toolJsonSchemas().open_panel.input as { properties: { panelId: { enum: string[] } } }).properties.panelId.enum, [...PANEL_IDS]);
  assert.equal(open.input.safeParse({ panelId: "objects" }).success, true, "params are optional");
  assert.equal(open.input.safeParse({ panelId: "stored" }).success, false, "a built-in panel id comes from the enum");
  assert.equal(open.input.safeParse({ slug: "my-panel" }).success, true, "a stored panel by slug");
  assert.equal(open.input.safeParse({ slug: "Not A Slug" }).success, false, "slugs are kebab-case");
  assert.equal(open.input.safeParse({ panelId: "objects", place: { direction: "sideways" } }).success, false);
  assert.equal(open.input.safeParse({ panelId: "objects", place: { relativeTo: "p1", direction: "tab" } }).success, true);
  assert.equal(tool("move_pane").input.safeParse({ paneId: "p2" }).success, false, "a move needs a place");
  assert.equal(tool("set_panel_params").input.safeParse({ paneId: "p1" }).success, false, "params are required here");
  assert.equal(tool("close_pane").input.safeParse({ paneId: "" }).success, false);
  for (const name of ["get_layout", "open_panel", "set_panel_params", "move_pane", "close_pane"]) assert.ok(tool(name).functions.includes(name === "get_layout" ? "layout.current" : "layout.set"), name);
});

test("permission matrix: a grant lists exactly the tools at or below it", () => {
  const names = (p: "read" | "act" | "owner") => toolsFor(p).map(t => t.name).sort();
  assert.deepEqual(names("read"), [...READ].sort());
  assert.deepEqual(names("act"), [...READ, ...ACT].sort());
  assert.deepEqual(names("owner"), [...READ, ...ACT, ...OWNER].sort());
  assert.equal(mayUse("read", tool("send_chat")), false);
  assert.equal(mayUse("act", tool("start_game")), false);
  assert.equal(mayUse("owner", tool("summon_agent")), true);
});

test("JSON Schema: the committed snapshot matches the zod definitions", () => {
  const committed = JSON.parse(readFileSync(new URL("../src/tools.schema.json", import.meta.url), "utf8"));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(toolJsonSchemas())),
    "src/tools.schema.json is stale: run `pnpm --filter @workspace/player-client gen:tools` and commit it");
  for (const [name, s] of Object.entries(committed as Record<string, { input: any; output: any }>)) {
    assert.equal(s.input.type, "object", name);
    assert.equal(s.output.type, "object", name);
    assert.ok(!JSON.stringify(s.input).includes("roomId"), `${name}: the room comes from the grant, never from arguments`);
  }
  assert.ok(committed.summon_agent.input.required.includes("commandId"));
  assert.ok(committed.start_game.input.required.includes("requestId"));
});

test("commandId rules: required for summon, destroy and pause; optional (generated) for the rest", () => {
  for (const name of ["summon_agent", "destroy_agent", "pause_game"]) {
    const t = tool(name);
    const base = name === "summon_agent" ? { source: "x" } : name === "destroy_agent" ? { agentId: "a" } : {};
    assert.equal(t.input.safeParse(base).success, false, `${name} without commandId`);
    assert.equal(t.input.safeParse({ ...base, commandId: "not-a-uuid" }).success, false);
    assert.equal(t.input.safeParse({ ...base, commandId: uuid }).success, true);
  }
  for (const name of ["validate_agent", "set_ready", "send_chat"]) {
    const base = name === "validate_agent" ? { source: "x" } : name === "set_ready" ? { ready: true } : { text: "hi" };
    assert.equal(tool(name).input.safeParse(base).success, true, name);
  }
  for (const name of ["update_settings", "start_game", "resume_game", "end_game", "add_ai", "remove_ai"]) {
    assert.equal(tool(name).input.safeParse({ revision: 0, aiAgentId: "x", deityId: "y" }).success, false, `${name} needs a requestId`);
  }
  assert.equal(tool("summon_agent").input.safeParse({ source: "x", commandId: uuid, roomId: "other" }).success, false, "unknown keys are refused");
  assert.equal((tool("summon_agent").input.parse({ source: "x", commandId: uuid }) as { waitMs: number }).waitMs, 90_000, "waitMs defaults to 90 s");
  assert.equal(tool("summon_agent").input.safeParse({ source: "x", commandId: uuid, waitMs: 10 * 60_000 }).success, false, "waitMs is bounded");
});

test("buildEnvelope: v3 envelopes with the game's language and id; the given commandId is kept", () => {
  const game = { gameId: "g1", language: "typescript" as const };
  const summon = buildEnvelope("summon_agent", { source: "function agent(x) { return [add(1)]; }", commandId: uuid }, game);
  assert.deepEqual(summon, { version: "code-gods.player.v3", commandId: uuid, gameId: "g1",
    command: { type: "summon", language: "typescript", source: "function agent(x) { return [add(1)]; }" } });
  const chat = buildEnvelope("send_chat", { text: "hello" }, game);
  assert.match(chat.commandId, /^[0-9a-f-]{36}$/);
  assert.equal(chat.gameId, undefined, "chat is a room command: no gameId");
  assert.deepEqual(chat.command, { type: "chat", text: "hello" });
  assert.deepEqual(buildEnvelope("set_ready", { ready: false, commandId: uuid }, game).command, { type: "ready", ready: false });
  assert.deepEqual(buildEnvelope("pause_game", { commandId: uuid, gameId: "g0" }, game).gameId, "g0", "an explicit gameId wins");
  assert.deepEqual(buildEnvelope("destroy_agent", { agentId: "a1", commandId: uuid }, game).command, { type: "destroy", agentId: "a1" });
  assert.deepEqual(buildEnvelope("validate_agent", { source: "def agent(x):\n    return []", language: "python", commandId: uuid }, game).command.type, "validate");
  assert.throws(() => buildEnvelope("summon_agent", { source: "x", commandId: uuid }, { gameId: undefined, language: undefined }), /No game/);
});

test("envelopeNeedsGame: only game commands without a gameId, or agents without a language, read the current game", () => {
  assert.equal(envelopeNeedsGame("send_chat", { text: "hi" }), false);
  assert.equal(envelopeNeedsGame("set_ready", { ready: true }), false);
  assert.equal(envelopeNeedsGame("pause_game", {}), true);
  assert.equal(envelopeNeedsGame("pause_game", { gameId: "g" }), false);
  assert.equal(envelopeNeedsGame("summon_agent", { gameId: "g" }), true, "the language comes from the game");
  assert.equal(envelopeNeedsGame("summon_agent", { gameId: "g", language: "python" }), false);
});

/** An engine site whose /mcp loses the summon's answer (a dropped connection), for the CLI's command journal. */
function lostAnswers(seen: string[]) {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/device/token")) {
      return Response.json({ token: "eyJ.a.b", expiresAt: Date.now() + 600_000, roomId: "room1", permission: "act", credentialId: "cred1", credentialExpiresAt: Date.now() + 86400_000 });
    }
    const body = JSON.parse(String(init?.body ?? "{}"));
    seen.push(body.params?.name ?? body.method);
    if (body.params?.name === "summon_agent") throw new TypeError("socket hang up");
    if (body.params?.name === "get_receipt") {
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { untrusted: true, notice: "", data: { status: "not_found", commandId: uuid } } } });
    }
    return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "no" } });
  }) as typeof fetch;
}

test("assistant command: a lost answer is uncertain and stays in the journal; a JSON-RPC refusal is rejected", async () => {
  const seen: string[] = [];
  const env = { CODE_GODS_STATE_DIR: mkdtempSync(join(tmpdir(), "cg-journal-")) };
  const engine = new Engine({ engineUrl: "https://dep-1.convex.site", credential: "cgc_" + "A".repeat(43) }, { fetch: lostAnswers(seen) });
  const envelope = { version: "code-gods.player.v3", commandId: uuid, gameId: "g1", command: { type: "summon", language: "typescript", source: "function agent(x) { return [add(1)]; }" } };
  const io = { readStdin: async () => JSON.stringify(envelope), env };
  const lost = await runAssistant(engine, "command", {}, io) as { status: string };
  assert.equal(lost.status, "uncertain", "the summon may have been applied: never 'rejected'");
  assert.equal(JSON.parse(readFileSync(journalPath("cred1", env).file, "utf8"))[uuid].status, "uncertain");
  // Resending without --retry-unknown checks the receipt and sends nothing.
  assert.equal((await runAssistant(engine, "command", {}, io) as { status: string }).status, "uncertain");
  assert.deepEqual(seen, ["summon_agent", "get_receipt"]);
  const chat = { version: "code-gods.player.v3", commandId: crypto.randomUUID(), command: { type: "chat", text: "hi" } };
  await assert.rejects(runAssistant(engine, "command", {}, { readStdin: async () => JSON.stringify(chat), env }),
    (e: Error & { extra?: { status?: string } }) => e.extra?.status === "rejected");
});
