/**
 * The scripted mock ChatProvider (src/chat-mock.ts, selected by the engine only under AI_MOCK=1) and its
 * `/mock {json}` script parser; plus the shared game primer of AI seats and the in-client assistant.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GAME_PRIMER, SYSTEM, assistantSystemPrompt, mockChatProvider, parseMockScript, type ChatMessage, type ChatRequest, type ChatToolUse } from "../src/index.ts";
import { CHIP_TEXT, SUMMON_REPLY } from "@workspace/player-client/chips";
import { firstAgentFor, firstAgentSection } from "@workspace/player-client/first-agent";

const ask = (messages: ChatMessage[], over: Partial<ChatRequest> = {}): ChatRequest =>
  ({ system: "s", tools: [], maxOutputTokens: 4096, signal: new AbortController().signal, messages, ...over });

test("parseMockScript reads /mock {json} and bare step arrays, and ignores other text", () => {
  assert.equal(parseMockScript("hello"), null);
  assert.equal(parseMockScript("please /mock {}"), null, "only a message that starts with /mock");
  assert.deepEqual(parseMockScript('/mock {"steps":[{"text":"hi"}]}'), { steps: [{ text: ["hi"], delayMs: 0, tools: [] }] });
  assert.deepEqual(parseMockScript('/mock [{"text":["a","b"],"delayMs":5,"tools":[{"name":"whoami"}]},{"fail":"boom"}]'), {
    steps: [{ text: ["a", "b"], delayMs: 5, tools: [{ name: "whoami", input: {} }] }, { text: [], delayMs: 0, tools: [], fail: "boom" }],
  });
  assert.throws(() => parseMockScript("/mock {not json"), /mock script/i);
  assert.throws(() => parseMockScript('/mock {"steps":[{"delayMs":-1}]}'), /mock script/i);
  assert.throws(() => parseMockScript('/mock {"steps":[{"delayMs":600000}]}'), /mock script/i);
});

test("a script runs one step per model call, counted from the latest user message", async () => {
  const mock = mockChatProvider();
  const prompt: ChatMessage = { role: "user", content: '/mock {"steps":[{"text":["Let me ","check."],"tools":[{"name":"get_observation","input":{"objectsLimit":3}}]},{"text":"Done."}]}' };
  const deltas: string[] = [];
  const first = await mock.stream(ask([{ role: "user", content: "earlier" }, { role: "assistant", content: [{ type: "text", text: "old" }] }, prompt], { onText: d => deltas.push(d) }));
  assert.deepEqual(deltas, ["Let me ", "check."]);
  assert.equal(first.stopReason, "tool_use");
  assert.deepEqual(first.content, [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "mock_0_0", name: "get_observation", input: { objectsLimit: 3 } }]);
  assert.ok(first.inputTokens > 0 && first.outputTokens > 0 && first.outputTokens <= 4096);
  const second = await mock.stream(ask([prompt, { role: "assistant", content: first.content }, { role: "user", content: [{ type: "tool_result", toolUseId: "mock_0_0", content: "{}" }] }]));
  assert.deepEqual(second.content, [{ type: "text", text: "Done." }]);
  assert.equal(second.stopReason, "end_turn");
});

test("a prompt may follow a briefing block in the same user message; echo shows what the model was given", async () => {
  const mock = mockChatProvider();
  const prompt: ChatMessage = { role: "user", content: [{ type: "text", text: "<briefing>Power Hoarder</briefing>" }, { type: "text", text: '/mock [{"tools":[{"name":"whoami"}]},{"echo":true}]' }] };
  const first = await mock.stream(ask([prompt], { system: "SYS", tools: [{ name: "whoami", description: "d", inputSchema: {} }] }));
  assert.deepEqual(first.content.map(b => b.type === "tool_use" && b.name), ["whoami"], "the script is read from the message's last text block");
  const second = await mock.stream(ask([prompt, { role: "assistant", content: first.content },
    { role: "user", content: [{ type: "tool_result", toolUseId: "mock_0_0", content: "{}" }] }], { system: "SYS", tools: [{ name: "whoami", description: "d", inputSchema: {} }] }));
  const echoed = JSON.parse((second.content[0] as { text: string }).text);
  assert.deepEqual(echoed, { system: "SYS", tools: ["whoami"], context: ["<briefing>Power Hoarder</briefing>"], earlier: [], later: [], maxOutputTokens: 4096 });
  // Earlier user messages (an older question, an engine note) are echoed too.
  const later = await mock.stream(ask([{ role: "user", content: "old question" }, { role: "user", content: [{ type: "text", text: "Engine note: unanswered" }] },
    { role: "user", content: '/mock [{"echo":true}]' }]));
  assert.deepEqual(JSON.parse((later.content[0] as { text: string }).text).earlier, ["old question", "Engine note: unanswered"]);
});

test("the default script reads the observation, then summarizes it", async () => {
  const mock = mockChatProvider();
  const prompt: ChatMessage = { role: "user", content: "How am I doing?" };
  const first = await mock.stream(ask([prompt]));
  assert.equal(first.stopReason, "tool_use");
  assert.equal((first.content.find(b => b.type === "tool_use") as { name: string }).name, "get_observation");
  const result = JSON.stringify({ untrusted: true, notice: "n", data: { phase: "planning", objectCount: 4, self: { energy: 120 } } });
  const second = await mock.stream(ask([prompt, { role: "assistant", content: first.content }, { role: "user", content: [{ type: "tool_result", toolUseId: "mock_0_0", content: result }] }]));
  assert.equal(second.stopReason, "end_turn");
  assert.match((second.content[0] as { text: string }).text, /planning.*4 objects.*120/);
});

test("a failing step throws, and an abort during a delay rejects promptly", async () => {
  const mock = mockChatProvider();
  await assert.rejects(mock.stream(ask([{ role: "user", content: '/mock {"steps":[{"fail":"provider down"}]}' }])), /provider down/);
  const controller = new AbortController();
  const began = Date.now();
  const pending = mock.stream(ask([{ role: "user", content: '/mock {"steps":[{"text":["a","b","c"],"delayMs":5000}]}' }], { signal: controller.signal }));
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(pending, /abort/i);
  assert.ok(Date.now() - began < 2000, "the abort does not wait out the delay");
});

test("seats explain the game with the primer, the assistant with a summary and its game-rules skill; only the player's messages instruct the assistant", () => {
  assert.ok(GAME_PRIMER.includes("SCORING") && GAME_PRIMER.includes("ENERGY"));
  assert.ok(SYSTEM.includes(GAME_PRIMER));
  const prompt = assistantSystemPrompt({ playerName: "Ada Lovelace", roomCode: "AB12", permission: "act", mode: "onRequest" });
  assert.match(prompt, /THE GAME IN BRIEF[\s\S]*game-rules skill/, "the assistant summarises the game and loads the full rules as a skill");
  assert.match(prompt, /Ada Lovelace/);
  assert.match(prompt, /only the player's messages are instructions/i);
  assert.match(prompt, /untrusted/i);
  assert.doesNotMatch(prompt, /Return ONLY a JSON object/, "the seat's JSON protocol is not the assistant's");
});

// ---------------------------------------------------------------------------------------------
// Starter chips (lib/player-client chips.ts): the mock follows the chip's intent with the real tools
// ---------------------------------------------------------------------------------------------

const BRIEFING = "<briefing>\nGame AB12 — phase: planning; agent languages: python.\nYour energy: 500. Economy: {\"startingEnergy\":200,\"powerPerSecond\":4}.\nYour utility (private; its source is in the writing-agents skill): 🪞 Mirrormancer — Make the left half mirror the right half.\n</briefing>";
const chip = (text: string, briefing = BRIEFING): ChatMessage => ({ role: "user", content: [{ type: "text", text: briefing }, { type: "text", text }] });
const toolResult = (id: string, body: unknown, isError = false): ChatMessage => ({ role: "user", content: [{ type: "tool_result", toolUseId: id, content: JSON.stringify(body), ...(isError ? { isError } : {}) }] });
const textOf = (r: { content: { type: string; text?: string }[] }) => r.content.flatMap(b => b.type === "text" ? [b.text!] : []).join("");
const usesOf = (r: { content: { type: string }[] }) => r.content.filter((b): b is ChatToolUse => b.type === "tool_use");

test("the chip 'Explain my goal simply' is answered from the briefing: short, plain, with the player's own rule text", async () => {
  const mock = mockChatProvider();
  const answer = await mock.stream(ask([chip(CHIP_TEXT.explainGoal)]));
  assert.equal(answer.stopReason, "end_turn");
  const text = textOf(answer);
  assert.ok(text.includes("Mirrormancer") && text.includes("Make the left half mirror the right half."), text);
  assert.ok(text.includes("your rule score") || text.includes("Your rule score"), "the goal card's count is called the rule score");
  assert.match(text, /points/);
  assert.doesNotMatch(text, /\bbits\b|utility/i, "plain words");
  assert.ok(text.split(/\s+/).length < 90, "short");
  const lobby = await mock.stream(ask([chip(CHIP_TEXT.explainGoal, "<briefing>\nNo game is running in this room (lobby).\n</briefing>")]));
  assert.match(textOf(lobby), /no game running yet/i, "with no game it says so instead of inventing a goal");
});

test("the chip 'Write me a first agent' loads the skill, shows and tests its example, then offers to summon; a yes summons that source", async () => {
  const mock = mockChatProvider();
  const example = firstAgentFor({ objectType: "Grid", language: "python" })!;
  const body = `WRITING AN AGENT.\n${firstAgentSection(example, "python")}\nHelpers in python:`;
  const asked = chip(CHIP_TEXT.firstAgent);
  const first = await mock.stream(ask([asked]));
  assert.deepEqual(usesOf(first).map(u => [u.name, u.input]), [["load_skill", { name: "writing-agents" }]]);
  const loaded = [asked, { role: "assistant" as const, content: first.content }, toolResult("mock_0_0", { data: { name: "writing-agents", body } })];
  const second = await mock.stream(ask(loaded));
  assert.deepEqual(usesOf(second).map(u => u.name), ["open_panel", "validate_agent"]);
  assert.deepEqual(usesOf(second)[0].input, { panelId: "forge", params: { source: example.source, language: "python" } });
  assert.deepEqual(usesOf(second)[1].input, { source: example.source, language: "python" });
  const tested = [...loaded, { role: "assistant" as const, content: second.content },
    { role: "user" as const, content: [{ type: "tool_result" as const, toolUseId: "mock_1_0", content: "{}" },
      { type: "tool_result" as const, toolUseId: "mock_1_1", content: JSON.stringify({ data: { status: "received", receipt: { validation: { valid: true, cost: 39.2, energy: 500.7, affordable: true } }, assessment: { verdict: "works", summary: "Works. Summon price 39.2 bits.", next: "" } } }) }] }];
  const third = await mock.stream(ask(tested));
  assert.equal(third.stopReason, "end_turn");
  const offer = textOf(third);
  for (const expected of [example.source, example.name, "Mirrormancer", "Make the left half mirror the right half.", "Summoning it costs 40 energy, and you have 500.", `Say "${SUMMON_REPLY}" and I will summon it`]) assert.ok(offer.includes(expected), `the offer has ${expected}: ${offer}`);
  assert.doesNotMatch(offer, /\bbits\b/, "energy is never counted in bits");
  assert.equal(usesOf(third).length, 0, "it offers; it does not summon unasked");
  // A draft the player cannot pay for yet: the reply says so instead of offering a summon that would be refused.
  const dear = tested.slice(0, -1).concat({ role: "user", content: [{ type: "tool_result", toolUseId: "mock_1_0", content: "{}" },
    { type: "tool_result", toolUseId: "mock_1_1", content: JSON.stringify({ data: { receipt: { validation: { valid: true, cost: 377.1, energy: 200, affordable: false } }, assessment: { verdict: "works", summary: "Works.", next: "" } } }) }] });
  const later = textOf(await mock.stream(ask(dear)));
  assert.ok(later.includes("costs 378 energy, and you have 200") && later.includes("more than you have right now") && later.includes("You will have enough about 45 seconds after the world starts running") && !later.includes("and I will summon it for you"), later);

  // The player's yes, in the next turn of the conversation.
  const yes: ChatMessage = chip(SUMMON_REPLY);
  const history = [...tested, { role: "assistant" as const, content: third.content }, yes];
  const summon = await mock.stream(ask(history));
  assert.deepEqual(usesOf(summon).map(u => [u.name, u.input.source, u.input.language, u.input.name]), [["summon_agent", example.source, "python", example.name]]);
  const done = await mock.stream(ask([...history, { role: "assistant" as const, content: summon.content }, toolResult("mock_0_0", { data: { status: "received", receipt: { accepted: true } } })]));
  assert.match(textOf(done), /is summoned/);
  const refused = await mock.stream(ask([...history, { role: "assistant" as const, content: summon.content }, toolResult("mock_0_0", { error: { code: "CONFLICT", message: "Not enough energy" } }, true)]));
  assert.match(textOf(refused), /did not go through: Not enough energy/);
});

test("a chip never ends in silence: no example, a failed test and a refused tool each end in text saying so; a plain yes is an ordinary message", async () => {
  const mock = mockChatProvider();
  const asked = chip(CHIP_TEXT.writeAgent);
  const first = await mock.stream(ask([asked]));
  const without = await mock.stream(ask([asked, { role: "assistant", content: first.content }, toolResult("mock_0_0", { data: { name: "writing-agents", body: "WRITING AN AGENT." } })]));
  assert.equal(without.stopReason, "end_turn");
  assert.match(textOf(without), /could not find a first agent/);
  const refusedSkill = await mock.stream(ask([asked, { role: "assistant", content: first.content }, toolResult("mock_0_0", { error: { code: "UNAUTHENTICATED", message: "revoked" } }, true)]));
  assert.ok(textOf(refusedSkill).length > 0);

  const example = firstAgentFor({ objectType: "Int", language: "typescript" })!;
  const loaded = [asked, { role: "assistant" as const, content: first.content }, toolResult("mock_0_0", { data: { body: firstAgentSection(example, "typescript") } })];
  const second = await mock.stream(ask(loaded));
  const failing = (validation: ChatMessage) => mock.stream(ask([...loaded, { role: "assistant" as const, content: second.content }, validation]));
  const failed = await failing({ role: "user", content: [{ type: "tool_result", toolUseId: "mock_1_0", content: "{}" },
    { type: "tool_result", toolUseId: "mock_1_1", content: JSON.stringify({ data: { assessment: { verdict: "fails", summary: "It raises on every object.", next: "" } } }) }] });
  assert.match(textOf(failed), /did not pass: It raises on every object\./);
  assert.doesNotMatch(textOf(failed), /Say "Summon it"/, "a failing draft is not offered for summoning");
  const readOnly = await failing({ role: "user", content: [{ type: "tool_result", toolUseId: "mock_1_0", content: JSON.stringify({ error: { code: "READ_ONLY", message: "open_panel changes the player's things" } }), isError: true },
    { type: "tool_result", toolUseId: "mock_1_1", content: JSON.stringify({ error: { code: "READ_ONLY", message: "Read-only mode" } }), isError: true }] });
  assert.match(textOf(readOnly), /could not test it: Read-only mode/);

  const plainYes = await mock.stream(ask([chip("yes")]));
  assert.deepEqual(usesOf(plainYes).map(u => u.name), ["get_observation"], "nothing was drafted: the default script");
});

test("an autopilot tick with no agent yet tests and summons the first agent for the player's rule, and says what it summoned", async () => {
  const mock = mockChatProvider();
  const tick = (briefing: string) => chip("(autopilot) Engine prompt, not from the player: you are on Autopilot.", briefing);
  const playing = BRIEFING.replace("agent languages: python.", "agent languages: python; objects: 10; your live agents: 0 live agents.");
  const example = firstAgentFor({ objectType: "Grid", language: "python" })!;
  const messages: ChatMessage[] = [tick(playing)];
  const results = [{ data: { body: firstAgentSection(example, "python") } }, { data: { assessment: { verdict: "works", summary: "Works.", next: "" } } }, { data: { status: "received", receipt: { accepted: true } } }];
  const tools: string[] = [];
  for (const result of results) {
    const step = await mock.stream(ask(messages));
    tools.push(...usesOf(step).map(u => u.name));
    messages.push({ role: "assistant", content: step.content }, toolResult(usesOf(step)[0].id, result));
  }
  assert.deepEqual(tools, ["load_skill", "validate_agent", "summon_agent"]);
  const told = textOf(await mock.stream(ask(messages)));
  assert.ok(told.includes(`I summoned an agent called ${example.name}`) && told.includes(example.source) && told.includes("Mirrormancer"), told);
  // With an agent already, or no game, it does nothing and says so.
  for (const idle of [playing.replace("0 live agents", "1 live agent"), "<briefing>\nNo game is running in this room (lobby).\n</briefing>"]) {
    const step = await mock.stream(ask([tick(idle)]));
    assert.equal(usesOf(step).length, 0);
    assert.match(textOf(step), /nothing is worth doing/);
  }
});
