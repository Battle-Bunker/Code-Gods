/**
 * Unit tests of the agent tool registry (src/tools.ts): the committed JSON Schema snapshot, the permission
 * matrix, and the commandId / requestId rules every surface (MCP, CLI, in-client assistant) relies on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOOLS, TOOL_NAMES, buildEnvelope, mayUse, tool, toolJsonSchemas, toolsFor } from "../src/tools.ts";

const READ = ["whoami", "get_rules", "get_observation", "get_events", "get_trajectories", "list_games", "get_game_history", "get_my_utility",
  "evaluate_value", "get_chat", "get_receipt"];
const ACT = ["validate_agent", "summon_agent", "destroy_agent", "set_ready", "send_chat", "pause_game", "wake_engine"];
const OWNER = ["get_room_state", "get_ai_catalog", "update_settings", "start_game", "resume_game", "end_game", "add_ai", "remove_ai"];
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
  for (const name of ["destroy_agent", "end_game", "remove_ai"]) assert.equal(tool(name).annotations.destructiveHint, true, name);
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
  assert.equal(tool("summon_agent").input.parse({ source: "x", commandId: uuid }).waitMs, 90_000, "waitMs defaults to 90 s");
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
