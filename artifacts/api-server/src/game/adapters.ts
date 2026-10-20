import { validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { RuntimeError, type GameRuntime, type Language } from "@workspace/game-runtime";
import { divineLottery, readDescriptor, selector, utility, type UtilityDescriptor } from "@workspace/game-utilities";
import { randomInt } from "node:crypto";

// Explicit injection boundary for the independently developed packages.
export interface RuntimeAdapter {
  languages: string[];
  inspect(source: string, settings: GameSettings): Promise<{ cost: number }>;
  execute(source: string, input: ObjectValue, settings: GameSettings): Promise<ObjectValue>;
}
export interface UtilitiesAdapter {
  deal(settings: GameSettings, count: number): UtilityDescriptor[];
  evaluate(descriptor: UtilityDescriptor, value: ObjectValue): number;
}
export let runtime: RuntimeAdapter | undefined;
export let utilities: UtilitiesAdapter | undefined;
export function registerAdapters(next: { runtime: RuntimeAdapter; utilities: UtilitiesAdapter }) {
  runtime = next.runtime;
  utilities = next.utilities;
}
export function unregisterAdapters() {
  runtime = undefined;
  utilities = undefined;
}

export function createRuntimeAdapter(pools: Partial<Record<Language, GameRuntime>>): RuntimeAdapter {
  // Shared admission across both languages, including summon validation.
  // Language-specific workers remain persistent, but at most four requests
  // execute at once. Bound waiting callers as well as the underlying pools.
  let active = 0;
  const waiting: Array<() => void> = [];
  async function admitted<T>(run: () => Promise<T>): Promise<T> {
    if (active < 4) active++;
    else {
      if (waiting.length >= 64) throw new RuntimeError("CAPACITY", "Runtime capacity exhausted; retry later");
      await new Promise<void>((resolve, reject) => {
        const resume = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => {
          const index = waiting.indexOf(resume);
          if (index >= 0) waiting.splice(index, 1);
          reject(new RuntimeError("CAPACITY", "Queue wait expired"));
        }, 34000);
        waiting.push(resume);
      });
    }
    try { return await run(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  function pool(settings: GameSettings): GameRuntime {
    validateSettings(settings);
    const selected = pools[settings.language];
    if (!selected) throw new RuntimeError("UNAVAILABLE", `Isolated ${settings.language} runtime is unavailable`);
    return selected;
  }
  return {
    languages: Object.keys(pools),
    async inspect(source, settings) {
      const selected = pool(settings);
      return admitted(() => selected.inspect(source, settings));
    },
    async execute(source, input, settings) {
      const selected = pool(settings);
      // Pass the complete room snapshot, including interactionComputeMs, to the guest runtime.
      return (await admitted(() => selected.execute(source, input, settings))).value;
    },
  };
}

export function createUtilitiesAdapter(): UtilitiesAdapter {
  return {
    deal(settings, count) {
      validateSettings(settings);
      return selector(settings.utilitySelectorId ?? divineLottery.id).select(settings, count, randomInt);
    },
    evaluate(descriptor, value) {
      return utility(readDescriptor(descriptor), value);
    },
  };
}
export function requireAdapters() {
  if (!runtime || !utilities) throw Object.assign(
    new Error("Game execution is unavailable until the isolated runtime has started"),
    { status: 503, code: "RUNNER_UNAVAILABLE" },
  );
  return { runtime, utilities };
}
