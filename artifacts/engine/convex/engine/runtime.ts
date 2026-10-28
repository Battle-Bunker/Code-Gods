"use node";
/**
 * The ONE place that constructs agent sandboxes. Warm runtimes live at module scope, so a warm Node
 * instance reuses them across tick actions and summon examinations.
 *
 * Interim implementation: `@workspace/game-runtime`'s `createRuntime` (persistent child-process workers:
 * QuickJS for TypeScript, CPython-WASI on Wasmtime for Python). It is loaded from the workspace package on
 * disk, not from the function bundle, because its worker scripts are resolved relative to its own module
 * URL; this works on the local backend, whose Node executor runs in the project directory. When the
 * in-process runtime (convex/runtime/**, same `createRuntime` API) lands, swap `load()` for a static
 * import of it; nothing else changes.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { codecOf, instantiationOf, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { objectType, withCommitClause } from "@workspace/game-types";
import type { ActResult, ActSettings, GameRuntime, Inspection, Language, PricingVocab } from "@workspace/game-runtime";

type RuntimeModule = typeof import("@workspace/game-runtime");
let modulePromise: Promise<RuntimeModule> | undefined;
function load(): Promise<RuntimeModule> {
  return modulePromise ??= (async () => {
    const dir = process.env.CODE_GODS_RUNTIME_DIR;
    const entry = dir ? join(dir, "index.mjs") : createRequire(join(process.cwd(), "package.json")).resolve("@workspace/game-runtime");
    return (await import(/* @vite-ignore */ pathToFileURL(entry).href)) as RuntimeModule;
  })();
}

/** Workers per language: summon measurement runs four acts at once; the tick runs waves of four. */
export const WORKERS = 4;
const pools = new Map<Language, Promise<GameRuntime>>();
const unavailable = new Map<Language, string>();

async function pool(language: Language): Promise<GameRuntime> {
  let p = pools.get(language);
  if (!p) {
    p = load().then(m => m.createRuntime({ language, workers: WORKERS, queueLimit: 64, startupMs: 120000 }));
    pools.set(language, p);
  }
  return p;
}

/** Runtime failures caused by the agent's own code; CONFIG is a server bug, CAPACITY/UNAVAILABLE are the host's. */
export const AGENT_FAULTS: ReadonlySet<string> = new Set(["COMPILE", "DOMAIN", "EXECUTION", "LIMIT"]);
export const isAgentFault = (error: unknown) =>
  !!error && typeof error === "object" && AGENT_FAULTS.has(String((error as { code?: unknown }).code));

const actSettingsCache = new Map<string, ActSettings>();
/** The runtime's view of a room: the instantiation's prelude and wire bound, never the full settings. */
export function actSettings(settings: GameSettings): ActSettings {
  const inst = instantiationOf(settings);
  const key = `${inst.key}\0${settings.interactionComputeMs}\0${settings.stepBudget}\0${settings.commitClause}`;
  let cached = actSettingsCache.get(key);
  if (!cached) {
    const base = objectType(inst.objectType).prelude(inst), parts = settings.commitClause ? withCommitClause(base) : base;
    cached = Object.freeze({
      objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs, stepBudget: settings.stepBudget,
      prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts,
        pricing: parts.pricing as unknown as { python: PricingVocab; typescript: PricingVocab } },
    }) as ActSettings;
    if (actSettingsCache.size >= 64) actSettingsCache.delete(actSettingsCache.keys().next().value!);
    actSettingsCache.set(key, cached);
  }
  return cached;
}

async function guarded<T>(language: Language, run: (rt: GameRuntime) => Promise<T>): Promise<T> {
  const rt = await pool(language);
  try { return await run(rt); }
  catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "CONFIG") {
      console.error("Runtime configuration error (server bug)", (error as Error).message);
      throw Object.assign(new Error("The game runtime is misconfigured"), { code: "RUNTIME_CONFIG" });
    }
    if (code === "UNAVAILABLE") unavailable.set(language, (error as Error).message);
    throw error;
  }
}

/** The source's description bits and literal moves. Never evaluates. */
export function inspect(source: string, settings: GameSettings): Promise<Inspection> {
  validateSettings(settings);
  return guarded(settings.language, rt => rt.inspect(source, actSettings(settings)));
}
/** One deterministic act (frozen clock, `random` seeded with `seed`): the UNTRUSTED encoded call list. */
export function act(source: string, input: ObjectValue, settings: GameSettings, seed: bigint): Promise<ActResult> {
  return guarded(settings.language, rt => rt.act(source, input as string | number, actSettings(settings), seed.toString()));
}

/** Probe a language once per warm instance: an empty agent must round-trip. */
const probes = new Map<Language, Promise<boolean>>();
export function languageAvailable(settings: GameSettings): Promise<boolean> {
  const language = settings.language;
  let p = probes.get(language);
  if (!p) {
    p = (async () => {
      try {
        const source = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
        const inst = instantiationOf(settings), T = objectType(inst.objectType);
        const { seededRng } = await import("@workspace/game-types");
        const value = T.codec(inst).encode(T.spawn(inst, seededRng(`code-gods:probe:${inst.key}`)));
        const result = await act(source, value, settings, 0n);
        return result.calls === "[]";
      } catch (error) {
        console.warn(`Isolated ${language} runtime unavailable: ${(error as Error).message}`);
        probes.delete(language);
        return false;
      }
    })();
    probes.set(language, p);
  }
  return p;
}
