"use node";
/**
 * Node-only game helpers: the season salt, CSPRNG, scoring with the shipped calibration tables, dealing,
 * kid cards, catalogs, settings validation and spawns. Everything that imports @workspace/game-utilities
 * (4.5 MB of calibration JSON) lives behind "use node"; queries and mutations never load it.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  DEFAULT_SETTINGS, SettingsChangeError, applySettingsChange, instantiationOf, netBits, softHinge, validateSettings,
  type GameSettings, type ObjectValue,
} from "@workspace/game-core";
import { objectType, type Rng } from "@workspace/game-types";
import {
  card, context, divineLottery, evaluator, familiesFor, hasTable, offeredInstantiations, penaltyMeanBits, publicCatalog, selector,
  shippedPriors, surprisal, tableFor, type GodScore, type PriorRef, type UtilityDescriptor,
} from "@workspace/game-utilities";
import { fail } from "../lib/errors";
import { SETTINGS_DOMAIN } from "./settingsDomain";

// ------------------------------------------------------------------------------------------------
// season salt
// ------------------------------------------------------------------------------------------------

let salt: string | undefined, commitment: string | undefined;
/**
 * The season salt behind every measurement and play seed. Read only here (Node actions). Production (no
 * DEV) refuses without SEASON_SALT; dev uses a random per-instance salt with a warning.
 */
export function seasonSalt(): string {
  if (salt !== undefined) return salt;
  const configured = process.env.SEASON_SALT;
  if (configured && configured.length >= 16) salt = configured;
  else if (process.env.DEV !== "1") fail("UNAVAILABLE", "SEASON_SALT must be set (at least 16 characters) in production");
  else {
    salt = randomBytes(32).toString("hex");
    console.warn("SEASON_SALT is not set: using a random per-instance season salt (development only)");
  }
  commitment = createHash("sha256").update(salt!, "utf8").digest("hex");
  return salt!;
}
/** sha256(salt), hex: public, recorded on every game. */
export function seasonCommitment(): string { seasonSalt(); return commitment!; }

// ------------------------------------------------------------------------------------------------
// randomness
// ------------------------------------------------------------------------------------------------

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
/** Uniform in [0, 1). */
export const uniform01 = () => cryptoRng.int(2 ** 48) / 2 ** 48;
/** Uniform in (0, 1). */
export const openUniform = () => (randomBytes(6).readUIntBE(0, 6) + 0.5) / 281474976710656;

// ------------------------------------------------------------------------------------------------
// scoring and dealing (calibration tables)
// ------------------------------------------------------------------------------------------------

/** The priors a room may measure rarity against: every one with shipped calibration tables (game-utilities). */
export const PRIORS: Readonly<Record<string, PriorRef>> = Object.freeze(Object.fromEntries(shippedPriors().map(p => [p.id, p])));
export function priorOf(priorId: string): PriorRef {
  return PRIORS[priorId] ?? fail("BAD_REQUEST", `Unknown prior ${priorId}: choose one of ${Object.keys(PRIORS).join(", ")}`);
}
/** Bits are compared and serialised: never let −0 through. */
const bits = (x: number) => (x === 0 ? 0 : x);
function table(draw: { familyId: string; params: UtilityDescriptor["params"] }, settings: GameSettings) {
  const found = tableFor(draw, instantiationOf(settings), priorOf(settings.priorId));
  if (!found) throw new Error(`No calibration table for ${draw.familyId} in ${instantiationOf(settings).key}`);
  return found;
}
/** One god's private score of one value: ordinal, surprisal bits and net bits. */
export function score(settings: GameSettings, descriptor: UtilityDescriptor, value: ObjectValue): GodScore {
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
}
export type Deal = { godId: string; utility: UtilityDescriptor };
/** Every roster god's score of a value, in the stored form. */
export function scoresOf(settings: GameSettings, deities: readonly Deal[], value: ObjectValue) {
  return deities.map(d => {
    const s = score(settings, d.utility, value);
    return {
      god: d.godId, ordinal: s.ordinal as number | number[], rewardBits: s.rewardBits, netBits: s.netBits,
      ...(s.penaltyOrdinal !== undefined ? { penaltyOrdinal: s.penaltyOrdinal as number | number[] } : {}),
      ...(s.penaltyBits !== undefined ? { penaltyBits: s.penaltyBits } : {}),
    };
  });
}
export function deal(settings: GameSettings, count: number): UtilityDescriptor[] {
  validateSettings(settings);
  const inst = instantiationOf(settings);
  return selector(settings.utilitySelectorId ?? divineLottery.id).select(inst, count, cryptoRng, {
    defenceGoals: settings.defenceGoals, hasTable: draw => hasTable(draw, inst, priorOf(settings.priorId)),
    exclude: settings.excludedFamilies, excludeDefence: settings.excludedDefenceFamilies, priorId: settings.priorId,
  });
}
/** A god's own kid card: plain-language incentives first, then source in the game's language, plus any defence goal. */
export function utilityCard(settings: GameSettings, utility: UtilityDescriptor) {
  const language = settings.language;
  const c = card(utility, context(instantiationOf(settings)));
  return {
    familyId: c.familyId, emoji: c.emoji, name: c.name, theme: c.theme, summary: c.summary, shape: c.shape,
    language, source: c.source[language],
    ...(c.penalty ? { penalty: {
      familyId: c.penalty.familyId, emoji: c.penalty.emoji, name: c.penalty.name, summary: c.penalty.summary,
      comparative: c.penalty.comparative, shape: c.penalty.shape, source: c.penalty.source[language],
    } } : {}),
  };
}
/** The public catalog of families any god might draw, with availability, badges and locked reasons. */
export function catalogFor(settings: GameSettings) {
  return publicCatalog(instantiationOf(settings)).map(f => ({
    ...f, excluded: (f.role === "penalty" ? !settings.defenceGoals || settings.excludedDefenceFamilies.includes(f.id) : settings.excludedFamilies.includes(f.id)),
  }));
}

// ------------------------------------------------------------------------------------------------
// settings
// ------------------------------------------------------------------------------------------------

const isOffered = (settings: GameSettings) => {
  const inst = instantiationOf(settings);
  const excludedFamilies = [...settings.excludedFamilies, ...settings.excludedDefenceFamilies];
  return offeredInstantiations(settings.objectType, { excludedFamilies, prior: priorOf(settings.priorId) })
    .some(offered => offered.key === inst.key);
};
/** Settings name an instantiation the engine offers (every dealable family calibrated) and known families. */
export function assertOffered(settings: GameSettings) {
  priorOf(settings.priorId);
  if (!isOffered(settings)) fail("BAD_REQUEST", `${instantiationOf(settings).key} is not offered: choose one of the listed ${settings.objectType} settings`);
  for (const [ids, role, words] of [[settings.excludedFamilies, "reward", "reward"], [settings.excludedDefenceFamilies, "penalty", "defence"]] as const) {
    const known = new Set(familiesFor(settings.objectType, role).map(f => f.id));
    const unknown = ids.filter(id => !known.has(id));
    if (unknown.length) fail("BAD_REQUEST", `Unknown ${settings.objectType} ${words} families: ${unknown.join(", ")}`);
  }
}
/** Settings a game can be played with: valid, offered, and within the server's resource limits. Throws BAD_REQUEST. */
export function assertPlayable(settings: GameSettings): void {
  try { validateSettings(settings, SETTINGS_DOMAIN); } catch (error) { fail("BAD_REQUEST", (error as Error).message); }
  assertOffered(settings);
  if (settings.startingObjectCount > 1000 || settings.interactionRateHz > 1000 || settings.spawnRateHz > 10 ||
      settings.planningSeconds > 3600 || settings.pauseSeconds > 3600) fail("BAD_REQUEST", "Settings exceed server resource limits");
}

/** A complete settings object (a game setup): exactly the GameSettings fields, playable. */
export function assertCompleteSettings(settings: unknown): GameSettings {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return fail("BAD_REQUEST", "settings must be a settings object");
  const keys = Object.keys(settings), fields = Object.keys(DEFAULT_SETTINGS);
  const unknown = keys.filter(k => !fields.includes(k)), missing = fields.filter(k => !keys.includes(k));
  if (unknown.length) fail("BAD_REQUEST", `Unknown settings: ${unknown.join(", ")}`);
  if (missing.length) fail("BAD_REQUEST", `A setup has every setting; missing: ${missing.join(", ")}`);
  assertPlayable(settings as GameSettings);
  return settings as GameSettings;
}

/**
 * The next game's settings from an owner request: a setup's complete settings, or a change to the room's settings
 * applied through the settings model (only the game's own dependencies move; nothing is retuned).
 */
export function nextSettings(previous: GameSettings, input: { settings?: Record<string, unknown>; setup?: GameSettings }): GameSettings {
  let settings: GameSettings;
  if (input.setup) return assertCompleteSettings(input.setup);   // stored setups are re-checked whole: a field added since fails loudly
  else if (input.settings) {
    try { settings = applySettingsChange(previous, input.settings as Partial<GameSettings>, SETTINGS_DOMAIN); } catch (error) {
      return fail("BAD_REQUEST", error instanceof SettingsChangeError ? error.message : `Invalid settings: ${(error as Error).message}`);
    }
  } else return fail("BAD_REQUEST", "Settings or a setup are required");
  assertPlayable(settings);
  return settings;
}

// ------------------------------------------------------------------------------------------------
// spawns
// ------------------------------------------------------------------------------------------------

export function spawnValue(settings: GameSettings): ObjectValue {
  const inst = instantiationOf(settings), T = objectType(inst.objectType);
  return T.codec(inst).encode(T.spawn(inst, cryptoRng));
}
/** A fresh value not in `occupied` (every object is unique; spawns redraw), or undefined in a nearly full tiny domain. */
export function uniqueSpawn(settings: GameSettings, occupied: ReadonlySet<ObjectValue>): ObjectValue | undefined {
  for (let attempt = 0; attempt <= 100; attempt++) {
    const value = spawnValue(settings);
    if (!occupied.has(value)) return value;
  }
  return undefined;
}
