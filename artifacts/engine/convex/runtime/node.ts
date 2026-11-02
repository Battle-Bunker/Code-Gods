"use node";
/**
 * Agent sandboxes for Node actions (the tick action, summon/validate). Import from a "use node" file:
 *
 *   import { bindRuntime, runtimeFor } from "../runtime/node";
 *   export const tick = internalAction({ handler: async ctx => {
 *     await bindRuntime(ctx);                             // loads the Python bundle from storage once
 *     const result = await runtimeFor(language).act(source, input, actSettings(settings), seed);
 *   } });
 *
 * Runtimes live at module scope, so a warm Node instance keeps its workers, compiled reactor,
 * initialized snapshot and compile caches across actions. The Python bundle is fetched from file
 * storage once per instance into /tmp (or read back from there), and the package verifies their SHA-256
 * (PYTHON_BUNDLE_SHA256) before using it.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRuntime, PYTHON_BUNDLE_FILE, PYTHON_BUNDLE_SHA256,
  type GameRuntime, type Language, type RuntimeOptions } from "@workspace/game-runtime";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

const CACHE_DIR = "/tmp/code-gods-runtime";
/** How the Python bundle was obtained by this instance (for the cold-start measurement). */
export const assetLoad: { source?: "tmp" | "storage"; ms?: number; bytes?: number } = {};

/** After a failed load, actions skip the lookup until this time: a setup without that language pays it once a minute. */
const RETRY_MS = 60_000;

/** One runtime bundle in file storage (pinned by SHA-256), loaded once per instance. */
class StoredBundle {
  /** The bundle's bytes for this instance. Never holds an action's context beyond that action. */
  bytes?: Promise<Uint8Array>;
  retryAfter = 0;
  constructor(readonly label: string, readonly name: string, readonly sha256: string,
    readonly measure?: { source?: "tmp" | "storage"; ms?: number; bytes?: number }) {}
  get cacheFile() { return `${CACHE_DIR}/${this.sha256}-${this.name}`; }
  private async load(ctx: ActionCtx): Promise<Uint8Array> {
    const start = performance.now();
    try {
      const bytes = await readFile(this.cacheFile);
      if (this.measure) Object.assign(this.measure, { source: "tmp", ms: performance.now() - start, bytes: bytes.length });
      return bytes;
    } catch { /* not cached on this instance yet */ }
    const row = await ctx.runQuery(internal.runtime.assets.lookup, { name: this.name });
    if (!row) throw new Error(`The ${this.label} runtime bundle is not uploaded: run pnpm --filter @workspace/engine upload-runtime`);
    if (row.sha256 !== this.sha256) {
      throw new Error(`The stored ${this.label} bundle (${row.sha256}) is not the one this code pins (${this.sha256}): run upload-runtime`);
    }
    const blob = await ctx.storage.get(row.storageId);
    if (!blob) throw new Error(`The ${this.label} runtime bundle is missing from file storage`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Best effort: a later module load on this instance (after a push) reads it back without a download.
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      const partial = `${this.cacheFile}.${process.pid}.partial`;
      await writeFile(partial, bytes);
      await rename(partial, this.cacheFile);
    } catch { /* /tmp is an optimization only */ }
    if (this.measure) Object.assign(this.measure, { source: "storage", ms: performance.now() - start, bytes: bytes.length });
    return bytes;
  }
  /** Load with this action's context (alive for the whole load); concurrent callers share it; failures retry after a minute. */
  async bind(ctx: ActionCtx): Promise<void> {
    if (!this.bytes && Date.now() < this.retryAfter) return;
    this.bytes ??= this.load(ctx).catch(error => {
      this.bytes = undefined; this.retryAfter = Date.now() + RETRY_MS;
      console.warn(`${this.label} runtime bundle unavailable (retrying in ${RETRY_MS / 1000} s): ${(error as Error).message}`);
      throw error;
    });
    await this.bytes.catch(() => {});
  }
  /** The `assets` hook: one stable function, so the package compiles the bundle once per instance. */
  readonly hook = async (): Promise<Uint8Array> => {
    if (!this.bytes) throw new Error(`The ${this.label} runtime bundle is not loaded (no action has called bindRuntime, or the load failed)`);
    return this.bytes;
  };
}

const PYTHON = new StoredBundle("Python", PYTHON_BUNDLE_FILE, PYTHON_BUNDLE_SHA256, assetLoad);

/**
 * Every action that may run agent code awaits this first. The first one on an instance loads the Python runtime bundle
 * with ITS OWN context and awaits it; concurrent actions await the same load; later ones return at once. A failed load
 * (e.g. the bundle not uploaded) is logged once and retried a minute later; meanwhile only Python's requests fail.
 */
export async function bindRuntime(ctx: ActionCtx): Promise<void> {
  await PYTHON.bind(ctx);
}

/** The Python `assets` hook (probes compile the bundle through it). */
export const pythonBundle = PYTHON.hook;

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
 * Pool sizes for a 512 MiB Node action with a fraction of a vCPU (measured on the dev deployment, runtime/probe:bench
 * and footprint): one execution worker per language. A second worker added no throughput there (TypeScript 49 vs 48
 * acts/s, Python about 45) but about 80 MiB each. TypeScript compiles nothing here: another action does
 * (runtime/compile.ts, compilePool), and its pool runs the stored programs. Pools start lazily, on demand.
 */
export const RUNTIME_OPTIONS: Record<Language, RuntimeOptions> = {
  python: { language: "python", workers: 1, queueLimit: 64, assets: pythonBundle },
  get typescript(): RuntimeOptions {
    return { language: "typescript", workers: 1, queueLimit: 64, compilation: "external", typescriptFiles: typescriptFiles() };
  },
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
/**
 * The instance's warm runtime for a language (created lazily; workers start on demand or via `warm()`): only in the
 * actions that run that language (runtime/acts.ts, probes).
 */
export function runtimeFor(language: Language): GameRuntime {
  closeIdleExcept(language);
  return (runtimes[language] ??= createRuntime(RUNTIME_OPTIONS[language]));
}

/**
 * The TypeScript compiler (runtime/compile.ts only): a compile-only pool, kept warm for COMPILER_KEEP_MS unless another
 * group's pools are needed on this instance.
 */
export const COMPILER_KEEP_MS = 5 * 60_000;
let compiler: GameRuntime | undefined;
export function compilePool(): GameRuntime {
  closeIdleExcept("compiler");
  return (compiler ??= createRuntime({ language: "typescript", role: "compile", compilerIdleMs: COMPILER_KEEP_MS, typescriptFiles: typescriptFiles() }));
}
/**
 * The pools an instance holds belong to one group at a time: a language's agent pool, the TypeScript compiler, or a
 * language's analytics-script pool. On a cloud action (512 MiB; the process alone is about 100–200 MiB) one group fits
 * comfortably, several did not (Python and TypeScript warm with the compiler held about 450 MiB). Whichever group is
 * about to be used closes the others' idle pools (an instance runs one action at a time, so they are idle between
 * actions, and Convex may reuse a process for any function); the next use starts them again.
 */
function closeIdleExcept(group: Language | "compiler" | `script-${ScriptLanguage}`): void {
  if (group !== "compiler" && compiler?.idle) { compiler.close(); compiler = undefined; }
  for (const [registry, prefix] of [[runtimes, ""], [scriptRuntimes, "script-"]] as [Partial<Record<string, GameRuntime>>, string][]) {
    for (const [language, runtime] of Object.entries(registry)) {
      if (`${prefix}${language}` !== group && runtime?.idle) { runtime.close(); delete registry[language]; }
    }
  }
}

/**
 * Analytics scripts (run_code; docs/assistant/code-execution.md §2): pools of their own, so a ten-second script never
 * delays an agent's act. One engine each. The Python pool shares the agents' compiled reactor and initialized snapshot
 * (same `assets` hook, so no second bootstrap: about 100 ms to start a worker); the TypeScript pool has one QuickJS
 * executor and a compiler worker that only transpiles and stops after 10 s idle.
 */
export type ScriptLanguage = "python" | "typescript";
export const SCRIPT_OPTIONS: Record<ScriptLanguage, RuntimeOptions> = {
  python: { language: "python", workers: 1, queueLimit: 8, assets: pythonBundle },
  get typescript(): RuntimeOptions { return { language: "typescript", workers: 1, queueLimit: 8, compilerIdleMs: 10_000, typescriptFiles: typescriptFiles() }; },
};
const scriptRuntimes: Partial<Record<ScriptLanguage, GameRuntime>> = {};
export function scriptRuntimeFor(language: ScriptLanguage): GameRuntime {
  closeIdleExcept(`script-${language}`);
  return (scriptRuntimes[language] ??= createRuntime(SCRIPT_OPTIONS[language]));
}
