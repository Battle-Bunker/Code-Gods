"use node";
/**
 * Agent sandboxes for Node actions (the tick action, summon/validate). Import from a "use node" file:
 *
 *   import { bindRuntime, runtimeFor } from "../runtime/node";
 *   export const tick = internalAction({ handler: async ctx => {
 *     await bindRuntime(ctx);                             // loads the Python and Haskell bundles from storage once
 *     const result = await runtimeFor(language).act(source, input, actSettings(settings, language), seed);
 *   } });
 *
 * Runtimes live at module scope, so a warm Node instance keeps its workers, compiled reactor,
 * initialized snapshot and compile caches across actions. The Python and Haskell bundles are fetched from file
 * storage once per instance into /tmp (or read back from there), and the package verifies their SHA-256
 * (PYTHON_BUNDLE_SHA256, HASKELL_BUNDLE_SHA256) before using them.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { COMPLEXITY_IDS, createRuntime, GRAMMAR_IDS, HASKELL_BUNDLE_FILE, HASKELL_BUNDLE_SHA256, PYTHON_BUNDLE_FILE, PYTHON_BUNDLE_SHA256, type ActSettings,
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
const HASKELL = new StoredBundle("Haskell", HASKELL_BUNDLE_FILE, HASKELL_BUNDLE_SHA256);

/**
 * Every action that may run agent code awaits this first. The first one on an instance loads the runtime bundles
 * (Python's and Haskell's, concurrently) with ITS OWN context and awaits them; concurrent actions await the same
 * loads; later ones return at once. A failed load (e.g. a bundle not uploaded) is logged once and retried a minute
 * later; meanwhile only that language's requests fail.
 */
export async function bindRuntime(ctx: ActionCtx): Promise<void> {
  await Promise.all([PYTHON.bind(ctx), HASKELL.bind(ctx)]);
}
/** The Haskell bundle alone (runtime/haskellCompile.ts: the compiler's instance needs nothing else). */
export async function bindHaskell(ctx: ActionCtx): Promise<void> {
  await HASKELL.bind(ctx);
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
 * acts/s, Python about 45) but about 80 MiB each, and Python 2 + TypeScript 2 warm held 489 of the 512 MiB. TypeScript
 * also has its compiler worker (stopped when idle); Haskell's evaluator worker (QuickJS encodes its moves) runs on
 * instances of its own (closeIdleExcept), on programs another action compiles (haskellCompilePool). Pools start
 * lazily, on demand.
 */
export const RUNTIME_OPTIONS: Record<Language, RuntimeOptions> = {
  python: { language: "python", workers: 1, queueLimit: 64, assets: pythonBundle },
  // The compiler worker (about 80–140 MiB once it has type-checked) stops 10 s after its last compilation: compiled
  // agents stay cached in the pool, so only a new source starts it again.
  get typescript(): RuntimeOptions {
    return { language: "typescript", workers: 1, queueLimit: 64, compilerIdleMs: 10_000, typescriptFiles: typescriptFiles() };
  },
  get haskell(): RuntimeOptions {
    return { language: "haskell", workers: 1, queueLimit: 64, compilation: "external", assets: HASKELL.hook, typescriptFiles: typescriptFiles() };
  },
};
/**
 * The file-storage asset each language's runtime needs, pinned by SHA-256 (a language without one ships in the
 * deployment's packages). Its pin is also the runtime's version for readiness (runtime/readiness.ts): a new bundle boots again.
 */
export const RUNTIME_ASSETS: Partial<Record<Language, { name: string; sha256: string }>> = {
  python: { name: PYTHON_BUNDLE_FILE, sha256: PYTHON_BUNDLE_SHA256 },
  haskell: { name: HASKELL_BUNDLE_FILE, sha256: HASKELL_BUNDLE_SHA256 },
};
export const runtimeVersion = (language: Language): string => RUNTIME_ASSETS[language]?.sha256 ?? `builtin:${language}`;

const runtimes: Partial<Record<Language, GameRuntime>> = {};
/**
 * The instance's warm runtime for a language (created lazily; workers start on demand or via `warm()`). The Haskell
 * pool is only for runtime/haskellAct.ts: other actions send Haskell acts there (engine/runtime.ts act).
 */
export function runtimeFor(language: Language): GameRuntime {
  closeIdleExcept(language === "haskell" ? "haskell" : "agents");
  return (runtimes[language] ??= createRuntime(RUNTIME_OPTIONS[language]));
}

/**
 * The Haskell compiler (runtime/haskellCompile.ts only): a compile-only pool. A cold compilation takes about 40 s on a
 * cloud Node action (a room's first: it writes the room's compilation cache), so its wall is the longest allowed. It
 * stays warm for HASKELL_COMPILER_KEEP_MS (its room caches with it) unless other pools are needed on this instance.
 */
export const HASKELL_COMPILER_KEEP_MS = 5 * 60_000;
let haskellCompiler: GameRuntime | undefined;
export function haskellCompilePool(): GameRuntime {
  closeIdleExcept("compiler");
  return (haskellCompiler ??= createRuntime({ language: "haskell", role: "compile", startupMs: 120_000, prepareMs: 120_000,
    compilerIdleMs: HASKELL_COMPILER_KEEP_MS, assets: HASKELL.hook }));
}
/**
 * The pools an instance holds belong to one group at a time, as measured on a cloud action (512 MiB; the process alone
 * is about 214 MiB): "agents" (Python and TypeScript, about 280 MiB warm), "haskell" (Haskell's execution pool) or
 * "compiler" (MicroHs's compiler, about 250 MiB). Whichever group is about to be used closes the others' idle pools
 * (an instance runs one action at a time, so they are idle between actions); the next use starts them again. A game's
 * Haskell acts and compilations therefore run in actions of their own (haskellAct.ts, haskellCompile.ts).
 */
function closeIdleExcept(group: "agents" | "haskell" | "compiler"): void {
  if (group !== "compiler" && haskellCompiler?.idle) { haskellCompiler.close(); haskellCompiler = undefined; }
  const pools: [Partial<Record<string, GameRuntime>>, string, "agents" | "haskell"][] = [
    ...Object.keys(runtimes).map(language => [runtimes, language, language === "haskell" ? "haskell" : "agents"] as [Partial<Record<string, GameRuntime>>, string, "agents" | "haskell"]),
    ...Object.keys(scriptRuntimes).map(language => [scriptRuntimes, language, "agents"] as [Partial<Record<string, GameRuntime>>, string, "agents" | "haskell"]),
  ];
  for (const [registry, language, owner] of pools) {
    const runtime = registry[language];
    if (owner !== group && runtime?.idle) { runtime.close(); delete registry[language]; }
  }
}
/**
 * The key of a compiled Haskell program (runtime/haskellPrograms.ts), as the package keys its own compilations: the
 * grammar and price function, the bundle, the room's prelude, the source.
 */
export function haskellKey(source: string, settings: ActSettings): string {
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  return sha(JSON.stringify([GRAMMAR_IDS.haskell, COMPLEXITY_IDS.haskell, HASKELL_BUNDLE_SHA256, settings.objectType, settings.prelude.key,
    sha(settings.prelude.haskell ?? ""), sha(source)]));
}

/**
 * Analytics scripts (run_code; docs/assistant/code-execution.md §2): pools of their own, so a ten-second script never
 * delays an agent's act. One engine each. The Python pool shares the agents' compiled reactor and initialized snapshot
 * (same `assets` hook, so no second bootstrap: about 100 ms to start a worker); the TypeScript pool has one QuickJS
 * executor and a compiler worker that only transpiles and stops after 10 s idle.
 */
export type ScriptLanguage = "python" | "typescript";
/** Haskell has no script mode (lib/game-runtime). */
export const SCRIPT_OPTIONS: Record<ScriptLanguage, RuntimeOptions> = {
  python: { language: "python", workers: 1, queueLimit: 8, assets: pythonBundle },
  get typescript(): RuntimeOptions { return { language: "typescript", workers: 1, queueLimit: 8, compilerIdleMs: 10_000, typescriptFiles: typescriptFiles() }; },
};
const scriptRuntimes: Partial<Record<ScriptLanguage, GameRuntime>> = {};
export function scriptRuntimeFor(language: ScriptLanguage): GameRuntime {
  closeIdleExcept("agents");
  return (scriptRuntimes[language] ??= createRuntime(SCRIPT_OPTIONS[language]));
}
