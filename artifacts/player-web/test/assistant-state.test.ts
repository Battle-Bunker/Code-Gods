/**
 * Pure UI state of the assistant pane (src/core/chat/state.ts): the timeline built from a thread's messages and
 * tool calls, the optimistic user message, the modes, the allowance meter and chip labels.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MODE_OPTIONS, allowanceMeter, allowanceNote, buildTimeline, modeLabel, queueNote, chipView, prettyArgs, stepView, summonWarnings, userCount, withPending, withSteps, type CallRow, type MessageRow,
} from "../src/core/chat/state.ts";

const msg = (seq: number, role: "user" | "assistant", text: string, over: Partial<MessageRow> = {}): MessageRow =>
  ({ _id: `m${seq}`, turnId: "t1", seq, role, text, status: "done", ...over });
const call = (index: number, messageId: string, tool: string, status: CallRow["status"], over: Partial<CallRow> = {}): CallRow =>
  ({ _id: `c${messageId}${index}`, turnId: "t1", messageId, index, tool, status, argsJson: "{}", summary: "", resultJson: null, ...over });

test("the timeline orders messages by seq and puts each step's tool calls after its text, in call order", () => {
  const timeline = buildTimeline(
    [msg(3, "assistant", "", { _id: "m3" }), msg(1, "user", "hi"), msg(2, "assistant", "Looking", { _id: "m2" }), msg(4, "assistant", "Done", { _id: "m4" })],
    [call(1, "m2", "get_chat", "ok"), call(0, "m2", "get_observation", "ok"), call(0, "m3", "summon_agent", "running")],
  );
  assert.deepEqual(timeline.map(i => i.kind === "call" ? `call:${i.call.tool}` : `${i.kind}:${i.text}`), [
    "user:hi", "assistant:Looking", "call:get_observation", "call:get_chat", "call:summon_agent", "assistant:Done",
  ], "an empty step text is not shown, its calls are");
  assert.equal(timeline.find(i => i.kind === "call" && i.call.tool === "summon_agent")!.kind, "call");
});

test("a streaming message stays visible while empty (a typing indicator)", () => {
  const timeline = buildTimeline([msg(1, "user", "hi"), msg(2, "assistant", "", { status: "streaming" })], []);
  assert.deepEqual(timeline.map(i => i.kind === "assistant" ? i.status : i.kind), ["user", "streaming"]);
});

test("the optimistic message shows until the server has it", () => {
  const server = [msg(1, "user", "first"), msg(2, "assistant", "ok")];
  assert.deepEqual(withPending(buildTimeline(server, []), "second").map(i => i.kind === "call" ? "" : i.text), ["first", "ok", "second"]);
  const echoed = [...server, msg(3, "user", "second")];
  assert.equal(withPending(buildTimeline(echoed, []), "second").filter(i => i.kind === "user" && i.text === "second").length, 1);
  assert.equal(withPending(buildTimeline(server, []), null).length, 2);
});

test("an autopilot turn's prompt is a labelled user item, not the player's words: it counts for no optimistic message", () => {
  const timeline = buildTimeline([msg(1, "user", "hi"), msg(2, "assistant", "ok"), msg(3, "user", "(autopilot) Engine prompt", { autopilot: true }), msg(4, "assistant", "Summoned one.")], []);
  const prompt = timeline.find(i => i.kind === "user" && i.autopilot);
  assert.ok(prompt, "kept, flagged autopilot");
  assert.equal(userCount(timeline), 1, "only the player's own messages count");
  assert.equal(withPending(timeline, "next", 1).at(-1)?.kind === "user" && (withPending(timeline, "next", 1).at(-1) as any).pending, true,
    "a message sent after an autopilot turn still shows as pending until the server has it");
});

test("the three modes, in order, each with a one-line description", () => {
  assert.deepEqual(MODE_OPTIONS.map(m => m.label), ["Autopilot", "On request", "Read-only"]);
  for (const m of MODE_OPTIONS) assert.ok(m.detail.length > 0 && m.detail.length <= 60 && !m.detail.includes("\n"), m.id);
  assert.equal(modeLabel("onRequest"), "On request");
});

test("the allowance meter: fraction, label, exhausted and off", () => {
  assert.deepEqual(allowanceMeter(250, 1000), { fraction: 0.25, label: "250 / 1,000 tokens", exhausted: false, off: false });
  assert.deepEqual(allowanceMeter(1200, 1000), { fraction: 1, label: "1,200 / 1,000 tokens", exhausted: true, off: false });
  assert.deepEqual(allowanceMeter(0, 0), { fraction: 0, label: "off", exhausted: false, off: true });
});

test("chips: a label, a tone per status, and pretty arguments", () => {
  assert.deepEqual(chipView(call(0, "m", "get_observation", "ok", { summary: "Read" })), { label: "get observation", tone: "ok", detail: "Read" });
  assert.equal(chipView(call(0, "m", "summon_agent", "error", { summary: "FORBIDDEN: nope" })).tone, "error");
  assert.equal(chipView(call(0, "m", "send_chat", "denied")).tone, "muted");
  assert.equal(chipView(call(0, "m", "validate_agent", "running")).tone, "busy");
  assert.equal(prettyArgs('{"text":"hi","commandId":"x"}'), '{\n  "text": "hi",\n  "commandId": "x"\n}');
  assert.equal(prettyArgs("not json"), "not json");
});

test("step lines: one line per model step in human verbs, present tense while running, the asking and declined calls named", () => {
  const timeline = buildTimeline(
    [msg(1, "user", "write me an agent"), msg(2, "assistant", "", { _id: "m2" }), msg(3, "assistant", "Done", { _id: "m3" })],
    [call(0, "m2", "get_observation", "ok"), call(1, "m2", "validate_agent", "ok"), call(2, "m2", "open_panel", "ok", { argsJson: '{"panelId":"forge"}' }),
      call(0, "m3", "send_chat", "denied")],
  );
  const items = withSteps(timeline);
  assert.deepEqual(items.map(i => i.kind), ["user", "step", "assistant", "step"], "each step's calls fold into one line, after its text");
  const [first, second] = items.filter(i => i.kind === "step");
  assert.deepEqual(stepView(first.calls), { text: "looked at the game · tested agent code · showed Agent code", tone: "ok", open: false });
  assert.deepEqual(stepView(second.calls), { text: "not run: post to everyone", tone: "muted", open: false });
  assert.deepEqual(stepView([call(0, "m", "validate_agent", "running")]), { text: "testing agent code…", tone: "busy", open: false });
  assert.equal(stepView([call(0, "m", "load_tools", "ok"), call(1, "m", "load_skill", "ok")]).text, "got tools ready · read up on it", "the loaders read as plain steps, not tool names");
  const failed = stepView([call(0, "m", "get_observation", "ok"), call(1, "m", "summon_agent", "error")]);
  assert.deepEqual(failed, { text: "looked at the game · couldn't summon an agent", tone: "error", open: true }, "an error stays open");
});

test("step lines truncate past three verbs and never repeat one", () => {
  const calls = ["get_observation", "get_observation", "get_chat", "get_events", "get_rules", "list_games"].map((tool, i) => call(i, "m", tool, "ok"));
  assert.equal(stepView(calls).text, "looked at the game · read the public chat · read the event log · +2");
  assert.equal(stepView([call(0, "m", "brand_new_tool", "ok")]).text, "ran brand new tool", "an unknown tool still reads as a verb");
});

test("the optimistic message also shows when the same text is sent again (counted against the user messages before it)", () => {
  const server = [msg(1, "user", "What next?"), msg(2, "assistant", "This.")];
  const shown = withPending(buildTimeline(server, []), "What next?", 1);
  assert.equal(shown.filter(i => i.kind === "user").length, 2, "the repeat shows as pending");
  assert.ok(shown.at(-1)?.kind === "user" && shown.at(-1)!.pending);
  const echoed = withPending(buildTimeline([...server, msg(3, "user", "What next?")], []), "What next?", 1);
  assert.equal(echoed.filter(i => i.kind === "user").length, 2, "and goes once the server has it");
});

test("the allowance note is silent below 80 % and speaks after", () => {
  assert.equal(allowanceNote(500, 1000), null);
  assert.equal(allowanceNote(850, 1000), "15 % of this game's assistant quota left");
  assert.match(allowanceNote(1000, 1000)!, /^Assistant quota used up/);
  assert.equal(allowanceNote(0, 0), null, "off is said elsewhere");
});

test("the queue line says when queued messages reach the assistant: next step, after autopilot stops, held while idle", () => {
  assert.equal(queueNote({ count: 0, active: true }), null);
  assert.equal(queueNote({ count: 1, active: true }), "Queued · your assistant reads it after its current step");
  assert.equal(queueNote({ count: 2, active: true }), "2 queued · your assistant reads them after its current step");
  assert.equal(queueNote({ count: 1, active: true, autopilot: true }), "Queued · autopilot stops; your assistant answers it next");
  assert.equal(queueNote({ count: 1, active: false }), "Held · your assistant stopped; send it now or with your next message");
});

test("a summon's step line carries the warnings of the latest validation of the identical code", () => {
  const source = "def agent(grid):\n    return [write(everything(), 0)]";
  const validated = (src: string, warnings: string[], rate = 0.03) => call(0, "m1", "validate_agent", "ok", { argsJson: JSON.stringify({ source: src, language: "python" }),
    resultJson: JSON.stringify({ data: { status: "received", receipt: { accepted: true, validation: { valid: true, expectedSuccessRate: rate, warnings } } } }) });
  const summon = call(0, "m2", "summon_agent", "ok", { argsJson: JSON.stringify({ source, language: "python", name: "Zero" }) });
  const constant = "It gives every object the same result, so only one object can ever hold this value; every other act will collide.";
  assert.deepEqual(summonWarnings(summon, [validated(source, [constant]), summon]), { successRate: 0.03, warnings: [constant] });
  // Another source's validation, or a clean one, says nothing.
  assert.equal(summonWarnings(summon, [validated("def agent(g):\n    return []", [constant]), summon]), null);
  assert.equal(summonWarnings(summon, [validated(source, [constant]), validated(source, []), summon]), null);
  assert.equal(summonWarnings(call(0, "m", "send_chat", "ok"), []), null);
});
