/**
 * Abuse controls on the expensive commands (docs/external-clients.md §5): every validate or summon runs the agent a
 * few hundred times in the sandbox, so a looping client (a buggy player app, an agent with a token) is capped per
 * human per room, whatever credential or surface it uses. A refusal is RATE_LIMITED with no receipt: the identical
 * envelope works once the minute has passed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, playerClient, rejects, roomWith, startGame, touch, TS } from "./game-helpers.ts";

const INT_TS = { languages: ["typescript"], language: "typescript", objectType: "Int", spawnRateHz: 0, planningSeconds: 3600, halfLifeSeconds: 3600 };
const LIMIT = 30;

test("validate and summon examinations are capped per human per room per minute, across credentials; older ones stop counting", { timeout: 180_000 }, async () => {
  const [host, ada, bo] = await gods("Limit Host", "Limit Ada", "Limit Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], INT_TS);
  const game = await startGame(host, roomId);
  const validate = () => envelope({ type: "validate", language: "typescript", source: TS.Int }, game.gameId);

  // Ada has used her minute: through her browser and through a player app alike, the next examination is refused.
  await admin.mutation(internal.testing.seedExaminations, { roomId, godId: ada.subject, count: LIMIT, ageMs: 1000 });
  assert.match(await rejects(ada.c.action(api.commands.submit, { roomId, envelope: validate() })), /At most 30 agent checks a minute/);
  const app = await playerClient(ada, roomId, "act");
  const refused = validate();
  assert.match(await rejects(app.action(api.commands.submit, { roomId, envelope: refused })), /At most 30/);
  assert.equal(await ada.c.query(api.receipts.get, { roomId, commandId: refused.commandId }), null, "no receipt: the same envelope may be retried");
  assert.match(await rejects(ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", language: "typescript", source: TS.Int }, game.gameId) })), /At most 30/,
    "summon counts too");

  // Other humans are not affected; cheap commands are not limited by it.
  assert.equal((await bo.c.action(api.commands.submit, { roomId, envelope: validate() })).accepted, true);
  assert.equal((await ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "ready", ready: true }) })).accepted, true);

  // A minute later the window has moved on: the refused envelope now runs.
  await admin.mutation(internal.testing.ageExaminations, { roomId, godId: ada.subject, byMs: 61_000 });
  const retried = await app.action(api.commands.submit, { roomId, envelope: refused });
  assert.equal(retried.accepted, true, JSON.stringify(retried));
  assert.equal(retried.validation.valid, true);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
