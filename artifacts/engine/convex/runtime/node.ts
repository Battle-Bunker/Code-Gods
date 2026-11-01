"use node";
/**
 * Agent sandboxes for Node actions (the tick action, summon/validate). Import from a "use node" file:
 *
 *   import { bindRuntime, runtimeFor } from "../runtime/node";
 *   export const tick = internalAction({ handler: async ctx => {
 *     await bindRuntime(ctx);                             // loads the Python bundle from storage once
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

const CACHE_DIR = "/tmp/code-gods-runtime";
const CACHE_FILE = `${CACHE_DIR}/${PYTHON_BUNDLE_SHA256}-${PYTHON_BUNDLE_FILE}`;
/** How the bundle was obtained by this instance (for the cold-start measurement). */
export const assetLoad: { source?: "tmp" | "storage"; ms?: number; bytes?: number } = {};

/** The bundle's bytes for this instance, loaded once. Never holds an action's context beyond that action. */
let bundle: Promise<Uint8Array> | undefined;
/** After a failed load, actions skip the lookup until this time: a TypeScript-only setup pays it once a minute. */
let retryAfter = 0;
const RETRY_MS = 60_000;

async function loadBundle(ctx: ActionCtx): Promise<Uint8Array> {
  const start = performance.now();
  try {
    const bytes = await readFile(CACHE_FILE);
    Object.assign(assetLoad, { source: "tmp", ms: performance.now() - start, bytes: bytes.length });
    return bytes;
  } catch { /* not cached on this instance yet */ }
  const row = await ctx.runQuery(internal.runtime.assets.lookup, { name: PYTHON_BUNDLE_FILE });
  if (!row) throw new Error("The Python runtime bundle is not uploaded: run pnpm --filter @workspace/engine upload-runtime");
  if (row.sha256 !== PYTHON_BUNDLE_SHA256) {
    throw new Error(`The stored Python bundle (${row.sha256}) is not the one this code pins (${PYTHON_BUNDLE_SHA256}): run upload-runtime`);
  }
  const blob = await ctx.storage.get(row.storageId);
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
 * Every action that may run agent code awaits this first. The first one on an instance loads the Python
 * bundle with ITS OWN context and awaits it, so the context is alive for the whole load; concurrent
 * actions await the same load; later ones return at once. A failed load (e.g. no bundle uploaded in a
 * TypeScript-only setup) is logged once and retried a minute later; meanwhile only Python requests fail.
 */
export async function bindRuntime(ctx: ActionCtx): Promise<void> {
  if (!bundle && Date.now() < retryAfter) return;
  bundle ??= loadBundle(ctx).catch(error => {
    bundle = undefined; retryAfter = Date.now() + RETRY_MS;
    console.warn(`Python runtime bundle unavailable (retrying in ${RETRY_MS / 1000} s): ${(error as Error).message}`);
    throw error;
  });
  await bundle.catch(() => {});
}

/** The `assets` hook: one stable function, so the package compiles the bundle once per instance. */
export async function pythonBundle(): Promise<Uint8Array> {
  if (!bundle) throw new Error("The Python runtime bundle is not loaded (no action has called bindRuntime, or the load failed)");
  return bundle;
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
/**
 * The file-storage asset each language's runtime needs, pinned by SHA-256 (a language without one ships in the
 * deployment's packages). Its pin is also the runtime's version for readiness (runtime/readiness.ts): a new bundle boots again.
 */
export const RUNTIME_ASSETS: Partial<Record<Language, { name: string; sha256: string }>> = {
  python: { name: PYTHON_BUNDLE_FILE, sha256: PYTHON_BUNDLE_SHA256 },
};
export const runtimeVersion = (language: Language): string => RUNTIME_ASSETS[language]?.sha256 ?? `builtin:${language}`;

const runtimes: Partial<Record<Language, GameRuntime>> = {};
/** The instance's warm runtime for a language (created lazily; workers start on demand or via `warm()`). */
export function runtimeFor(language: Language): GameRuntime {
  return (runtimes[language] ??= createRuntime(RUNTIME_OPTIONS[language]));
}

/**
 * Analytics scripts (run_code; docs/assistant/code-execution.md §2): pools of their own, so a ten-second script never
 * delays an agent's act. One engine each. The Python pool shares the agents' compiled reactor and initialized snapshot
 * (same `assets` hook, so no second bootstrap: about 100 ms to start a worker); the TypeScript pool has one QuickJS
 * executor and a compiler worker that only transpiles and stops after 60 s idle.
 */
export const SCRIPT_OPTIONS: Record<Language, RuntimeOptions> = {
  python: { language: "python", workers: 1, queueLimit: 8, assets: pythonBundle },
  get typescript(): RuntimeOptions { return { language: "typescript", workers: 1, queueLimit: 8, typescriptFiles: typescriptFiles() }; },
};
const scriptRuntimes: Partial<Record<Language, GameRuntime>> = {};
export function scriptRuntimeFor(language: Language): GameRuntime {
  return (scriptRuntimes[language] ??= createRuntime(SCRIPT_OPTIONS[language]));
}
