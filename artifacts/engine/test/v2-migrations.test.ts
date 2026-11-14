/**
 * The schema migrations (convex/migrations.ts runAll; CLAUDE.md "Schema migrations") on v2 rows stored before the
 * change, against the live local backend. Decision 23 (#488) took the level off values and moves and the ladder off
 * rules. What would break: a row left in the old shape after the migration reports success (the later narrowing would
 * then fail to deploy), a migration touching anything else, or a second run changing anything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans } from "./v2-helpers.ts";

async function runAll() {
  const since = Date.now();
  await admin.mutation("migrations:runAll", { reset: true });
  for (let i = 0; ; i++) {
    const statuses = await admin.query("migrations:status", {}) as { name: string; state: string; latestStart?: number }[];
    assert.ok(!statuses.some(s => s.state === "failed" || s.state === "canceled"), JSON.stringify(statuses));
    if (statuses.every(s => s.state === "success" && (s.latestStart ?? 0) >= since)) return statuses;
    assert.ok(i < 1200, `every migration reports success: ${JSON.stringify(statuses)}`);
    await new Promise(r => setTimeout(r, 250));
  }
}

test("decision 23's levels and ladders leave stored rows; the rest is untouched; a second run changes nothing", { timeout: 600_000 }, async () => {
  const [owner, player] = await humans("Mig Owner", "Mig Player");
  const { gameId } = await admin.mutation("v2/testing:seedGame", { owner: owner!.userId, humans: [player!.userId], practice: 1 });
  await admin.mutation("v2/testing:legacyLevels", { gameId });
  const legacy = await admin.query("v2/testing:legacyCounts", { gameId });
  for (const t of ["rules", "values", "moves"] as const) assert.ok(legacy[t][0] > 0 && legacy[t][0] === legacy[t][1], `the fixture is legacy: ${t} ${legacy[t]}`);
  for (const run of [1, 2]) {
    const statuses = await runAll();
    assert.deepEqual(statuses.map(s => s.name).sort(), ["migrations:noiseKeys", "migrations:shownValues", "migrations:stripLevels", "migrations:stripObjectLevels", "migrations:stripRuleLadders"]);
    const now = await admin.query("v2/testing:legacyCounts", { gameId });
    for (const t of ["rules", "values", "moves"] as const) assert.deepEqual(now[t], [0, legacy[t][1]], `run ${run}: no ${t} row keeps a level or ladder`);
    assert.deepEqual(now.points, legacy.points, `run ${run}: the values themselves are untouched`);
  }
});

test("the disclosure noise reaches stored games not yet ended: a key, and every value row's disclosed fields; ended games are left exact", { timeout: 600_000 }, async () => {
  const [owner, player, other] = await humans("Noise Owner", "Noise Player", "Noise Other");
  const live = (await admin.mutation("v2/testing:seedGame", { owner: owner!.userId, humans: [player!.userId], practice: 1 })).gameId;
  const ended = (await admin.mutation("v2/testing:seedGame", { owner: other!.userId, practice: 2 })).gameId;
  await admin.mutation("v2/testing:markEnded", { gameId: ended });
  const before = await admin.query("v2/testing:noiseState", { gameId: live });
  assert.ok(!before.key && before.shown === 0 && before.rows > 0, `the fixture predates the noise: ${JSON.stringify(before)}`);
  for (const run of [1, 2]) {
    await runAll();
    const now = await admin.query("v2/testing:noiseState", { gameId: live });
    assert.ok(now.key, `run ${run}: the live game has its key`);
    assert.equal(now.consistent, now.rows, `run ${run}: every row discloses its state's noise`);
    assert.deepEqual(now.points, before.points, `run ${run}: the exact values are untouched`);
    const done = await admin.query("v2/testing:noiseState", { gameId: ended });
    assert.ok(!done.key && done.shown === 0, `run ${run}: an ended game is left exact`);
  }
});
