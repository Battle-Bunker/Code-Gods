/**
 * The settings model: the degrees of freedom of GameSettings and exactly the dependencies the game defines between
 * them, nothing else. Every surface that changes settings goes through `applySettingsChange` (the configuration
 * page for each control, the engine for every `owner.settings` request), so a change means the same thing everywhere.
 *
 * Dependencies (the only fields a change moves besides the changed field itself):
 * - language: the grammar and the summon-price function become the language's choices (each language has one);
 * - objectType: the type's default instantiation (else the first offered one), and excluded families that do not
 *   exist in it are dropped;
 * - typeArgs: only an offered instantiation is accepted, and excluded families that do not exist in it are dropped.
 * Constraints checked on the changed field: the grammar, goal dealing and summon price are among the choices of the
 * current language and object type (settingsOptionsFor); excluded families exist in the instantiation.
 * Everything else (every number, the commit clause, act targeting) is free: `validateSettings` (the single
 * validator) says whether a value is within bounds. No field is retuned to "suit" another, and nothing is repaired.
 *
 * Which instantiations are offered and which families exist depend on the shipped calibration tables and the
 * utility-family catalogue, which game-core does not import: the caller passes them in as a `SettingsDomain`
 * (the engine from @workspace/game-utilities, the configuration page from the manifest and its catalogue).
 */
import { instantiate, objectType as objectTypeDef } from "@workspace/game-types";
import type { TypeArgs } from "@workspace/game-types";
import { DEFAULT_SETTINGS, LANGUAGES, settingsOptionsFor, type GameSettings, type OptionKey } from "./settings.ts";

export interface SettingsDomain {
  /** The type arguments of every instantiation the server offers for an object type (the manifest's `objectTypes[].offered`). */
  offered(objectType: string): readonly TypeArgs[];
  /** The ids of the utility families that exist (can be dealt) in an instantiation, reward and defence families alike. */
  families(objectType: string, typeArgs: TypeArgs): readonly string[];
}

/** A change outside the degrees of freedom; `field` names the setting it concerns. */
export class SettingsChangeError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "SettingsChangeError";
    this.field = field;
  }
}

const FIELDS = new Set(Object.keys(DEFAULT_SETTINGS));
const OPTION_KEYS: readonly OptionKey[] = ["grammarId", "utilitySelectorId", "complexityFunctionId"];

/** JSON with sorted object keys, so equal settings compare equal whatever their key order. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
/** Whether two settings (or two values of one field) are the same, whatever their key order. */
export const sameSettings = (a: unknown, b: unknown): boolean => stableJson(a) === stableJson(b);

function keyOf(objectType: string, typeArgs: TypeArgs): string {
  try { return instantiate(objectType, typeArgs).key; } catch (error) { throw new SettingsChangeError("typeArgs", `typeArgs: ${(error as Error).message}`); }
}

/** The offered arguments equal to `typeArgs` (as the domain spells them), or a SettingsChangeError. */
function offeredArgs(objectType: string, typeArgs: TypeArgs, domain: SettingsDomain): TypeArgs {
  const key = keyOf(objectType, typeArgs);
  const found = domain.offered(objectType).find(args => keyOf(objectType, args) === key);
  if (!found) throw new SettingsChangeError("typeArgs", `${key} is not offered: choose one of the listed ${objectType} instantiations`);
  return found;
}

/** Excluded families that still exist after an instantiation change. */
const keepExisting = (s: GameSettings, domain: SettingsDomain): GameSettings => {
  const exists = new Set(domain.families(s.objectType, s.typeArgs));
  return { ...s, excludedFamilies: s.excludedFamilies.filter(id => exists.has(id)) };
};

/** An option field whose current value is no longer a choice, and which has exactly one choice now, takes it. */
function determinedOptions(s: GameSettings): GameSettings {
  const out = { ...s } as Record<string, unknown>;
  for (const key of OPTION_KEYS) {
    const choices = settingsOptionsFor(key, s.language, s.objectType);
    if (!choices.some(o => o.id === s[key]) && choices.length === 1) out[key] = choices[0]!.id;
  }
  return out as unknown as GameSettings;
}

function withObjectType(s: GameSettings, objectType: unknown, domain: SettingsDomain): GameSettings {
  if (typeof objectType !== "string") throw new SettingsChangeError("objectType", "objectType must be an object type id");
  let defaults: TypeArgs;
  try { defaults = objectTypeDef(objectType).defaults; } catch (error) { throw new SettingsChangeError("objectType", (error as Error).message); }
  const offered = domain.offered(objectType);
  const defaultKey = keyOf(objectType, defaults);
  const typeArgs = offered.find(args => keyOf(objectType, args) === defaultKey) ?? offered[0];
  if (!typeArgs) throw new SettingsChangeError("objectType", `No ${objectType} instantiation is offered`);
  return determinedOptions(keepExisting({ ...s, objectType, typeArgs }, domain));
}

function withLanguage(s: GameSettings, language: unknown): GameSettings {
  if (!LANGUAGES.includes(language as GameSettings["language"])) throw new SettingsChangeError("language", `Unsupported language: ${String(language)}`);
  return determinedOptions({ ...s, language: language as GameSettings["language"] });
}

/**
 * The settings after an owner changes the fields in `patch`. Fields equal to their current value are no change, so a
 * whole settings object may be passed (the configuration page's draft). Changes apply in dependency order: object
 * type, then type arguments, then language, then every other field. Throws SettingsChangeError for an unknown field,
 * an instantiation that is not offered, an option the language and type do not offer, or an excluded family that
 * does not exist in the instantiation. Numbers are not range-checked here: `validateSettings` does that.
 */
export function applySettingsChange(settings: GameSettings, patch: Partial<GameSettings>, domain: SettingsDomain): GameSettings {
  for (const key of Object.keys(patch)) if (!FIELDS.has(key)) throw new SettingsChangeError(key, `Unknown setting ${key}`);
  const given = patch as Record<string, unknown>;
  let next: GameSettings = { ...settings };
  const changed = (key: keyof GameSettings) => given[key] !== undefined && !sameSettings(given[key], next[key]);

  if (changed("objectType")) next = withObjectType(next, given.objectType, domain);
  if (changed("typeArgs")) {
    const args = given.typeArgs;
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new SettingsChangeError("typeArgs", "typeArgs must be an object of type arguments");
    next = keepExisting({ ...next, typeArgs: offeredArgs(next.objectType, args as TypeArgs, domain) }, domain);
  }
  if (changed("language")) next = withLanguage(next, given.language);
  for (const key of OPTION_KEYS) {
    if (!changed(key)) continue;
    if (!settingsOptionsFor(key, next.language, next.objectType).some(o => o.id === given[key])) {
      throw new SettingsChangeError(key, `Unsupported ${key} for ${next.language} and ${next.objectType}: ${String(given[key])}`);
    }
    next = { ...next, [key]: given[key] };
  }
  if (changed("excludedFamilies")) {
    const ids = given.excludedFamilies;
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) throw new SettingsChangeError("excludedFamilies", "excludedFamilies must be a list of family ids");
    const exists = new Set(domain.families(next.objectType, next.typeArgs));
    const unknown = ids.filter(id => !exists.has(id));
    if (unknown.length) throw new SettingsChangeError("excludedFamilies", `Not a family of ${keyOf(next.objectType, next.typeArgs)}: ${unknown.join(", ")}`);
    next = { ...next, excludedFamilies: [...new Set(ids as string[])] };
  }
  const handled = new Set<string>(["objectType", "typeArgs", "language", "excludedFamilies", ...OPTION_KEYS]);
  for (const key of Object.keys(given) as (keyof GameSettings)[]) {
    if (!handled.has(key) && changed(key)) next = { ...next, [key]: given[key] };
  }
  return next;
}
