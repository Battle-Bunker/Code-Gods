/**
 * The artifact client's pure core (core.js), no browser and no runtime: the result envelope, error-code
 * classification, the observation view model, the commandId/receipt retry state machine, the sample
 * prompt, and the build that inlines core.js into dist/template.html. Run: pnpm run test:artifact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SERVER, MANIFEST_TOOLS, manifest, unwrap, classify, viewModel, whoamiView, uuid,
  newCommand, sent, settled, failed, nextAction, autoAction, request, receiptView, askPrompt, OBSERVATION_INPUT,
  summonInput, validateInput, chatInput, readyInput,
} from "./core.js";
import { inline } from "./build.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const schemas = JSON.parse(readFileSync(here("../../lib/player-client/src/tools.schema.json"), "utf8"));
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

// ----- manifest and tool inputs ------------------------------------------------------------------

test("manifest: the declared tools exist in the registry and match what the page calls", () => {
  assert.equal(SERVER, "Code Gods");
  for (const name of MANIFEST_TOOLS) assert.ok(schemas[name], `${name} is a registry tool`);
  const template = readFileSync(here("./template.html"), "utf8");
  // The page reaches tools only through call("…"), watch("…") and newCommand("…") (whose receipt checks call
  // get_receipt); a tool outside the manifest is not_in_manifest at runtime.
  const used = new Set([...template.matchAll(/\b(?:call|watch|newCommand)\("([a-z_]+)"/g)].map(m => m[1]));
  if (/\bnewCommand\("/.test(template)) used.add("get_receipt");
  assert.deepEqual([...used].sort(), [...MANIFEST_TOOLS].sort());
  assert.deepEqual(manifest(), { mcp: { servers: [{ server: "Code Gods", tools: [...MANIFEST_TOOLS] }] }, sample: {} });
});

test("tool inputs satisfy the registry's JSON Schemas (property names, required members)", () => {
  const check = (name, input) => {
    const s = schemas[name].input;
    for (const k of Object.keys(input)) assert.ok(k in s.properties, `${name}: ${k} is a declared property`);
    for (const k of s.required ?? []) assert.ok(k in input, `${name}: required ${k}`);
  };
  check("get_observation", OBSERVATION_INPUT);
  check("summon_agent", summonInput("def agent(o): return []", ID));
  check("validate_agent", validateInput("def agent(o): return []", ID));
  check("send_chat", chatInput("hi", ID));
  check("set_ready", readyInput(true, ID));
  check("get_receipt", request({ ...newCommand("summon_agent", {}, ID), status: "unknown" }, "check").input);
  // The page waits less than the runtime's ~130 s reply budget, and less than the engine's default.
  assert.ok(summonInput("x", ID).waitMs <= 60_000);
  assert.ok(summonInput("x", ID).waitMs >= 0 && Number.isInteger(summonInput("x", ID).waitMs));
});

test("uuid: a v4 UUID the registry's pattern accepts, different each time", () => {
  const pattern = new RegExp(schemas.get_receipt.input.properties.commandId.pattern);
  const a = uuid(), b = uuid();
  assert.match(a, pattern);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

// ----- result envelope ---------------------------------------------------------------------------

test("unwrap: reads the envelope from payload, falling back to structuredContent and then the text block", () => {
  const env = { untrusted: true, notice: "n", data: { x: 1 }, nextCursor: 50, truncated: true };
  assert.deepEqual(unwrap({ content: [], payload: env, cache: { storedAt: 5, revalidating: true } }, 99),
    { data: { x: 1 }, notice: "n", nextCursor: 50, truncated: true, storedAt: 5, revalidating: true });
  assert.deepEqual(unwrap({ content: [], structuredContent: env }, 99).storedAt, 99, "a fresh result is stamped at receipt");
  assert.deepEqual(unwrap({ content: [{ type: "text", text: JSON.stringify(env) }] }, 1).data, { x: 1 });
  assert.equal(unwrap({ content: [], payload: env }, 1).revalidating, false);
});

test("unwrap: a result that is not the Code Gods envelope is refused, not rendered", () => {
  assert.throws(() => unwrap({ content: [], payload: { data: 1 } }, 1), /envelope/);
  assert.throws(() => unwrap({ content: [], payload: "plain text" }, 1), /envelope/);
  assert.throws(() => unwrap(undefined, 1), /envelope/);
});

// ----- error classification ----------------------------------------------------------------------

test("classify: each runtime code gets its own fix, with the connector's name", () => {
  const k = (code, extra = {}) => classify({ code, message: "m", server: "Code Gods", ...extra });
  assert.equal(k("needs_reauth").kind, "reconnect");
  assert.match(k("needs_reauth").text, /Reconnect Code Gods/);
  assert.equal(k("server_not_connected").kind, "add_connector");
  assert.match(k("server_not_connected").text, /Add Code Gods/);
  assert.equal(k("selection_required").kind, "choose_connector");
  assert.equal(k("not_in_manifest").kind, "not_allowed");
  assert.equal(k("blocked_by_policy").kind, "not_allowed");
  assert.equal(k("approval_required").kind, "needs_approval");
  assert.equal(k("server_unavailable").kind, "transient");
  assert.equal(k("not_granted").kind, "no_mcp");
  assert.equal(k("capability_disabled").kind, "no_mcp");
  assert.equal(k("bad_request").kind, "page_bug");
  assert.equal(k("user_changed").kind, "stop");
  assert.equal(k("something_new").code, "upstream_error", "unknown codes read as upstream_error");
  assert.equal(classify("boom").code, "upstream_error", "a non-object rejection is upstream_error");
});

test("classify: authz denials retract data; transient failures keep it", () => {
  for (const code of ["needs_reauth", "server_not_connected", "blocked_by_policy", "approval_required", "not_in_manifest", "user_changed"]) {
    assert.equal(classify({ code, message: "" }).retract, true, code);
  }
  for (const code of ["server_unavailable", "upstream_error", "rate_limited", "tool_error", "cancelled"]) {
    assert.equal(classify({ code, message: "" }).retract, false, code);
  }
});

test("classify: only server_unavailable, upstream_error (and unknown codes) and cancelled are ambiguous for a write", () => {
  const amb = (code) => classify({ code, message: "" }).ambiguous;
  assert.equal(amb("server_unavailable"), true);
  assert.equal(amb("upstream_error"), true);
  assert.equal(amb("brand_new_code"), true);
  assert.equal(amb("cancelled"), true, "an aborted call may still have run");
  for (const code of ["tool_error", "needs_reauth", "not_in_manifest", "rate_limited", "approval_required", "bad_request"]) {
    assert.equal(amb(code), false, code);
  }
});

test("classify: a tool_error carries the engine's refusal code and message from the result text", () => {
  const result = { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: "CONFLICT", message: "Command ID was reused" } }) }] };
  const c = classify({ code: "tool_error", message: "x", result });
  assert.equal(c.kind, "refused");
  assert.equal(c.engineCode, "CONFLICT");
  assert.match(c.text, /Command ID was reused/);
  const fromMessage = classify({ code: "tool_error", message: JSON.stringify({ error: { code: "FORBIDDEN", message: "No act grant" } }) });
  assert.equal(fromMessage.engineCode, "FORBIDDEN");
  assert.equal(classify({ code: "tool_error", message: "not json" }).engineCode, undefined);
});

// ----- view model --------------------------------------------------------------------------------

const observation = {
  version: "code-gods.player.v3", roomId: "r1", revision: 3, gameId: "g1", phase: "planning", language: "python",
  planningEndsAt: 10_000, roomShortCode: "ABCD", gameShortCode: "G7", seated: true,
  self: { godId: "me", label: "Ada", isAI: false, energy: 412.75, ready: false },
  objects: [
    { id: "o1", value: "abc", own: { ordinal: 1, rewardBits: 2, netBits: 1.5 }, peerNetBits: -3, peerCare: 1, payoff: 0.25 },
    { id: "o2", value: 42, own: { ordinal: 2, rewardBits: 5, netBits: 4 }, peerNetBits: 2, peerCare: 1, payoff: 3.5 },
  ],
  objectCount: 120,
  agents: [{ id: "a1", source: "def agent(o): ...", language: "python", summonCost: 80, decisionBits: 2, expectedActCost: 9,
    breakdown: { decision: 2, erasure: 4, motion: 2, floor: 1 }, randomized: false, energy: -2, eligible: false, acts: 7, spent: 63 }],
  agentCount: 1,
  transformations: [],
  leaderboard: [
    { godId: "x", label: "Bo", isAI: true, totalPayoff: 10 },
    { godId: "me", label: "Ada", isAI: false, totalPayoff: 12.5 },
  ],
  chat: Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, godId: "x", label: "Bo", isAI: true, text: `m${i}` })),
};

test("viewModel: phase, clock, own energy and seat", () => {
  const vm = viewModel(observation, 4_000);
  assert.equal(vm.phase, "planning");
  assert.equal(vm.self.label, "Ada");
  assert.equal(vm.self.energy, 412.75);
  assert.equal(vm.self.ready, false);
  assert.equal(vm.seated, true);
  assert.deepEqual(vm.clocks, [{ label: "Planning ends", at: 10_000, remainingMs: 6_000 }]);
  assert.deepEqual(viewModel({ ...observation, planningEndsAt: 1000 }, 4_000).clocks[0].remainingMs, 0, "a past clock reads 0, not negative");
  assert.deepEqual(viewModel({ ...observation, phase: "paused", pauseEndsAt: 7_000 }, 4_000).clocks.map(c => c.label), ["Planning ends", "Pause ends"]);
  assert.equal(viewModel({ ...observation, gameId: undefined, phase: "lobby" }, 0).game, null);
  assert.deepEqual(viewModel(observation, 0).game, { gameId: "g1", shortCode: "G7", language: "python" });
});

test("viewModel: objects sorted by my payoff, best first, with own and peer bits; counts for the paged rest", () => {
  const vm = viewModel(observation, 0);
  assert.deepEqual(vm.objects.map(o => o.id), ["o2", "o1"]);
  assert.deepEqual(vm.objects[0], { id: "o2", value: "42", payoff: 3.5, ownNetBits: 4, peerNetBits: 2 });
  assert.equal(vm.objectCount, 120);
  assert.equal(vm.objectsShown, 2);
});

test("viewModel: agents with energy, eligibility, acts and spend", () => {
  const [a] = viewModel(observation, 0).agents;
  assert.deepEqual(a, { id: "a1", energy: -2, eligible: false, acts: 7, spent: 63, summonCost: 80, expectedActCost: 9 });
  assert.equal(viewModel(observation, 0).agentCount, 1);
});

test("viewModel: leaderboard ranked by payoff with my row marked; chat is the tail, newest last", () => {
  const vm = viewModel(observation, 0);
  assert.deepEqual(vm.leaderboard.map(r => [r.rank, r.label, r.mine]), [[1, "Ada", true], [2, "Bo", false]]);
  assert.equal(vm.chat.length, 10);
  assert.equal(vm.chat.at(-1).text, "m14");
  assert.deepEqual(vm.chat[0], { id: "c5", label: "Bo", isAI: true, text: "m5" });
  const anonymous = viewModel({ ...observation, self: { label: "Ada" }, leaderboard: [{ label: "Bo", totalPayoff: 1 }] }, 0);
  assert.equal(anonymous.leaderboard[0].mine, false, "a missing godId on both sides is not a match");
});

test("viewModel: game strings stay strings, and a sparse lobby observation does not throw", () => {
  const hostile = { ...observation, self: { ...observation.self, label: { toString: () => "<b>x</b>" } } };
  assert.equal(typeof viewModel(hostile, 0).self.label, "string");
  const lobby = { phase: "lobby", self: { godId: "me", label: "Ada", energy: 0, ready: true }, objects: [], agents: [], leaderboard: [], chat: [] };
  const vm = viewModel(lobby, 0);
  assert.deepEqual([vm.clocks, vm.objects, vm.agents, vm.objectCount, vm.agentCount], [[], [], [], 0, 0]);
  assert.equal(viewModel(null, 0), null);
});

test("whoamiView: room, permission, and whether the grant may act", () => {
  const w = whoamiView({ name: "Ada", roomCode: "ABCD", permission: "read", expiresAt: 5 });
  assert.deepEqual(w, { name: "Ada", roomCode: "ABCD", permission: "read", expiresAt: 5, canAct: false });
  assert.equal(whoamiView({ permission: "act" }).canAct, true);
  assert.equal(whoamiView({ permission: "owner" }).canAct, true);
  assert.equal(whoamiView(null), null);
});

// ----- command state machine ---------------------------------------------------------------------

const received = (accepted = true, extra = {}) => ({ status: "received", commandId: ID, receipt: { commandId: ID, accepted, message: accepted ? "ok" : "too poor", ...extra } });

test("command: a fresh command sends its tool with its commandId; a receipt finishes it", () => {
  const c = newCommand("summon_agent", summonInput("src", ID), ID);
  assert.equal(nextAction(c), "send");
  assert.deepEqual(request(c, "send"), { tool: "summon_agent", input: summonInput("src", ID) });
  const s = sent(c, "send");
  assert.equal(s.status, "sending");
  assert.equal(nextAction(s), null, "nothing to do while a call is in flight");
  assert.equal(settled(s, received()).status, "done");
  assert.equal(settled(s, received(false)).status, "rejected", "the engine said no: a definite answer");
  assert.equal(nextAction(settled(s, received(false))), null);
});

test("command: an ambiguous failure checks the receipt first (once, automatically), never resends blindly", () => {
  const c = sent(newCommand("summon_agent", summonInput("src", ID), ID), "send");
  const u = failed(c, { code: "server_unavailable", message: "timeout", retryable: true });
  assert.equal(u.status, "unknown");
  assert.equal(nextAction(u), "check");
  assert.equal(autoAction(u), "check");
  assert.deepEqual(request(u, "check"), { tool: "get_receipt", input: { commandId: ID } });
  // The check itself is ambiguous too: still unknown, but no second automatic check.
  const u2 = failed(sent(u, "check"), { code: "upstream_error", message: "" });
  assert.equal(u2.status, "unknown");
  assert.equal(nextAction(u2), "check");
  assert.equal(autoAction(u2), null);
});

test("command: after the check, received is done, pending polls, failed and not_found resend the SAME call", () => {
  const u = failed(sent(newCommand("summon_agent", summonInput("src", ID), ID), "send"), { code: "upstream_error", message: "" });
  const checking = sent(u, "check");
  assert.equal(settled(checking, received()).status, "done");
  const p = settled(checking, { status: "pending", commandId: ID });
  assert.equal(p.status, "pending");
  assert.equal(nextAction(p), "check");
  assert.equal(autoAction(p), null, "pending polls on a button, not a timer");
  for (const status of ["failed", "not_found"]) {
    const r = settled(checking, { status, commandId: ID });
    assert.equal(nextAction(r), "resend", status);
    assert.equal(autoAction(r), null, "a resend is a write: it waits for a click");
    assert.deepEqual(request(r, "resend"), request(u, "send"), "identical call, same commandId");
    assert.equal(request(r, "resend").input.commandId, ID);
  }
});

test("command: pending from the call itself (waitMs elapsed) polls get_receipt", () => {
  const p = settled(sent(newCommand("validate_agent", validateInput("s", ID), ID), "send"), { status: "pending", commandId: ID });
  assert.equal(p.status, "pending");
  assert.deepEqual(request(p, "check"), { tool: "get_receipt", input: { commandId: ID } });
});

test("command: a refusal (tool_error) is final; an authz failure blocks without resending", () => {
  const s = sent(newCommand("send_chat", chatInput("hi", ID), ID), "send");
  const refused = failed(s, { code: "tool_error", message: JSON.stringify({ error: { code: "CONFLICT", message: "reused" } }) });
  assert.equal(refused.status, "refused");
  assert.equal(nextAction(refused), null);
  assert.equal(refused.error.engineCode, "CONFLICT");
  const blocked = failed(s, { code: "needs_reauth", message: "" });
  assert.equal(blocked.status, "blocked");
  assert.equal(nextAction(blocked), null);
});

test("command: an unrecognised answer is not success", () => {
  const s = sent(newCommand("set_ready", readyInput(true, ID), ID), "send");
  assert.equal(settled(s, { weird: true }).status, "unknown");
  assert.equal(settled(s, undefined).status, "unknown");
});

test("receiptView: accepted, message, and validation figures with diagnostics", () => {
  const v = receiptView({ commandId: ID, accepted: true, message: "Valid", validation: { valid: true, cost: 81.2, expectedActCost: 9.5, diagnostics: ["warn: x"] } });
  assert.deepEqual(v, { accepted: true, message: "Valid", validation: { valid: true, cost: 81.2, expectedActCost: 9.5, diagnostics: ["warn: x"] } });
  assert.deepEqual(receiptView({ accepted: false, message: "no" }), { accepted: false, message: "no", validation: null });
  assert.equal(receiptView(undefined), null);
});

// ----- Ask Claude --------------------------------------------------------------------------------

test("askPrompt: instructions, the question and the data, with the data marked untrusted and bounded", () => {
  const p = askPrompt("Which object should I target?", observation);
  assert.match(p, /Which object should I target\?/);
  assert.match(p, /untrusted/i);
  assert.ok(p.includes(JSON.stringify(observation.self)), "the observation JSON is included");
  assert.ok(p.indexOf("Which object") < p.indexOf("<observation>"), "the question comes before the data");
  const huge = { ...observation, chat: [{ text: "x".repeat(400_000) }] };
  assert.ok(new TextEncoder().encode(askPrompt("q", huge)).length < 200 * 1024, "under sample's 256 KiB limit");
  assert.match(askPrompt("q", huge), /truncated/);
});

// ----- build -------------------------------------------------------------------------------------

test("build: inlines core.js in place of its import, leaving no module syntax behind", () => {
  const core = readFileSync(here("./core.js"), "utf8");
  const html = '<script type="module">\nimport * as core from "./core.js";\nconsole.log(core.SERVER);\n</script>';
  const out = inline(html, core);
  assert.ok(!out.includes('from "./core.js"'));
  assert.ok(!/^\s*export\s/m.test(out), "no export statements");
  assert.match(out, /const core = Object\.freeze\(\(\(\) => \{/);
  for (const name of ["viewModel", "classify", "newCommand", "SERVER", "MANIFEST_TOOLS"]) assert.match(out, new RegExp(`\\b${name}\\b`));
  assert.throws(() => inline("<p>no import here</p>", core), /import/);
  assert.ok(!inline(readFileSync(here("./template.html"), "utf8"), core).includes('from "./core.js"'));
});

test("build: the inlined core evaluates to the same exports as the module", async () => {
  const core = readFileSync(here("./core.js"), "utf8");
  const out = inline('<script type="module">\nimport * as core from "./core.js";\n</script>', core);
  const body = out.replace(/^<script type="module">\n/, "").replace(/<\/script>$/, "");
  const ns = new Function(`${body}; return core;`)();
  const mod = await import("./core.js");
  assert.deepEqual(Object.keys(ns).sort(), Object.keys(mod).sort());
  assert.equal(ns.SERVER, mod.SERVER);
});
