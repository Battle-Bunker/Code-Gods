/**
 * The configuration page's rules (archive/engine-v1 site/lib/settings-form.ts and game-core SETTINGS_DOCS, ported onto
 * v2), pure so they are tested without a browser.
 *
 * v1 edited one GameSettings record; a v2 room plays a preset plus the overrides `room.settings` accepts. So the draft
 * here is the preset's values with the room's overrides on top (`draftOf`), and saving sends only what differs from the
 * preset (`overridesFor`), so a later change of setup starts clean. Every override the affordance accepts has exactly
 * one question here (FIELDS; the test compares the two), with v1's question, meaning, consequence, section, tier
 * ("ask" first, the rest under "More"), stepped choices and limits. v1 wording is kept; a field v2 added (rule drift,
 * the look price that replaced v1's observation modes, the noise variance that replaced v1's σ) says so in its doc.
 * The World section of v1 (object type and shape) is v2's preset choice, the "Setup" section.
 */
import { presetOf, type Preset } from "@workspace/engine/convex/v2/presets.ts";
import { DEFAULT_SCORE_INTERVAL_SECONDS, PEER_NOISE_VARIANCE_OPTIONS, SCORE_INTERVAL_OPTIONS, type DurationMode } from "@workspace/engine/convex/v2/duration.ts";

/** Every value a room's next game can be given, as the page edits it (all present; the overrides are the differences). */
export interface Draft {
  planningSeconds: number; worldSeconds: number; startingEnergy: number;
  durationMode: DurationMode; scoreIntervalSeconds: number; peerNoiseVariance: number;
  readPriceWeight: number; driftSeconds: number; pauseSeconds: number; commitClause: boolean;
}
export type FieldKey = keyof Draft;
export type Overrides = Partial<Draft>;

export type SectionId = "setup" | "goals" | "agents" | "energy" | "population" | "time" | "players" | "review";
type FieldSection = Exclude<SectionId, "setup" | "players" | "review">;
export type ControlKind = "number" | "segmented" | "switch";

/** v1's units, limits and docs for one field (game-core FieldDoc + settings-form LIMITS). */
export interface FieldSpec {
  label: string; question: string; meaning: string; consequence: string;
  section: FieldSection; tier: "ask" | "more"; control: ControlKind;
  suggested?: readonly (number | string)[]; unit?: string;
  /** Typed in minutes, stored in seconds (v1: game length, planning, pause). */
  minutes?: boolean;
  limit?: { min: number; max?: number; int?: boolean };
}

/** v1's pause length when the room sets none (convex/v2/loop.ts DEFAULT_PAUSE_SECONDS). */
export const DEFAULT_PAUSE_SECONDS = 180;
export const READ_PRICE_WEIGHTS: readonly number[] = [0, 0.5, 1, 2, 3, 4];

export const FIELDS: Readonly<Record<FieldKey, FieldSpec>> = {
  peerNoiseVariance: {
    label: "Blur on others' interest", section: "goals", tier: "more", control: "segmented", suggested: PEER_NOISE_VARIANCE_OPTIONS,
    question: "How blurred are the other players' combined interest in each object?",
    meaning: "While the game runs, each reading of the other players' summed bits for an object carries random noise of this variance (bits²); after the end the exact numbers show, and totals are always exact.",
    consequence: "More noise makes it harder to work out the other players' rules from the numbers alone, so negotiation clues matter more, but it also makes their interest in each object less certain.",
  },
  driftSeconds: {
    label: "Rules get new numbers", section: "goals", tier: "more", control: "number", suggested: [0, 60, 120, 300], unit: "s", limit: { min: 0, max: 3600, int: true },
    question: "How often do the rules get new numbers?",
    meaning: "Every this many seconds of world time, each player's rule keeps its kind but may get a new target; a rule with one set of numbers keeps it, and zero is never.",
    consequence: "Shorter intervals keep the world from settling, so a plan that worked must keep adapting.",
  },
  commitClause: {
    label: "Conditional moves", section: "agents", tier: "more", control: "switch",
    question: "May agents make their moves conditional?",
    meaning: "Whether agents may wrap moves in only_if_better, so that the moves apply only if they raise their owner's payoff on that object.",
    consequence: "Offering it makes agents safer and accidents rarer, at a few extra summon bits for each agent that uses it.",
  },
  startingEnergy: {
    label: "Starting energy", section: "energy", tier: "ask", control: "number", suggested: [50, 100, 200, 400, 600], unit: "energy", limit: { min: 0 },
    question: "How much energy does each player start with?",
    meaning: "The energy each player holds for summoning agents when planning begins.",
    consequence: "Raising it allows bigger or more first agents and a faster start.",
  },
  readPriceWeight: {
    label: "Price of a look", section: "energy", tier: "more", control: "segmented", suggested: READ_PRICE_WEIGHTS, limit: { min: 0, max: 4 },
    question: "Do players pay to look at the world?",
    meaning: "Everyone sees each object as they or their agents last saw it, and a fresh look costs this many times its read price in energy; free shows every object as it changes.",
    consequence: "Paid looking gives a player's own energy a use and makes watching the others costly.",
  },
  planningSeconds: {
    label: "Planning", section: "time", tier: "ask", control: "number", suggested: [30, 60, 120, 300], unit: "s", minutes: true, limit: { min: 5, max: 900, int: true },
    question: "How long is planning before the world starts?",
    meaning: "How long the world stays frozen at the start while players read their goals, summon agents and talk.",
    consequence: "Lengthening it helps beginners and delays the action.",
  },
  durationMode: {
    label: "Game end", section: "time", tier: "ask", control: "segmented", suggested: ["fixed", "halfLife"],
    question: "Does the game end at a set time, or at a surprise?",
    meaning: "A fixed game ends exactly when its time is up, and everyone can see when; a half-life game ends at a hidden random moment, half of games ending within the time chosen.",
    consequence: "A fixed end lets players plan for the last second, while a surprise end rewards scoring early.",
  },
  worldSeconds: {
    label: "Game length", section: "time", tier: "ask", control: "number", suggested: [120, 300, 600, 1200], unit: "s", minutes: true, limit: { min: 30, max: 7200, int: true },
    question: "How long should games last?",
    meaning: "The game's length in world time: exactly this long for a fixed game, or the time within which half of games end for a half-life game.",
    consequence: "Lengthening it gives more time to negotiate and makes games longer.",
  },
  scoreIntervalSeconds: {
    label: "Score updates", section: "time", tier: "more", control: "number", suggested: SCORE_INTERVAL_OPTIONS, unit: "s", limit: { min: 1, max: 3600, int: true },
    question: "How often do the public scores update?",
    meaning: "Every player's public score on the leaderboard changes for everyone at once, every this many seconds of world time; your own score stays live.",
    consequence: "Lengthening it makes it harder to tell from the leaderboard whose move changed an object, while shortening it makes the race easier to follow.",
  },
  pauseSeconds: {
    label: "Pause length", section: "time", tier: "more", control: "number", suggested: [60, 180, 300], unit: "s", minutes: true, limit: { min: 1, max: 1800, int: true },
    question: "How long is each player's one pause?",
    meaning: "How long the world stops when a player uses their one pause per game.",
    consequence: "Lengthening it gives more time to negotiate during a pause.",
  },
};

export const SECTIONS_ALL: readonly { id: SectionId; title: string; intro: string }[] = [
  { id: "setup", title: "Setup", intro: "What the objects are and which rules can be dealt: each setup is a board and its pool of rules." },
  { id: "goals", title: "Goals", intro: "How much players can read of each other's goals, and whether the goals move." },
  { id: "agents", title: "Agents", intro: "What agents may do." },
  { id: "energy", title: "Energy", intro: "How players and their agents earn and spend energy." },
  { id: "population", title: "Population", intro: "How many objects there are and how new ones arrive." },
  { id: "time", title: "Time", intro: "How long planning, pauses and the game itself last." },
  { id: "players", title: "Players & AI", intro: "Who fills the seats and what the AI may spend." },
  { id: "review", title: "Review", intro: "What changes for the next game, as players will see it." },
];

/** The fields of a section in display order (asked first, then "More"). */
export function fieldsOf(section: SectionId): FieldKey[] {
  const tier = { ask: 0, more: 1 } as const;
  return (Object.keys(FIELDS) as FieldKey[]).filter(k => FIELDS[k].section === section).sort((a, b) => tier[FIELDS[a].tier] - tier[FIELDS[b].tier]);
}
/** The sections the page shows: v1's order, without a settings section that has no question in v2 yet. */
export const SECTIONS = SECTIONS_ALL.filter(s => s.id === "setup" || s.id === "players" || s.id === "review" || fieldsOf(s.id).length > 0);

/** The preset's own value of each field (absent from the preset: the server's default). */
export function presetDraft(p: Preset): Draft {
  return {
    planningSeconds: p.planningSeconds, worldSeconds: p.worldSeconds, startingEnergy: p.startingEnergy, durationMode: p.durationMode,
    scoreIntervalSeconds: DEFAULT_SCORE_INTERVAL_SECONDS, peerNoiseVariance: p.peerNoiseVariance, readPriceWeight: p.readPriceWeight,
    driftSeconds: p.driftSeconds, pauseSeconds: DEFAULT_PAUSE_SECONDS, commitClause: false,
  };
}
/** The room's next game: the preset with the room's overrides on top (a stored field the page does not know is ignored). */
export function draftOf(p: Preset, o: Record<string, unknown>): Draft {
  const d = presetDraft(p);
  for (const k of Object.keys(FIELDS) as FieldKey[]) if (o[k] !== undefined && o[k] !== null) (d as unknown as Record<string, unknown>)[k] = o[k];
  return d;
}
/** What to send: only what differs from the preset. */
export function overridesFor(d: Draft, p: Preset): Overrides {
  const own = presetDraft(p), out: Record<string, unknown> = {};
  for (const k of Object.keys(FIELDS) as FieldKey[]) if (!sameValue(d[k], own[k])) out[k] = d[k];
  return out as Overrides;
}
const sameValue = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9 : a === b);

const n = (v: number) => v.toLocaleString("en-US");
const unitText = (u?: string) => (u ? ` ${u === "s" ? "seconds" : u}` : "");
/** The message for a value outside its field's limits (v1's words), or null. */
export function fieldError(key: FieldKey, value: unknown): string | null {
  const spec = FIELDS[key], limit = spec.limit;
  if (spec.control === "number" && (typeof value !== "number" || !Number.isFinite(value))) return "Enter a number.";
  if (!limit || typeof value !== "number") return null;
  if (!Number.isFinite(value)) return "Enter a number.";
  if (limit.int && !Number.isInteger(value)) return "Must be a whole number.";
  if (value < limit.min || (limit.max !== undefined && value > limit.max)) {
    return limit.max !== undefined ? `Must be between ${n(limit.min)} and ${n(limit.max)}${unitText(spec.unit)}.` : `Must be at least ${n(limit.min)}${unitText(spec.unit)}.`;
  }
  return null;
}
export function draftErrors(d: Draft): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  for (const k of Object.keys(FIELDS) as FieldKey[]) { const e = fieldError(k, d[k]); if (e) out[k] = e; }
  return out;
}

/** The stepped choices of a field, with the current value added when it is not among them. */
export function stepChoices(key: FieldKey, current: unknown): (number | string)[] {
  const out = [...(FIELDS[key].suggested ?? [])];
  if ((typeof current === "number" || typeof current === "string") && !out.includes(current)) {
    out.push(current);
    if (typeof current === "number") out.sort((a, b) => Number(a) - Number(b));
  }
  return out;
}

const duration = (s: number) => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${n(s)} s`);
const weightText = (w: number) => (Number.isInteger(w * 4) ? String(w) : w.toFixed(2));
const NAMED: Partial<Record<FieldKey, Record<string, string>>> = {
  worldSeconds: { 120: "Short", 300: "Normal", 600: "Long", 1200: "Marathon" },
};
/** A stepped choice's label: "Normal (5 min)", "every 10 s", "Exact", "2×". */
export function choiceLabel(key: FieldKey, v: number | string | boolean): string {
  if (key === "durationMode") return v === "fixed" ? "Fixed duration" : "Half-life";
  if (typeof v === "boolean") return v ? "Offered" : "Off";
  const named = NAMED[key]?.[String(v)];
  if (typeof v === "number") {
    if (key === "worldSeconds") return named ? `${named} (${duration(v)})` : duration(v);
    if (key === "planningSeconds" || key === "pauseSeconds") return duration(v);
    if (key === "scoreIntervalSeconds") return `every ${duration(v)}`;
    if (key === "driftSeconds") return v === 0 ? "Never" : `every ${duration(v)}`;
    if (key === "peerNoiseVariance") return v === 0 ? "Exact" : `±${Math.round(Math.sqrt(v) * 10) / 10} bits`;
    if (key === "readPriceWeight") return v === 0 ? "Free" : `${weightText(v)}×`;
    return n(v);
  }
  return named ?? v;
}
/** A value in plain words, for summaries and the Review diff: "600 energy", "offered", "never". */
export function formatValue(key: FieldKey, v: unknown): string {
  if (key === "commitClause") return v ? "offered" : "off";
  if (key === "driftSeconds" && v === 0) return "never";
  if (key === "durationMode" && typeof v === "string") return choiceLabel(key, v).toLowerCase();
  if (key === "startingEnergy" && typeof v === "number") return `${n(v)} energy`;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return choiceLabel(key, v);
  return String(v);
}

/**
 * The next game's time in one line (v1's lengthLine; planning and the game's length are never added up): "75 s
 * planning, then a 5 min game" for a fixed game; "1 min planning, then about 5 min (ends at a hidden moment, often
 * after 2 to 12 min)" for a half-life one (the 20%–80% range of its random end).
 */
export function lengthLine(d: Pick<Draft, "planningSeconds" | "worldSeconds" | "durationMode">): string {
  const m = (sec: number) => Math.max(1, Math.round(sec / 60));
  const planning = d.planningSeconds > 0 ? `${duration(d.planningSeconds)} planning, then ` : "";
  if (d.durationMode === "fixed") return `${planning}a ${duration(d.worldSeconds)} game`;
  return `${planning}about ${duration(d.worldSeconds)} (ends at a hidden moment, often after ${m(0.415 * d.worldSeconds)} to ${m(2.32 * d.worldSeconds)} min)`;
}

export interface Change { key: FieldKey | "preset"; label: string; from: string; to: string }
/** The Review section's diff (v1 review): the setup first, then each changed field in page order, as label: before → after. */
export function reviewDiff(saved: { preset: string; draft: Draft }, next: { preset: string; draft: Draft }): Change[] {
  const out: Change[] = [];
  if (saved.preset !== next.preset) out.push({ key: "preset", label: "Setup", from: presetOf(saved.preset).title, to: presetOf(next.preset).title });
  for (const k of SECTIONS.flatMap(s => fieldsOf(s.id))) {
    if (!sameValue(saved.draft[k], next.draft[k])) out.push({ key: k, label: FIELDS[k].label, from: formatValue(k, saved.draft[k]), to: formatValue(k, next.draft[k]) });
  }
  return out;
}
