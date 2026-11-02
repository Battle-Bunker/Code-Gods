import test from "node:test";
import assert from "node:assert/strict";
import { agentDisplayName } from "../../convex/lib/agentName.ts";

// An agent summoned before names existed has none stored; its owner sees the generated default, "Agent N" by position.
test("agents without a stored name get a generated default; named ones keep theirs", () => {
  assert.equal(agentDisplayName(undefined, 0), "Agent 1");
  assert.equal(agentDisplayName(undefined, 1), "Agent 2");
  assert.equal(agentDisplayName("", 2), "Agent 3");
  assert.equal(agentDisplayName("Hoarder", 2), "Hoarder");
});
