#!/usr/bin/env node
/**
 * Uploads the Python runtime bundle (lib/game-runtime/dist/python-runtime.bin.gz) to the deployment's
 * file storage and registers it in `runtimeAssets` (convex/runtime/assets.ts).
 *
 *   pnpm --filter @workspace/engine upload-runtime [convex run flags, e.g. --prod]
 *
 * `pnpm --filter @workspace/engine dev` runs it against the local deployment on every start, so local
 * testing needs no manual step.
 *
 * Builds the bundle first if it is missing or stale (its SHA-256 is not the package's pin), running
 * `setup:python` (the pinned CPython WASI download) when that is missing too; refuses a bundle that still
 * misses the pin; and skips the upload when the deployment already has exactly these bytes (one
 * `convex run`, about a second).
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { loadPythonRuntime, PYTHON_BUNDLE_FILE, PYTHON_BUNDLE_SHA256 } from "@workspace/game-runtime";
import { convexRunner } from "./upload-calibration.mjs";

const RUNTIME = fileURLToPath(new URL("../../../lib/game-runtime/", import.meta.url));
export const BUNDLE = `${RUNTIME}dist/${PYTHON_BUNDLE_FILE}`;
const CPYTHON_WASM = fileURLToPath(new URL("../../../.cache/code-gods/python-3.15.0/python.wasm", import.meta.url));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/** "missing", "stale" (not the pinned bundle, or not gzip at all) or "current". */
export function bundleStatus(path = BUNDLE, pin = PYTHON_BUNDLE_SHA256) {
  if (!existsSync(path)) return "missing";
  try { return sha256(gunzipSync(readFileSync(path))) === pin ? "current" : "stale"; } catch { return "stale"; }
}

const run = (file, args) => new Promise((resolve, reject) =>
  execFile(file, args, { cwd: RUNTIME, maxBuffer: 16 * 1024 * 1024 }, error => (error ? reject(error) : resolve())));

/** Build the bundle if it is missing or stale (downloading the pinned CPython first if needed). Returns the gzip bytes. */
export async function ensureBundle({ log = console.log } = {}) {
  const status = bundleStatus();
  if (status !== "current") {
    if (!existsSync(CPYTHON_WASM)) {
      log("Python runtime: downloading the pinned CPython WASI build (setup:python)...");
      await run("python3", ["python/setup.py"]);
    }
    log(`Python runtime: bundle ${status}, building it (build:python)...`);
    await run(process.execPath, ["scripts/build-python-bundle.mjs"]);
    const after = bundleStatus();
    if (after !== "current") throw new Error(`${BUNDLE} is ${after} after building: its SHA-256 is not PYTHON_BUNDLE_SHA256`);
  }
  return readFileSync(BUNDLE);
}

/** Upload the bundle unless the deployment has these bytes. `convex(fn, args)` runs a deployment function. */
export async function uploadRuntime(convex, { log = console.log } = {}) {
  const bytes = await ensureBundle({ log });
  const storedSha256 = sha256(bytes);
  const current = await convex("runtime/assets:lookup", { name: PYTHON_BUNDLE_FILE });
  if (current?.sha256 === PYTHON_BUNDLE_SHA256 && current?.storedSha256 === storedSha256) {
    log(`${PYTHON_BUNDLE_FILE} ${PYTHON_BUNDLE_SHA256} is already uploaded (${current.size} bytes).`);
    return { uploaded: false };
  }
  // Unpacks and compiles the reactor: the bundle must load before any deployment gets it.
  await loadPythonRuntime(bytes);
  const url = await convex("runtime/assets:generateUploadUrl");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/gzip" }, body: bytes });
  if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  const { storageId } = await response.json();
  const result = await convex("runtime/assets:register", { name: PYTHON_BUNDLE_FILE, sha256: PYTHON_BUNDLE_SHA256, storedSha256, storageId });
  log(`Uploaded ${PYTHON_BUNDLE_FILE}: ${bytes.length} bytes, SHA-256 ${PYTHON_BUNDLE_SHA256}${result.replaced ? ` (replaced ${result.replaced})` : ""}.`);
  return { uploaded: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await uploadRuntime(convexRunner(process.argv.slice(2)));
}
