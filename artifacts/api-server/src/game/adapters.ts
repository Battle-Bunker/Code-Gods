import { codecOf, instantiationOf, netBits, softHinge, validateSettings, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { RuntimeError, type ActSettings, type GameRuntime, type Language } from "@workspace/game-runtime";
import { objectType, type Rng } from "@workspace/game-types";
import { divineLottery, evaluator, selector, type GodScore, type UtilityDescriptor } from "@workspace/game-utilities";
import { randomBytes } from "node:crypto";
import { hasTable, penaltyMeanBits, surprisal, tableFor } from "./calibration.ts";

// Explicit injection boundary for the independently developed packages.
export interface RuntimeAdapter {
  languages: string[];
  /** ast-bytes-v1 price of the source (its description bits). Parses and type-checks; never evaluates. */
  inspect(source: string, settings: GameSettings): Promise<{ cost: number }>;
  /** One act: the exact, UNTRUSTED encoded call list the guest returned. */
  act(source: string, input: ObjectValue, settings: GameSettings): Promise<{ calls: string }>;
  /** inspect + one act per sample (fresh guest each); rejects on the first failure. */
  validate(source: string, samples: ObjectValue[], settings: GameSettings): Promise<{ cost: number; outputs: string[] }>;
}
export interface UtilitiesAdapter {
  deal(settings: GameSettings, count: number): UtilityDescriptor[];
  /** One god's private score of one object value: ordinal, surprisal bits and net bits. */
  score(settings: GameSettings, descriptor: UtilityDescriptor, value: ObjectValue): GodScore;
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

/** Runtime failures caused by the agent's own code; CONFIG is a server bug, CAPACITY/UNAVAILABLE are the host's. */
export const AGENT_FAULTS: ReadonlySet<string> = new Set(["COMPILE", "DOMAIN", "EXECUTION", "LIMIT"]);
export const isAgentFault = (error: unknown) =>
  !!error && typeof error === "object" && AGENT_FAULTS.has(String((error as { code?: unknown }).code));

/** Unbiased cryptographic randomness for live games (spawns, dealing, selection). */
export const cryptoRng: Rng = {
  big(bound: bigint) {
    if (bound <= 0n) throw new Error("Random bound must be positive");
    const bytes = Math.ceil(bound.toString(2).length / 8);
    const range = 1n << BigInt(bytes * 8), limit = range - range % bound;
    for (;;) {
      const n = BigInt(`0x${randomBytes(bytes).toString("hex")}`);
      if (n < limit) return n % bound;
    }
  },
  int(bound: number) {
    if (!Number.isSafeInteger(bound) || bound <= 0) throw new Error("Random bound must be a positive safe integer");
    return Number(cryptoRng.big(BigInt(bound)));
  },
};

const actSettingsCache = new Map<string, ActSettings>();
/** The runtime's view of a room: the instantiation's prelude and wire bound, never the full settings. */
export function actSettings(settings: GameSettings): ActSettings {
  const inst = instantiationOf(settings);
  const cacheKey = `${inst.key}\0${settings.interactionComputeMs}`;
  let cached = actSettingsCache.get(cacheKey);
  if (!cached) {
    const parts = objectType(inst.objectType).prelude(inst);
    cached = Object.freeze({
      objectType: inst.objectType, wireMaxLength: codecOf(settings).maxLength,
      interactionComputeMs: settings.interactionComputeMs,
      prelude: { key: parts.hash, python: parts.python, js: parts.js, dts: parts.dts },
    });
    if (actSettingsCache.size >= 64) actSettingsCache.delete(actSettingsCache.keys().next().value!);
    actSettingsCache.set(cacheKey, cached);
  }
  return cached;
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
  /** CONFIG means the server built a bad prelude or settings: never the agent's fault. */
  async function guarded<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) {
      if (error instanceof RuntimeError && error.code === "CONFIG") {
        console.error("Runtime configuration error (server bug)", error.message);
        throw Object.assign(new Error("The game runtime is misconfigured"), { status: 500, code: "RUNTIME_CONFIG" });
      }
      throw error;
    }
  }
  return {
    languages: Object.keys(pools),
    async inspect(source, settings) {
      const selected = pool(settings);
      return guarded(() => admitted(() => selected.inspect(source, actSettings(settings))));
    },
    async act(source, input, settings) {
      const selected = pool(settings);
      return guarded(() => admitted(() => selected.act(source, input, actSettings(settings))));
    },
    async validate(source, samples, settings) {
      const selected = pool(settings);
      return guarded(() => admitted(() => selected.validate(source, samples, actSettings(settings))));
    },
  };
}

/** Bits are compared and serialised: never let −0 (−log2 1) through. */
const bits = (x: number) => (x === 0 ? 0 : x);
export function createUtilitiesAdapter(): UtilitiesAdapter {
  const table = (draw: { familyId: string; params: UtilityDescriptor["params"] }, settings: GameSettings) => {
    const found = tableFor(draw, instantiationOf(settings));
    if (!found) throw new Error(`No calibration table for ${draw.familyId} in ${instantiationOf(settings).key}`);
    return found;
  };
  return {
    deal(settings, count) {
      validateSettings(settings);
      const inst = instantiationOf(settings);
      return selector(settings.utilitySelectorId ?? divineLottery.id).select(inst, count, cryptoRng, {
        defenceRate: settings.defenceRate, hasTable: draw => hasTable(draw, inst),
      });
    },
    score(settings, descriptor, value) {
      const inst = instantiationOf(settings);
      const ordinal = evaluator(descriptor, inst)(value);
      const rewardBits = bits(surprisal(table(descriptor, settings), ordinal));
      if (!descriptor.penalty) return { ordinal, rewardBits, netBits: bits(netBits({ rewardBits }, settings.penaltyWeight)) };
      const penaltyTable = table(descriptor.penalty, settings);
      const penaltyOrdinal = evaluator(descriptor.penalty, inst)(value);
      const penaltyBits = bits(softHinge(surprisal(penaltyTable, penaltyOrdinal)));
      return {
        ordinal, rewardBits, penaltyOrdinal, penaltyBits,
        netBits: bits(netBits({ rewardBits, penaltyBits, penaltyMeanBits: penaltyMeanBits(penaltyTable) }, settings.penaltyWeight)),
      };
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
