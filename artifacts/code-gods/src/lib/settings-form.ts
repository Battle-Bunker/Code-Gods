/**
 * The configuration page's rules (docs/research/ui-redesign/onboarding-and-config.md §4), pure so they are tested
 * without a browser:
 * - field limits and messages, mirroring `validateSettings` and the engine's `nextSettings` resource limits, shown
 *   on the field ("Must be between 1 and 200 agents.");
 * - the settings model's domain from the manifest (`settingsDomain`): every control changes the draft through
 *   game-core's `applySettingsChange`, exactly as the engine applies a change, so the only dependencies are the
 *   game's own (a language moves its grammar and summon price, a world its default instantiation and the families
 *   that no longer exist); penalty weight hides while no defence goals are dealt;
 * - the family shelf of an instantiation; which game setup the settings are on;
 * - stepped choices that always contain the current value; the length and pace lines of the summary.
 */
import { SETTINGS_DOCS, sameSettings, validateSettings, type FieldDoc, type GameSettings, type SettingsDomain, type SettingsSection } from "@workspace/game-core";
import { instantiate, type TypeArgs } from "@workspace/game-types";
import { familiesFor, publicCatalog, type CatalogEntry } from "@workspace/game-utilities";

export type Settings = GameSettings;
export type SettingsKey = keyof GameSettings;

export const SECTIONS: readonly { id: SettingsSection | "review"; title: string; intro: string }[] = [
  { id: "world", title: "World", intro: "What the objects are and which language agents are written in." },
  { id: "goals", title: "Goals", intro: "How secret goals are dealt and whether players also defend something." },
  { id: "agents", title: "Agents", intro: "How many agents each player may keep and how much they may compute." },
  { id: "energy", title: "Energy", intro: "How players and their agents earn and spend bits." },
  { id: "population", title: "Population", intro: "How many objects there are and how new ones arrive." },
  { id: "time", title: "Time", intro: "How long planning, pauses and the game itself last, and how fast the world moves." },
  { id: "players", title: "Players & AI", intro: "Who fills the seats and what the AI may spend." },
  { id: "review", title: "Review", intro: "What changes for the next game, as players will see it." },
];

/** The fields of a section in display order (asked first, then "More", then fixed facts). */
export function fieldsOf(section: SettingsSection): SettingsKey[] {
  const tier = { ask: 0, more: 1, fixed: 2 } as const;
  return (Object.keys(SETTINGS_DOCS) as SettingsKey[]).filter(k => SETTINGS_DOCS[k].section === section)
    .sort((a, b) => tier[SETTINGS_DOCS[a].tier] - tier[SETTINGS_DOCS[b].tier]);
}

/** Short labels for summaries and diffs ("World speed: 100 → 25 acts/s"). */
export const LABELS: Readonly<Record<SettingsKey, string>> = {
  language: "Language", objectType: "Objects", typeArgs: "Object shape", grammarId: "Agent code shape", utilitySelectorId: "Goal dealing",
  complexityFunctionId: "Summon price", spawnFunctionId: "New objects", planningSeconds: "Planning", halfLifeSeconds: "Game length (half-life)",
  startingObjectCount: "Starting objects", spawnRateHz: "New objects per second", interactionRateHz: "World speed", interactionComputeMs: "CPU limit per act",
  stepBudget: "Steps per act", perActFloorBits: "Minimum act price", pauseSeconds: "Pause length", startingEnergy: "Starting energy",
  energyPerSecond: "Energy refill", agentEnergyPerSecond: "Agent charging", agentBatteryActs: "Agent battery", maxAgentsPerGod: "Agents per player",
  penaltyWeight: "Defence weight", defenceRate: "Defence goals", excludedFamilies: "Rules never dealt", priorId: "Rarity reference",
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
  defenceRate: { min: 0, max: 1, unit: "" },
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

/** Every field error of a draft, plus `_form` for anything else validateSettings refuses (e.g. an unknown option). */
export function draftErrors(s: Settings): Partial<Record<SettingsKey | "_form", string>> {
  const out: Partial<Record<SettingsKey | "_form", string>> = {};
  for (const key of Object.keys(LIMITS) as SettingsKey[]) {
    const e = fieldError(key, s[key]);
    if (e) out[key] = e;
  }
  if (!Object.keys(out).length) {
    try { validateSettings(s); } catch (e) { out._form = e instanceof Error ? e.message : String(e); }
  }
  return out;
}

/** Fields with no effect in these settings (penalty weight while defence goals are off). */
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
/** The utility families that exist (can be dealt) in an instantiation, from the shipped catalogue; [] for bad args. */
function existingFamilies(objectType: string, typeArgs: TypeArgs): CatalogEntry[] {
  let key: string;
  try { key = instantiate(objectType, typeArgs).key; } catch { return []; }
  let entries = catalogs.get(key);
  if (!entries) catalogs.set(key, entries = publicCatalog(instantiate(objectType, typeArgs)).filter(e => e.available));
  return entries;
}

/** The manifest's object types, as far as the settings model needs them. */
export interface OfferedTypes { id: string; offered: readonly { args: TypeArgs }[] }
/**
 * The settings model's domain on this page: the instantiations the manifest offers (the engine applies a change with
 * the same list) and the families that exist in each, from the shipped catalogue.
 */
export function settingsDomain(types: readonly OfferedTypes[]): SettingsDomain {
  return {
    offered: objectType => types.find(t => t.id === objectType)?.offered.map(o => o.args) ?? [],
    families: (objectType, typeArgs) => existingFamilies(objectType, typeArgs).map(e => e.id),
    typeFamilies: objectType => familiesFor(objectType).map(f => f.id),
  };
}

/** The family shelf of an instantiation: the families that exist there, each marked excluded as the draft says. */
export function shelfEntries(objectType: string, typeArgs: TypeArgs, excluded: readonly string[]): (CatalogEntry & { excluded: boolean })[] {
  const out = new Set(excluded);
  return existingFamilies(objectType, typeArgs).map(e => ({ ...e, excluded: out.has(e.id) }));
}

export type OriginLike = { kind: string; id?: string; modified: boolean } | null | undefined;
/**
 * The game setup these settings are on: the setup the room's origin names while the settings still equal it, else
 * the first setup with exactly these settings (two setups may be equal), else undefined (custom settings).
 */
export function currentSetup<S extends { id: string; settings: unknown }>(settings: Settings, origin: OriginLike, setups: readonly S[]): S | undefined {
  const named = origin?.kind === "setup" ? setups.find(s => s.id === origin.id && same(s.settings, settings)) : undefined;
  return named ?? setups.find(s => same(s.settings, settings));
}

/** A value in plain words: "25 acts/s", "4 × base10 × rgb", "11 rules", "offered". */
export function formatValue(key: SettingsKey, v: unknown): string {
  if (key === "typeArgs" && v && typeof v === "object") return Object.values(v).join(" · ");
  if (key === "excludedFamilies" && Array.isArray(v)) return v.length ? `${v.length} rule${v.length === 1 ? "" : "s"}` : "none";
  if (key === "commitClause") return v ? "offered" : "off";
  if (key === "defenceRate" && typeof v === "number") return v === 0 ? "off" : `${Math.round(v * 100)}% of players`;
  if ((key === "language" || key === "utilitySelectorId" || key === "objectSelection") && typeof v === "string") return choiceLabel(key, v);
  const unit = (SETTINGS_DOCS[key] as FieldDoc).unit;
  return typeof v === "number" ? `${n(v)}${unit ? ` ${unit}` : ""}` : String(v);
}

const NAMED: Partial<Record<SettingsKey, Record<string, string>>> = {
  interactionRateHz: { 25: "Slow", 100: "Normal", 300: "Fast", 1000: "Max" },
  halfLifeSeconds: { 120: "Short", 300: "Normal", 600: "Long", 1200: "Marathon" },
  utilitySelectorId: { "fair-aligned": "Aligned Lottery", "divine-lottery": "Divine Lottery" },
  objectSelection: { uniform: "Uniform", shelter: "Shelter" },
  language: { python: "Python", typescript: "TypeScript" },
};
const duration = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${n(s)} s`);
/** A stepped choice's label: "Slow (25/s)", "2 min", "50%", "500,000 steps". */
export function choiceLabel(key: SettingsKey, v: number | string | boolean): string {
  const named = NAMED[key]?.[String(v)];
  if (typeof v === "boolean") return v ? "Offered" : "Off";
  if (key === "interactionRateHz" && typeof v === "number") return named ? `${named} (${n(v)}/s)` : `${n(v)}/s`;
  if (key === "halfLifeSeconds" && typeof v === "number") return named ? `${named} (${duration(v)})` : duration(v);
  if (named) return named;
  if ((key === "planningSeconds" || key === "pauseSeconds") && typeof v === "number") return duration(v);
  if (key === "defenceRate" && typeof v === "number") return v === 0 ? "Never" : v === 1 ? "Always" : `${Math.round(v * 100)}%`;
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
