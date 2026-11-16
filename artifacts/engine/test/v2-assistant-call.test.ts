/**
 * One assistant tool call in detail (v1's ToolDetail; `v2/assistant:call`): what was sent and what came back, for the
 * turn's own human only. What would break: another human reading a call; the args not as sent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans } from "./v2-helpers.ts";

test("a turn's call: its tool, args and outcome for the turn's human; nobody else's", async () => {
  const [ada, bo] = await humans("Call Ada", "Call Bo");
  const { roomId } = await admin.mutation("v2/testing:seedGame", { owner: ada!.userId, humans: [bo!.userId] });
  const { turnId } = await admin.mutation("v2/testing:seedAssistant", { roomId, userId: ada!.userId, turns: 1 });
  const c = await ada!.query("v2/assistant:call", { turnId, index: 1 });
  assert.deepEqual([c.tool, c.ok, c.summary, c.args, c.argsText, c.result], ["rule_explain", true, "done", {}, null, null]);
  assert.equal(await ada!.query("v2/assistant:call", { turnId, index: 9 }), null, "no such call");
  assert.equal(await bo!.query("v2/assistant:call", { turnId, index: 1 }), null, "another human's turn");
});
