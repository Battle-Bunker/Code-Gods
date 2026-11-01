/**
 * The settings model: the degrees of freedom of GameSettings and exactly the dependencies the game defines between
 * them, nothing else. Every surface that changes settings goes through `applySettingsChange` (the configuration
 * page for each control, the engine for every `owner.settings` request), so a change means the same thing everywhere.
 *
 * Dependencies (the only fields a change moves besides the changed field itself):
 * - language: the grammar and the summon-price function become the language's choices (each language has one);
 * - language: also any other option (goal dealing, spawn function) the new language does not offer takes the first
 *   one it does;
 * - objectType: the type's default instantiation (else the first playable one), and excluded families (reward and
 *   defence alike) that do not exist in it are dropped;
 * - typeArgs: only a playable instantiation is accepted, and excluded families that do not exist in it are dropped.
 * Constraints checked on the changed field: the grammar, goal dealing, summon price and spawn function are among the
 * choices of the current language and object type (settingsOptionsFor); excluded reward families are reward families
 * of the object type and excluded defence families its defence families, and each list keeps only those that exist in
 * the instantiation (excluding one its board cannot deal means nothing).
 * Everything else (every number, the defence switch, the prior, the commit clause, act targeting) is free:
 * `validateSettings` (the single validator) says whether a value is within bounds. No field is retuned to "suit"
 * another, and nothing is repaired.
 *
 * Which instantiations are playable (every one the type can instantiate, minus retired shapes: calibration tables are
 * prepared on demand, never a condition) and which families exist come from the utility-family catalogue, which
 * game-core does not import: the caller passes them in as a `SettingsDomain` (the engine from
 * @workspace/game-utilities, the configuration page from the manifest and its catalogue).
 */
import { instantiate, objectType as objectTypeDef } from "@workspace/game-types";
import type { TypeArgs } from "@workspace/game-types";
import { DEFAULT_SETTINGS, LANGUAGES, OPTION_KEYS, settingsOptionsFor, type FamilyDomain, type FamilyRole, type GameSettings } from "./settings.ts";

export interface SettingsDomain extends FamilyDomain {
  /**
   * The type arguments of the instantiations listed for an object type (game-utilities `playableInstantiations`, the
   * manifest's `objectTypes[].playable`), the type's default first: what a change of object type picks from.
   */
  playable(objectType: string): readonly TypeArgs[];
  /**
   * Whether other valid arguments (not listed) may be played too (game-utilities `isPlayableInstantiation`). Absent:
   * only the listed ones.
   */
  isPlayable?(objectType: string, typeArgs: TypeArgs): boolean;
  /** The ids of the utility families of one role that exist (can be dealt) in an instantiation. */
  families(objectType: string, typeArgs: TypeArgs, role: FamilyRole): readonly string[];
  /** The ids of every utility family of one role of an object type, whichever instantiation can deal it. */
  typeFamilies(objectType: string, role: FamilyRole): readonly string[];
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
/** Each excluded-family list and the role of the families it holds. */
const EXCLUDED = [["excludedFamilies", "reward"], ["excludedDefenceFamilies", "defence"]] as const;

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

/** The playable arguments equal to `typeArgs` (as the domain spells them, or as the type resolves them), or a SettingsChangeError. */
function playableArgs(objectType: string, typeArgs: TypeArgs, domain: SettingsDomain): TypeArgs {
  const key = keyOf(objectType, typeArgs);
  const found = domain.playable(objectType).find(args => keyOf(objectType, args) === key);
  if (found) return found;
  if (domain.isPlayable?.(objectType, typeArgs)) return instantiate(objectType, typeArgs).args;
  throw new SettingsChangeError("typeArgs", `${key} is not playable: choose one of the listed ${objectType} instantiations`);
}

/** Excluded families (of both roles) that still exist after an instantiation change. */
const keepExisting = (s: GameSettings, domain: SettingsDomain): GameSettings => {
  const out = { ...s };
  for (const [field, role] of EXCLUDED) {
    const exists = new Set(domain.families(s.objectType, s.typeArgs, role));
    out[field] = s[field].filter(id => exists.has(id));
  }
  return out;
};

/** An option field whose current value is no longer a choice takes the first choice there is (nothing else moves). */
function determinedOptions(s: GameSettings): GameSettings {
  const out = { ...s } as Record<string, unknown>;
  for (const key of OPTION_KEYS) {
    const choices = settingsOptionsFor(key, s.language, s.objectType);
    if (!choices.some(o => o.id === s[key]) && choices.length) out[key] = choices[0]!.id;
  }
  return out as unknown as GameSettings;
}

function withObjectType(s: GameSettings, objectType: unknown, domain: SettingsDomain): GameSettings {
  if (typeof objectType !== "string") throw new SettingsChangeError("objectType", "objectType must be an object type id");
  let defaults: TypeArgs;
  try { defaults = objectTypeDef(objectType).defaults; } catch (error) { throw new SettingsChangeError("objectType", (error as Error).message); }
  const playable = domain.playable(objectType);
  const defaultKey = keyOf(objectType, defaults);
  const typeArgs = playable.find(args => keyOf(objectType, args) === defaultKey) ?? playable[0];
  if (!typeArgs) throw new SettingsChangeError("objectType", `No ${objectType} instantiation is playable`);
  return determinedOptions(keepExisting({ ...s, objectType, typeArgs }, domain));
}

function withLanguage(s: GameSettings, language: unknown): GameSettings {
  if (!LANGUAGES.includes(language as GameSettings["language"])) throw new SettingsChangeError("language", `Unsupported language: ${String(language)}`);
  return determinedOptions({ ...s, language: language as GameSettings["language"] });
}

/**
 * The settings after an owner changes the fields in `patch`. A field equal to its value in `settings` is no change, so
 * a whole settings object may be passed (the configuration page's draft, or the room's settings with one field
 * edited: a stale grammar or type arguments then simply follow the changed language or type). Changes apply in
 * dependency order: object type, then type arguments, then language, then every other field. Throws
 * SettingsChangeError for an unknown field, an instantiation that is not playable, an option the language and type do
 * not offer, or an excluded id that is no family of that role of the object type. Numbers are not range-checked here:
 * `validateSettings` does that.
 */
export function applySettingsChange(settings: GameSettings, patch: Partial<GameSettings>, domain: SettingsDomain): GameSettings {
  for (const key of Object.keys(patch)) if (!FIELDS.has(key)) throw new SettingsChangeError(key, `Unknown setting ${key}`);
  const given = patch as Record<string, unknown>;
  let next: GameSettings = { ...settings };
  const changed = (key: keyof GameSettings) => given[key] !== undefined && !sameSettings(given[key], settings[key]);

  if (changed("objectType")) next = withObjectType(next, given.objectType, domain);
  if (changed("typeArgs")) {
    const args = given.typeArgs;
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new SettingsChangeError("typeArgs", "typeArgs must be an object of type arguments");
    next = keepExisting({ ...next, typeArgs: playableArgs(next.objectType, args as TypeArgs, domain) }, domain);
  }
  if (changed("language")) next = withLanguage(next, given.language);
  for (const key of OPTION_KEYS) {
    if (!changed(key)) continue;
    if (!settingsOptionsFor(key, next.language, next.objectType).some(o => o.id === given[key])) {
      throw new SettingsChangeError(key, `Unsupported ${key} for ${next.language} and ${next.objectType}: ${String(given[key])}`);
    }
    next = { ...next, [key]: given[key] };
  }
  for (const [field, role] of EXCLUDED) {
    if (!changed(field)) continue;
    const ids = given[field];
    if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) throw new SettingsChangeError(field, `${field} must be a list of family ids`);
    const known = new Set(domain.typeFamilies(next.objectType, role));
    const unknown = ids.filter(id => !known.has(id));
    if (unknown.length) throw new SettingsChangeError(field, `Not ${role} families of ${next.objectType}: ${unknown.join(", ")}`);
    next = keepExisting({ ...next, [field]: [...new Set(ids as string[])] }, domain);
  }
  const handled = new Set<string>(["objectType", "typeArgs", "language", ...EXCLUDED.map(([f]) => f), ...OPTION_KEYS]);
  for (const key of Object.keys(given) as (keyof GameSettings)[]) {
    if (!handled.has(key) && changed(key)) next = { ...next, [key]: given[key] };
  }
  return next;
}
