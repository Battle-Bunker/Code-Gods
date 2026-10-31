/**
 * The configuration page's rules (docs/research/ui-redesign/onboarding-and-config.md §4), pure so they are tested
 * without a browser:
 * - field limits and messages, mirroring `validateSettings` and the engine's `nextSettings` resource limits, shown
 *   on the field ("Must be between 1 and 200 agents.");
 * - dependencies (§4.2): a new object type retunes the fields still at the old tuned defaults, exactly as the
 *   engine's `retuneSettings` does on save, and reports which moved; a new language moves grammar and price;
 *   penalty weight hides while no defence goals are dealt;
 * - stepped choices that always contain the current value; the preset the settings match; a plain-language diff;
 *   the length and pace lines of the summary; the three-way merge of a draft with changes saved elsewhere.
 */
import {
  COMPLEXITY_FOR, DEFAULT_SETTINGS, SETTINGS_DOCS, instantiationOf, settingsOptionsFor, typeDefaults, validateSettings,
  type FieldDoc, type GameSettings, type SettingsSection,
} from "@workspace/game-core";

export type Settings = GameSettings;
export type SettingsKey = keyof GameSettings;

export const SECTIONS: readonly { id: SettingsSection | "start" | "review"; title: string; intro: string }[] = [
  { id: "start", title: "Start from", intro: "Pick a ready-made game; every answer below starts from it." },
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

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
export const same = (a: unknown, b: unknown) => canon(a) === canon(b);

/**
 * A new object type or type arguments: fields still at the old instantiation's tuned defaults move to the new ones
 * (the engine's retuneSettings does the same on save), and the moved fields are named for the toast.
 */
export function retune(prev: Settings, next: Pick<Settings, "objectType" | "typeArgs">): { settings: Settings; moved: SettingsKey[] } {
  const out = { ...prev, objectType: next.objectType, typeArgs: next.typeArgs } as Settings;
  let oldDefaults: Partial<Settings>, newDefaults: Partial<Settings>;
  try {
    if (instantiationOf(prev).key === instantiationOf(out).key) return { settings: out, moved: [] };
    oldDefaults = typeDefaults(prev.objectType, prev.typeArgs);
    newDefaults = typeDefaults(out.objectType, out.typeArgs);
  } catch { return { settings: out, moved: [] }; }
  const moved: SettingsKey[] = [];
  const keys = new Set([...Object.keys(oldDefaults), ...Object.keys(newDefaults)]) as Set<SettingsKey>;
  for (const key of keys) {
    if (key === "objectType" || key === "typeArgs") continue;
    const wasDefault = same(prev[key], oldDefaults[key] ?? DEFAULT_SETTINGS[key]);
    const target = newDefaults[key] ?? DEFAULT_SETTINGS[key];
    if (wasDefault && !same(prev[key], target)) { (out as unknown as Record<string, unknown>)[key] = target; moved.push(key); }
  }
  return { settings: fixOptions(out), moved };
}

/** Grammar, selector and price moved to a choice the language and object type offer (the first), as the engine does. */
export function fixOptions(s: Settings): Settings {
  const out = { ...s };
  for (const key of ["grammarId", "utilitySelectorId", "complexityFunctionId"] as const) {
    const choices = settingsOptionsFor(key, s.language, s.objectType);
    if (!choices.some(o => o.id === s[key])) (out as Record<string, unknown>)[key] = choices[0]?.id ?? s[key];
  }
  return out;
}

/** A new language: the grammar and the summon-price function follow it. */
export function withLanguage(s: Settings, language: Settings["language"]): Settings {
  return fixOptions({ ...s, language, grammarId: `${language}-agent-v1` as Settings["grammarId"], complexityFunctionId: COMPLEXITY_FOR[language] });
}

const LANGUAGE_FIELDS: readonly SettingsKey[] = ["language", "grammarId", "complexityFunctionId"];
/** The preset these settings are exactly (ignoring the language, which every preset takes from the room), if any. */
export function matchPreset<P extends { id: string; settings?: Settings; offered?: boolean }>(s: Settings, presets: readonly P[]): P | undefined {
  return presets.find(p => p.settings && (Object.keys(p.settings) as SettingsKey[]).every(k => LANGUAGE_FIELDS.includes(k) || same(p.settings![k], s[k])));
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

export interface Change { key: SettingsKey; label: string; from: string; to: string }
/** What differs from the base, in field order. */
export function settingsDiff(base: Settings, draft: Settings): Change[] {
  return (Object.keys(SETTINGS_DOCS) as SettingsKey[]).filter(k => !same(base[k], draft[k]))
    .map(key => ({ key, label: LABELS[key], from: formatValue(key, base[key]), to: formatValue(key, draft[key]) }));
}

/** "~6 min (often 3–13)": planning plus the half-life, and the 20%–80% range of the random end. */
export function lengthLine(s: Pick<Settings, "planningSeconds" | "halfLifeSeconds">): string {
  const m = (sec: number) => Math.max(1, Math.round(sec / 60));
  const p = s.planningSeconds, h = s.halfLifeSeconds;
  return `~${m(p + h)} min (often ${m(p + 0.415 * h)}–${m(p + 2.32 * h)})`;
}
export const paceWord = (hz: number) => (hz <= 30 ? "slow" : hz <= 150 ? "normal" : "fast");

/**
 * The owner's draft against settings saved elsewhere since it began (another tab, the assistant): fields only one
 * side changed merge; fields both changed differently are conflicts, resolved per field (the draft's value until
 * the owner takes theirs). The draft is never discarded.
 */
export function threeWayMerge<T extends Record<string, unknown>>(base: T, mine: T, theirs: T): { merged: T; conflicts: (keyof T)[]; fromTheirs: (keyof T)[] } {
  const merged = { ...mine } as T;
  const conflicts: (keyof T)[] = [], fromTheirs: (keyof T)[] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]) as Set<keyof T>) {
    const mineChanged = !same(base[key], mine[key]), theirsChanged = !same(base[key], theirs[key]);
    if (theirsChanged && !mineChanged) { merged[key] = theirs[key]; fromTheirs.push(key); }
    else if (theirsChanged && mineChanged && !same(mine[key], theirs[key])) conflicts.push(key);
  }
  return { merged, conflicts, fromTheirs };
}
