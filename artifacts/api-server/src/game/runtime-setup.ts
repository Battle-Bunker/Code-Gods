import { DEFAULT_SETTINGS, type GameSettings } from "@workspace/game-core";
import { OBJECT_TYPES } from "@workspace/game-types";
import { createRuntime, RuntimeError, type GameRuntime, type Language } from "@workspace/game-runtime";
import { actSettings, createRuntimeAdapter, createUtilitiesAdapter, registerAdapters, unregisterAdapters } from "./adapters.ts";
import { referenceSpawns } from "./engine.ts";

const languages: Language[] = ["python", "typescript"];
let pools: Partial<Record<Language, GameRuntime>> = {};
let initialization: Promise<void> | undefined;
let generation = 0;

/** Starts bounded Wasm-only workers; only successfully probed languages are advertised. */
export function initializeRuntimeAdapters(): Promise<void> {
  if (initialization) return initialization;
  const currentGeneration = generation;
  const candidates: Partial<Record<Language, GameRuntime>> = {};
  pools = candidates;
  initialization = (async () => {
    const failures: string[] = [];
    const usable: Partial<Record<Language, GameRuntime>> = {};
    await Promise.all(languages.map(async language => {
      // Persistent workers grow lazily: identity probes start only one per
      // language; concurrent interactions can use four independent CPU cores.
      const pool = createRuntime({ language, workers: 4, queueLimit: 32 });
      candidates[language] = pool;
      const probe = async () => {
        // Every object type's default instantiation: the prelude compiles and an empty agent round-trips.
        for (const type of OBJECT_TYPES) {
          // The probe checks availability, not speed: a cold worker on a busy host can
          // exceed the 5 ms play budget, which must not disable a language until restart.
          const settings: GameSettings = { ...DEFAULT_SETTINGS, language, grammarId: `${language}-agent-v1`,
            objectType: type.id, typeArgs: type.defaults, interactionComputeMs: 1000 };
          const source = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
          const act = actSettings(settings);
          const { cost } = await pool.inspect(source, act);
          const input = referenceSpawns(settings)[0];
          const { calls } = await pool.act(source, input, act);
          if (!Number.isSafeInteger(cost) || cost <= 0 || calls !== "[]") {
            throw new RuntimeError("UNAVAILABLE", `${language} ${type.id} agent probe failed`);
          }
        }
      };
      try {
        for (let attempt = 1; ; attempt++) {
          try { await probe(); break; }
          catch (error) { if (attempt >= 3) throw error; }
        }
        usable[language] = pool;
      } catch (error) {
        pool.close();
        failures.push(`${language}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    if (currentGeneration !== generation) {
      for (const pool of Object.values(candidates)) pool.close();
      throw new RuntimeError("UNAVAILABLE", "Runtime initialization was shut down");
    }
    if (!Object.keys(usable).length) {
      throw new RuntimeError("UNAVAILABLE", `No isolated runtime is usable: ${failures.join("; ")}`);
    }
    for (const failure of failures) console.warn(`Isolated runtime unavailable (no fallback): ${failure}`);
    pools = usable;
    registerAdapters({ runtime: createRuntimeAdapter(usable), utilities: createUtilitiesAdapter() });
  })().catch(error => {
    if (currentGeneration === generation) {
      for (const pool of Object.values(candidates)) pool.close();
      pools = {};
      initialization = undefined;
      unregisterAdapters();
    }
    throw error;
  });
  return initialization;
}

export function shutdownRuntimeAdapters(): void {
  generation++;
  for (const pool of Object.values(pools)) pool.close();
  pools = {};
  initialization = undefined;
  unregisterAdapters();
}
