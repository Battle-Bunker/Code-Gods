"use node";
/**
 * The ONE place the engine reaches agent sandboxes: the in-process runtime of convex/runtime/node.ts
 * (QuickJS for TypeScript, CPython-WASI on Node's WebAssembly for Python), whose warm workers live at
 * module scope and are reused across tick actions and summon examinations. Every action that can run
 * agent code calls `bindRuntime(ctx)` first, so the Python bundle can load from file storage.
 */
import { LANGUAGE_SPECS, codecOf, instantiationOf, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { objectType, withCommitClause } from "@workspace/game-types";
import type { ActResult, ActSettings, GameRuntime, Inspection, Language, PricingVocab } from "@workspace/game-runtime";
import { runtimeFor } from "../runtime/node";
export { bindRuntime } from "../runtime/node";

/** Acts in flight per tick wave (the runtime pools queue beyond their worker count). */
export const WORKERS = 4;
const unavailable = new Map<Language, string>();
const pool = async (language: Language): Promise<GameRuntime> => runtimeFor(language);

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

/**
 * The source's description bits and literal moves, in the agent's own language (one the game allows: the caller
 * checks that). Never evaluates.
 */
export function inspect(source: string, language: Language, settings: GameSettings): Promise<Inspection> {
  validateSettings(settings);
  return guarded(language, rt => rt.inspect(source, actSettings(settings)));
}
/** One deterministic act (frozen clock, `random` seeded with `seed`) of an agent in `language`: the UNTRUSTED encoded call list. */
export function act(source: string, language: Language, input: ObjectValue, settings: GameSettings, seed: bigint): Promise<ActResult> {
  return guarded(language, rt => rt.act(source, input as string | number, actSettings(settings), seed.toString()));
}

/** Probe a language once per warm instance: an empty agent must round-trip on these settings' instantiation. */
const probes = new Map<Language, Promise<boolean>>();
export function languageAvailable(language: Language, settings: GameSettings): Promise<boolean> {
  let p = probes.get(language);
  if (!p) {
    p = (async () => {
      try {
        const source = LANGUAGE_SPECS[language].emptyAgent;
        const inst = instantiationOf(settings), T = objectType(inst.objectType);
        const { seededRng } = await import("@workspace/game-types");
        const value = T.codec(inst).encode(T.spawn(inst, seededRng(`code-gods:probe:${inst.key}`)));
        const result = await act(source, language, value, settings, 0n);
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
