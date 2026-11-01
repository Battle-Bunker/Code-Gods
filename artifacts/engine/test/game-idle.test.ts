/**
 * Idle parking (plan §0): after 30 minutes without authenticated human activity the loop stops and running
 * games enter `recovery` with auto-resume, world time frozen; a human `activity.touch` resumes them without
 * simulating the downtime. The 2,000-object safety stop (no auto-resume) waits for the owner's Resume.
 * The watchdog restarts a game whose tick lease expired.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, gods, internal, raw, rejects, roomWith, sleep, touch, waitFor } from "./game-helpers.ts";

const settings = {
  languages: ["typescript"], objectType: "Int",
  typeArgs: { min: -2147483648, max: 2147483647 }, startingObjectCount: 3, spawnRateHz: 0, planningSeconds: 3600,
};

test("idle parking freezes running games; a human touch resumes them; safety stops wait for the owner", { timeout: 180000 }, async () => {
  const trio = await gods("Idle Host", "Idle Ada", "Idle Bo");
  const [host, ada] = trio;
  await touch(host);
  const { roomId } = await roomWith(trio, settings);
  const game = await host.c.action(api.owner.start, { roomId });
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.25 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.phase === "running", "running");
  try {
    // Idle: the loop parks the game itself on its next tick.
    await admin.mutation(internal.testing.setActivity, { at: Date.now() - 31 * 60 * 1000 });
    assert.equal((await ada.c.query(api.activity.status, {})).idle, true);
    await waitFor(async () => (await raw(game.gameId)).game.phase === "recovery", "the idle loop parks the game", 30000);
    let secret = await raw(game.gameId);
    assert.equal(secret.game.autoResume, true);
    const frozen = secret.game.worldSeconds, seq = secret.game.tick.seq;
    assert.match(secret.game.recoveryReason, /idle/);
    assert.equal((await ada.c.query(api.player.observation, { roomId })).phase, "paused", "recovery shows as paused to players");
    await sleep(2500);
    secret = await raw(game.gameId);
    assert.equal(secret.game.worldSeconds, frozen, "parked world time stays frozen");
    assert.equal(secret.game.tick.seq, seq, "no ticks are scheduled while parked");

    // A human returns: the game resumes and the downtime is not simulated.
    await touch(ada);
    secret = await raw(game.gameId);
    assert.equal(secret.game.phase, "running");
    assert.ok(Math.abs(secret.game.worldSeconds - frozen) < 1e-9, "resuming never skips simulated time");
    await sleep(1500);
    secret = await raw(game.gameId);
    assert.ok(secret.game.worldSeconds - frozen < 5, "downtime is not simulated");
    assert.ok(secret.game.tick.seq > seq, "the loop runs again");

    // A safety stop (no auto-resume) waits for the owner's resume.
    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { phase: "recovery", recoveryReason: "The world reached its 2,000-object safety limit.", executionEpoch: secret.game.executionEpoch + 1 } });
    await admin.mutation(internal.testing.setActivity, { at: Date.now() - 31 * 60 * 1000 });
    await touch(ada);
    assert.equal((await raw(game.gameId)).game.phase, "recovery", "only idle recoveries resume themselves");
    assert.match(await rejects(ada.c.mutation(api.rooms.resume, { roomId })), /owner/i);
    await host.c.mutation(api.rooms.resume, { roomId });
    assert.equal((await raw(game.gameId)).game.phase, "running");

    // The watchdog restarts an expired lease.
    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { tick: { seq: (await raw(game.gameId)).game.tick.seq + 100, leaseUntil: 0 } } });
    const restarted = await admin.mutation(internal.engine.loop.watchdog, {});
    assert.ok(restarted.restarted >= 1);
    const before = (await raw(game.gameId)).game.tick.seq;
    await waitFor(async () => (await raw(game.gameId)).game.tick.seq > before, "the restarted loop ticks", 20000);
  } finally {
    await touch(host);
    await host.c.mutation(api.rooms.endActiveGame, { roomId }).catch(() => {});
  }
});

test("the owner's Resume brings back an idle-parked game", { timeout: 120000 }, async () => {
  const trio = await gods("Resume Host", "Resume Ada", "Resume Bo");
  const [host] = trio;
  await touch(host);
  const { roomId } = await roomWith(trio, settings);
  const game = await host.c.action(api.owner.start, { roomId });
  await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now(), endAtWorld: 3517.25 }, kick: true });
  await waitFor(async () => (await raw(game.gameId)).game.phase === "running", "running");
  try {
    await admin.mutation(internal.testing.setActivity, { at: Date.now() - 31 * 60 * 1000 });
    await waitFor(async () => (await raw(game.gameId)).game.phase === "recovery", "the idle loop parks the game", 30000);
    // The Resume button (or the assistant's room-command resume) on an idle-parked game: no prior touch.
    await host.c.mutation(api.rooms.resume, { roomId });
    assert.equal((await raw(game.gameId)).game.phase, "running");
  } finally {
    await touch(host);
    await host.c.mutation(api.rooms.endActiveGame, { roomId }).catch(() => {});
  }
});
