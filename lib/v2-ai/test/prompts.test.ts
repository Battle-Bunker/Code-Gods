import { test } from "node:test";
import assert from "node:assert/strict";
import { assistantTools, type AffordanceContext } from "@workspace/v2-affordances";
import { aiSeatSystemPrompt, assistantSystemPrompt, mockProvider, pitchDraft } from "../src/index.ts";

const ctx: AffordanceContext = {
  context: "planning",
  principal: { signedIn: true, member: true, seated: true, owner: false, admin: false },
  room: { players: 3, minPlayers: 2 },
  game: { phase: "planning", energy: 100, pauseUsed: false, agents: 0 },
};
const tools = assistantTools(ctx);
const RULE = "Make the gradient close to a prime; tie-breaker: the bigger that prime, the better.";
const STARTERS = [{ title: "Simple", summary: "One small step a turn.", language: "python", source: "def agent(offer):\n    return None\n" }];

const VOCAB = ["points", "✨ rarity", "⚡ energy", "power", "main part", "tie-breaker", "line"];

for (const [name, prompt] of [
  ["assistant", assistantSystemPrompt({ context: "planning", playerName: "Ada", rule: RULE, affordances: tools, starters: STARTERS })],
  ["AI seat", aiSeatSystemPrompt({ name: "Robo", rule: RULE, affordances: tools, starters: STARTERS })],
] as const) {
  test(`the ${name} prompt teaches the vocabulary, lists the context's affordances and never says "bits"`, () => {
    assert.ok(tools.some(t => t.name === "agent_check") && tools.some(t => t.name === "agent_summon"));
    for (const word of VOCAB) assert.ok(prompt.includes(word), word);
    for (const t of tools) assert.ok(prompt.includes(t.name), t.name);
    assert.doesNotMatch(prompt, /\bbits?\b/i);
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
