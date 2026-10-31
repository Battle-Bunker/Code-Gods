#!/usr/bin/env node
/**
 * Uploads the calibration tables (lib/game-utilities/data/calibration/v1/<instance>.json, one file per
 * instantiation) to the deployment's file storage and registers each in `calibrationFiles`
 * (convex/calibration/files.ts). The engine loads them lazily from there (convex/engine/calibration.ts).
 *
 *   pnpm --filter @workspace/engine upload-calibration [convex run flags, e.g. --prod]
 *
 * Idempotent: a file whose bytes (SHA-256) the deployment already has is skipped; a changed file replaces the stored
 * one; a stored instance with no file in git any more is removed, so storage mirrors git. The offered order is
 * manifest.json's (files it does not list yet come after, sorted). A constant number of `convex run` calls (list,
 * upload URLs, register, prune), however many files. Like upload-runtime, it drives the Convex CLI, which targets
 * CONVEX_DEPLOY_KEY's deployment when that is set and the local deployment otherwise.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ENGINE = fileURLToPath(new URL("..", import.meta.url));
export const CALIBRATION_DIR = fileURLToPath(new URL("../../../lib/game-utilities/data/calibration/v1/", import.meta.url));

/** Instance keys with a file in `dir`, in manifest.json's order, then the others sorted. */
export function instanceFiles(dir = CALIBRATION_DIR) {
  const keys = readdirSync(dir).filter(f => f.endsWith(".json") && f !== "manifest.json").map(f => f.slice(0, -5));
  const order = existsSync(`${dir}manifest.json`) ? Object.keys(JSON.parse(readFileSync(`${dir}manifest.json`, "utf8")).instances) : [];
  return [...order.filter(k => keys.includes(k)), ...keys.filter(k => !order.includes(k)).sort()];
}

/** Upload what changed. `convex(fn, args)` runs a deployment function and resolves with its JSON result. */
export async function uploadCalibration(convex, { dir = CALIBRATION_DIR, log = console.log } = {}) {
  const keys = instanceFiles(dir);
  const stored = new Map(((await convex("calibration/files:list")) ?? []).map(r => [r.instance, r]));
  const local = keys.map((instance, rank) => {
    const bytes = readFileSync(`${dir}${instance}.json`);
    return { instance, rank, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  const changed = local.filter(f => stored.get(f.instance)?.sha256 !== f.sha256);
  let uploaded = [];
  if (changed.length) {
    const urls = await convex("calibration/files:generateUploadUrls", { count: changed.length });
    const files = await Promise.all(changed.map(async (f, i) => {
      const response = await fetch(urls[i], { method: "POST", headers: { "Content-Type": "application/json" }, body: f.bytes });
      if (!response.ok) throw new Error(`Upload of ${f.instance} failed: ${response.status} ${await response.text()}`);
      const { storageId } = await response.json();
      return { instance: f.instance, rank: f.rank, sha256: f.sha256, storageId };
    }));
    uploaded = await convex("calibration/node:register", { files });
    for (const r of uploaded) log(`Uploaded ${r.instance}: ${r.tables} tables, ${r.size} bytes${r.replaced ? ` (replaced ${r.replaced.slice(0, 12)})` : ""}.`);
  }
  const removed = await convex("calibration/files:prune", { keep: local.map(f => ({ instance: f.instance, rank: f.rank })) });
  for (const instance of removed) log(`Removed ${instance} (no file in git).`);
  log(`Calibration: ${keys.length} files; ${uploaded.length} uploaded, ${keys.length - changed.length} unchanged, ${removed.length} removed.`);
  return { uploaded: uploaded.map(r => r.instance), unchanged: keys.length - changed.length, removed };
}

/** `npx convex run [flags] fn args` from the engine directory (asynchronous: the caller's event loop keeps running). */
export const convexRunner = (flags = [], cwd = ENGINE, env = process.env) => async (fn, args = {}) => {
  const { stdout } = await promisify(execFile)("npx", ["convex", "run", ...flags, fn, JSON.stringify(args)],
    { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim() === "" ? null : JSON.parse(stdout);   // `convex run` prints nothing for null
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await uploadCalibration(convexRunner(process.argv.slice(2)));
}
