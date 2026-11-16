/**
 * A command's receipt (v1's "Check a command's status…", cmd-dock-receipts-get; the retry-uncertain banner): every
 * write sent with a `requestId` leaves a receipt when it applies, and `receipt.get` answers, for the caller only,
 * whether it applied and with what result. A command whose outcome is unknown is safe to send again with the same
 * requestId: the receipt answers it instead of applying it twice (v2-contract).
 *
 * What would break: a receipt read that answers another caller's command; "not applied" for a command that applied.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { humans, perform } from "./v2-helpers.ts";

test("receipt.get: applied with its result, not applied, and never another caller's", async () => {
  const [ada, bo] = await humans("Receipt Ada", "Receipt Bo");
  const { roomId } = (await perform(ada!, "room.create", { name: "Receipt room" })).result;
  const requestId = randomUUID();
  const sent = await perform(ada!, "chat.send", { text: "hello", requestId }, { roomId });
  assert.equal(sent.ok, true, JSON.stringify(sent));

  const mine = await perform(ada!, "receipt.get", { id: requestId }, {}, "query");
  assert.equal(mine.ok, true, JSON.stringify(mine));
  assert.deepEqual(mine.result, { applied: true, operation: "chat.send", result: sent.result });
  const unknown = await perform(ada!, "receipt.get", { id: randomUUID() }, {}, "query");
  assert.deepEqual(unknown.result, { applied: false, operation: null, result: null }, "never sent, or refused: safe to send again");
  const refusedId = randomUUID();
  assert.equal((await perform(bo!, "chat.send", { text: "hi", requestId: refusedId }, { roomId })).ok, false, "Bo is not in the room");
  assert.equal((await perform(bo!, "receipt.get", { id: refusedId }, {}, "query")).result.applied, false, "a refused command leaves no receipt");
  const theirs = await perform(bo!, "receipt.get", { id: requestId }, {}, "query");
  assert.deepEqual(theirs.result, { applied: false, operation: null, result: null }, "another caller's receipt is never answered");
});
