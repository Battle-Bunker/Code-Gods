#!/usr/bin/env node
/**
 * Uploads the Python runtime bundle (lib/v2-sandbox/dist/python-runtime.bin.gz) to the deployment's file storage and
 * registers it in `runtimeAssets` (convex/runtime/assets.ts), where engine v2's agent runtime loads it
 * (convex/v2/runtime.ts).
 *
 *   pnpm --filter @workspace/engine upload-runtime [convex run flags, e.g. --prod]
 *
 * Builds the bundle first if it is missing or stale (its SHA-256 is not v2-sandbox's pin), running its pinned setup
 * when that is missing too; refuses a bundle that still misses the pin; and skips the upload when the deployment
 * already has exactly these bytes. `pnpm --filter @workspace/engine dev` runs it on every start.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SANDBOX = fileURLToPath(new URL("../../../lib/v2-sandbox/", import.meta.url));
const ENGINE = fileURLToPath(new URL("../", import.meta.url));
const FILE = "python-runtime.bin.gz";
const PATH = `${SANDBOX}dist/${FILE}`;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
/** The pin, read from v2-sandbox's own source (one place). */
const PIN = /PYTHON_BUNDLE_SHA256 = "([0-9a-f]{64})"/.exec(readFileSync(`${SANDBOX}src/bundle.ts`, "utf8"))[1];

/** `npx convex run <fn> <args>` against the deployment the flags name; null for an empty answer. */
export const convexRunner = (flags = [], cwd = ENGINE, env = process.env) => async (fn, args = {}) => {
  const { stdout } = await promisify(execFile)("npx", ["convex", "run", ...flags, fn, JSON.stringify(args)], { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim() === "" ? null : JSON.parse(stdout);
};

const status = () => {
  if (!existsSync(PATH)) return "missing";
  try { return sha256(gunzipSync(readFileSync(PATH))) === PIN ? "current" : "stale"; } catch { return "stale"; }
};
const pnpm = (script) => promisify(execFile)("pnpm", ["--filter", "@workspace/v2-sandbox", "run", script], { cwd: SANDBOX, maxBuffer: 16 * 1024 * 1024 });

/** The bundle's gzip bytes, built first when missing or stale. */
export async function ensureBundle({ log = console.log } = {}) {
  const was = status();
  if (was !== "current") {
    log(`Python runtime: bundle ${was}, building it (v2-sandbox setup:python, build:python)...`);
    await pnpm("setup:python");
    await pnpm("build:python");
    const after = status();
    if (after !== "current") throw new Error(`${PATH} is ${after} after building: its SHA-256 is not the pinned one`);
  }
  return readFileSync(PATH);
}

/** Uploads the bundle unless the deployment has these bytes. */
export async function uploadRuntime(convex, { log = console.log } = {}) {
  const bytes = await ensureBundle({ log });
  const storedSha256 = sha256(bytes);
  const current = await convex("runtime/assets:lookup", { name: FILE });
  if (current?.sha256 === PIN && current?.storedSha256 === storedSha256) {
    log(`${FILE} ${PIN} is already uploaded (${current.size} bytes).`);
    return { uploaded: false };
  }
  const url = await convex("runtime/assets:generateUploadUrl");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/gzip" }, body: bytes });
  if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
  const { storageId } = await response.json();
  const result = await convex("runtime/assets:register", { name: FILE, sha256: PIN, storedSha256, storageId });
  log(`Uploaded ${FILE}: ${bytes.length} bytes, SHA-256 ${PIN}${result.replaced ? ` (replaced ${result.replaced})` : ""}.`);
  return { uploaded: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await uploadRuntime(convexRunner(process.argv.slice(2)));
}
