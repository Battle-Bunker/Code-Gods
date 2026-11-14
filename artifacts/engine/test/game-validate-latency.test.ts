/**
 * A player's Validate in a practice game (the room's default setup: Python, two mock AI seats playing their turns): an
 * edited agent, so nothing is answered from the examination cache, must come back in a few seconds. It is the first
 * thing a beginner does after changing the pre-filled example; "is it stuck?" starts at about five seconds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { admin, adminGods, api, envelope, internal, raw, sleep, startGame, touch, sandboxesWarm, waitFor } from "./game-helpers.ts";

const VALIDATE_MS = Number(process.env.CG_VALIDATE_MS ?? 5000), PLANNING = 10, ROUNDS = Number(process.env.CG_VALIDATE_ROUNDS ?? 6);

test("an edited agent validates within five seconds while two AI seats play", { timeout: 300000 }, async () => {
  await sandboxesWarm();
  const [host] = await adminGods("Practice Host");
  await touch(host);
  // The default room, as the app's "practice game" makes it: its own settings, AI players in the empty seats.
  const { roomId } = await host.c.mutation(api.rooms.create, {});
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: false });
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  for (let i = 0; i < 2; i++) await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  // A short planning phase, so the validations below meet the running world: every agent's acts each tick.
  const room = await host.c.query(api.rooms.get, { room: roomId });
  await host.c.action(api.owner.settings, { roomId, revision: room.revision, settings: { ...room.settings, planningSeconds: PLANNING } });
  const { gameId } = await startGame(host, roomId);
  // The player's own agents act too (as after a first summon).
  for (let i = 0; i < 2; i++) {
    const summoned = await host.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", name: `Mine ${i}`, language: "python", source: `def agent(grid):\n    return [slide(row(0), ${i + 1})]` }, gameId) });
    assert.equal(summoned.accepted, true, JSON.stringify(summoned).slice(0, 300));
  }
  await waitFor(async () => (await raw(gameId)).game.phase === "running" || undefined, "the world runs", 120_000, 500);
  await sleep(3000);
  const times: number[] = [];
  // Six validations over the seats' first turns (they start 1 s and 3.5 s in, then every 12 s), each of new code.
  for (let i = 0; i < ROUNDS; i++) {
    const source = `def agent(grid):\n    edit = ${randomInt(2, 1_000_000)}\n    return [slide(row(0), 1)]`;
    const from = Date.now();
    const result = await host.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "validate", language: "python", source }, gameId) });
    times.push(Date.now() - from);
    assert.equal(result.accepted, true, JSON.stringify(result).slice(0, 300));
    await sleep(ROUNDS > 6 ? 700 : 2500);
  }
  console.log(`validate latencies (ms): ${times.join(", ")}`);
  assert.ok(Math.max(...times) <= VALIDATE_MS, `every validate within ${VALIDATE_MS} ms: ${times.join(", ")}`);
});
