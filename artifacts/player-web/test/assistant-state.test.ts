/**
 * Pure UI state of the assistant pane (src/core/chat/state.ts): the timeline built from a thread's messages and
 * tool calls, the optimistic user message, the confirmation-card state machine, the allowance meter and chip labels.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  allowanceMeter, allowanceNote, buildTimeline, cardReducer, chipView, confirmSentence, initialCard, prettyArgs, stepView, withPending, withSteps, type CallRow, type MessageRow,
} from "../src/core/chat/state.ts";

const msg = (seq: number, role: "user" | "assistant", text: string, over: Partial<MessageRow> = {}): MessageRow =>
  ({ _id: `m${seq}`, turnId: "t1", seq, role, text, status: "done", ...over });
const call = (index: number, messageId: string, tool: string, status: CallRow["status"], over: Partial<CallRow> = {}): CallRow =>
  ({ _id: `c${messageId}${index}`, turnId: "t1", messageId, index, tool, status, argsJson: "{}", summary: "", resultJson: null, ...over });

test("the timeline orders messages by seq and puts each step's tool calls after its text, in call order", () => {
  const timeline = buildTimeline(
    [msg(3, "assistant", "", { _id: "m3" }), msg(1, "user", "hi"), msg(2, "assistant", "Looking", { _id: "m2" }), msg(4, "assistant", "Done", { _id: "m4" })],
    [call(1, "m2", "get_chat", "ok"), call(0, "m2", "get_observation", "ok"), call(0, "m3", "summon_agent", "awaiting_confirmation")],
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

test("a confirmation card submits one decision at a time, settles when the server moves on, and can retry after an error", () => {
  let s = initialCard;
  s = cardReducer(s, { type: "submit", decision: "approve" });
  assert.deepEqual(s, { phase: "submitting", decision: "approve" });
  assert.deepEqual(cardReducer(s, { type: "submit", decision: "deny" }), s, "no second decision while one is in flight");
  const failed = cardReducer(s, { type: "failed", message: "network" });
  assert.deepEqual(failed, { phase: "error", decision: "approve", message: "network" });
  assert.deepEqual(cardReducer(failed, { type: "submit", decision: "deny" }), { phase: "submitting", decision: "deny" });
  const sent = cardReducer(s, { type: "sent" });
  assert.deepEqual(sent, { phase: "sent", decision: "approve" });
  assert.deepEqual(cardReducer(sent, { type: "server", status: "running" }), { phase: "settled", status: "running" });
  assert.deepEqual(cardReducer(initialCard, { type: "server", status: "awaiting_confirmation" }), initialCard, "still waiting");
  assert.deepEqual(cardReducer(initialCard, { type: "server", status: "denied" }), { phase: "settled", status: "denied" }, "timed out on the server");
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
    [call(0, "m2", "get_observation", "ok"), call(1, "m2", "validate_agent", "ok"), call(2, "m2", "open_lens", "ok", { argsJson: '{"lensId":"forge"}' }),
      call(0, "m3", "send_chat", "denied")],
  );
  const items = withSteps(timeline);
  assert.deepEqual(items.map(i => i.kind), ["user", "step", "assistant", "step"], "each step's calls fold into one line, after its text");
  const [first, second] = items.filter(i => i.kind === "step");
  assert.deepEqual(stepView(first.calls), { text: "looked at the game · tested agent code · showed Agent code", tone: "ok", open: false });
  assert.deepEqual(stepView(second.calls), { text: "you declined: post to everyone", tone: "muted", open: false });
  assert.deepEqual(stepView([call(0, "m", "validate_agent", "running")]), { text: "testing agent code…", tone: "busy", open: false });
  assert.equal(stepView([call(0, "m", "summon_agent", "awaiting_confirmation")]).text, "waiting for you: summon an agent");
  assert.equal(stepView([call(0, "m", "summon_agent", "awaiting_confirmation")]).tone, "ask");
  const failed = stepView([call(0, "m", "get_observation", "ok"), call(1, "m", "summon_agent", "error")]);
  assert.deepEqual(failed, { text: "looked at the game · couldn't summon an agent", tone: "error", open: true }, "an error stays open");
});

test("step lines truncate past three verbs and never repeat one", () => {
  const calls = ["get_observation", "get_observation", "get_chat", "get_events", "get_rules", "list_games"].map((tool, i) => call(i, "m", tool, "ok"));
  assert.equal(stepView(calls).text, "looked at the game · read the public chat · read the event log · +2");
  assert.equal(stepView([call(0, "m", "brand_new_tool", "ok")]).text, "ran brand new tool", "an unknown tool still reads as a verb");
});

test("confirmation cards lead with a plain sentence", () => {
  assert.equal(confirmSentence(call(0, "m", "send_chat", "awaiting_confirmation", { argsJson: '{"text":"Let\'s leave the blue grids alone"}' })),
    "Post to everyone: \"Let's leave the blue grids alone\"");
  assert.equal(confirmSentence(call(0, "m", "summon_agent", "awaiting_confirmation"), { energy: 412 }), "Summon this agent: it pays from your 412 bits of energy");
  assert.equal(confirmSentence(call(0, "m", "pause_game", "awaiting_confirmation"), { pauseSeconds: 180 }), "Use your one pause: it stops the world for everyone for 180 s");
  assert.match(confirmSentence(call(0, "m", "destroy_agent", "awaiting_confirmation", { argsJson: '{"agentId":"abc"}' })), /^Destroy your agent abc/);
  assert.equal(confirmSentence(call(0, "m", "end_game", "awaiting_confirmation")), "End the game now for everyone");
  assert.equal(confirmSentence(call(0, "m", "send_chat", "awaiting_confirmation", { argsJson: "not json" })), "Post to everyone: \"\"");
});

test("the allowance note is silent below 80 % and speaks after", () => {
  assert.equal(allowanceNote(500, 1000), null);
  assert.equal(allowanceNote(850, 1000), "15 % of this game's assistant allowance left");
  assert.match(allowanceNote(1000, 1000)!, /^Allowance used up/);
  assert.equal(allowanceNote(0, 0), null, "off is said elsewhere");
});
