/**
 * Agent sandboxes boot asynchronously (lib/sandboxes.ts, runtime/readiness.ts). What would break: a start that waits
 * for a cold runtime to boot (seconds, on a cold instance), validate or summon blocking or failing instead of saying
 * the sandbox is warming (or receipting that answer, so the identical retry never runs), AI seats spending tokens
 * before they could summon, world time starting before every allowed language can run, or a runtime that cannot boot
 * stalling silently instead of saying why.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, envelope, gods, internal, raw, rejects, roomWith, sandboxesWarm, startGame, touch, PY, waitFor } from "./game-helpers.ts";

const INT = { languages: ["python"], objectType: "Int", typeArgs: { min: -2147483648, max: 2147483647 }, spawnRateHz: 0, planningSeconds: 3600,
  startingObjectCount: 4, agentEnergyPerSecond: 1000, agentBatteryActs: 1000, interactionRateHz: 20, halfLifeSeconds: 1e9 };

const pythonRow = async () => (await admin.query(internal.testing.sandboxes, {})).find((r: any) => r.language === "python");
/** Back to a warm Python sandbox for the next test: the row's last attempt is long past, so the next ensure boots it. */
async function rewarm() {
  await admin.mutation(internal.testing.setSandbox, { language: "python", patch: { attemptAt: Date.now() - 3600_000, attempts: 0 } });
  await admin.action(api.manifest.get, {});
  await waitFor(async () => (await pythonRow())?.state === "ready" || undefined, "python ready again", 60_000, 100);
}

test("a start never waits for a cold sandbox; validate, summon and AI seats wait for it; planning holds until it is warm", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Warm Host", "Warm Ada", "Warm Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], INT);
  await admin.mutation(internal.aiTemplates.ensureSeeded, {});
  const { godId: aiId } = await host.c.mutation(api.rooms.addAi, { roomId, templateId: "sonnet-strategist" });
  await host.c.mutation(api.rooms.approveAiBudget, { roomId, aiBudget: 300_000 });
  try {
    // A boot in flight (as on a fresh deployment): nothing will finish it for a minute.
    await admin.mutation(internal.testing.setSandbox, { language: "python", patch: { state: "warming", attemptAt: Date.now() } });
    const started = Date.now();
    const game = await startGame(host, roomId);
    const startMs = Date.now() - started;
    assert.ok(game.gameId, "the game starts");
    assert.equal((await pythonRow()).state, "warming", "the start returned without booting or waiting for the sandbox");
    console.log(`start with a cold sandbox: ${startMs} ms`);

    const obs = await ada.c.query(api.player.observation, { roomId });
    assert.deepEqual(obs.sandboxes, [{ language: "python", state: "warming" }], "players see the sandbox warming");

    const validate = envelope({ type: "validate", language: "python", source: PY.Int }, game.gameId);
    const early = await ada.c.action(api.commands.submit, { roomId, envelope: validate });
    assert.equal(early.accepted, false);
    assert.equal(early.notReady.state, "warming");
    assert.equal(early.notReady.language, "python");
    assert.ok(early.notReady.retryAfterMs > 0);
    assert.match(early.message, /Python agent sandbox is warming up/);
    const summon = await bo.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "summon", language: "python", source: PY.Int }, game.gameId) });
    assert.equal(summon.notReady?.state, "warming", "summon waits too");

    // The AI seat waits without calling its provider.
    await waitFor(async () => {
      const { members } = await admin.query(internal.testing.rawRoom, { roomId });
      return /warm up/.test(members.find((m: any) => m.godId === aiId)?.status ?? "") || undefined;
    }, "the AI seat says it waits for the sandbox", 30_000, 200);
    assert.equal((await admin.query(internal.testing.rawRoom, { roomId })).room.aiUsed ?? 0, 0, "no tokens spent before it could summon");

    // Planning's deadline passes: world time does not start while the sandbox is warming.
    await admin.mutation(internal.testing.patchGame, { gameId: game.gameId, patch: { planningEndsAt: Date.now() }, kick: true });
    const seq = (await raw(game.gameId)).game.tick.seq;
    await waitFor(async () => (await raw(game.gameId)).game.tick.seq >= seq + 2 || undefined, "the held loop polls", 20_000, 100);
    const held = (await raw(game.gameId)).game;
    assert.equal(held.phase, "planning", "planning holds past its deadline");
    assert.equal(held.worldSeconds, 0);

    // The boot in flight is lost (its action died): the held loop's next check schedules a real one.
    await admin.mutation(internal.testing.setSandbox, { language: "python", patch: { attemptAt: Date.now() - 61_000 } });
    await waitFor(async () => {
      const o = await ada.c.query(api.player.observation, { roomId });
      return o.sandboxes?.[0]?.state === "ready" || undefined;
    }, "the sandbox becomes ready", 60_000, 100);
    await waitFor(async () => (await raw(game.gameId)).game.phase === "running" || undefined, "world time starts once it is warm", 20_000, 100);

    // Nothing was receipted: the identical command now runs.
    const later = await ada.c.action(api.commands.submit, { roomId, envelope: validate });
    assert.equal(later.accepted, true, later.message);
    assert.equal(later.validation.valid, true);
    assert.equal(later.notReady, undefined);
    await waitFor(async () => (await raw(game.gameId)).agents.some((a: any) => a.ownerId === aiId) || undefined, "the AI seat summons once warm", 90_000, 500);
    await host.c.mutation(api.rooms.endActiveGame, { roomId });
  } finally { await rewarm(); }
});

test("a sandbox that fails to boot says why: in the observation, at validate, and by refusing the next start", { timeout: 180_000 }, async () => {
  await sandboxesWarm();
  const [host, ada, bo] = await gods("Fail Host", "Fail Ada", "Fail Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], INT);
  const game = await startGame(host, roomId);
  try {
    // A boot is scheduled, then reports a failure (the warm-up action's own report path).
    const token = Date.now();
    const row = await admin.mutation(internal.testing.setSandbox, { language: "python", patch: { state: "warming", attemptAt: token } });
    const settled = await admin.mutation(internal.runtime.readiness.settle, { language: "python", token, version: row.version, ok: false, reason: "the probe agent crashed", bootMs: 5 });
    assert.equal(settled.applied, true);
    const stale = await admin.mutation(internal.runtime.readiness.settle, { language: "python", token: token - 1, version: row.version, ok: true, bootMs: 5 });
    assert.equal(stale.applied, false, "a superseded boot's report is ignored");

    const obs = await ada.c.query(api.player.observation, { roomId });
    assert.deepEqual(obs.sandboxes, [{ language: "python", state: "failed", reason: "the probe agent crashed" }]);
    const refused = await ada.c.action(api.commands.submit, { roomId, envelope: envelope({ type: "validate", language: "python", source: PY.Int }, game.gameId) });
    assert.equal(refused.accepted, false);
    assert.deepEqual([refused.notReady.state, refused.notReady.reason], ["failed", "the probe agent crashed"]);
    assert.match(refused.message, /Python agent sandbox failed to start: the probe agent crashed/);
    await host.c.mutation(api.rooms.endActiveGame, { roomId });

    // Inside the retry backoff, a start says why instead of starting a game nobody could play.
    const message = await rejects(host.c.action(api.owner.start, { roomId }));
    assert.match(message, /Python runtime is unavailable: the probe agent crashed/);
  } finally { await rewarm(); }
  // A keep-warm refresh that fails on one instance does not take a version that has booted away from every game.
  const ready = await pythonRow();
  const refresh = await admin.mutation(internal.runtime.readiness.settle, { language: "python", token: ready.attemptAt, version: ready.version, ok: false, reason: "transient", bootMs: 5 });
  assert.equal(refresh.applied, true);
  assert.equal((await pythonRow()).state, "ready");
  // Past the backoff the boot is retried, and starts work again.
  const again = await startGame(host, roomId);
  assert.ok(again.gameId);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
});
