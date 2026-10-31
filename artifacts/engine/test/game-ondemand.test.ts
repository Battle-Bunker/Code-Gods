/**
 * On-demand calibration (docs/analytic-calibration/architecture.md §3): a shape with no shipped tables gets its draws'
 * tables from the family's analytic (at once), or from one sampling action per missing table, cached by key. What would
 * break: a draw left without a table, a second request recomputing a cached table, a cached table whose key is not the
 * current code's, or a first use slower than the planning window. Runs against the live local backend; the measured
 * first-use latency is printed (the architecture document records it).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiate } from "@workspace/game-types";
import { context, family, tableKey } from "@workspace/game-utilities";
import { admin, internal } from "./game-helpers.ts";

/** A shape the repository ships no tables for. */
const settings = { objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "rgby" }, priorId: "uniform" };
const inst = instantiate("Grid", settings.typeArgs);
const analyticDraw = { familyId: "hate_colour", params: { colour: 1 } };           // Binomial: analytic, instant
const sampled = [{ familyId: "snap", params: {} }, { familyId: "odds_evens", params: { X: null } }, { familyId: "hate_blob", params: { C: 2 } }];
const draws = [analyticDraw, ...sampled];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

test("first use on a new shape: analytic draws are ready at once, sampled draws are computed in parallel actions and cached", { timeout: 600_000 }, async () => {
  await admin.mutation(internal.calibration.cache.forget, { instance: inst.key });
  const started = performance.now();
  const first = await admin.action(internal.calibration.compute.prepare, { settings, draws });
  assert.equal(first.instance, inst.key);
  assert.deepEqual(first.ready.map((r: { familyId: string; source: string }) => [r.familyId, r.source]), [["hate_colour", "analytic"]]);
  assert.deepEqual(first.pending.map((p: { familyId: string; scheduled: boolean }) => [p.familyId, p.scheduled]).sort(), sampled.map(d => [d.familyId, true]).sort());
  // The keys are the current code's, for the canonical params.
  for (const p of first.pending) {
    const f = family(p.familyId), draw = draws.find(d => d.familyId === p.familyId)!;
    assert.equal(p.key, tableKey(f.id, f.canonical(draw.params, context(inst)), inst));
  }
  // Poll until every table has landed.
  let last = first;
  while (last.pending.length) {
    assert.ok(performance.now() - started < 540_000, `still pending after ${((performance.now() - started) / 1000).toFixed(0)} s: ${JSON.stringify(last.pending)}`);
    await sleep(1000);
    last = await admin.action(internal.calibration.compute.prepare, { settings, draws });
    assert.ok(last.pending.every((p: { scheduled: boolean }) => !p.scheduled), "a second request must not schedule again");
  }
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
  const rows = await admin.query(internal.calibration.cache.getMany, { keys: computed.map((r: { key: string }) => r.key) });
  assert.equal(rows.length, computed.length);
  for (const row of rows) { assert.equal(row.status, "ready"); assert.equal(JSON.parse(row.table).key, row.key); }
});

test("a shipped shape resolves every draw from the warm file without computing anything", async () => {
  const shipped = { objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" }, priorId: "uniform" };
  const r = await admin.action(internal.calibration.compute.prepare, { settings: shipped, draws: [{ familyId: "snap", params: {} }, { familyId: "hate_colour", params: { colour: 0 } }] });
  assert.equal(r.pending.length, 0);
  assert.deepEqual(r.ready.map((x: { source: string }) => x.source), ["file", "file"]);
});
