"use node";
/**
 * Agent sandboxes for Node actions (the tick action, summon/validate). Import from a "use node" file:
 *
 *   import { bindRuntime, runtimeFor } from "../runtime/node";
 *   export const tick = internalAction({ handler: async ctx => {
 *     bindRuntime(ctx);                                   // lets the Python bundle load from storage
 *     const result = await runtimeFor(settings.language).act(source, input, actSettings(settings), seed);
 *   } });
 *
 * Runtimes live at module scope, so a warm Node instance keeps its workers, compiled reactor,
 * initialized snapshot and compile caches across actions. The Python bundle is fetched from file
 * storage once per instance into /tmp (or read back from there), and the package verifies its SHA-256
 * (PYTHON_BUNDLE_SHA256) before using it.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRuntime, PYTHON_BUNDLE_FILE, PYTHON_BUNDLE_SHA256, type GameRuntime, type Language, type RuntimeOptions } from "@workspace/game-runtime";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

let bound: ActionCtx | undefined;
/** Every action that may run Python calls this first (the loader needs a context to read storage). */
export function bindRuntime(ctx: ActionCtx): void { bound = ctx; }

const CACHE_DIR = "/tmp/code-gods-runtime";
const CACHE_FILE = `${CACHE_DIR}/${PYTHON_BUNDLE_SHA256}-${PYTHON_BUNDLE_FILE}`;
/** How the bundle was obtained by this instance (for the cold-start measurement). */
export const assetLoad: { source?: "tmp" | "storage"; ms?: number; bytes?: number } = {};

/** The `assets` hook: one stable function, so the package loads and compiles the bundle once per instance. */
export async function pythonBundle(): Promise<Uint8Array> {
  const start = performance.now();
  try {
    const bytes = await readFile(CACHE_FILE);
    Object.assign(assetLoad, { source: "tmp", ms: performance.now() - start, bytes: bytes.length });
    return bytes;
  } catch { /* not cached on this instance yet */ }
  if (!bound) throw new Error("bindRuntime(ctx) must be called before the first Python request");
  const row = await bound.runQuery(internal.runtime.assets.lookup, { name: PYTHON_BUNDLE_FILE });
  if (!row) throw new Error("The Python runtime bundle is not uploaded: run pnpm --filter @workspace/engine upload-runtime");
  if (row.sha256 !== PYTHON_BUNDLE_SHA256) {
    throw new Error(`The stored Python bundle (${row.sha256}) is not the one this code pins (${PYTHON_BUNDLE_SHA256}): run upload-runtime`);
  }
  const blob = await bound.storage.get(row.storageId);
  if (!blob) throw new Error("The Python runtime bundle is missing from file storage");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Best effort: a later module load on this instance (after a push) reads it back without a download.
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const partial = `${CACHE_FILE}.${process.pid}.partial`;
    await writeFile(partial, bytes);
    await rename(partial, CACHE_FILE);
  } catch { /* /tmp is an optimization only */ }
  Object.assign(assetLoad, { source: "storage", ms: performance.now() - start, bytes: bytes.length });
  return bytes;
}

/**
 * The TypeScript sandbox's packages, as Convex installs them (convex.json `externalPackages`). These
 * imports are never called: they are what makes the bundler keep both packages external, so Convex
 * installs them; workers then load the resolved files. (Imported from inside @workspace/game-runtime,
 * they would be inlined into the bundle, where quickjs-emscripten cannot find its .wasm.)
 */
export const keepExternal = () => [import("typescript"), import("quickjs-emscripten")];
const typescriptFiles = () => ({
  typescript: fileURLToPath(import.meta.resolve("typescript")),
  quickjs: fileURLToPath(import.meta.resolve("quickjs-emscripten")),
});

/**
 * Pool sizes for a 512 MiB Node action, measured in lib/game-runtime/README.md ("Convex
 * measurements"): Python 2 workers (the compiled reactor and the initialized snapshot are shared);
 * TypeScript 1 compiler worker + 2 QuickJS execution workers.
 */
export const RUNTIME_OPTIONS: Record<Language, RuntimeOptions> = {
  python: { language: "python", workers: 2, queueLimit: 64, assets: pythonBundle },
  get typescript(): RuntimeOptions { return { language: "typescript", workers: 2, queueLimit: 64, typescriptFiles: typescriptFiles() }; },
};
const runtimes: Partial<Record<Language, GameRuntime>> = {};
/** The instance's warm runtime for a language (created lazily; workers start on demand or via `warm()`). */
export function runtimeFor(language: Language): GameRuntime {
  return (runtimes[language] ??= createRuntime(RUNTIME_OPTIONS[language]));
}
