/**
 * Parameter drift (convex/v2/drift.ts; the coordinator's trial, call 18), live: a room set to drift every 10 world
 * seconds, with Ada dealt a family that has a parameter grid. At 10 s her rule's parameters are redrawn (family and
 * tie-breaker kept), her rule document and card say so, the record has a `drift` event, and every stored value agrees
 * with the new rules.
 *
 * What would break: a drift that never happens, changes the family, leaves values computed under the old rule, or
 * is missing from the record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, humans, perform } from "./v2-helpers.ts";
import { VALUE_RECORDS } from "../convex/v2/values.gen.ts";

test("every driftSeconds, a seat's parameters are redrawn; the rule, the values and the record follow", { timeout: 180_000 }, async () => {
  const [ada] = await humans("Drift Ada");
  const { roomId } = (await perform(ada!, "room.create", { name: "Drift room" })).result;
  await perform(ada!, "seats.fillPracticePartners", {}, { roomId });
  assert.equal((await perform(ada!, "room.settings", { overrides: { driftSeconds: 10 } }, { roomId })).ok, true);
  const { gameId } = (await perform(ada!, "game.start", {}, { roomId })).result;
  assert.equal((await ada!.query("v2/games:header", { gameId })).driftSeconds, 10);
  // A line-q family with several parameter values (its grid), for Ada.
  const counts = new Map<string, number>();
  for (const r of VALUE_RECORDS) if (r.variant === "line-q") counts.set(`${r.family}|${r.tieBreaker}`, (counts.get(`${r.family}|${r.tieBreaker}`) ?? 0) + 1);
  const [pick] = [...counts].find(([, n]) => n >= 3)!;
  const rec = VALUE_RECORDS.find(r => r.variant === "line-q" && `${r.family}|${r.tieBreaker}` === pick)!;
  await admin.mutation("v2/testing:setRule", { gameId, userId: ada!.userId, ruleKey: rec.ruleKey });
  const before = await ada!.query("v2/play:myRule", { gameId });
  assert.deepEqual([before.ruleKey, before.drifts, before.driftedAt], [rec.ruleKey, 0, null]);

  await perform(ada!, "game.startWorldNow", {}, { gameId });
  for (let i = 0; (await admin.query("v2/testing:clock", { gameId })).worldSeconds < 11; i++) {
    assert.ok(i < 120, "the world reaches 11 s");
    await new Promise(r => setTimeout(r, 500));
  }
  const after = await ada!.query("v2/play:myRule", { gameId });
  assert.equal(after.drifts, 1);
  assert.ok(after.driftedAt >= 10 && after.driftedAt < 13, `drifted at ${after.driftedAt}`);
  assert.deepEqual([after.family, after.tieBreaker], [before.family, before.tieBreaker], "never the family or tie-breaker");
  assert.notEqual(JSON.stringify(after.params), JSON.stringify(before.params), "the parameters changed");
  assert.notEqual(after.ruleKey, before.ruleKey);

  const events = await admin.query("v2/testing:events", { gameId, after: -1 });
  const drift = events.find((e: any) => e.kind === "drift");
  assert.ok(drift && drift.data.k === 1 && drift.data.seats.some((s: any) => s.ruleKey === after.ruleKey), "the record has the redraw");
  assert.ok(events.some((e: any) => e.kind === "values" && e.seq > drift.seq), "and the objects' values under the new rules");
  await perform(ada!, "game.pause", {}, { gameId });
  const { rows, stale } = await admin.query("v2/testing:staleValues", { gameId });
  assert.ok(rows > 0 && stale === 0, `every stored value agrees with the current rules: ${stale} of ${rows} stale`);
  await perform(ada!, "game.end", {}, { gameId });
});
