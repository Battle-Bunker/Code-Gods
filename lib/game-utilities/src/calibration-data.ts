/**
 * The shipped calibration data on disk (data/calibration/v1/), for Node-side tools: tests, the calibrate script and
 * the engine's unit tests. Not exported from the package root (it reads the file system); import
 * "@workspace/game-utilities/calibration-data". The engine itself loads the same files from Convex file storage
 * (artifacts/engine/scripts/upload-calibration.mjs uploads them; convex/engine/calibration.ts loads them).
 *
 * The manifest here is built from the instance files themselves (`manifestEntry`), so it always describes exactly
 * the files present, whether or not manifest.json has been regenerated since a file was added.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALIBRATION_FORMAT, instanceTables, manifestEntry, manifestOf, type CalibrationFile, type CalibrationManifest, type InstanceTables,
} from "./calibration.ts";

export const CALIBRATION_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "calibration", CALIBRATION_FORMAT);

/** Instance keys with a file in `dir`: manifest.json's order first, then any others sorted. */
export function shippedInstanceKeys(dir = CALIBRATION_DIR): string[] {
  const keys = readdirSync(dir).filter(f => f.endsWith(".json") && f !== "manifest.json").map(f => f.slice(0, -5));
  const path = join(dir, "manifest.json");
  const order = existsSync(path) ? Object.keys((JSON.parse(readFileSync(path, "utf8")) as CalibrationManifest).instances) : [];
  return [...order.filter(k => keys.includes(k)), ...keys.filter(k => !order.includes(k)).sort()];
}

/** One instance file, or null when none is shipped. */
export function shippedFile(instKey: string, dir = CALIBRATION_DIR): CalibrationFile | null {
  const path = join(dir, `${instKey}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as CalibrationFile : null;
}

const tablesMemo = new Map<string, InstanceTables>();
/** An instantiation's shipped tables (empty when none are shipped), read once per process. */
export function shippedTables(instKey: string): InstanceTables {
  let t = tablesMemo.get(instKey);
  if (!t) tablesMemo.set(instKey, t = instanceTables(instKey, shippedFile(instKey)));
  return t;
}

let manifestMemo: CalibrationManifest | undefined;
/** The manifest of every shipped file (from the files, in `shippedInstanceKeys` order), read once per process. */
export function shippedManifest(): CalibrationManifest {
  return manifestMemo ??= manifestOf(shippedInstanceKeys().map(k => [k, manifestEntry(shippedFile(k)!)] as const));
}
