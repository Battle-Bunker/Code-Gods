import { defaultSettingsFor, type GameSettings } from "@workspace/game-core";
import { OBJECT_TYPES } from "@workspace/game-types";
import { createRuntime, RuntimeError, type GameRuntime, type Language } from "@workspace/game-runtime";
import { actSettings, createRuntimeAdapter, createUtilitiesAdapter, probeValue, registerAdapters, unregisterAdapters } from "./adapters.ts";

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
      // Four persistent workers per language (four CPU cores). Summon measurement runs four acts at
      // once, so all four are started (warmed) here rather than cold inside a summon.
      const pool = createRuntime({ language, workers: 4, queueLimit: 32, startupMs: 120000 });
      candidates[language] = pool;
      const probe = async () => {
        // Every object type's default instantiation: the prelude compiles and an empty agent round-trips.
        for (const type of OBJECT_TYPES) {
          // The probe checks availability, not speed: a cold worker on a busy host can
          // exceed the 5 ms play budget, which must not disable a language until restart.
          const settings: GameSettings = defaultSettingsFor(type.id, language);
          const source = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
          const act = actSettings(settings);
          const { cost } = await pool.inspect(source, act);
          const input = probeValue(settings);
          const { calls } = await pool.act(source, input, act, "0");
          if (!Number.isFinite(cost) || cost <= 0 || calls !== "[]") {
            throw new RuntimeError("UNAVAILABLE", `${language} ${type.id} agent probe failed`);
          }
        }
      };
      try {
        for (let attempt = 1; ; attempt++) {
          try { await probe(); break; }
          catch (error) { if (attempt >= 3) throw error; }
        }
        const warm = defaultSettingsFor("Grid", language), act = actSettings(warm);
        const source = language === "python" ? "def agent(x):\n    return []" : "function agent(x) { return []; }";
        await Promise.all(Array.from({ length: 4 }, (_, i) => pool.act(source, probeValue(warm), act, String(i))));
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
