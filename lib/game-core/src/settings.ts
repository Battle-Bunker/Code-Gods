/**
 * Room/game settings (docs/clean-implementation-plan.md §§1, 4.3–4.4).
 *
 * The object type is a type constructor applied to runtime arguments: `objectType` names it and
 * `typeArgs` are its arguments (Int → {min, max}, string → {maxLength}, Grid → {size, symbols, colours}).
 * game-core knows no object type itself: arguments, codecs and spawn priors all come from the
 * `@workspace/game-types` registry.
 */
import { instantiate, objectType as objectTypeDef } from "@workspace/game-types";
import type { Codec, Instantiation, ObjectValue, TypeArgs } from "@workspace/game-types";

export type { ObjectValue, TypeArgs } from "@workspace/game-types";

export type Language = "python" | "typescript";
export const LANGUAGES: readonly Language[] = ["python", "typescript"];

/** Agent grammars: source defines `agent(obj)` returning mutator calls, against the room's prelude. */
export type GrammarId = "python-agent-v1" | "typescript-agent-v1";

/** Resource limit: at most this many live agents per god. */
export const MAX_AGENTS_PER_GOD = 200;

export interface GameSettings {
  language: Language;
  /** Registered object type id ("Int", "string", "Grid", ...). */
  objectType: string;
  /** Arguments of the type constructor, validated by the type's `instantiate`. */
  typeArgs: TypeArgs;
  grammarId: GrammarId;
  /** How utility functions are dealt to gods; see @workspace/game-utilities. */
  utilitySelectorId: string;
  /** Summon price in bits (the agent source's description length). */
  complexityFunctionId: string;
  spawnFunctionId: "uniform";
  planningSeconds: number;
  halfLifeSeconds: number;
  startingObjectCount: number;
  spawnRateHz: number;
  interactionRateHz: number;
  /** Guest execution CPU budget per interaction; excludes compilation and startup. */
  interactionComputeMs: number;
  pauseSeconds: number;
  /** God energy (bits) at the start of planning; accrues in real time. */
  startingEnergy: number;
  /** God income, bits per real-time second. */
  energyPerSecond: number;
  /** Each agent's income, bits per second of world time (grid-lab `agent_income`). */
  agentEnergyPerSecond: number;
  /** Agent battery in expected acts: income stops at agentBatteryActs × expectedActCost. */
  agentBatteryActs: number;
  maxAgentsPerGod: number;
  /** w in n = s⁺ − w(h − E_μh): the weight of a defence-goal bit against a reward bit. */
  penaltyWeight: number;
  /** Probability that a god is dealt a defence goal (0: opt-in, as in grid-lab). */
  defenceRate: number;
}

// These IDs describe the contract, not a claim that runners are installed.
export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  language: "python",
  objectType: "Int",
  typeArgs: Object.freeze({ min: -2147483648, max: 2147483647 }),
  grammarId: "python-agent-v1",
  utilitySelectorId: "divine-lottery",
  complexityFunctionId: "ast-bytes-v1",
  spawnFunctionId: "uniform",
  planningSeconds: 60,
  halfLifeSeconds: 300,
  startingObjectCount: 10,
  spawnRateHz: 0.1,
  interactionRateHz: 100,
  interactionComputeMs: 5,
  pauseSeconds: 180,
  startingEnergy: 100,
  energyPerSecond: 1,
  agentEnergyPerSecond: 2,
  agentBatteryActs: 2,
  maxAgentsPerGod: MAX_AGENTS_PER_GOD,
  penaltyWeight: 1,
  defenceRate: 0,
} satisfies GameSettings);

export interface SettingsOption {
  readonly id: string;
  readonly label: string;
  readonly languages: readonly Language[];
  readonly objectTypes: readonly string[];
}

const ALL_TYPES = ["Int", "string", "Grid"] as const;

/** Pre-authored dropdown choices; unknown identifiers are always rejected. */
export const SETTINGS_OPTIONS: Readonly<Record<"grammarId" | "utilitySelectorId" | "complexityFunctionId",
  readonly SettingsOption[]>> = Object.freeze({
  grammarId: [
    { id: "python-agent-v1", label: "Python agent: def agent(obj) returns mutator calls", languages: ["python"], objectTypes: ALL_TYPES },
    { id: "typescript-agent-v1", label: "TypeScript agent: function agent(obj) returns mutator calls", languages: ["typescript"], objectTypes: ALL_TYPES },
  ],
  utilitySelectorId: [
    { id: "divine-lottery", label: "Divine Lottery (each god draws a random utility function)", languages: ["python", "typescript"], objectTypes: ALL_TYPES },
  ],
  complexityFunctionId: [
    { id: "ast-bytes-v1", label: "AST nodes + literal bytes (summon price in bits)", languages: ["python", "typescript"], objectTypes: ALL_TYPES },
  ],
});

export type OptionKey = keyof typeof SETTINGS_OPTIONS;

/** The options of one dropdown compatible with a language and object type. */
export function settingsOptionsFor(key: OptionKey, language: Language, objectType: string): SettingsOption[] {
  return SETTINGS_OPTIONS[key].filter(o => o.languages.includes(language) && o.objectTypes.includes(objectType));
}

function finiteNonnegative(settings: GameSettings, keys: readonly (keyof GameSettings)[]): void {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${key} must be finite and nonnegative`);
    }
  }
}

/**
 * Validate mathematical settings and pre-authored options. Type arguments are validated by the
 * object type's own `instantiate` (it throws on bad arguments).
 */
export function validateSettings(settings: GameSettings): void {
  if (!LANGUAGES.includes(settings.language)) throw new Error("Unsupported language");
  if (typeof settings.objectType !== "string") throw new Error("Unsupported object type");
  if (settings.typeArgs === null || typeof settings.typeArgs !== "object" || Array.isArray(settings.typeArgs)) {
    throw new Error("typeArgs must be an object of type arguments");
  }
  instantiationOf(settings);
  if (!Number.isSafeInteger(settings.startingObjectCount) || settings.startingObjectCount < 0) {
    throw new Error("startingObjectCount must be a nonnegative safe integer");
  }
  finiteNonnegative(settings, [
    "planningSeconds", "halfLifeSeconds", "spawnRateHz", "interactionRateHz", "pauseSeconds",
    "startingEnergy", "energyPerSecond", "agentEnergyPerSecond", "agentBatteryActs",
    "penaltyWeight", "defenceRate",
  ]);
  if (settings.halfLifeSeconds === 0) throw new Error("Half-life must be positive");
  if (settings.interactionRateHz > 1000) throw new Error("interactionRateHz must not exceed 1000 Hz");
  if (!Number.isInteger(settings.interactionComputeMs) ||
      settings.interactionComputeMs < 1 || settings.interactionComputeMs > 1000) {
    throw new Error("interactionComputeMs must be an integer from 1 to 1000 milliseconds");
  }
  if (settings.pauseSeconds === 0) throw new Error("Pause duration must be positive");
  // A battery smaller than one expected act could never reach eligibility.
  if (settings.agentBatteryActs < 1) throw new Error("agentBatteryActs must be at least 1");
  if (!Number.isInteger(settings.maxAgentsPerGod) ||
      settings.maxAgentsPerGod < 1 || settings.maxAgentsPerGod > MAX_AGENTS_PER_GOD) {
    throw new Error(`maxAgentsPerGod must be an integer from 1 to ${MAX_AGENTS_PER_GOD}`);
  }
  if (settings.defenceRate > 1) throw new Error("defenceRate must be a probability in [0, 1]");
  if (settings.spawnFunctionId !== "uniform") throw new Error("Unsupported spawn function");
  for (const key of ["grammarId", "utilitySelectorId", "complexityFunctionId"] as const) {
    if (!settingsOptionsFor(key, settings.language, settings.objectType).some(o => o.id === settings[key])) {
      throw new Error(`Unsupported ${key} for this language and object type`);
    }
  }
}

// ------------------------------------------------------------------------------------------------
// instantiation and codec (cached: assertObjectValue runs on every act)
// ------------------------------------------------------------------------------------------------

interface Resolved { readonly inst: Instantiation; readonly codec: Codec<unknown> }
const CACHE_LIMIT = 64;
const cache = new Map<string, Resolved>();

function resolveType(settings: Pick<GameSettings, "objectType" | "typeArgs">): Resolved {
  const args = settings.typeArgs;
  const cacheKey = JSON.stringify([settings.objectType,
    Object.keys(args ?? {}).sort().map(k => [k, args[k]])]);
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const inst = instantiate(settings.objectType, args);
  const resolved: Resolved = { inst, codec: objectTypeDef(settings.objectType).codec(inst) };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, resolved);
  return resolved;
}

/** The fully applied object type of these settings, e.g. Grid(5,base10,rgby). Throws on bad args. */
export function instantiationOf(settings: Pick<GameSettings, "objectType" | "typeArgs">): Instantiation {
  return resolveType(settings).inst;
}

/** The wire codec of these settings' instantiation. */
export function codecOf(settings: Pick<GameSettings, "objectType" | "typeArgs">): Codec<unknown> {
  return resolveType(settings).codec;
}

/** Reject rather than coerce, truncate, wrap, or clamp: the value must be canonical for the type. */
export function assertObjectValue(
  value: unknown,
  settings: Pick<GameSettings, "objectType" | "typeArgs">,
): asserts value is ObjectValue {
  const codec: Codec<unknown> = codecOf(settings);
  codec.assert(value);
}

// ------------------------------------------------------------------------------------------------
// COMPATIBILITY SHIM (docs/clean-implementation-plan.md §6.1): the only one in game-core.
// ------------------------------------------------------------------------------------------------

const LEGACY_GRAMMARS: Readonly<Record<string, GrammarId>> = {
  "python-standard-v1": "python-agent-v1",
  "typescript-standard-v1": "typescript-agent-v1",
};

/**
 * Compatibility shim for settings stored before the object-type registry (JSONB room/game snapshots).
 *
 * - `intMin`/`intMax` (Int) and `stringMaxLength` (string) become `typeArgs`; the legacy fields are dropped.
 * - Old grammar ids `python-standard-v1` / `typescript-standard-v1` become `python-agent-v1` /
 *   `typescript-agent-v1`.
 * - Fields missing from the stored JSON take today's defaults (new economy and scoring knobs included);
 *   a type without stored arguments takes that type's registry defaults.
 *
 * It does not validate: call `validateSettings` on the result. Use it only when reading stored data,
 * never for new input (new input must already have the current shape).
 */
export function normalizeLegacySettings(raw: unknown): GameSettings {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Stored settings must be an object");
  const { intMin, intMax, stringMaxLength, ...rest } = raw as Record<string, unknown>;
  const merged = { ...DEFAULT_SETTINGS, ...rest } as GameSettings;
  if (!("typeArgs" in rest) || rest.typeArgs === undefined) {
    if (merged.objectType === "Int") {
      merged.typeArgs = {
        min: intMin === undefined ? DEFAULT_SETTINGS.typeArgs.min : intMin as number,
        max: intMax === undefined ? DEFAULT_SETTINGS.typeArgs.max : intMax as number,
      };
    } else if (merged.objectType === "string" && stringMaxLength !== undefined) {
      merged.typeArgs = { maxLength: stringMaxLength as number };
    } else {
      // An unknown type gets empty arguments here and is rejected by validateSettings.
      try { merged.typeArgs = objectTypeDef(merged.objectType).defaults; } catch { merged.typeArgs = {}; }
    }
  }
  const grammar = LEGACY_GRAMMARS[merged.grammarId as string];
  if (grammar) merged.grammarId = grammar;
  return merged;
}
