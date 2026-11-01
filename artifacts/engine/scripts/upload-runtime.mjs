#!/usr/bin/env node
/**
 * Uploads the runtime bundles (lib/game-runtime/dist/python-runtime.bin.gz and haskell-runtime.bin.gz) to the
 * deployment's file storage and registers each in `runtimeAssets` (convex/runtime/assets.ts).
 *
 *   pnpm --filter @workspace/engine upload-runtime [convex run flags, e.g. --prod]
 *
 * `pnpm --filter @workspace/engine dev` runs it against the local deployment on every start, so local
 * testing needs no manual step.
 *
 * Builds a bundle first if it is missing or stale (its SHA-256 is not the package's pin), running its setup
 * (the pinned CPython WASI download; the pinned MicroHs and wasi-sdk) when that is missing too; refuses a bundle
 * that still misses the pin; and skips the upload when the deployment already has exactly these bytes (one
 * `convex run`, about a second).
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { HASKELL_BUNDLE_FILE, HASKELL_BUNDLE_SHA256, loadHaskellRuntime, loadPythonRuntime, PYTHON_BUNDLE_FILE,
  PYTHON_BUNDLE_SHA256 } from "@workspace/game-runtime";
import { convexRunner } from "./upload-calibration.mjs";

const RUNTIME = fileURLToPath(new URL("../../../lib/game-runtime/", import.meta.url));
const CACHE = fileURLToPath(new URL("../../../.cache/code-gods/", import.meta.url));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/** The bundles the deployment needs: where each is built, how, and how the package loads it. */
export const BUNDLES = [
  { label: "Python", file: PYTHON_BUNDLE_FILE, pin: PYTHON_BUNDLE_SHA256, load: loadPythonRuntime,
    setupDone: () => existsSync(`${CACHE}python-3.15.0/python.wasm`),
    setup: ["python3", ["python/setup.py"]], build: [process.execPath, ["scripts/build-python-bundle.mjs"]] },
  { label: "Haskell", file: HASKELL_BUNDLE_FILE, pin: HASKELL_BUNDLE_SHA256, load: loadHaskellRuntime,
    setupDone: () => existsSync(`${CACHE}wasi-sdk-25.0/bin/clang`) && existsSync(`${CACHE}microhs-d756fa9/generated/mhs.c`),
    setup: [process.execPath, ["scripts/setup-haskell.mjs"]], build: [process.execPath, ["scripts/build-haskell-bundle.mjs"]] },
];
const pathOf = bundle => `${RUNTIME}dist/${bundle.file}`;

/** "missing", "stale" (not the pinned bundle, or not gzip at all) or "current". */
export function bundleStatus(path = pathOf(BUNDLES[0]), pin = BUNDLES[0].pin) {
  if (!existsSync(path)) return "missing";
  try { return sha256(gunzipSync(readFileSync(path))) === pin ? "current" : "stale"; } catch { return "stale"; }
}

const run = (file, args) => new Promise((resolve, reject) =>
  execFile(file, args, { cwd: RUNTIME, maxBuffer: 16 * 1024 * 1024 }, error => (error ? reject(error) : resolve())));

/** Build a bundle if it is missing or stale (running its pinned setup first if needed). Returns the gzip bytes. */
export async function ensureBundle({ log = console.log, bundle = BUNDLES[0] } = {}) {
  const path = pathOf(bundle), status = bundleStatus(path, bundle.pin);
  if (status !== "current") {
    if (!bundle.setupDone()) {
      log(`${bundle.label} runtime: fetching the pinned build inputs (${bundle.setup[1].join(" ")})...`);
      await run(...bundle.setup);
    }
    log(`${bundle.label} runtime: bundle ${status}, building it (${bundle.build[1].join(" ")})...`);
    await run(...bundle.build);
    const after = bundleStatus(path, bundle.pin);
    if (after !== "current") throw new Error(`${path} is ${after} after building: its SHA-256 is not the pinned one`);
  }
  return readFileSync(path);
}

/** Upload one bundle unless the deployment has these bytes. `convex(fn, args)` runs a deployment function. */
async function uploadBundle(convex, bundle, log) {
  const bytes = await ensureBundle({ log, bundle });
  const storedSha256 = sha256(bytes);
  const current = await convex("runtime/assets:lookup", { name: bundle.file });
  if (current?.sha256 === bundle.pin && current?.storedSha256 === storedSha256) {
    log(`${bundle.file} ${bundle.pin} is already uploaded (${current.size} bytes).`);
    return false;
  }
  // Unpacks and compiles the modules: the bundle must load before any deployment gets it.
  await bundle.load(bytes);
  const url = await convex("runtime/assets:generateUploadUrl");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/gzip" }, body: bytes });
  if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  const { storageId } = await response.json();
  const result = await convex("runtime/assets:register", { name: bundle.file, sha256: bundle.pin, storedSha256, storageId });
  log(`Uploaded ${bundle.file}: ${bytes.length} bytes, SHA-256 ${bundle.pin}${result.replaced ? ` (replaced ${result.replaced})` : ""}.`);
  return true;
}

/** Upload every runtime bundle the deployment lacks; one bundle's failure does not stop the others (it is rethrown after). */
export async function uploadRuntime(convex, { log = console.log } = {}) {
  let uploaded = false;
  const failures = [];
  for (const bundle of BUNDLES) {
    try { uploaded = (await uploadBundle(convex, bundle, log)) || uploaded; }
    catch (error) { failures.push(`${bundle.label}: ${error.message}`); }
  }
  if (failures.length) throw new Error(`${failures.join("; ")} (games in those languages will fail)`);
  return { uploaded };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await uploadRuntime(convexRunner(process.argv.slice(2)));
}
