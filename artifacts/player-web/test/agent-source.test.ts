import assert from "node:assert/strict";
import { test } from "node:test";
import { highlight } from "../src/core/chat/tool-detail.ts";
import { pruneSourceOpen, setSourceOpen, sourceOpen } from "../src/core/panels/agent-source-state.ts";

test("an agent's source is highlighted in its language and reassembles exactly", () => {
  const cases: [string, string, string][] = [
    ["python", "def act(obs):\n    return 1  # go", "def"],
    ["typescript", "export const act = () => 'x';", "const"],
    ["haskell", "act obs = if True then 1 else 2 -- go", "then"],
  ];
  for (const [language, code, keyword] of cases) {
    const tokens = highlight(code, language);
    assert.equal(tokens.map(t => t.text).join(""), code);
    assert.ok(tokens.some(t => t.kind === "keyword" && t.text === keyword), `${language}: ${keyword} is a keyword`);
    assert.ok(tokens.some(t => t.kind === "comment" || t.kind === "string"));
  }
});

test("the Source disclosure is collapsed by default, remembered per agent, and forgotten with the agent", () => {
  assert.equal(sourceOpen("a1"), false);
  assert.equal(sourceOpen("a1", true), true, "the panel's showSource param sets the default");
  setSourceOpen("a1", true);
  setSourceOpen("a2", true);
  assert.equal(sourceOpen("a1"), true);
  assert.equal(sourceOpen("a3"), false, "another agent is unaffected");
  setSourceOpen("a1", false);
  assert.equal(sourceOpen("a1", true), false, "an explicit collapse beats the default");
  pruneSourceOpen(["a1"]);
  assert.equal(sourceOpen("a2"), false, "a destroyed agent's choice is dropped");
});
