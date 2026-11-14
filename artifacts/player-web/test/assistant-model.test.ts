/** The assistant pane's pure model (src/panes/assistant-model.ts): chips, allowance words, turn words, the timeline. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { allowanceWords, chipView, GRANT_OPTIONS, isBusy, MODE_OPTIONS, timeline, turnWords } from "../src/panes/assistant-model.ts";

test("a chip names the operation in the directory's own words, not the model's tool name", () => {
  // Catches: chips reading "view_openPane" (the tool name) instead of the affordance's title.
  assert.deepEqual(chipView({ tool: "view_openPane", ok: true, summary: "done" }), { label: "Open a pane", tone: "ok", detail: null });
  assert.deepEqual(chipView({ tool: "agent_summon", ok: false, summary: "Not enough energy." }),
    { label: "Summon an agent", tone: "error", detail: "Not enough energy." });
  // A tool the directory no longer has still reads as words.
  assert.equal(chipView({ tool: "old_thing_gone", ok: true, summary: "done" }).label, "old thing gone");
});

test("the allowance reads as a share used, the larger of tokens and money, and says when it is gone", () => {
  // Catches: a percentage over 100, a NaN on a zero limit, a tiny use shown as 0%, money ignored.
  const a = (usedTokens: number, usedUsd = 0) => allowanceWords({ tokens: 300_000, usd: 2, usedTokens, usedUsd });
  assert.deepEqual(a(0), { used: 0, text: "None of this game's assistant allowance used yet.", low: false, out: false });
  assert.equal(a(300).text, "Less than 1% of this game's assistant allowance used.");
  assert.equal(a(30_000).text, "10% of this game's assistant allowance used.");
  assert.equal(a(30_000, 1).used, 0.5, "money counts when it is the larger share");
  assert.equal(a(250_000).low, true);
  assert.equal(a(299_000).text, "99% of this game's assistant allowance used.", "never 100% while some is left");
  assert.deepEqual(a(400_000), { used: 1, text: "This game's assistant allowance is used up. You can still do everything yourself.", low: true, out: true });
  assert.equal(allowanceWords({ tokens: 0, usd: 0, usedTokens: 0, usedUsd: 0 }).out, true);
});

test("a turn's status reads as a short sentence; a finished turn says nothing", () => {
  assert.equal(turnWords({ status: "running", error: null }), "Working on it…");
  assert.equal(turnWords({ status: "cancelling", error: null }), "Stopping…");
  assert.equal(turnWords({ status: "done", error: null }), null);
  assert.equal(turnWords({ status: "cancelled", error: null }), "Stopped.");
  assert.equal(turnWords({ status: "failed", error: "Model unavailable" }), "Something went wrong: Model unavailable");
  assert.equal(turnWords({ status: "failed", error: null }), "Something went wrong. Try again.");
  assert.match(turnWords({ status: "budget", error: null })!, /allowance/);
  assert.equal(turnWords(null), null);
  assert.equal(isBusy("running"), true);
  assert.equal(isBusy("cancelling"), true);
  assert.equal(isBusy("done"), false);
  assert.equal(isBusy(undefined), false);
});

test("the timeline runs oldest first, grouped by turn, from newest-first pages", () => {
  // Catches: the newest message at the top, or one turn's reply split from its question.
  const m = (seq: number, role: "user" | "assistant", turnId: string, autopilot = false) => ({ seq, role, text: `m${seq}`, autopilot, turnId });
  const page = [m(5, "assistant", "t2"), m(4, "assistant", "t2"), m(3, "user", "t2", true), m(2, "assistant", "t1"), m(1, "user", "t1")];
  const groups = timeline(page);
  assert.deepEqual(groups.map(g => g.turnId), ["t1", "t2"]);
  assert.deepEqual(groups[1]!.messages.map(x => x.seq), [3, 4, 5]);
  assert.equal(groups[1]!.autopilot, true);
  assert.equal(groups[0]!.autopilot, false);
  assert.deepEqual(timeline([]), []);
});

test("every mode and grant has a plain label and one line, with no dashes", () => {
  assert.deepEqual(MODE_OPTIONS.map(o => o.id), ["onRequest", "autopilot", "readOnly"]);
  assert.deepEqual(GRANT_OPTIONS.map(o => o.id), ["read", "act", "owner"]);
  for (const o of [...MODE_OPTIONS, ...GRANT_OPTIONS]) {
    assert.ok(o.label && o.detail, o.id);
    assert.doesNotMatch(`${o.label} ${o.detail}`, /—|–/, o.id);
  }
});
