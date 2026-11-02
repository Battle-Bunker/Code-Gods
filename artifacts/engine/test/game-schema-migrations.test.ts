/**
 * The component migrations (convex/migrations.ts runAll, @convex-dev/migrations; CLAUDE.md "Schema migrations") on
 * rows stored before the change, against the live local backend. What would break: an existing room's owner turned
 * into a spectator (their room would stop starting with its players), a member or game left without the field after
 * the migration reports success (the later narrowing would then fail to deploy), or a second run changing anything.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { admin, api, internal, raw, roomWith, gods, startGame, touch, waitFor } from "./game-helpers.ts";

const INT_TS = { language: "typescript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform", objectType: "Int", spawnRateHz: 0, startingObjectCount: 3, halfLifeSeconds: 100000 };

/**
 * Starts runAll and waits for every migration to report success, and for `done()` (the rows the test expects): right
 * after a restart the status can still read the previous run's success before the new run has touched a row.
 */
async function runAll(reset: boolean, done: () => Promise<boolean>) {
  await admin.mutation(internal.migrations.runAll, reset ? { reset: true } : {});
  await waitFor(done, "the migrated rows", 120_000, 250);
  return waitFor(async () => {
    const statuses = await admin.query(internal.migrations.status, {}) as { name: string; state: string; processed: number }[];
    assert.ok(!statuses.some(s => s.state === "failed" || s.state === "canceled"), JSON.stringify(statuses));
    return statuses.every(s => s.state === "success") && statuses;
  }, "every migration reports success", 120_000, 250);
}

test("spectators backfill: stored members keep playing, stored games had no spectators; a second run changes nothing", { timeout: 240_000 }, async () => {
  const [host, ada, bo] = await gods("Mig Host", "Mig Ada", "Mig Bo");
  await touch(host);
  const { roomId } = await roomWith([host, ada, bo], INT_TS);
  const game = await startGame(host, roomId);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });
  await admin.mutation(internal.testing.legacySpectators, { roomId });
  assert.ok((await admin.query(internal.testing.rawMembers, { roomId })).every((m: any) => m.spectator === undefined), "the fixture is legacy");

  const members = () => admin.query(internal.testing.rawMembers, { roomId }) as Promise<any[]>;
  const statuses = await runAll(true, async () => (await members()).every(m => m.spectator !== undefined) && (await raw(game.gameId)).game.spectators !== undefined);
  assert.deepEqual(statuses.map(s => s.name).sort(), ["migrations:backfillGameSpectators", "migrations:backfillMemberSpectator"]);
  // Catches: the owner (or anyone) backfilled as a spectator; a row left unset.
  assert.deepEqual((await members()).map(m => m.spectator), [false, false, false]);
  assert.deepEqual((await raw(game.gameId)).game.spectators, []);
  // The room still starts with the same three players.
  const next = await startGame(host, roomId);
  assert.equal((await raw(next.gameId)).game.roster.length, 3);
  await host.c.mutation(api.rooms.endActiveGame, { roomId });

  // Idempotent: a run over migrated rows (a new member already has the field) keeps every value.
  await host.c.mutation(api.rooms.setSpectator, { roomId, spectator: true });
  await runAll(true, async () => true);
  assert.deepEqual((await admin.query(internal.testing.rawMembers, { roomId }) as any[]).map(m => [m.godId === host.subject, m.spectator]).sort(),
    [[false, false], [false, false], [true, true]]);
});
