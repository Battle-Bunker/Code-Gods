/** "How to play" states the room's real end rule (src/core/panels/end-rule.ts). */
import test from "node:test";
import assert from "node:assert/strict";
import { endRuleSentence } from "../src/core/panels/end-rule.ts";

test("a fixed game ends on its countdown; a half-life game at a hidden random moment; unknown settings claim neither", () => {
  // Catches: "The game ends at a random moment" beside a countdown (the default setup is fixed, 5 minutes).
  assert.equal(endRuleSentence({ durationMode: "fixed", halfLifeSeconds: 300 }), "The game ends when its countdown reaches zero, 5 minutes after the world starts.");
  assert.equal(endRuleSentence({ durationMode: "fixed", halfLifeSeconds: 90 }), "The game ends when its countdown reaches zero, 90 seconds after the world starts.");
  assert.equal(endRuleSentence({ durationMode: "fixed", halfLifeSeconds: 60 }), "The game ends when its countdown reaches zero, 1 minute after the world starts.");
  assert.equal(endRuleSentence({ durationMode: "halfLife", halfLifeSeconds: 300 }),
    "The game ends at a hidden random moment: half of games end within 5 minutes of the world starting, and the timer shows a range, not an exact time.");
  assert.equal(endRuleSentence({}), "The game ends when its countdown reaches zero, or in some setups at a hidden random moment.");
  assert.doesNotMatch(endRuleSentence({ durationMode: "fixed" }), /random/);
});
