/**
 * On-demand calibration (docs/analytic-calibration/architecture.md §3): a shape with no shipped tables gets its draws'
 * tables from the family's analytic (at once), or from one sampling action per missing table, cached by key. What would
 * break: a draw left without a table, a second request recomputing a cached table, a cached table whose key is not the
 * current code's, or a first use slower than the planning window. Runs against the live local backend; the measured
 * first-use latency is printed (the architecture document records it). Not part of `test:game` (it samples for 10 s to
 * minutes): `pnpm --filter @workspace/engine test:calibration` runs it with the storage test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { context, family, tableKey } from "@workspace/game-utilities";
import { familiesFor } from "@workspace/game-utilities";
import { admin, api, gods, internal, roomWith, touch, waitFor } from "./game-helpers.ts";

/** A shape the repository ships no tables for (every Grid shape is shipped since PR #57; this Int range is not). */
const settings = { objectType: "Int", typeArgs: { min: 0, max: 2147483647 }, priorId: "uniform" };
const inst = instantiate("Int", settings.typeArgs);
const analyticDraw = { familyId: "digit-devotee", params: { d: 7 } };             // digit counts: analytic, instant
const sampled = [3, 4, 5].map(n => ({ familyId: "smooth-operator", params: { primes: [3, 5, 7, 11, 13].slice(0, n) } }));
const draws = [analyticDraw, ...sampled];

test("first use on a new shape: analytic draws are ready at once, sampled draws are computed in parallel actions and cached", { timeout: 600_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  const started = performance.now();
  const first = await admin.action(internal.calibration.compute.prepare, { settings, draws });
  assert.equal(first.instance, inst.key);
  assert.deepEqual(first.ready.map((r: { familyId: string; source: string }) => [r.familyId, r.source]), [["digit-devotee", "analytic"]]);
  assert.deepEqual(first.pending.map((p: { familyId: string; scheduled: boolean }) => [p.familyId, p.scheduled]), sampled.map(d => [d.familyId, true]));
  // The keys are the current code's, for the canonical params.
  for (const [i, p] of first.pending.entries()) {
    const f = family(p.familyId), draw = sampled[i]!;
    assert.equal(p.key, tableKey(f.id, f.canonical(draw.params, context(inst)), inst));
  }
  // Poll until every table has landed; a later request must never schedule again.
  const last = await waitFor(async () => {
    const r = await admin.action(internal.calibration.compute.prepare, { settings, draws });
    assert.ok(r.pending.every((p: { scheduled: boolean }) => !p.scheduled), "a second request must not schedule again");
    return r.pending.length ? undefined : r;
  }, `tables of ${inst.key}`, 540_000, 1000);
  const firstUseSeconds = (performance.now() - started) / 1000;
  const computed = last.ready.filter((r: { source: string }) => r.source === "computed");
  assert.equal(computed.length, sampled.length);
  const builds = computed.map((r: { familyId: string; buildMs: number }) => `${r.familyId} ${(r.buildMs / 1000).toFixed(1)} s`);
  console.log(`# on-demand first use on ${inst.key}: ${firstUseSeconds.toFixed(1)} s wall for ${sampled.length} sampled tables in parallel (builds: ${builds.join(", ")}); analytic ${analyticDraw.familyId} in ${first.ready[0].buildMs?.toFixed(0) ?? "<1"} ms`);
  // Warm: everything ready, nothing scheduled, quick.
  const warm = await admin.action(internal.calibration.compute.prepare, { settings, draws });
  assert.equal(warm.pending.length, 0);
  assert.equal(warm.ready.length, draws.length);
  assert.ok(warm.ms < 5000, `warm resolution took ${warm.ms.toFixed(0)} ms`);
  console.log(`# warm resolution of ${draws.length} draws: ${warm.ms.toFixed(0)} ms`);
  // The cached rows are ready and keyed by the current code.
  const rows = await admin.mutation(internal.calibration.cache.getMany, { keys: computed.map((r: { key: string }) => r.key) });
  assert.equal(rows.length, computed.length);
  for (const row of rows) { assert.equal(row.status, "ready"); assert.equal(JSON.parse(row.table).key, row.key); }
});

test("a shipped shape resolves every draw from the warm file without computing anything; impossible draws fail at once", async () => {
  const shipped = { objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" }, priorId: "uniform" };
  const r = await admin.action(internal.calibration.compute.prepare, { settings: shipped, draws: [{ familyId: "snap", params: {} }, { familyId: "hate_colour", params: { colour: 0 } }] });
  assert.equal(r.pending.length, 0);
  assert.deepEqual(r.ready.map((x: { source: string }) => x.source), ["file", "file"]);
  // A family of another object type is refused before anything is claimed.
  await assert.rejects(admin.action(internal.calibration.compute.prepare, { settings: shipped, draws: [{ familyId: "digit-devotee", params: { d: 7 } }] }), /Int family/);
});

test("a game started on a shape with no shipped file deals, prepares its tables by a real fan-out of actions, then reaches planning", { timeout: 600_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  const members = await gods("Fanout Owner", "Fanout Ada", "Fanout Bo");
  await touch(members[0]);
  // Only smooth-operator may be dealt: three gods, its three sampled tables, none ready.
  const excludedFamilies = familiesFor("Int", "reward").map(f => f.id).filter(id => id !== "smooth-operator");
  const { roomId } = await roomWith(members, { objectType: "Int", typeArgs: settings.typeArgs, languages: ["typescript"], excludedFamilies, halfLifeSeconds: 100000 });
  const started = performance.now();
  const first = await members[0].c.action(api.owner.start, { roomId, requestId: crypto.randomUUID() });
  assert.deepEqual([first.status, first.ready, first.total], ["preparing", 0, 3]);
  let seenProgress = false;
  const game = await waitFor(async () => {
    const r = await members[1].c.query(api.rooms.get, { room: roomId });
    assert.equal(r.preparing?.error, undefined, "no table failed");
    if (r.preparing && r.preparing.ready > 0 && r.preparing.ready < 3) seenProgress = true;
    return r.activeGame;
  }, "the prepared game", 540_000, 500);
  assert.equal(game.phase, "planning");
  console.log(`# start on ${inst.key} with 3 tables to compute: planning after ${((performance.now() - started) / 1000).toFixed(1)} s${seenProgress ? " (progress observed)" : ""}`);
  // Scoring works: the starting objects carry every god's score from the computed tables.
  const g = await admin.query(internal.testing.rawGame, { gameId: game.id });
  assert.ok(g.objects.length > 0 && g.objects.every((o: { scores: unknown[] }) => o.scores.length === 3));
  await members[0].c.mutation(api.rooms.endActiveGame, { roomId });
});

test("a slow table is planned in pieces, fanned out, merged and cached: the bytes are those the pieces make in any process", { timeout: 900_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  // truncation-saint is this range's slowest table (a factorising evaluator: tens of µs per evaluation, 50 s here).
  const draw = { familyId: "truncation-saint", params: {} };
  const first = await admin.action(internal.calibration.compute.prepare, { settings, draws: [draw] });
  assert.equal(first.pending.length, 1);
  const key = first.pending[0].key;
  const started = performance.now();
  const last = await waitFor(async () => {
    const r = await admin.action(internal.calibration.compute.prepare, { settings, draws: [draw] });
    return r.pending.length ? undefined : r;
  }, `the split table of ${draw.familyId}`, 840_000, 2000);
  const [row] = await admin.mutation(internal.calibration.cache.getMany, { keys: [key] });
  const table = JSON.parse(row.table);
  const pieces = table.estimator.split?.replicates ?? 1;
  assert.ok(pieces > 1, `the planner split the table (planned ${pieces})`);
  const { budgetFor, buildTable, tableJson } = await import("@workspace/game-utilities/estimator");
  const f = family(draw.familyId);
  assert.equal(row.table, tableJson(buildTable(draw.familyId, f.canonical(draw.params, context(inst)), inst, budgetFor("Int"), { plan: { replicates: pieces } }).table));
  console.log(`# ${draw.familyId} on ${inst.key}: ${pieces} pieces (${(await admin.mutation(internal.calibration.cache.getMany, { keys: [key] }))[0].buildMs?.toFixed(0)} ms merge), ready after ${((performance.now() - started) / 1000).toFixed(1)} s; ready: ${last.ready.map((r: { source: string }) => r.source)}`);
});
