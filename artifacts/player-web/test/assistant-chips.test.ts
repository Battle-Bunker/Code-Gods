import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestionsFor } from "../src/panes/assistant-chips.ts";

test("v1's chips: at most three questions for the phase, in the game's noun", () => {
  const t = (o: Parameters<typeof suggestionsFor>[0]) => suggestionsFor(o);
  assert.deepEqual(t({ phase: "planning", seated: true, agents: 0, noun: "line" }), ["Explain my goal simply", "Write me a first agent", "What should my agent do?"]);
  assert.deepEqual(t({ phase: "planning", seated: true, agents: 1, noun: "line" })[1], "Is my agent any good?");
  assert.deepEqual(t({ phase: "live", seated: true, agents: 2, noun: "grid" }), ["What should I do next?", "Which grids matter to me?", "What do the others want?"]);
  assert.equal(t({ phase: "live", seated: true, agents: 0, noun: "line" })[0], "Write me an agent");
  assert.deepEqual(t({ phase: "live", seated: false, agents: 0, noun: "line" }), ["What's happening?", "Who's winning?", "How do I join the next game?"]);
  assert.deepEqual(t({ phase: "ended", seated: true, agents: 1, noun: "line" }), ["Why did I finish there?", "What would have worked better?", "Show the results"]);
  for (const phase of ["planning", "live", "paused", "ended"] as const) assert.ok(t({ phase, seated: true, agents: 1, noun: "line" }).length <= 3);
});
