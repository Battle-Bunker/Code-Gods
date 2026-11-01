/**
 * The assistant's model history (convex/assistant/rules.ts buildHistory), no backend. What would break: Claude 5
 * models return thinking blocks that are valid only while everything before them is byte-identical, so within a
 * turn every step's history must extend the previous one exactly (append-only, even when older turns are cut);
 * the current turn replays the model's own blocks verbatim; every tool use gets a result.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LIMITS, UNANSWERED_NOTES, buildHistory, turnEnding, type HistoryCall, type HistoryRow } from "../../convex/assistant/rules.ts";

const think = (signature: string) => ({ type: "thinking", provider: "anthropic", block: { type: "thinking", thinking: "", signature } });
const user = (id: string, turnId: string, text: string): HistoryRow => ({ id, turnId, role: "user", text });
const step = (id: string, turnId: string, content: unknown[]): HistoryRow =>
  ({ id, turnId, role: "assistant", text: content.flatMap((b: any) => b.type === "text" ? [b.text] : []).join(""), contentJson: JSON.stringify(content) });
const call = (messageId: string, callId: string, tool: string, args: Record<string, unknown>, result = '{"untrusted":true,"data":{}}', index = 0): HistoryCall =>
  ({ messageId, callId, index, tool, argsJson: JSON.stringify(args), status: "ok", resultJson: result });

test("every turn replays the model's blocks verbatim (thinking and raw tool input) after its own briefing, earlier turns included", () => {
  const rows = [
    user("u1", "A", "hi"), step("m1", "A", [think("s1"), { type: "text", text: "hello" }]),
    user("u2", "B", "suggest an agent"),
    step("m2", "B", [think("s2"), { type: "text", text: "Checking." }, { type: "tool_use", id: "toolu_1", name: "validate_agent", input: { source: "x" } }]),
  ];
  const calls = [call("m2", "toolu_1", "validate_agent", { source: "x", commandId: "derived-id", waitMs: 60000 }, '{"ok":1}')];
  assert.deepEqual(buildHistory(rows, calls, { turnId: "B", briefings: { A: "<briefing>A</briefing>", B: "<briefing>Power Hoarder</briefing>" } }), [
    { role: "user", content: [{ type: "text", text: "<briefing>A</briefing>" }, { type: "text", text: "hi" }] },
    { role: "assistant", content: [think("s1"), { type: "text", text: "hello" }] },
    { role: "user", content: [{ type: "text", text: "<briefing>Power Hoarder</briefing>" }, { type: "text", text: "suggest an agent" }] },
    { role: "assistant", content: [think("s2"), { type: "text", text: "Checking." }, { type: "tool_use", id: "toolu_1", name: "validate_agent", input: { source: "x" } }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_1", content: '{"ok":1}' }] },
  ]);
});

test("within a turn each step's history extends the previous one byte-for-byte, even when older turns exceed the size limit", () => {
  const rows: HistoryRow[] = [];
  const calls: HistoryCall[] = [];
  const big = "x".repeat(LIMITS.historyChars / 8);
  for (let t = 0; t < 12; t++) rows.push(user(`u${t}`, `T${t}`, big), step(`m${t}`, `T${t}`, [think(`old${t}`), { type: "text", text: big }]));
  rows.push(user("uC", "C", "go"));
  let previous = JSON.stringify(buildHistory(rows, calls, { turnId: "C", briefings: { C: "<briefing/>" } }));
  for (let s = 0; s < 8; s++) {
    rows.push(step(`c${s}`, "C", [think(`c${s}`), { type: "tool_use", id: `toolu_${s}`, name: "get_observation", input: {} }]));
    calls.push(call(`c${s}`, `toolu_${s}`, "get_observation", {}, JSON.stringify({ data: "y".repeat(8000) })));
    const history = buildHistory(rows, calls, { turnId: "C", briefings: { C: "<briefing/>" } });
    const json = JSON.stringify(history);
    assert.ok(json.startsWith(previous.slice(0, -1)), `step ${s} appends to step ${s - 1}`);
    previous = json;
  }
  const cut = buildHistory(rows, calls, { turnId: "C" });
  assert.ok(JSON.stringify(cut).length < LIMITS.historyChars + 8 * 9000 + 1000, "older turns are still cut to the limit");
  assert.deepEqual(cut[0], { role: "user", content: big }, "cuts fall between whole turns");
});

test("rows without stored blocks are rebuilt from text and calls; a tool use without a finished call gets an error result", () => {
  const rows: HistoryRow[] = [
    { id: "m0", turnId: "A", role: "assistant", text: "orphan of a cut turn" },
    user("u1", "A", "hi"), { id: "m1", turnId: "A", role: "assistant", text: "Looking." },
    user("u2", "B", "and?"), step("m2", "B", [{ type: "tool_use", id: "toolu_9", name: "whoami", input: {} }]),
  ];
  const calls = [call("m1", "toolu_1", "get_rules", {}, '{"r":1}'), { ...call("m1", "toolu_2", "whoami", {}, '{"e":1}', 1), status: "error" }];
  assert.deepEqual(buildHistory(rows, calls, { turnId: "B" }), [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "Looking." }, { type: "tool_use", id: "toolu_1", name: "get_rules", input: {} }, { type: "tool_use", id: "toolu_2", name: "whoami", input: {} }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_1", content: '{"r":1}' }, { type: "tool_result", toolUseId: "toolu_2", content: '{"e":1}', isError: true }] },
    { role: "user", content: "and?" },
    { role: "assistant", content: [{ type: "tool_use", id: "toolu_9", name: "whoami", input: {} }] },
    { role: "user", content: [{ type: "tool_result", toolUseId: "toolu_9", content: '{"error":{"code":"NOT_RUN","message":"This call did not run."}}', isError: true }] },
  ]);
});

test("an earlier turn that ended without its answer closes with an engine note; a finished one and the current turn get none", () => {
  const rows = [
    user("u1", "A", "what is my utility?"),
    user("u2", "B", "and my energy?"), step("m2", "B", [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "toolu_1", name: "get_observation", input: {} }]),
    user("u3", "C", "thanks"), step("m3", "C", [{ type: "text", text: "You are welcome." }]),
    user("u4", "D", "now?"),
  ];
  const calls = [call("m2", "toolu_1", "get_observation", {})];
  const history = buildHistory(rows, calls, { turnId: "D", briefings: { D: "<briefing/>" }, endings: { A: "budget_exhausted", B: "cancelled", C: "done", D: "running" } });
  const notes = history.flatMap(m => m.role === "user" && typeof m.content !== "string" ? m.content.flatMap(b => b.type === "text" && b.text.startsWith("Engine note") ? [b.text] : []) : []);
  assert.deepEqual(notes, [UNANSWERED_NOTES.budget_exhausted, UNANSWERED_NOTES.cancelled], "A's and B's notes, in order; none for C or D");
  assert.match(UNANSWERED_NOTES.budget_exhausted!, /allowance ran out[\s\S]*UNANSWERED/);
  // The note follows the turn it closes: A's question, then its note, before B's question.
  assert.deepEqual(history.slice(0, 2), [
    { role: "user", content: "what is my utility?" },
    { role: "user", content: [{ type: "text", text: UNANSWERED_NOTES.budget_exhausted }] },
  ]);
  // A "done" turn that hit the step limit, and a deadline failure, are named as such.
  assert.equal(turnEnding("done", "STEP_LIMIT"), "step_limit");
  assert.equal(turnEnding("failed", "DEADLINE"), "deadline");
  assert.equal(turnEnding("done"), "done");
  assert.match(UNANSWERED_NOTES.step_limit!, /step limit/);
  // Without endings (older callers) nothing changes.
  assert.ok(!JSON.stringify(buildHistory(rows, calls, { turnId: "D" })).includes("Engine note"));
});

test("a new turn's history starts with the previous turn's last step byte-for-byte, so it reads the thread from the prompt cache", () => {
  const rows: HistoryRow[] = [user("u1", "A", "suggest an agent")];
  const calls: HistoryCall[] = [];
  const briefings = { A: "<briefing>A</briefing>", B: "<briefing>B, later</briefing>" };
  rows.push(step("m1", "A", [think("a1"), { type: "tool_use", id: "toolu_1", name: "validate_agent", input: { source: "x" } }]));
  calls.push(call("m1", "toolu_1", "validate_agent", { source: "x", commandId: "id" }, '{"ok":1}'));
  rows.push(step("m2", "A", [think("a2"), { type: "text", text: "Valid." }]));
  const lastOfA = buildHistory(rows, calls, { turnId: "A", briefings, endings: {} });
  rows.push(user("u2", "B", "thanks"));
  const firstOfB = buildHistory(rows, calls, { turnId: "B", briefings, endings: { A: "done" } });
  assert.deepEqual(firstOfB.slice(0, lastOfA.length), lastOfA, "turn A exactly as its last step sent it: briefing, thinking, raw input, results");
  assert.deepEqual(firstOfB.slice(lastOfA.length), [{ role: "user", content: [{ type: "text", text: "<briefing>B, later</briefing>" }, { type: "text", text: "thanks" }] }]);
});
