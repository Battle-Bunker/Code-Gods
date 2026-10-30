"use node";
/**
 * Node-only game helpers: the season salt, CSPRNG, scoring with the shipped calibration tables, dealing,
 * kid cards, catalogs, settings validation and spawns. Everything that imports @workspace/game-utilities
 * (4.5 MB of calibration JSON) lives behind "use node"; queries and mutations never load it.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  DEFAULT_SETTINGS, instantiationOf, netBits, presetSettings, softHinge, typeDefaults, validateSettings, type GameSettings, type ObjectValue,
  defaultSettingsFor,
} from "@workspace/game-core";
import { objectType, type Rng } from "@workspace/game-types";
import {
  card, context, divineLottery, evaluator, familiesFor, hasTable, offeredInstantiations, penaltyMeanBits, publicCatalog, selector,
  surprisal, tableFor, UNIFORM_PRIOR, type GodScore, type PriorRef, type UtilityDescriptor,
} from "@workspace/game-utilities";
import { fail } from "../lib/errors";

// ------------------------------------------------------------------------------------------------
// season salt
// ------------------------------------------------------------------------------------------------

let salt: string | undefined, commitment: string | undefined;
/**
 * The season salt behind every measurement and play seed. Read only here (Node actions). Production (no
 * CODE_GODS_DEV) refuses without CODE_GODS_SEASON_SALT; dev uses a random per-instance salt with a warning.
 */
export function seasonSalt(): string {
  if (salt !== undefined) return salt;
  const configured = process.env.CODE_GODS_SEASON_SALT;
  if (configured && configured.length >= 16) salt = configured;
  else if (!process.env.CODE_GODS_DEV) fail("UNAVAILABLE", "CODE_GODS_SEASON_SALT must be set (at least 16 characters) in production");
  else {
    salt = randomBytes(32).toString("hex");
    console.warn("CODE_GODS_SEASON_SALT is not set: using a random per-instance season salt (development only)");
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

export const PRIORS: Readonly<Record<string, PriorRef>> = Object.freeze({ [UNIFORM_PRIOR.id]: UNIFORM_PRIOR });
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
    defenceRate: settings.defenceRate, hasTable: draw => hasTable(draw, inst, priorOf(settings.priorId)),
    exclude: settings.excludedFamilies, priorId: settings.priorId,
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
  return publicCatalog(instantiationOf(settings)).map(f => ({ ...f, excluded: settings.excludedFamilies.includes(f.id) }));
}

// ------------------------------------------------------------------------------------------------
// settings
// ------------------------------------------------------------------------------------------------

const isOffered = (settings: GameSettings) => {
  const inst = instantiationOf(settings);
  return offeredInstantiations(settings.objectType, { excludedFamilies: settings.excludedFamilies, prior: priorOf(settings.priorId) })
    .some(offered => offered.key === inst.key);
};
/** Settings name an instantiation the engine offers (every dealable family calibrated) and known families. */
export function assertOffered(settings: GameSettings) {
  priorOf(settings.priorId);
  if (!isOffered(settings)) fail("BAD_REQUEST", `${instantiationOf(settings).key} is not offered: choose one of the listed ${settings.objectType} settings`);
  const known = new Set(familiesFor(settings.objectType).map(f => f.id));
  const unknown = settings.excludedFamilies.filter(id => !known.has(id));
  if (unknown.length) fail("BAD_REQUEST", `Unknown ${settings.objectType} utility families: ${unknown.join(", ")}`);
}
/**
 * When the owner switches instantiation, tuned fields the request left untouched and that were still at the
 * old instantiation's default follow to the new instantiation's defaults; customised values are kept.
 */
export function retuneSettings(previous: GameSettings, next: GameSettings, sent: Record<string, unknown>): GameSettings {
  if (instantiationOf(previous).key === instantiationOf(next).key) return next;
  const oldDefaults = typeDefaults(previous.objectType, previous.typeArgs);
  const newDefaults = typeDefaults(next.objectType, next.typeArgs);
  const tuned = new Set([...Object.keys(oldDefaults), ...Object.keys(newDefaults)]) as Set<keyof GameSettings>;
  const out = { ...next } as Record<string, unknown>;
  for (const key of tuned) {
    const untouched = !(key in sent) || JSON.stringify(sent[key]) === JSON.stringify(previous[key]);
    const wasDefault = JSON.stringify(previous[key]) === JSON.stringify(oldDefaults[key] ?? DEFAULT_SETTINGS[key]);
    if (untouched && wasDefault) out[key] = newDefaults[key] ?? DEFAULT_SETTINGS[key];
  }
  return out as unknown as GameSettings;
}
/**
 * Fields implied by a partial request: a new object type without typeArgs takes that type's default
 * arguments (the old type's arguments mean nothing to it), and a new language its grammar and complexity
 * function. Explicitly sent fields still win.
 */
function derived(previous: GameSettings, sent: Record<string, unknown>): Partial<GameSettings> {
  const objectType = typeof sent.objectType === "string" ? sent.objectType : previous.objectType;
  const language = (sent.language as GameSettings["language"] | undefined) ?? previous.language;
  const fresh = defaultSettingsFor(objectType, language);
  return {
    ...(objectType !== previous.objectType ? { typeArgs: fresh.typeArgs } : {}),
    ...(language !== previous.language ? { grammarId: fresh.grammarId, complexityFunctionId: fresh.complexityFunctionId } : {}),
  };
}
/** The next game's settings from an owner request: a preset (keeping the room's language) or explicit settings. */
export function nextSettings(previous: GameSettings, input: { settings?: Record<string, unknown>; preset?: string }): GameSettings {
  let settings: GameSettings;
  try {
    if (input.preset) settings = presetSettings(input.preset, (input.settings?.language as GameSettings["language"]) ?? previous.language);
    else if (input.settings) settings = retuneSettings(previous, { ...previous, ...derived(previous, input.settings), ...input.settings } as GameSettings, input.settings);
    else return fail("BAD_REQUEST", "Settings or a preset are required");
    validateSettings(settings);
  } catch (error) {
    return fail("BAD_REQUEST", (error as Error).message);
  }
  assertOffered(settings);
  if (settings.startingObjectCount > 1000 || settings.interactionRateHz > 1000 || settings.spawnRateHz > 10 ||
      settings.planningSeconds > 3600 || settings.pauseSeconds > 3600) fail("BAD_REQUEST", "Settings exceed server resource limits");
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
