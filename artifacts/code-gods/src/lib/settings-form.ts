/**
 * The configuration page's rules (docs/research/ui-redesign/onboarding-and-config.md §4), pure so they are tested
 * without a browser:
 * - field limits and messages, mirroring `validateSettings` and the engine's `nextSettings` resource limits, shown
 *   on the field ("Must be between 1 and 200 agents.");
 * - the settings model's domain from the manifest (`settingsDomain`): every control changes the draft through
 *   game-core's `applySettingsChange`, exactly as the engine applies a change, so the only dependencies are the
 *   game's own (a world moves its default instantiation and the families
 *   that no longer exist); penalty weight and the defence checklist hide while defence goals are off;
 * - one control per type argument (`argChoices`): every value of each argument, never moving another argument; only a
 *   combination the type refuses (or a retired one, 3×3) is disabled. Calibration is never a condition: a shape whose
 *   tables are not shipped prepares them on its first game, which `firstUseNote` says (with the measured time);
 * - the family shelves of an instantiation (reward rules and defence goals);
 * - stepped choices that always contain the current value; the length and pace lines of the summary.
 */
import { LANGUAGES, LANGUAGE_SPECS, SETTINGS_DOCS, sameSettings, validateSettings, type FamilyRole, type FieldDoc, type GameSettings, type Language, type SettingsDomain, type SettingsSection } from "@workspace/game-core";
import { instanceInfo, instantiate, type ParamSchema, type TypeArgs } from "@workspace/game-types";
import { familiesFor, firstUseSeconds, isPlayableInstantiation, publicCatalog, type CatalogEntry } from "@workspace/game-utilities";

export type Settings = GameSettings;
export type SettingsKey = keyof GameSettings;

export const SECTIONS: readonly { id: SettingsSection | "review"; title: string; intro: string }[] = [
  { id: "world", title: "World", intro: "What the objects are and which languages agents may be written in." },
  { id: "goals", title: "Goals", intro: "How secret goals are dealt, and whether every player also defends something." },
  { id: "agents", title: "Agents", intro: "How many agents each player may keep and how much they may compute." },
  { id: "energy", title: "Energy", intro: "How players and their agents earn and spend bits." },
  { id: "population", title: "Population", intro: "How many objects there are and how new ones arrive." },
  { id: "time", title: "Time", intro: "How long planning, pauses and the game itself last, and how fast the world moves." },
  { id: "players", title: "Players & AI", intro: "Who fills the seats and what the AI may spend." },
  { id: "review", title: "Review", intro: "What changes for the next game, as players will see it." },
];

/** The fields of a section in display order (asked first, then "More"). */
export function fieldsOf(section: SettingsSection): SettingsKey[] {
  const tier = { ask: 0, more: 1 } as const;
  return (Object.keys(SETTINGS_DOCS) as SettingsKey[]).filter(k => SETTINGS_DOCS[k].section === section)
    .sort((a, b) => tier[SETTINGS_DOCS[a].tier] - tier[SETTINGS_DOCS[b].tier]);
}

/** Short labels for summaries and diffs ("World speed: 100 → 25 acts/s"). */
export const LABELS: Readonly<Record<SettingsKey, string>> = {
  languages: "Languages", objectType: "Objects", typeArgs: "Object shape", utilitySelectorId: "Goal dealing",
  spawnFunctionId: "New objects", planningSeconds: "Planning", halfLifeSeconds: "Game length (half-life)",
  startingObjectCount: "Starting objects", spawnRateHz: "New objects per second", interactionRateHz: "World speed", interactionComputeMs: "CPU limit per act",
  stepBudget: "Steps per act", perActFloorBits: "Minimum act price", pauseSeconds: "Pause length", startingEnergy: "Starting energy",
  energyPerSecond: "Energy refill", agentEnergyPerSecond: "Agent charging", agentBatteryActs: "Agent battery", maxAgentsPerGod: "Agents per player",
  penaltyWeight: "Defence weight", defenceGoals: "Defence goals", excludedFamilies: "Rules never dealt", excludedDefenceFamilies: "Defence goals never dealt",
  priorId: "Rarity reference",
  commitClause: "Conditional moves", objectSelection: "Act targeting",
};

type Limit = { min: number; max?: number; int?: boolean; above?: boolean; unit: string };
/** Bounds from validateSettings and the engine's nextSettings resource limits (onboarding §0). */
export const LIMITS: Readonly<Partial<Record<SettingsKey, Limit>>> = {
  planningSeconds: { min: 0, max: 3600, unit: "seconds" },
  halfLifeSeconds: { min: 0, above: true, unit: "seconds" },
  startingObjectCount: { min: 0, max: 1000, int: true, unit: "objects" },
  spawnRateHz: { min: 0, max: 10, unit: "per second" },
  interactionRateHz: { min: 0, max: 1000, unit: "acts per second" },
  interactionComputeMs: { min: 1, max: 1000, int: true, unit: "ms" },
  stepBudget: { min: 1, max: 10_000_000, int: true, unit: "steps" },
  perActFloorBits: { min: 0, unit: "bits" },
  pauseSeconds: { min: 0, above: true, max: 3600, unit: "seconds" },
  startingEnergy: { min: 0, unit: "bits" },
  energyPerSecond: { min: 0, unit: "bits per second" },
  agentEnergyPerSecond: { min: 0, unit: "bits per second" },
  agentBatteryActs: { min: 1, unit: "acts" },
  maxAgentsPerGod: { min: 1, max: 200, int: true, unit: "agents" },
  penaltyWeight: { min: 0, unit: "" },
};
export const BUDGET_LIMITS = { aiBudget: { min: 0, max: 1_000_000, int: true, unit: "tokens" }, assistantBudget: { min: 0, max: 2_000_000, int: true, unit: "tokens" } } as const;

const n = (v: number) => v.toLocaleString("en-US");
const unitText = (u: string) => (u ? ` ${u}` : "");

/** The message for a number outside its field's limits, or null when it is fine. */
export function limitError(limit: Limit | undefined, value: unknown): string | null {
  if (!limit) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return "Enter a number.";
  if (limit.int && !Number.isInteger(value)) return "Must be a whole number.";
  if (limit.above && value <= limit.min) return `Must be more than ${n(limit.min)}${unitText(limit.unit)}.`;
  if (value < limit.min || (limit.max !== undefined && value > limit.max)) {
    return limit.max !== undefined ? `Must be between ${n(limit.min)} and ${n(limit.max)}${unitText(limit.unit)}.` : `Must be at least ${n(limit.min)}${unitText(limit.unit)}.`;
  }
  return null;
}
export const fieldError = (key: SettingsKey, value: unknown) => limitError(LIMITS[key], value);

/**
 * Every field error of a draft, plus `_form` for anything else validateSettings refuses (e.g. an unknown option, or
 * defence goals on with none allowed, which needs the families of the `domain`).
 */
export function draftErrors(s: Settings, domain?: SettingsDomain): Partial<Record<SettingsKey | "_form", string>> {
  const out: Partial<Record<SettingsKey | "_form", string>> = {};
  if (!Array.isArray(s.languages) || !s.languages.length) out.languages = "Allow at least one language";
  for (const key of Object.keys(LIMITS) as SettingsKey[]) {
    const e = fieldError(key, s[key]);
    if (e) out[key] = e;
  }
  if (!Object.keys(out).length) {
    try { validateSettings(s, domain); } catch (e) { out._form = e instanceof Error ? e.message : String(e); }
  }
  return out;
}

/**
 * The allowed languages after ticking (`on`) or unticking one. The order is kept (its first is the game's default) and
 * a newly ticked language goes last; the set never empties, so unticking the last one changes nothing.
 */
export function toggleLanguage(current: readonly Language[], language: Language, on: boolean): Language[] {
  const next = on ? (current.includes(language) ? [...current] : [...current, language]) : current.filter(l => l !== language);
  return next.length ? next : [...current];
}

/** Fields with no effect in these settings (penalty weight and the defence checklist while defence goals are off). */
export function isHidden(key: SettingsKey, s: Settings): boolean {
  const when = (SETTINGS_DOCS[key] as FieldDoc).hiddenWhen;
  return !!when && Object.entries(when).every(([k, v]) => s[k as SettingsKey] === v);
}

/** The stepped choices of a field, with the current value added when it is not among them. */
export function stepChoices(key: SettingsKey, current: unknown): (number | string)[] {
  const suggested = [...((SETTINGS_DOCS[key] as FieldDoc).suggested ?? [])] as (number | string)[];
  if ((typeof current === "number" || typeof current === "string") && !suggested.includes(current)) {
    suggested.push(current);
    if (typeof current === "number") suggested.sort((a, b) => Number(a) - Number(b));
  }
  return suggested;
}

/** Equal settings (or field values), whatever their key order. */
export const same = sameSettings;

const catalogs = new Map<string, CatalogEntry[]>();
const utilityRole = (role: FamilyRole) => (role === "defence" ? "penalty" : "reward");
/** The utility families of one role that exist (can be dealt) in an instantiation, from the shipped catalogue; [] for bad args. */
function existingFamilies(objectType: string, typeArgs: TypeArgs, role: FamilyRole): CatalogEntry[] {
  let key: string;
  try { key = instantiate(objectType, typeArgs).key; } catch { return []; }
  let entries = catalogs.get(key);
  if (!entries) catalogs.set(key, entries = publicCatalog(instantiate(objectType, typeArgs)).filter(e => e.available));
  return entries.filter(e => e.role === utilityRole(role));
}

/** How a first game on a shape goes on this server (manifest.get `playable[].prepare`): tables to compute, about how long. */
export interface Prepare { toCompute: number; seconds: number }
/** The manifest's object types, as far as the settings model and the argument controls need them. */
export interface PlayableTypes {
  id: string; params?: readonly ParamSchema[]; defaults?: TypeArgs;
  /** `synergy`: the priors under which the Aligned Lottery has a measured synergy matrix for the shape. */
  playable: readonly { args: TypeArgs; prepare?: Prepare | null; synergy?: readonly string[] }[];
}
/**
 * The settings model's domain on this page: the instantiations the manifest lists as playable (the engine applies a
 * change with the same list), any other valid, non-retired arguments, and the families that exist in each, from the
 * shipped catalogue.
 */
export function settingsDomain(types: readonly PlayableTypes[]): SettingsDomain {
  return {
    playable: objectType => types.find(t => t.id === objectType)?.playable.map(o => o.args) ?? [],
    isPlayable: (objectType, typeArgs) => { try { return isPlayableInstantiation(instantiate(objectType, typeArgs)); } catch { return false; } },
    families: (objectType, typeArgs, role) => existingFamilies(objectType, typeArgs, role).map(e => e.id),
    typeFamilies: (objectType, role) => familiesFor(objectType, utilityRole(role)).map(f => f.id),
  };
}

/** A family shelf of an instantiation: the families of one role that exist there, each marked excluded as the draft says. */
export function shelfEntries(objectType: string, typeArgs: TypeArgs, excluded: readonly string[], role: FamilyRole = "reward"): (CatalogEntry & { excluded: boolean })[] {
  const out = new Set(excluded);
  return existingFamilies(objectType, typeArgs, role).map(e => ({ ...e, excluded: out.has(e.id) }));
}

/** Why defence goals cannot be switched on in this world (it has no defence families), or null. */
export function defenceBlocker(s: Pick<Settings, "objectType" | "typeArgs">): string | null {
  return existingFamilies(s.objectType, s.typeArgs, "defence").length ? null : "This world has no defence goals to deal.";
}

const argKey = (objectType: string, args: TypeArgs) => { try { return instantiate(objectType, args).key; } catch { return null; } };
const shapeLabel = (objectType: string, args: TypeArgs) => { try { return instanceInfo(instantiate(objectType, args)).label; } catch { return `${objectType} ${Object.values(args).join(" · ")}`; } };

/** One value of one type argument: its label, and whether picking it (the other arguments unchanged) is playable. */
export interface ArgChoice { value: number | string; label: string; enabled: boolean; reason?: string }
/**
 * The controls of a type's arguments (Grid: size, symbols, colours; Int: smallest, biggest; string: longest), one per
 * parameter of the manifest's `params`. Each lists the parameter's values that some playable instantiation uses (a
 * component's options, an integer's presets: so the retired 3×3 is not a size), plus the current value. A value is
 * enabled when the combination with the other arguments as they are is playable (valid and not retired); whether its
 * tables are shipped does not matter (`firstUseNote`). Picking a value never changes another argument.
 */
export function argChoices(type: PlayableTypes, args: TypeArgs): { param: ParamSchema; current: number | string; choices: ArgChoice[] }[] {
  const full = { ...(type.defaults ?? {}), ...args };
  return (type.params ?? []).map(param => {
    const used = new Set(type.playable.map(o => ({ ...(type.defaults ?? {}), ...o.args })[param.id]));
    const all: { value: number | string; label: string }[] = param.kind === "component"
      ? param.options.map(o => ({ value: o.id, label: o.label }))
      : (param.presets ?? []).map(v => ({ value: v, label: param.id === "size" ? `${v}×${v}` : v.toLocaleString("en-US") }));
    const current = full[param.id] as number | string;
    const values = all.filter(v => used.has(v.value) || v.value === current);
    if (!values.some(v => v.value === current)) {
      // A value no longer offered (a legacy component, such as red, green, blue) keeps its name.
      const legacy = param.kind === "component" ? param.legacy?.find(o => o.id === current) : undefined;
      values.push({ value: current, label: legacy?.label ?? String(current) });
    }
    const choices = values.map(({ value, label }) => {
      const next = { ...full, [param.id]: value };
      let inst;
      try { inst = instantiate(type.id, next); } catch (e) { return { value, label, enabled: false, reason: `${shapeLabel(type.id, next)} is not a valid shape: ${(e as Error).message}` }; }
      return isPlayableInstantiation(inst) ? { value, label, enabled: true } : { value, label, enabled: false, reason: `${shapeLabel(type.id, next)} is retired` };
    });
    return { param, current, choices };
  });
}

/**
 * The light note under the shape controls when the first game on this shape will compute some of its rule tables
 * (none are shipped or analytic for those draws): "The first game on this shape prepares its rule tables (about 70 s)
 * before planning starts; later games start at once." Null when every table is ready. An unlisted shape (a custom Int
 * range) takes the measured estimate for its type (game-utilities firstUseSeconds).
 */
export function firstUseNote(type: PlayableTypes, args: TypeArgs): string | null {
  const key = argKey(type.id, { ...(type.defaults ?? {}), ...args });
  if (!key) return null;
  const listed = type.playable.find(o => argKey(type.id, { ...(type.defaults ?? {}), ...o.args }) === key);
  const seconds = listed ? listed.prepare?.seconds : firstUseSeconds(instantiate(type.id, { ...(type.defaults ?? {}), ...args }));
  if (seconds === undefined) return null;
  const tables = listed?.prepare ? `up to ${listed.prepare.toCompute} rule table${listed.prepare.toCompute === 1 ? "" : "s"}` : "its rule tables";
  return `The first game on this shape on this server prepares ${tables} (about ${formatSeconds(seconds)}) before planning starts; later games start at once.`;
}
/** "45 s", "4 min 20 s". */
export function formatSeconds(seconds: number): string {
  const s = Math.round(seconds);
  return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ""}`;
}

/**
 * How the goal dealing will actually deal on this shape: the Aligned Lottery needs measured synergy (shipped for a few
 * shapes) and deals exactly like the Divine Lottery without it. Null when the chosen dealer deals as named.
 */
export function dealerNote(type: PlayableTypes | undefined, s: Pick<Settings, "typeArgs" | "utilitySelectorId" | "priorId">): string | null {
  if (s.utilitySelectorId !== "fair-aligned" || !type) return null;
  const key = argKey(type.id, { ...(type.defaults ?? {}), ...s.typeArgs });
  const listed = type.playable.find(o => argKey(type.id, { ...(type.defaults ?? {}), ...o.args }) === key);
  return listed?.synergy?.includes(s.priorId) ? null : "No synergy has been measured for this shape: the Aligned Lottery deals like the Divine Lottery here.";
}

/** A value in plain words: "25 acts/s", "4 × base10 × rgb", "11 rules", "offered". */
export function formatValue(key: SettingsKey, v: unknown): string {
  if (key === "typeArgs" && v && typeof v === "object") return Object.values(v).join(" · ");
  if (key === "excludedFamilies" && Array.isArray(v)) return v.length ? `${v.length} rule${v.length === 1 ? "" : "s"}` : "none";
  if (key === "excludedDefenceFamilies" && Array.isArray(v)) return v.length ? `${v.length} defence goal${v.length === 1 ? "" : "s"}` : "none";
  if (key === "commitClause") return v ? "offered" : "off";
  if (key === "defenceGoals") return v ? "every player" : "off";
  if (key === "languages" && Array.isArray(v)) return v.map(l => choiceLabel(key, l)).join(", ") || "none";
  if ((key === "utilitySelectorId" || key === "objectSelection") && typeof v === "string") return choiceLabel(key, v);
  const unit = (SETTINGS_DOCS[key] as FieldDoc).unit;
  return typeof v === "number" ? `${n(v)}${unit ? ` ${unit}` : ""}` : String(v);
}

const NAMED: Partial<Record<SettingsKey, Record<string, string>>> = {
  interactionRateHz: { 25: "Slow", 100: "Normal", 300: "Fast", 1000: "Max" },
  halfLifeSeconds: { 120: "Short", 300: "Normal", 600: "Long", 1200: "Marathon" },
  utilitySelectorId: { "fair-aligned": "Aligned Lottery", "divine-lottery": "Divine Lottery" },
  objectSelection: { uniform: "Uniform", shelter: "Shelter" },
  languages: Object.fromEntries(LANGUAGES.map(l => [l, LANGUAGE_SPECS[l].label])),
};
const duration = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${n(s)} s`);
/** A stepped choice's label: "Slow (25/s)", "2 min", "50%", "500,000 steps". */
export function choiceLabel(key: SettingsKey, v: number | string | boolean): string {
  const named = NAMED[key]?.[String(v)];
  if (typeof v === "boolean") return key === "defenceGoals" ? (v ? "On: everyone" : "Off") : v ? "Offered" : "Off";
  if (key === "interactionRateHz" && typeof v === "number") return named ? `${named} (${n(v)}/s)` : `${n(v)}/s`;
  if (key === "halfLifeSeconds" && typeof v === "number") return named ? `${named} (${duration(v)})` : duration(v);
  if (named) return named;
  if ((key === "planningSeconds" || key === "pauseSeconds") && typeof v === "number") return duration(v);
  if (key === "penaltyWeight" && typeof v === "number") return v === 0.5 ? "½" : `${n(v)}`;
  return typeof v === "number" ? n(v) : v;
}

/** "~6 min (often 3–13)": planning plus the half-life, and the 20%–80% range of the random end. */
export function lengthLine(s: Pick<Settings, "planningSeconds" | "halfLifeSeconds">): string {
  const m = (sec: number) => Math.max(1, Math.round(sec / 60));
  const p = s.planningSeconds, h = s.halfLifeSeconds;
  return `~${m(p + h)} min (often ${m(p + 0.415 * h)}–${m(p + 2.32 * h)})`;
}
export const paceWord = (hz: number) => (hz <= 30 ? "slow" : hz <= 150 ? "normal" : "fast");
