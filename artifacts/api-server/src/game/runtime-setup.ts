import { DEFAULT_SETTINGS } from "@workspace/game-core";
import { createRuntime, RuntimeError, type GameRuntime, type Language } from "@workspace/game-runtime";
import { createRuntimeAdapter, createUtilitiesAdapter, registerAdapters, unregisterAdapters } from "./adapters.ts";

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
      try {
        for (const objectType of ["Int", "string"] as const) {
          const settings = { ...DEFAULT_SETTINGS, language, objectType, grammarId: `${language}-standard-v1` };
          const source = language === "python" ? "lambda x: x"
            : objectType === "Int" ? "(x: number) => x" : "(x: string) => x";
          const input = objectType === "Int" ? 37 : "identity\0\n";
          const { cost } = await pool.inspect(source, settings);
          const { value } = await pool.execute(source, input, settings);
          if (!Number.isSafeInteger(cost) || cost <= 0 || value !== input) {
            throw new RuntimeError("UNAVAILABLE", `${language} identity probe failed`);
          }
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
