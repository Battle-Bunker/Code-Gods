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
    assert.ok(i < 240, `every migration reports success: ${JSON.stringify(statuses)}`);
    await new Promise(r => setTimeout(r, 250));
  }
}

test("decision 23's levels and ladders leave stored rows; the rest is untouched; a second run changes nothing", { timeout: 120_000 }, async () => {
  const [owner, player] = await humans("Mig Owner", "Mig Player");
  const { gameId } = await admin.mutation("v2/testing:seedGame", { owner: owner!.userId, humans: [player!.userId], practice: 1 });
  await admin.mutation("v2/testing:legacyLevels", { gameId });
  const legacy = await admin.query("v2/testing:legacyCounts", { gameId });
  for (const t of ["rules", "values", "moves"] as const) assert.ok(legacy[t][0] > 0 && legacy[t][0] === legacy[t][1], `the fixture is legacy: ${t} ${legacy[t]}`);
  for (const run of [1, 2]) {
    const statuses = await runAll();
    assert.deepEqual(statuses.map(s => s.name).sort(), ["migrations:stripLevels", "migrations:stripObjectLevels", "migrations:stripRuleLadders"]);
    const now = await admin.query("v2/testing:legacyCounts", { gameId });
    for (const t of ["rules", "values", "moves"] as const) assert.deepEqual(now[t], [0, legacy[t][1]], `run ${run}: no ${t} row keeps a level or ladder`);
    assert.deepEqual(now.points, legacy.points, `run ${run}: the values themselves are untouched`);
  }
});
