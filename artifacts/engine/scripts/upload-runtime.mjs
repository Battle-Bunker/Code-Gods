#!/usr/bin/env node
/**
 * Uploads the Python runtime bundle (lib/game-runtime/dist/python-runtime.bin.gz) to the deployment's
 * file storage and registers it in `runtimeAssets` (convex/runtime/assets.ts).
 *
 *   pnpm --filter @workspace/game-runtime setup:python    # once: pinned CPython WASI download
 *   pnpm --filter @workspace/engine upload-runtime [convex run flags, e.g. --prod]
 *
 * Builds the bundle first if it is missing, refuses one whose SHA-256 is not the package's pin, and
 * skips the upload when the deployment already has exactly these bytes.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadPythonRuntime, PYTHON_BUNDLE_FILE, PYTHON_BUNDLE_SHA256 } from "@workspace/game-runtime";

const ENGINE = fileURLToPath(new URL("..", import.meta.url));
const RUNTIME = fileURLToPath(new URL("../../../lib/game-runtime/", import.meta.url));
const BUNDLE = `${RUNTIME}dist/${PYTHON_BUNDLE_FILE}`;
const flags = process.argv.slice(2);
const convex = (fn, args = {}) => {
  const out = execFileSync("npx", ["convex", "run", ...flags, fn, JSON.stringify(args)],
    { cwd: ENGINE, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return out.trim() === "" ? null : JSON.parse(out);   // `convex run` prints nothing for null
};

if (!existsSync(BUNDLE)) execFileSync(process.execPath, [`${RUNTIME}scripts/build-python-bundle.mjs`], { stdio: "inherit" });
const bytes = readFileSync(BUNDLE);
await loadPythonRuntime(bytes);   // unpacks and checks PYTHON_BUNDLE_SHA256 (and compiles the reactor)
const storedSha256 = createHash("sha256").update(bytes).digest("hex");

const current = convex("runtime/assets:lookup", { name: PYTHON_BUNDLE_FILE });
if (current?.sha256 === PYTHON_BUNDLE_SHA256 && current?.storedSha256 === storedSha256) {
  console.log(`${PYTHON_BUNDLE_FILE} ${PYTHON_BUNDLE_SHA256} is already uploaded (${current.size} bytes).`);
  process.exit(0);
}
const url = convex("runtime/assets:generateUploadUrl");
const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/gzip" }, body: bytes });
if (!response.ok) throw new Error(`Upload failed: ${response.status} ${await response.text()}`);
const { storageId } = await response.json();
const result = convex("runtime/assets:register", { name: PYTHON_BUNDLE_FILE, sha256: PYTHON_BUNDLE_SHA256, storedSha256, storageId });
console.log(`Uploaded ${PYTHON_BUNDLE_FILE}: ${bytes.length} bytes, SHA-256 ${PYTHON_BUNDLE_SHA256}${result.replaced ? ` (replaced ${result.replaced})` : ""}.`);
