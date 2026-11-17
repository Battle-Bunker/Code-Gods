import { test } from "node:test";
import assert from "node:assert/strict";
import { AFFORDANCES, assistantTools, toolName, type AffordanceContext } from "@workspace/v2-affordances";
import { aiSeatSystemPrompt, assistantSystemPrompt, mockProvider, pitchDraft } from "../src/index.ts";
import { NAMED_HELPERS } from "../src/prompts.ts";
import { HELPERS } from "../../v2-agents/src/primer.ts";

const ctx: AffordanceContext = {
  context: "planning",
  principal: { signedIn: true, member: true, seated: true, owner: false, admin: false },
  room: { players: 3, minPlayers: 2 },
  game: { phase: "planning", energy: 100, pauseUsed: false, agents: 0 },
};
const tools = assistantTools(ctx);
const RULE = "Make the gradient close to a prime; the bigger that prime, the better.";
const STARTERS = [{ title: "Simple", summary: "One small step a turn.", language: "python", source: "def agent(offer):\n    return None\n" }];

const VOCAB = ["points", "one utility", "a line's energy for a rule, in bits", "your bits × theirs. Your total adds up all the lines.", "pins ONE lens", "surprise", "power", "line"];

for (const [name, prompt] of [
  ["assistant", assistantSystemPrompt({ context: "planning", playerName: "Ada", rule: RULE, affordances: tools, starters: STARTERS })],
  ["AI seat", aiSeatSystemPrompt({ name: "Robo", rule: RULE, affordances: tools, starters: STARTERS })],
] as const) {
  test(`the ${name} prompt teaches the vocabulary, lists the context's affordances and how a score is made`, () => {
    assert.ok(tools.some(t => t.name === "agent_check") && tools.some(t => t.name === "agent_summon"));
    for (const word of VOCAB) assert.ok(prompt.includes(word), word);
    for (const t of tools) assert.ok(prompt.includes(t.name), t.name);
    assert.ok(prompt.includes(RULE) && prompt.includes("def agent(offer)"));
    // Check before summoning.
    assert.ok(prompt.indexOf("Always agent_check") >= 0 && prompt.indexOf("Always agent_check") < prompt.indexOf("agent_summon or"));
  });
}

test("the assistant prompt lists only the context's tools", () => {
  const home = assistantSystemPrompt({ context: "home", affordances: [{ name: "room_list", description: "", input_schema: {} }] });
  assert.match(home, /- room: room_list/);
  assert.doesNotMatch(home.split("TOOLS in this context:")[1]!, /agent_summon/);
});

test("pitchDraft returns the mock's text, from one call with no tools", async () => {
  let seen: { tools: number; prompt: string } | undefined;
  const mock = mockProvider([{ text: "  Let's both push gradients to 7: it's prime and odd.  " }]);
  const provider = { ...mock, step: async (r: Parameters<typeof mock.step>[0]) => {
    seen = { tools: r.tools.length, prompt: JSON.stringify(r.messages) };
    return mock.step(r);
  } };
  const out = await pitchDraft({ provider, myCard: RULE, players: [{ name: "Bo", rule: "odd gradients" }], aim: "share a line" });
  assert.equal(out.draft, "Let's both push gradients to 7: it's prime and odd.");
  assert.equal(seen!.tools, 0);
  assert.match(seen!.prompt, /untrusted/);
  assert.ok(out.usd > 0);
});

test("the AI seat plays for points: the scoring identity, a turn loop of real tools, deals, and child-safe chat", () => {
  const live: AffordanceContext = { ...ctx, context: "live", game: { phase: "live", energy: 100, pauseUsed: false, agents: 1 } };
  const liveTools = assistantTools(live);
  const prompt = aiSeatSystemPrompt({ name: "Robo", rule: RULE, affordances: liveTools });
  assert.match(prompt, /times the other players' energy there/);
  assert.match(prompt, /a line only you like scores nothing/);
  assert.match(prompt, /tug-of-war/);
  // Every tool the turn loop names exists in the seat's context.
  for (const name of ["game_standings", "objects_list", "moves_list", "chat_send", "agent_replace"]) {
    assert.ok(prompt.includes(name), name);
    assert.ok(liveTools.some(t => t.name === name), `${name} is a tool in a live game`);
  }
  assert.match(prompt, /children/);
  assert.match(prompt, /Never lie about your rule/);
  assert.match(prompt, /at most one message per turn/);
});

test("the assistant and the AI seat both teach paying for an agent: price, pull back just enough, pay, re-share, say what it cost", () => {
  const live: AffordanceContext = { ...ctx, context: "live", game: { phase: "live", energy: 100, pauseUsed: false, agents: 1 } };
  const liveTools = assistantTools(live);
  for (const prompt of [
    assistantSystemPrompt({ context: "live", playerName: "Ada", rule: RULE, affordances: liveTools }),
    aiSeatSystemPrompt({ name: "Robo", rule: RULE, affordances: liveTools }),
  ]) {
    assert.match(prompt, /PAYING FOR AN AGENT/);
    const at = (s: string) => prompt.indexOf(s, prompt.indexOf("PAYING FOR AN AGENT"));
    assert.ok(at("agent_check") < at("power_allocate") && at("power_allocate") < at("agent_summon"), "price, then pull back, then pay");
    for (const name of ["agent_check", "agents_list", "power_allocate", "agent_summon", "agent_replace"]) assert.ok(liveTools.some(t => t.name === name), name);
    assert.match(prompt, /in one line what you did and what it cost/);
    assert.match(prompt, /costs only the change/);
  }
});

test("the prompts cannot go stale silently: every tool and helper they name exists; no words of the old game", () => {
  const live: AffordanceContext = { ...ctx, context: "live", game: { phase: "live", energy: 100, pauseUsed: false, agents: 1 } };
  const tools = new Set(Object.keys(AFFORDANCES).map(id => toolName(id as never)));
  for (const prompt of [
    assistantSystemPrompt({ context: "live", playerName: "Ada", rule: RULE, affordances: assistantTools(live), starters: STARTERS }),
    assistantSystemPrompt({ context: "planning", playerName: "Ada", rule: RULE, affordances: assistantTools(ctx) }),
    aiSeatSystemPrompt({ name: "Robo", rule: RULE, affordances: assistantTools(live), starters: STARTERS }),
  ]) {
    // Every tool-shaped name (namespace_action) in the text is an affordance of the directory.
    for (const [name] of prompt.matchAll(/\b(?:agent|agents|power|chat|game|objects|object|moves|log|rule|view|room|replay|panel|panels|account)_[a-zA-Z]+\b/g)) {
      assert.ok(tools.has(name), `the prompt names ${name}, which is not an affordance`);
    }
    // The old game's words (owner decision 50: a rule is one utility; energy in bits, not rarity).
    for (const word of [/tie-?breaker/i, /main part/i, /rarity/i]) assert.doesNotMatch(prompt, word);
  }
  const helpers = new Set(HELPERS.map(h => h.name));
  for (const h of NAMED_HELPERS) assert.ok(helpers.has(h), `the prompts name the helper ${h}, which the agent API lacks`);
});
