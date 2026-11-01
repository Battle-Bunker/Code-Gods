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

/**
 * The agent languages, ONE entry each. A game allows a non-empty set of them (`GameSettings.languages`), and each
 * agent is written in one: its grammar and summon-price function are that language's, read from this table (each
 * language has exactly one of each, as in lib/game-runtime GRAMMAR_IDS and COMPLEXITY_IDS), so settings never carry
 * them. Adding a language is an entry here plus its runtime (lib/game-runtime, wired in the engine's runtime/node.ts).
 * `emptyAgent` is the smallest valid agent (the engine's availability probe).
 */
export const LANGUAGE_SPECS = Object.freeze({
  python: Object.freeze({
    label: "Python", grammarId: "python-agent-v1", complexityFunctionId: "ast-bits-v1",
    grammarLabel: "def agent(obj) returns mutator calls",
    emptyAgent: "def agent(x):\n    return []",
  }),
  typescript: Object.freeze({
    label: "TypeScript", grammarId: "typescript-agent-v1", complexityFunctionId: "ts-ast-bits-v1-uniform",
    grammarLabel: "function agent(obj) returns mutator calls",
    emptyAgent: "function agent(x) { return []; }",
  }),
} as const);
export type Language = keyof typeof LANGUAGE_SPECS;
export const LANGUAGES: readonly Language[] = Object.freeze(Object.keys(LANGUAGE_SPECS) as Language[]);
export const isLanguage = (value: unknown): value is Language => typeof value === "string" && Object.hasOwn(LANGUAGE_SPECS, value);

/** Agent grammars: source defines `agent(obj)` returning mutator calls, against the room's prelude. */
export type GrammarId = (typeof LANGUAGE_SPECS)[Language]["grammarId"];
/** The grammar of an agent written in this language. */
export const grammarFor = (language: Language): GrammarId => LANGUAGE_SPECS[language].grammarId;
/** The summon-price function of an agent written in this language. */
export const complexityFor = (language: Language): string => LANGUAGE_SPECS[language].complexityFunctionId;

/** Resource limit: at most this many live agents per god. */
export const MAX_AGENTS_PER_GOD = 200;

export interface GameSettings {
  /**
   * The languages agents may be written in (non-empty, each once; the first is the default). Each agent's grammar and
   * summon price follow its own language (LANGUAGE_SPECS). Stored settings from before this field held one `language`:
   * read them through `allowedLanguages`, or convert them with `upgradeLegacyLanguage`.
   */
  languages: readonly Language[];
  /** Registered object type id ("Int", "string", "Grid", ...). */
  objectType: string;
  /** Arguments of the type constructor, validated by the type's `instantiate`. */
  typeArgs: TypeArgs;
  /** How utility functions are dealt to gods; see @workspace/game-utilities. */
  utilitySelectorId: string;
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
  /**
   * Defence goals (opt-in, as in grid-lab): when on, EVERY god is also dealt exactly one defence goal, drawn from the
   * instantiation's defence (penalty) families minus `excludedDefenceFamilies`; when off, no god gets one. Never a
   * per-god probability: a defence goal is a handicap, so everyone gets one or no one does.
   */
  defenceGoals: boolean;
  /** Reward family ids the dealer never deals in this game (e.g. rules too hard on a beginner board). */
  excludedFamilies: readonly string[];
  /** Defence family ids the dealer never deals (the complement of the allowed defence goals). */
  excludedDefenceFamilies: readonly string[];
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
  /**
   * World seconds between publications of the public scoreboard (docs/public-log-design.md §3): every god's total
   * payoff, as the leaderboard shows it, changes for everyone at once every this many seconds, never per commit. One of
   * SCORE_INTERVALS. A player's own score stays live.
   */
  scoreIntervalSeconds: number;
  /**
   * The standard deviation (bits) of the noise on every disclosed sum of the other gods' net bits while a game is live
   * (docs/public-log-design.md §5): one Gaussian draw per spawn or transformation, stored server-side, so the same event
   * always discloses the same value. Payoffs, care, salience and the live scoreboard follow the noisy sums. 0 is exact.
   * One of PEER_NOISE_OPTIONS. An ended game is exact.
   */
  peerNoiseBits: number;
}

/** The pre-authored choices of scoreIntervalSeconds (world seconds). */
export const SCORE_INTERVALS: readonly number[] = Object.freeze([5, 10, 20, 30, 60]);
export const DEFAULT_SCORE_INTERVAL_SECONDS = 10;
/** The pre-authored choices of peerNoiseBits (σ in bits) and the default, chosen from the inference experiment. */
export const PEER_NOISE_OPTIONS: readonly number[] = Object.freeze([0, 2, 4, 8, 16]);
export const DEFAULT_PEER_NOISE_BITS = 8;

// These IDs describe the contract, not a claim that runners are installed.
export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  languages: Object.freeze(["python"]) as readonly Language[],
  objectType: "Int",
  typeArgs: Object.freeze({ min: -2147483648, max: 2147483647 }),
  utilitySelectorId: "fair-aligned",
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
  defenceGoals: false,
  excludedFamilies: Object.freeze([]) as readonly string[],
  excludedDefenceFamilies: Object.freeze([]) as readonly string[],
  priorId: "uniform",
  commitClause: false,
  objectSelection: "uniform",
  scoreIntervalSeconds: DEFAULT_SCORE_INTERVAL_SECONDS,
  peerNoiseBits: DEFAULT_PEER_NOISE_BITS,
} satisfies GameSettings);

/**
 * The languages a game allows (the first is the game's default). Settings stored before `languages` existed held a single `language` (with its grammar
 * and price ids): that one language is the set. Use this wherever stored settings are read, so a document the
 * migration has not reached yet still plays.
 */
export function allowedLanguages(settings: Pick<GameSettings, "languages"> | { language?: unknown; languages?: unknown } | null | undefined): readonly Language[] {
  if (!settings) return [];
  const s = settings as { language?: unknown; languages?: unknown };
  if (Array.isArray(s.languages) && s.languages.length && s.languages.every(isLanguage)) return s.languages as Language[];
  return isLanguage(s.language) ? [s.language] : [];
}

/**
 * Stored settings in today's shape, or null when they already are (idempotent): the single-language shape converted
 * (see upgradeLegacyLanguage), and fields added since filled with their defaults (scoreIntervalSeconds, peerNoiseBits:
 * 2026-11).
 * Use it wherever stored settings (rooms, setups, games) are read.
 */
export function upgradeStoredSettings(settings: unknown): Record<string, unknown> | null {
  const languages = upgradeLegacyLanguage(settings);
  const s = (languages ?? settings) as Record<string, unknown> | null;
  if (!s || typeof s !== "object" || Array.isArray(s)) return languages;
  const filled: Record<string, unknown> = {
    ...(!("scoreIntervalSeconds" in s) ? { scoreIntervalSeconds: DEFAULT_SCORE_INTERVAL_SECONDS } : {}),
    ...(!("peerNoiseBits" in s) ? { peerNoiseBits: DEFAULT_PEER_NOISE_BITS } : {}),
  };
  return Object.keys(filled).length ? { ...s, ...filled } : languages;
}

/**
 * Stored settings in the single-language shape ({language, grammarId, complexityFunctionId}) as allowed languages
 * ({languages: [language]}), dropping the derived ids. Only a `language` marks the old shape: a grammar or price id
 * without one is left for validation to refuse as an unknown setting. Returns null when there is nothing to convert, so
 * the migration (engine convex/lib/migrateSetups.ts) is idempotent.
 */
export function upgradeLegacyLanguage(settings: unknown): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const s = settings as Record<string, unknown>;
  if (!("language" in s)) return null;
  const { language, grammarId: _g, complexityFunctionId: _c, ...rest } = s;
  return "languages" in s || language === undefined ? rest : { ...rest, languages: [language] };
}

export interface SettingsOption {
  readonly id: string;
  readonly label: string;
  readonly objectTypes: readonly string[];
}

const ALL_TYPES = ["Int", "string", "Grid"] as const;

/** Pre-authored dropdown choices; unknown identifiers are always rejected. Languages are LANGUAGE_SPECS. */
export const SETTINGS_OPTIONS: Readonly<Record<"utilitySelectorId" | "spawnFunctionId", readonly SettingsOption[]>> = Object.freeze({
  utilitySelectorId: [
    { id: "fair-aligned", label: "Aligned Lottery (tables of rules that tend to want the same objects)", objectTypes: ALL_TYPES },
    { id: "divine-lottery", label: "Divine Lottery (each god draws a random utility function)", objectTypes: ALL_TYPES },
  ],
  spawnFunctionId: [
    { id: "uniform", label: "Uniformly at random (the type's spawn prior)", objectTypes: ALL_TYPES },
  ],
});

export type OptionKey = keyof typeof SETTINGS_OPTIONS;
/** The fields whose choices are pre-authored (SETTINGS_OPTIONS). */
export const OPTION_KEYS: readonly OptionKey[] = ["utilitySelectorId", "spawnFunctionId"];

/** The options of one dropdown compatible with an object type. */
export function settingsOptionsFor(key: OptionKey, objectType: string): SettingsOption[] {
  return SETTINGS_OPTIONS[key].filter(o => o.objectTypes.includes(objectType));
}

/** Whether `value` is a valid set of allowed languages: non-empty, supported, each once. */
export function validLanguages(value: unknown): value is readonly Language[] {
  return Array.isArray(value) && value.length > 0 && value.every(isLanguage) && new Set(value).size === value.length;
}

function finiteNonnegative(settings: GameSettings, keys: readonly (keyof GameSettings)[]): void {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${key} must be finite and nonnegative`);
    }
  }
}

/** Which families exist where, as far as validation needs it (settings-model.ts SettingsDomain provides it). */
export interface FamilyDomain {
  families(objectType: string, typeArgs: TypeArgs, role: FamilyRole): readonly string[];
}
/** A utility family's role: a reward rule every god is dealt, or a defence goal (game-utilities "penalty"). */
export type FamilyRole = "reward" | "defence";

const FAMILY_IDS = /^[a-z0-9_+-]{1,64}$/;
const familyList = (value: unknown) => Array.isArray(value) && value.length <= 200 && value.every(id => typeof id === "string" && FAMILY_IDS.test(id));

/**
 * Validate mathematical settings and pre-authored options. Type arguments are validated by the
 * object type's own `instantiate` (it throws on bad arguments). With `domain` (which families exist), defence goals
 * switched on also need at least one defence family left to deal.
 */
export function validateSettings(settings: GameSettings, domain?: FamilyDomain): void {
  if (!validLanguages(settings.languages)) throw new Error("languages must list one or more supported languages, each once");
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
    "penaltyWeight", "perActFloorBits",
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
  if (typeof settings.defenceGoals !== "boolean") throw new Error("defenceGoals must be true or false");
  if (!familyList(settings.excludedFamilies)) throw new Error("excludedFamilies must be a list of family ids");
  if (!familyList(settings.excludedDefenceFamilies)) throw new Error("excludedDefenceFamilies must be a list of family ids");
  if (typeof settings.priorId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(settings.priorId)) {
    throw new Error("priorId must be a prior identifier");
  }
  if (typeof settings.commitClause !== "boolean") throw new Error("commitClause must be true or false");
  if (settings.objectSelection !== "uniform" && settings.objectSelection !== "shelter") {
    throw new Error("objectSelection must be uniform or shelter");
  }
  if (!SCORE_INTERVALS.includes(settings.scoreIntervalSeconds)) {
    throw new Error(`scoreIntervalSeconds must be one of ${SCORE_INTERVALS.join(", ")} seconds`);
  }
  if (!PEER_NOISE_OPTIONS.includes(settings.peerNoiseBits)) {
    throw new Error(`peerNoiseBits must be one of ${PEER_NOISE_OPTIONS.join(", ")} bits`);
  }
  for (const key of OPTION_KEYS) {
    if (!settingsOptionsFor(key, settings.objectType).some(o => o.id === settings[key])) {
      throw new Error(`Unsupported ${key} for this object type`);
    }
  }
  if (settings.defenceGoals && domain) {
    const excluded = new Set(settings.excludedDefenceFamilies);
    if (!domain.families(settings.objectType, settings.typeArgs, "defence").some(id => !excluded.has(id))) {
      throw new Error("Defence goals need at least one defence goal allowed in this world");
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
    // alternative is the "grid-low-income" seed setup (16 bits/s, floor 1).
    all: { spawnRateHz: 0.5, startingObjectCount: 80, agentEnergyPerSecond: 32, excludedFamilies: WEAK_GRID_FAMILIES },
    byKey: {
      "Grid(4,base10,rgb)": { excludedFamilies: [...WEAK_GRID_FAMILIES, "fair_weaver"] },
      // Ladder of numbers needs numerals (Numeral), so it cannot be dealt on playing cards: excluding it there means nothing.
      "Grid(7,cards,rainbow6)": { excludedFamilies: WEAK_GRID_FAMILIES.filter(id => id !== "ladder_of_numbers") },
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
 * Default settings for one instantiation and set of allowed languages: tuned type defaults. Used to build the seed
 * setups below (and fixtures); a settings CHANGE never consults tuned defaults (settings-model.ts).
 */
export function defaultSettingsFor(
  objectType: string, languages: readonly Language[] = DEFAULT_SETTINGS.languages, typeArgs?: TypeArgs,
): GameSettings {
  const args = typeArgs ?? objectTypeDef(objectType).defaults;
  return { ...DEFAULT_SETTINGS, ...typeDefaults(objectType, args), languages: [...languages], objectType, typeArgs: args };
}

/**
 * The seed catalogue of game setups, in the suggested learning order. Each is a complete settings object: the
 * instantiation's tuned defaults (TYPE_DEFAULTS), then the setup's own patch. The engine keeps its `gameSetups` table
 * (artifacts/engine/convex/setups.ts) equal to this list: seed setups are owned by the system, so nobody (admins
 * included) edits or deletes them; players duplicate one instead. "First
 * steps" slows interactions so kids can follow their own scores (explore/gridtypes.md: at 100 Hz an own score changes
 * 10–17 times a minute).
 */
export interface SeedSetup {
  /** Stable id of the seeded row (the former preset id), so a re-seed never duplicates or recreates it. */
  readonly seedId: string;
  /** At most SETUP_NAME_MAX characters. */
  readonly name: string;
  /** One plain sentence for the setup menu. */
  readonly summary: string;
  readonly settings: Readonly<GameSettings>;
}
/** The longest setup name. */
export const SETUP_NAME_MAX = 40;
/** The setup a new room starts on (docs/ui-redesign.md §1): a small, slowed-down board a newcomer can follow. */
export const FIRST_STEPS_SEED_ID = "grid-first-steps";

const seed = (seedId: string, name: string, summary: string, objectType: string, typeArgs: TypeArgs, patch: Partial<GameSettings>): SeedSetup =>
  Object.freeze({ seedId, name, summary, settings: Object.freeze({ ...defaultSettingsFor(objectType, ["python"], typeArgs), ...patch }) });

export const SEED_SETUPS: readonly SeedSetup[] = Object.freeze([
  seed(FIRST_STEPS_SEED_ID, "First steps", "A small 4×4 board, slowed down so you can watch your score",
    "Grid", { size: 4, symbols: "base10", colours: "rgb" }, { interactionRateHz: 25 }),
  seed("grid-classic", "Classic", "5×5 with four colours: the standard game",
    "Grid", { size: 5, symbols: "base10", colours: "rgby" }, {}),
  // grid-lab PR #14 §4.9's alternative economy: half the income, half the floor (see TYPE_DEFAULTS.Grid).
  seed("grid-low-income", "Low income", "Classic 5×5, but agents earn half as fast and acts cost a little less",
    "Grid", { size: 5, symbols: "base10", colours: "rgby" }, { agentEnergyPerSecond: 16, perActFloorBits: 1 }),
  seed("grid-big", "Big board", "6×6 in hex digits and six colours",
    "Grid", { size: 6, symbols: "base16", colours: "rainbow6" }, {}),
  seed("grid-master", "Master", "7×7 playing cards in rainbow colours",
    "Grid", { size: 7, symbols: "cards", colours: "rainbow6" }, {}),
]);

/** A seed setup's complete settings (a fresh copy). */
export function seedSetupSettings(seedId: string): GameSettings {
  const found = SEED_SETUPS.find(s => s.seedId === seedId);
  if (!found) throw new Error(`Unknown seed setup: ${seedId}`);
  return { ...found.settings, languages: [...found.settings.languages], typeArgs: { ...found.settings.typeArgs }, excludedFamilies: [...found.settings.excludedFamilies] };
}

// ------------------------------------------------------------------------------------------------
// field documentation (docs/research/ui-redesign/onboarding-and-config.md §4.3, §4.6)
// ------------------------------------------------------------------------------------------------

/** The configuration page's sections, in order (the Players & AI section documents room budgets, not settings). */
export type SettingsSection = "world" | "goals" | "agents" | "energy" | "population" | "time" | "players";

/**
 * How a field is edited: stepped choices (`segmented`), a list of options (`select`), several of a list of options, at
 * least one (`multiselect`), a number (`number`, stepped
 * choices plus an exact value), on or off (`switch`), a checklist of families (`checklist`), or one control per type
 * argument (`typeArgs`). Every field has one: nothing a game needs is a read-only fact.
 */
export type ControlKind = "segmented" | "select" | "multiselect" | "number" | "switch" | "checklist" | "typeArgs";

/**
 * One field's documentation, read by every surface: the configuration page, the read-only view, the assistant's
 * explanation and tool descriptions. `meaning` and `consequence` are each one neutral sentence with no reference to
 * layout or controls. `suggested` are the stepped choices (every default and seed setup value is among them); `tier`
 * says whether a newcomer is asked ("ask") or the field sits under "More" ("more"); `control` how it is edited.
 */
export interface FieldDoc {
  readonly question: string;
  readonly meaning: string;
  readonly consequence: string;
  readonly unit?: string;
  readonly section: SettingsSection;
  readonly tier: "ask" | "more";
  readonly control: ControlKind;
  readonly suggested?: readonly number[] | readonly string[];
  /** Hidden while every listed field has the listed value (it has no effect then). */
  readonly hiddenWhen?: Partial<Record<keyof GameSettings, unknown>>;
  /** Fields whose change moves this one (e.g. the grammar follows the language). */
  readonly dependsOn?: readonly (keyof GameSettings)[];
}

/** Every GameSettings field, documented once; a field without docs (or a stale key) fails the typecheck. */
export const SETTINGS_DOCS = {
  objectType: {
    question: "What are the objects in the world?", section: "world", tier: "ask", control: "segmented", suggested: ["Grid", "Int", "string"],
    meaning: "The kind of thing every player scores and every agent changes: a grid of coloured symbols, a whole number or a piece of text.",
    consequence: "Grids give the richest and most visual rules, while numbers and text give terser, more abstract games.",
  },
  typeArgs: {
    question: "What shape does each object have?", section: "world", tier: "ask", control: "typeArgs", dependsOn: ["objectType"],
    meaning: "The arguments of the object type, such as a board's size, symbols and colours, or a range of numbers.",
    consequence: "They decide which rules can be dealt and how hard each object is to read at a glance.",
  },
  languages: {
    question: "Which languages may agents be written in?", section: "world", tier: "ask", control: "multiselect", suggested: LANGUAGES,
    meaning: "The programming languages players may choose from for each agent, at least one; each agent's code shape and summon price follow its own language.",
    consequence: "Allowing more languages lets every player write in the one they know, while summon prices are counted differently in each.",
  },
  utilitySelectorId: {
    question: "How are secret goals dealt?", section: "goals", tier: "ask", control: "segmented", suggested: ["fair-aligned", "divine-lottery"],
    meaning: "How secret goals are dealt: the Aligned Lottery deals rules that tend to want the same objects, and the Divine Lottery draws each rule at random.",
    consequence: "The Divine Lottery produces more clashing goals, which makes negotiation harder and outcomes less fair.",
  },
  excludedFamilies: {
    question: "Which rules are never dealt?", section: "goals", tier: "more", control: "checklist", dependsOn: ["objectType", "typeArgs"],
    meaning: "Families of reward rules that are never dealt in this game.",
    consequence: "Excluding more families makes goals more predictable, and restoring the weak families lowers fairness.",
  },
  defenceGoals: {
    question: "Does every player also get something to defend?", section: "goals", tier: "ask", control: "switch",
    meaning: "When on, every player is also dealt one defence goal from the allowed families, which costs points when objects are unusually bad for it.",
    consequence: "Turning it on adds conflict for everyone alike, because objects can lose points as well as gain them.",
  },
  excludedDefenceFamilies: {
    question: "Which defence goals can be dealt?", section: "goals", tier: "ask", control: "checklist", dependsOn: ["objectType", "typeArgs"],
    hiddenWhen: { defenceGoals: false },
    meaning: "The families every player's defence goal is drawn from, the rest never being dealt.",
    consequence: "Allowing fewer families makes defence goals more predictable, and at least one must stay allowed.",
  },
  penaltyWeight: {
    question: "How much does a defence bit weigh against a reward bit?", section: "goals", tier: "more", control: "number", suggested: [0.5, 1, 2],
    hiddenWhen: { defenceGoals: false },
    meaning: "How much one defence-goal bit counts against one reward bit.",
    consequence: "Raising it makes defending matter more than building, and it has no effect when no defence goals are dealt.",
  },
  priorId: {
    question: "What is rarity measured against?", section: "goals", tier: "more", control: "select",
    meaning: "The reference distribution that rarity is measured against, such as uniformly random objects.",
    consequence: "Every score is calibrated against it, so only references with shipped calibration tables can be chosen.",
  },
  maxAgentsPerGod: {
    question: "How many agents may each player keep?", section: "agents", tier: "ask", control: "number", suggested: [5, 20, 50, 200],
    meaning: "The most agents each player may have in the world at once.",
    consequence: "Lowering it makes each agent count more and rewards careful code over swarms.",
  },
  commitClause: {
    question: "May agents make their moves conditional?", section: "agents", tier: "more", control: "switch",
    meaning: "Whether agents may wrap moves in only_if_better, so that the moves apply only if they raise their owner's payoff on that object.",
    consequence: "Offering it makes agents safer and accidents rarer, at about 3.6 extra summon bits for each agent that uses it.",
  },
  stepBudget: {
    question: "How much may an agent compute per act?", section: "agents", tier: "more", control: "number", unit: "steps", suggested: [100_000, 500_000, 2_000_000],
    meaning: "The fixed number of computation steps an agent may use per act, so the same agent and input always fit or never do.",
    consequence: "Lowering it allows only simple agents, and raising it allows cleverer agents at the cost of a slower world.",
  },
  interactionComputeMs: {
    question: "What is the CPU safety limit per act?", section: "agents", tier: "more", control: "number", unit: "ms",
    meaning: "A CPU-time safety limit per act behind the step budget, excluding compilation and startup.",
    consequence: "It rarely binds, so changing it seldom matters.",
  },
  startingEnergy: {
    question: "How much energy does each player start with?", section: "energy", tier: "ask", control: "number", unit: "bits", suggested: [50, 100, 200, 400],
    meaning: "The energy, in bits, each player holds for summoning agents when planning begins.",
    consequence: "Raising it allows bigger or more first agents and a faster start.",
  },
  energyPerSecond: {
    question: "How fast does a player's energy refill?", section: "energy", tier: "ask", control: "number", unit: "bits/s", suggested: [0.5, 1, 2, 4],
    meaning: "The bits each player's energy gains per real-time second, including planning and pauses.",
    consequence: "Raising it allows more summons and a busier world.",
  },
  agentEnergyPerSecond: {
    question: "How fast do agents charge?", section: "energy", tier: "ask", control: "number", unit: "bits/s", suggested: [2, 8, 16, 32, 64],
    meaning: "The bits each agent's own energy gains per second of world time, used to pay for its acts.",
    consequence: "Raising it makes agents act more often, so objects change faster.",
  },
  agentBatteryActs: {
    question: "How many acts can an agent save up?", section: "energy", tier: "more", control: "number", unit: "acts", suggested: [1, 2, 4, 8],
    meaning: "How many expected acts' worth of energy an agent can store before its income stops.",
    consequence: "Raising it lets agents act in bursts after quiet spells.",
  },
  perActFloorBits: {
    question: "What is the minimum price of an attempted act?", section: "energy", tier: "more", control: "number", unit: "bits", suggested: [0, 1, 2, 4],
    meaning: "The minimum bits charged for every attempted act, whether or not it succeeds.",
    consequence: "Raising it makes failed and wasteful moves costlier, which favours precise code.",
  },
  startingObjectCount: {
    question: "How many objects does the world start with?", section: "population", tier: "ask", control: "number", suggested: [10, 40, 80, 160],
    meaning: "How many objects the world holds when it starts running.",
    consequence: "Raising it spreads scores across more objects, and each object changes less often.",
  },
  spawnRateHz: {
    question: "How often does a new object appear?", section: "population", tier: "ask", control: "number", unit: "per s", suggested: [0, 0.1, 0.5, 1],
    meaning: "How many new random objects appear per second of world time.",
    consequence: "Raising it brings more fresh objects to claim, and totals grow faster.",
  },
  spawnFunctionId: {
    question: "How are new objects drawn?", section: "population", tier: "more", control: "select",
    meaning: "How each new object is drawn, such as uniformly at random from every possible object.",
    consequence: "It decides which objects are common in the world, and uniform drawing is the only way shipped today.",
  },
  objectSelection: {
    question: "Which object does an act target?", section: "population", tier: "more", control: "segmented", suggested: ["uniform", "shelter"],
    meaning: "How an act's target object is chosen: uniformly, or with shelter, where objects many players care about are hit a little less often.",
    consequence: "Shelter protects objects many players care about, so agreements last longer.",
  },
  planningSeconds: {
    question: "How long is planning before the world starts?", section: "time", tier: "ask", control: "number", unit: "s", suggested: [30, 60, 120, 300],
    meaning: "How long the world stays frozen at the start while players read their goals, summon agents and talk.",
    consequence: "Lengthening it helps beginners and delays the action.",
  },
  halfLifeSeconds: {
    question: "Roughly how long should games last?", section: "time", tier: "ask", control: "number", unit: "s", suggested: [120, 300, 600, 1200],
    meaning: "The world time within which half of games end, the end itself being a hidden random moment.",
    consequence: "Lengthening it gives more time to negotiate and makes games longer on average.",
  },
  interactionRateHz: {
    question: "How fast does the world move?", section: "time", tier: "ask", control: "number", unit: "acts/s", suggested: [25, 100, 300, 1000],
    meaning: "The maximum number of acts per second across all agents.",
    consequence: "Lowering it makes each score easier to follow, and raising it makes the world busier and harder to read.",
  },
  scoreIntervalSeconds: {
    question: "How often do the public scores update?", section: "time", tier: "more", control: "segmented", unit: "s", suggested: SCORE_INTERVALS,
    meaning: "Every player's public score on the leaderboard changes for everyone at once, every this many seconds of world time; your own score stays live.",
    consequence: "Lengthening it makes it harder to tell from the leaderboard whose move changed an object, while shortening it makes the race easier to follow.",
  },
  peerNoiseBits: {
    question: "How blurred are the other players' combined interest in each object?", section: "goals", tier: "more", control: "segmented", unit: "bits", suggested: PEER_NOISE_OPTIONS,
    meaning: "While the game runs, the other players' summed bits for each object are shown with random noise of this size, fixed per change; after the end the exact numbers show.",
    consequence: "More noise makes it harder to work out the other players' rules from the numbers alone, so negotiation clues matter more, but it also makes their interest in each object less certain.",
  },
  pauseSeconds: {
    question: "How long is each player's one pause?", section: "time", tier: "more", control: "number", unit: "s", suggested: [60, 180, 300],
    meaning: "How long the world stops when a player uses their one pause per game.",
    consequence: "Lengthening it gives more time to negotiate during a pause.",
  },
} as const satisfies Record<keyof GameSettings, FieldDoc>;

/** The room budgets the configuration page also asks about (room state, not GameSettings; set by approveAiBudget). */
export const ROOM_BUDGET_DOCS = {
  aiBudget: {
    question: "How many tokens may AI players use per game?", section: "players", tier: "ask", control: "number", unit: "tokens", suggested: [0, 100_000, 300_000, 1_000_000],
    meaning: "The total tokens all AI players together may use in one game, billed to the server owner.",
    consequence: "Too low a budget makes AI players stop acting mid-game, and dollar caps of $2 per game and $5 per day still apply.",
  },
  assistantBudget: {
    question: "How many assistant tokens does each human get per game?", section: "players", tier: "ask", control: "number", unit: "tokens", suggested: [0, 50_000, 200_000, 1_000_000],
    meaning: "The tokens each human's in-client assistant may use per game, billed to the server owner, where zero turns the assistant off.",
    consequence: "Raising it lets players rely on the assistant for more of the game.",
  },
  assistantModel: {
    question: "Which model powers the assistants?", section: "players", tier: "ask", control: "select",
    meaning: "The AI model that powers every player's assistant in the room.",
    consequence: "Larger models give better help at a higher cost per token.",
  },
} as const satisfies Record<"aiBudget" | "assistantBudget" | "assistantModel", FieldDoc>;
