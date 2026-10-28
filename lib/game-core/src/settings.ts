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
  /** Summon price in bits: the source's description (Python ast-bits-v1, TypeScript ts-ast-bits-v1-uniform). */
  complexityFunctionId: string;
  spawnFunctionId: "uniform";
  planningSeconds: number;
  halfLifeSeconds: number;
  startingObjectCount: number;
  spawnRateHz: number;
  interactionRateHz: number;
  /** CPU backstop per act (ms); excludes compilation and startup. The deterministic `stepBudget` is what binds. */
  interactionComputeMs: number;
  /** Deterministic step budget per act (lib/game-runtime): the same agent, input and seed always fit or never do. */
  stepBudget: number;
  /** Bits added to every attempted act's charge, valid or not: the Margolus–Levitin floor (grid-lab PR #14). */
  perActFloorBits: number;
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
  /** Family ids the dealer never deals in this game (e.g. rules too hard on a beginner board). */
  excludedFamilies: readonly string[];
  /**
   * The reference prior that rarity is measured against (calibration tables are keyed by it). "uniform" is
   * the spawn prior; later seasons may use an empirical mixture (lib/grid-lab/docs/explore/priors.md).
   */
  priorId: string;
  /**
   * Offer the commit clause (grid-lab PR #18, docs/explore/spirals.md §9): an agent may wrap its moves in
   * `only_if_better(...)`, and the engine then commits them only if they strictly raise the owner's payoff on
   * that object. Off by default.
   */
  commitClause: boolean;
  /** Which object an interaction targets: "uniform", or "shelter" (weight 1/(1+σ⁺), σ the object's salience). */
  objectSelection: "uniform" | "shelter";
}

// These IDs describe the contract, not a claim that runners are installed.
export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  language: "python",
  objectType: "Int",
  typeArgs: Object.freeze({ min: -2147483648, max: 2147483647 }),
  grammarId: "python-agent-v1",
  utilitySelectorId: "fair-aligned",
  complexityFunctionId: "ast-bits-v1",
  spawnFunctionId: "uniform",
  planningSeconds: 60,
  halfLifeSeconds: 300,
  startingObjectCount: 10,
  spawnRateHz: 0.1,
  interactionRateHz: 100,
  interactionComputeMs: 1000,
  stepBudget: 500000,
  perActFloorBits: 2,
  pauseSeconds: 180,
  startingEnergy: 100,
  energyPerSecond: 1,
  agentEnergyPerSecond: 2,
  agentBatteryActs: 2,
  maxAgentsPerGod: MAX_AGENTS_PER_GOD,
  penaltyWeight: 1,
  defenceRate: 0,
  excludedFamilies: Object.freeze([]) as readonly string[],
  priorId: "uniform",
  commitClause: false,
  objectSelection: "uniform",
} satisfies GameSettings);

/** The one summon-price code of each language (lib/game-runtime COMPLEXITY_IDS). */
export const COMPLEXITY_FOR: Readonly<Record<Language, string>> = Object.freeze({ python: "ast-bits-v1", typescript: "ts-ast-bits-v1-uniform" });

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
    { id: "fair-aligned", label: "Aligned Lottery (tables of rules that tend to want the same objects)", languages: ["python", "typescript"], objectTypes: ALL_TYPES },
    { id: "divine-lottery", label: "Divine Lottery (each god draws a random utility function)", languages: ["python", "typescript"], objectTypes: ALL_TYPES },
  ],
  complexityFunctionId: [
    { id: "ast-bits-v1", label: "Python description bits (ast-bits-v1, corpus-weighted)", languages: ["python"], objectTypes: ALL_TYPES },
    { id: "ts-ast-bits-v1-uniform", label: "TypeScript description bits (ts-ast-bits-v1, uniform)", languages: ["typescript"], objectTypes: ALL_TYPES },
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
    "penaltyWeight", "defenceRate", "perActFloorBits",
  ]);
  if (!Number.isInteger(settings.stepBudget) || settings.stepBudget < 1 || settings.stepBudget > 10_000_000) {
    throw new Error("stepBudget must be an integer from 1 to 10,000,000 steps");
  }
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
  if (!Array.isArray(settings.excludedFamilies) || settings.excludedFamilies.length > 200 ||
      settings.excludedFamilies.some(id => typeof id !== "string" || !/^[a-z0-9_+-]{1,64}$/.test(id))) {
    throw new Error("excludedFamilies must be a list of family ids");
  }
  if (typeof settings.priorId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(settings.priorId)) {
    throw new Error("priorId must be a prior identifier");
  }
  if (typeof settings.commitClause !== "boolean") throw new Error("commitClause must be true or false");
  if (settings.objectSelection !== "uniform" && settings.objectSelection !== "shelter") {
    throw new Error("objectSelection must be uniform or shelter");
  }
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

/**
 * Tuned defaults per object type, layered over DEFAULT_SETTINGS: type-wide (`all`), computed from the
 * instantiation (`of`), then per instantiation key (`byKey`). Sources (lib/grid-lab/docs):
 * - experiments.md (held-out seeds): hits per object per second is the lever that matters, about 0.4–0.7;
 *   more objects and faster spawns get there.
 * - explore/gridtypes.md (2,344 games): the beginner board Grid(4,base10,rgb) also excludes five rules that
 *   are too hard there.
 * - explore/synergy.md §3.1b–c, §5 (held out): not dealing 11 weak families costs no dynamism (+0.010 to
 *   +0.016) and lowers unfairness (0.20 → 0.16). They stay in the catalogue; owners can deal them again.
 * This table is the single source of default dealer exclusions (settings.excludedFamilies).
 * Edit this table to retune a type or a single GridType.
 */
/** Weak Grid families, not dealt by default (synergy.md). The six "attractor" families stay dealt (flagged for rework). */
export const WEAK_GRID_FAMILIES: readonly string[] = Object.freeze([
  "tetromino_tamer", "quilt_maker", "robin_hood", "sudoku_scholar", "odds_evens", "lantern_lighter", "lone_peak",
  "number_sandwich", "picture_frame", "bridge_builder", "ladder_of_numbers",
]);

export const TYPE_DEFAULTS: Readonly<Record<string, {
  readonly all?: Partial<GameSettings>;
  readonly of?: (inst: Instantiation) => Partial<GameSettings>;
  readonly byKey?: Readonly<Record<string, Partial<GameSettings>>>;
}>> = {
  Grid: {
    // Agent income 32 bits/s with the 2-bit floor (perActFloorBits, a global default): the measured value of
    // grid-lab PR #14 §4.9 (held out) for the 80-object world: 0.46 hits per object, dynamism +0.056. The global
    // interaction cap binds in about 75% of snapshots, and the study predates defence goals. The documented
    // alternative is the "grid-low-income" preset (16 bits/s, floor 1).
    all: { spawnRateHz: 0.5, startingObjectCount: 80, agentEnergyPerSecond: 32, excludedFamilies: WEAK_GRID_FAMILIES },
    byKey: {
      "Grid(4,base10,rgb)": { excludedFamilies: [...WEAK_GRID_FAMILIES, "fair_weaver"] },
    },
  },
};

/** The tuned overrides for one instantiation. */
export function typeDefaults(objectType: string, typeArgs?: TypeArgs): Partial<GameSettings> {
  const entry = TYPE_DEFAULTS[objectType];
  if (!entry) return {};
  const inst = instantiate(objectType, typeArgs ?? objectTypeDef(objectType).defaults);
  return { ...entry.all, ...entry.of?.(inst), ...entry.byKey?.[inst.key] };
}

/**
 * Named starting points for the settings picker, in the suggested learning order. A preset is a settings
 * patch; owners can change anything afterwards. "Gentle" slows interactions so kids can follow their own
 * scores (explore/gridtypes.md: at 100 Hz an own score changes 10–17 times a minute).
 */
export const SETTINGS_PRESETS: readonly {
  readonly id: string; readonly label: string; readonly kid: string;
  readonly objectType: string; readonly typeArgs: TypeArgs; readonly patch: Partial<GameSettings>;
}[] = [
  { id: "grid-first-steps", label: "First steps", kid: "A small 4×4 board, slowed down so you can watch your score",
    objectType: "Grid", typeArgs: { size: 4, symbols: "base10", colours: "rgb" }, patch: { interactionRateHz: 25 } },
  { id: "grid-classic", label: "Classic", kid: "5×5 with four colours: the standard game",
    objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" }, patch: {} },
  // grid-lab PR #14 §4.9's alternative economy: half the income, half the floor (see TYPE_DEFAULTS.Grid).
  { id: "grid-low-income", label: "Low income", kid: "Classic 5×5, but agents earn half as fast and acts cost a little less",
    objectType: "Grid", typeArgs: { size: 5, symbols: "base10", colours: "rgby" }, patch: { agentEnergyPerSecond: 16, perActFloorBits: 1 } },
  { id: "grid-big", label: "Big board", kid: "6×6 in hex digits and six colours",
    objectType: "Grid", typeArgs: { size: 6, symbols: "base16", colours: "rainbow6" }, patch: {} },
  { id: "grid-master", label: "Master", kid: "7×7 playing cards in rainbow colours",
    objectType: "Grid", typeArgs: { size: 7, symbols: "cards", colours: "rainbow6" }, patch: {} },
];

/** Settings for a preset: the instantiation's tuned defaults, then the preset's own patch. */
export function presetSettings(id: string, language: GameSettings["language"] = DEFAULT_SETTINGS.language): GameSettings {
  const preset = SETTINGS_PRESETS.find(p => p.id === id);
  if (!preset) throw new Error(`Unknown settings preset: ${id}`);
  return { ...defaultSettingsFor(preset.objectType, language, preset.typeArgs), ...preset.patch };
}

/** Default settings for one instantiation and language: tuned type defaults and the language's grammar. */
export function defaultSettingsFor(
  objectType: string, language: GameSettings["language"] = DEFAULT_SETTINGS.language, typeArgs?: TypeArgs,
): GameSettings {
  const args = typeArgs ?? objectTypeDef(objectType).defaults;
  return {
    ...DEFAULT_SETTINGS, ...typeDefaults(objectType, args), language, objectType, typeArgs: args,
    grammarId: `${language}-agent-v1` as GrammarId, complexityFunctionId: COMPLEXITY_FOR[language],
  };
}
