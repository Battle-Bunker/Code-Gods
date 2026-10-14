import { createHash } from "node:crypto";
import { validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { RuntimeError, type GameRuntime, type Language } from "@workspace/game-runtime";
import {
  GENERATOR_ID, generate, evaluatePreference,
  type Domain, type Preference,
} from "@workspace/game-values";

// Explicit injection boundary for the independently developed packages.
export interface RuntimeAdapter {
  languages: string[];
  inspect(source: string, settings: GameSettings): Promise<{ cost: number }>;
  execute(source: string, input: ObjectValue, settings: GameSettings): Promise<ObjectValue>;
}
export interface ValuesAdapter {
  generate(settings: GameSettings, count: number, seed: string): { source: string; descriptor: unknown }[];
  evaluate(descriptor: unknown, value: ObjectValue): number;
}
export let runtime: RuntimeAdapter | undefined;
export let values: ValuesAdapter | undefined;
export function registerAdapters(next: { runtime: RuntimeAdapter; values: ValuesAdapter }) {
  runtime = next.runtime;
  values = next.values;
}
export function unregisterAdapters() {
  runtime = undefined;
  values = undefined;
}

export function createRuntimeAdapter(pools: Partial<Record<Language, GameRuntime>>): RuntimeAdapter {
  function pool(settings: GameSettings): GameRuntime {
    validateSettings(settings);
    const selected = pools[settings.language];
    if (!selected) throw new RuntimeError("UNAVAILABLE", `Isolated ${settings.language} runtime is unavailable`);
    return selected;
  }
  return {
    languages: Object.keys(pools),
    async inspect(source, settings) { return pool(settings).inspect(source, settings); },
    async execute(source, input, settings) {
      return (await pool(settings).execute(source, input, settings)).value;
    },
  };
}

interface ValueDescriptor {
  generatorId: typeof GENERATOR_ID;
  domain: Domain;
  preference: Preference;
}

function readDescriptor(value: unknown): ValueDescriptor {
  const invalid = () => new Error("Invalid or unsupported persisted value descriptor");
  if (!value || typeof value !== "object") throw invalid();
  const descriptor = value as ValueDescriptor;
  if (descriptor.generatorId !== GENERATOR_ID || !descriptor.domain || !descriptor.preference) throw invalid();
  const d = descriptor.domain;
  const p = descriptor.preference;
  if (d.objectType === "Int") {
    if (!Number.isSafeInteger(d.intMin) || !Number.isSafeInteger(d.intMax) ||
        d.intMin < -2147483648 || d.intMax > 2147483647 || d.intMin > d.intMax ||
        p.kind !== "cyclic-well" || !Number.isSafeInteger(p.period) || p.period < 1 ||
        !Number.isSafeInteger(p.center) || p.center < 0 || p.center >= p.period ||
        !Number.isFinite(p.width) || p.width <= 0) throw invalid();
  } else if (d.objectType === "string") {
    if (!Number.isSafeInteger(d.stringMaxLength) || d.stringMaxLength < 4 || d.stringMaxLength > 4096 ||
        p.kind !== "edit-well" || typeof p.prototype !== "string" ||
        p.prototype.length > d.stringMaxLength || /[^\x00-\x7f]/u.test(p.prototype) ||
        !Number.isFinite(p.width) || p.width <= 0) throw invalid();
  } else throw invalid();
  return descriptor;
}

export function createValuesAdapter(): ValuesAdapter {
  return {
    generate(settings, count, seed) {
      validateSettings(settings);
      if (!Number.isInteger(count) || count < 3 || count > 8) {
        throw new Error("Value generator requires 3–8 gods");
      }
      const numericSeed = createHash("sha256").update(seed, "utf8").digest().readUInt32BE(0);
      try {
        const pantheon = generate(settings.objectType === "Int"
          ? { seed: numericSeed, deityCount: count, objectType: "Int", intMin: settings.intMin, intMax: settings.intMax }
          : { seed: numericSeed, deityCount: count, objectType: "string", stringMaxLength: settings.stringMaxLength });
        return pantheon.gods.map(god => ({
          source: god.source[settings.language],
          descriptor: {
            generatorId: GENERATOR_ID, domain: pantheon.manifest.domain, preference: god.preference,
          } satisfies ValueDescriptor,
        }));
      } catch (error) {
        throw new Error(`Value generator cannot use this domain: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    },
    evaluate(descriptor, value) {
      const { domain, preference } = readDescriptor(descriptor);
      return evaluatePreference(value, domain, preference);
    },
  };
}
export function requireAdapters() {
  if (!runtime || !values) throw Object.assign(
    new Error("Game execution is unavailable until isolated runtime and value generator integration is complete"),
    { status: 503, code: "RUNNER_UNAVAILABLE" },
  );
  return { runtime, values };
}
