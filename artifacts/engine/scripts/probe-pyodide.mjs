#!/usr/bin/env node
/**
 * Measurement only (docs/assistant/code-execution.md §1): packs a Pyodide distribution (pyodide.mjs, pyodide.asm.*,
 * python_stdlib.zip, pyodide-lock.json and the wheels next to them, e.g. numpy, pandas and their dependencies) into one
 * bundle.mjs-format file and uploads it to the deployment's file storage as `probe-pyodide.bin.gz`, for
 * `npx convex run runtime/probeScripts:pyodideCold`. Pyodide is not a dependency of the engine.
 *
 *   node scripts/probe-pyodide.mjs <dir with the pyodide npm package files and the .whl files> [convex run flags]
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { pack, sha256 } from "@workspace/game-runtime/bundle";

const [dir, ...flags] = process.argv.slice(2);
if (!dir) { console.error("usage: node scripts/probe-pyodide.mjs <pyodide dir> [convex run flags]"); process.exit(1); }
const ENGINE = fileURLToPath(new URL("..", import.meta.url));
const NAME = "probe-pyodide.bin.gz";
const keep = name => /^(pyodide\.mjs|pyodide\.asm\.(mjs|wasm)|python_stdlib\.zip|pyodide-lock\.json|.*\.whl)$/.test(name);
const files = new Map(readdirSync(dir).filter(keep).map(name => [name, new Uint8Array(readFileSync(join(dir, name)))]));
const raw = pack(files);
const gz = gzipSync(raw, { level: 9 });
const convex = (fn, args = {}) => {
  const out = execFileSync("npx", ["convex", "run", ...flags, fn, JSON.stringify(args)], { cwd: ENGINE, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return out.trim() === "" ? null : JSON.parse(out);
};
const url = convex("runtime/assets:generateUploadUrl");
const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/gzip" }, body: gz });
if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
const { storageId } = await response.json();
const result = convex("runtime/assets:register", { name: NAME, sha256: sha256(raw), storedSha256: sha256(gz), storageId });
console.log(JSON.stringify({ name: NAME, files: [...files.keys()], rawBytes: raw.length, gzipBytes: gz.length, ...result }));
