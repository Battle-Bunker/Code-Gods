/**
 * Pure rules of the in-client assistant (convex/assistant/rules.ts), no backend: which tool calls need the player's
 * confirmation, deterministic command ids (UUIDv5 of turn and call), the tools offered to the model per permission,
 * the ids the engine (never the model) puts into command arguments, and bounded JSON for stored tool data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { OWNER_TOOLS } from "@workspace/player-client/tools";
import {
  LIMITS, argsLimit, callLimitProblem, clipJson, commandIdFor, modelTools, needsConfirmation, prepareArgs, summarize, uuidv5,
} from "../../convex/assistant/rules.ts";

const sha1 = (bytes: Uint8Array) => new Uint8Array(createHash("sha1").update(bytes).digest());
const DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

test("uuidv5 matches the RFC 9562 example; command ids depend only on (turn, call)", () => {
  assert.equal(uuidv5("www.example.com", DNS, sha1), "2ed6657d-e927-568b-95e1-2665a8aea6a2");
  const a = commandIdFor("turn1", "toolu_1", sha1);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(commandIdFor("turn1", "toolu_1", sha1), a, "replays derive the same id");
  assert.notEqual(commandIdFor("turn1", "toolu_2", sha1), a);
  assert.notEqual(commandIdFor("turn2", "toolu_1", sha1), a);
  assert.notEqual(commandIdFor("turn1t", "oolu_1", sha1), commandIdFor("turn1", "toolu_1", sha1), "the parts are delimited");
});

test("public chat, owner tools, pauses, destroys and panel and setup deletion always ask; summons ask unless auto-approved within budget; layout tools never", () => {
  for (const tool of ["send_chat", "start_game", "update_settings", "end_game", "add_ai", "get_room_state", "delete_panel", "delete_setup", "pause_game", "destroy_agent"]) {
    assert.equal(needsConfirmation(tool, {}, { autoApproveSummonBits: 1e9, validatedCost: 1 }), true, tool);
  }
  for (const tool of ["get_observation", "whoami", "validate_agent", "set_ready", "save_panel", "rollback_panel", "list_panels", "wake_engine", "list_setups", "save_setup",
    "get_layout", "open_panel", "set_panel_params", "open_panel", "move_pane", "close_pane"]) {
    assert.equal(needsConfirmation(tool, {}, {}), false, tool);
  }
  assert.equal(needsConfirmation("summon_agent", {}, {}), true, "no auto-approval set");
  assert.equal(needsConfirmation("summon_agent", {}, { autoApproveSummonBits: 50 }), true, "no validated cost known");
  assert.equal(needsConfirmation("summon_agent", {}, { autoApproveSummonBits: 50, validatedCost: 50 }), false, "within the limit (inclusive)");
  assert.equal(needsConfirmation("summon_agent", {}, { autoApproveSummonBits: 50, validatedCost: 50.5 }), true, "over the limit");
  assert.equal(needsConfirmation("summon_agent", {}, { autoApproveSummonBits: 0, validatedCost: 0 }), true, "0 means off");
});

test("the model sees only the tools its grant may use, without command or request ids", () => {
  const names = (p: "read" | "act" | "owner") => modelTools(p).map(t => t.name);
  assert.ok(names("read").includes("get_observation") && !names("read").includes("summon_agent") && !names("read").includes("save_panel"));
  assert.ok(names("act").includes("summon_agent") && names("act").includes("save_panel"));
  assert.ok(!names("act").includes("start_game") && !names("act").includes("get_room_state"), "owner tools absent for act");
  assert.ok(names("owner").includes("start_game"));
  for (const t of modelTools("owner")) {
    const schema = t.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    const keys = [...Object.keys(schema.properties ?? {}), ...(schema.required ?? [])];
    assert.ok(!keys.includes("commandId") && !keys.includes("requestId"), `${t.name} has no id the model could choose`);
    assert.equal((t.inputSchema as Record<string, unknown>).$schema, undefined);
    assert.equal((t.inputSchema as Record<string, unknown>).type, "object");
  }
  const summon = modelTools("act").find(t => t.name === "summon_agent")!;
  assert.deepEqual((summon.inputSchema as { required?: string[] }).required, ["source"]);
});

test("command ids and request ids come from the engine, overriding the model's; waits are capped", () => {
  const id = "11111111-2222-5333-8444-555555555555";
  assert.deepEqual(prepareArgs("summon_agent", { source: "s", commandId: "model-chosen", waitMs: 120_000 }, id), { source: "s", commandId: id, waitMs: LIMITS.waitMs });
  assert.deepEqual(prepareArgs("send_chat", { text: "hi" }, id), { text: "hi", commandId: id });
  assert.deepEqual(prepareArgs("start_game", { requestId: "x" }, id), { requestId: id });
  assert.deepEqual(prepareArgs("get_observation", { objectsLimit: 5, commandId: "x" }, id), { objectsLimit: 5, commandId: "x" }, "non-command tools are left alone (the schema rejects extras)");
});

test("owner tools get a request id only when their schema takes one (get_room_state and get_ai_catalog take none and reject extras)", () => {
  const id = "11111111-2222-5333-8444-555555555555";
  for (const tool of OWNER_TOOLS) {
    const prepared = prepareArgs(tool.name, {}, id);
    const takesId = "requestId" in (tool.input as unknown as { shape: Record<string, unknown> }).shape;
    assert.deepEqual(prepared, takesId ? { requestId: id } : {}, tool.name);
    if (!takesId) assert.ok(tool.input.safeParse(prepared).success, `${tool.name} accepts what the engine sends`);
  }
  assert.ok(OWNER_TOOLS.some(t => t.name === "get_room_state"), "the catalogue still has the read-only owner tools");
});

test("a step runs at most 16 calls and at most 2 layout changes", () => {
  assert.equal(callLimitProblem("get_observation", []), null);
  assert.equal(callLimitProblem("open_panel", ["get_observation", "open_panel"]), null, "a second layout change is fine");
  assert.match(callLimitProblem("set_panel_params", ["open_panel", "get_observation", "move_pane"])!, /At most 2 layout changes/);
  assert.equal(callLimitProblem("get_layout", ["open_panel", "move_pane"]), null, "reading the layout is not a change");
  assert.equal(callLimitProblem("get_observation", ["open_panel", "move_pane"]), null);
  assert.match(callLimitProblem("get_observation", Array.from({ length: LIMITS.callsPerStep }, () => "whoami"))!, /At most 16 tool calls/);
});

test("clipJson keeps stored tool data within its limit as valid JSON", () => {
  assert.equal(clipJson({ a: 1 }, 100), '{"a":1}');
  const big = { untrusted: true, data: { objects: Array.from({ length: 500 }, (_, i) => ({ id: `o${i}`, value: i })) } };
  const clipped = clipJson(big, 2000);
  assert.ok(clipped.length <= 2000);
  const parsed = JSON.parse(clipped);
  assert.equal(parsed.untrusted, true);
  assert.ok(parsed.data.objects.length > 0 && parsed.data.objects.length < 500);
  const long = clipJson({ untrusted: true, data: { rules: "x".repeat(50_000) } }, 2000);
  assert.ok(long.length <= 2000);
  assert.equal(JSON.parse(long).untrusted, true);
});

test("activity-chip summaries say what happened; argument limits fit panels and agent sources", () => {
  const wrap = (data: unknown) => ({ untrusted: true as const, notice: "n", data });
  assert.equal(summarize("summon_agent", wrap({ status: "received", commandId: "c", receipt: { accepted: true, message: "Summoned a1" } })), "Accepted: Summoned a1");
  assert.equal(summarize("send_chat", wrap({ status: "received", commandId: "c", receipt: { accepted: false, message: "Too fast" } })), "Rejected: Too fast");
  assert.equal(summarize("validate_agent", wrap({ status: "pending", commandId: "c", message: "Still running" })), "Pending: Still running");
  assert.equal(summarize("save_panel", wrap({ ok: true, version: 3, diagnostics: [] })), "Saved version 3");
  assert.equal(summarize("save_panel", wrap({ ok: false, diagnostics: [{ line: 1, column: 2, message: "x" }] })), "Not saved: 1 diagnostic");
  assert.equal(summarize("get_observation", wrap({ phase: "running" })), "Read");
  assert.equal(summarize("start_game", wrap({ requestId: "r", result: { gameId: "g" } })), "Done");
  assert.ok(summarize("summon_agent", wrap({ status: "received", commandId: "c", receipt: { accepted: true, message: "y".repeat(500) } })).length <= 200);
  assert.ok(argsLimit("save_panel") > 65536 && argsLimit("summon_agent") > 16384 && argsLimit("send_chat") === LIMITS.argsChars);
  assert.ok(argsLimit("open_panel") > 16384 && argsLimit("set_panel_params") > 16384, "a forge draft fits");
  assert.equal(summarize("open_panel", wrap({ paneId: "p3", summary: "Top 5 by payoff", reused: false })), "Showed Top 5 by payoff");
  assert.equal(summarize("open_panel", wrap({ paneId: "p1", summary: "Top 5 by payoff", reused: true })), "Updated Top 5 by payoff");
  assert.equal(summarize("close_pane", wrap({ paneId: "p3", summary: "closed", reused: false })), "Closed pane p3");
  assert.equal(summarize("get_layout", wrap({ layout: {} })), "Read");
});
