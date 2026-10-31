/**
 * Calibration tables in file storage: scripts/upload-calibration.mjs uploads what changed (by content hash) and the
 * engine loads an instantiation's file lazily, caching it per process (convex/engine/calibration.ts). What would
 * break: an upload that re-sends unchanged files or misses a changed one, a loader that serves an old file after a
 * re-upload, or a client action that cannot get its own tables.
 * Runs against the live local backend (`pnpm --filter @workspace/engine dev` uploads the tables at start).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CALIBRATION_DIR, convexRunner, instanceFiles, uploadCalibration } from "../scripts/upload-calibration.mjs";
import { admin, api, gods, internal } from "./game-helpers.ts";

const convex = convexRunner();
const quiet = { log: () => {} };
const INSTANCE = "Int(0,9999)";
const settings = { objectType: "Int", typeArgs: { min: 0, max: 9999 }, priorId: "uniform" };
const draw = { familyId: "digit-devotee", params: { d: 7 } };

test("upload skips unchanged files, replaces a changed one, and the engine then loads the new bytes from storage", { timeout: 180_000 }, async () => {
  // The dev script uploaded the repository's files: nothing to do.
  const again = await uploadCalibration(convex, quiet);
  assert.deepEqual([again.uploaded, again.removed], [[], []]);
  assert.equal(again.unchanged, instanceFiles().length);

  // The same tables in different bytes (indented): exactly that file is uploaded.
  const dir = mkdtempSync(join(tmpdir(), "cg-calibration-")) + "/";
  try {
    cpSync(CALIBRATION_DIR, dir, { recursive: true });
    const changed = JSON.stringify(JSON.parse(readFileSync(`${dir}${INSTANCE}.json`, "utf8")), null, 1) + " ".repeat(1 + Math.floor(Math.random() * 100_000)) + "\n";
    writeFileSync(`${dir}${INSTANCE}.json`, changed);
    const result = await uploadCalibration(convex, { ...quiet, dir });
    assert.deepEqual(result.uploaded, [INSTANCE]);
    const probe = await admin.action(internal.calibration.node.probe, { settings, draw, refresh: true });
    assert.equal(probe.load.source, "storage");
    assert.equal(probe.load.bytes, Buffer.byteLength(changed));
    assert.match(probe.key, /^[0-9a-f]{64}$/);
    // Second lookup in a warm process: memory, never storage (a cold process would refetch: also correct).
    const warm = await admin.action(internal.calibration.node.probe, { settings, draw });
    assert.ok(warm.load.source === "memory" || warm.load.source === "storage");
    assert.equal(warm.key, probe.key);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    const restored = await uploadCalibration(convex, quiet);
    assert.deepEqual(restored.uploaded, [INSTANCE]);
  }
  const back = await admin.action(internal.calibration.node.probe, { settings, draw, refresh: true });
  assert.equal(back.load.bytes, readFileSync(`${CALIBRATION_DIR}${INSTANCE}.json`).length);
});

test("a player client gets the tables of its own draws from the engine; unknown draws fail", async () => {
  const [alice] = await gods("alice");
  const [table] = JSON.parse(await alice.c.action(api.calibration.node.tables, { settings, draws: [draw] }));
  const probe = await admin.action(internal.calibration.node.probe, { settings, draw });
  assert.equal(table.key, probe.key);
  assert.equal(table.instance, INSTANCE);
  assert.ok(table.levels.length > 1);
  await assert.rejects(alice.c.action(api.calibration.node.tables, { settings, draws: [{ familyId: "seed3_green_ones", params: {} }] }));
});
