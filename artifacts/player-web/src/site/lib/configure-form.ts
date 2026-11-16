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
import { SETUP_NAME_MAX } from "@workspace/v2-affordances";
import { DEFAULT_SCORE_INTERVAL_SECONDS, PEER_NOISE_VARIANCE_OPTIONS, SCORE_INTERVAL_OPTIONS, type DurationMode } from "@workspace/engine/convex/v2/duration.ts";

/** Every value a room's next game can be given, as the page edits it (all present; the overrides are the differences). */
export interface Draft {
  planningSeconds: number; worldSeconds: number; startingEnergy: number;
  durationMode: DurationMode; scoreIntervalSeconds: number; peerNoiseVariance: number;
  readPriceWeight: number; driftSeconds: number; pauseSeconds: number; commitClause: boolean;
  defenceGoals: boolean; penaltyWeight: number;
  startingObjects: number; birthsPerSecond: number; opportunitiesPerSecond: number;
  powerPerSecond: number; fullChargeSeconds: number; stepBudget: number; interactionComputeMs: number;
  excludedFamilies: string[]; bidPricing: "first" | "second"; bidVisibility: "sealed" | "open"; bidDisclosure: "none" | "handicaps" | "all"; bidSeconds: number;
  /** Line turnover (engine docs/engine-v2/retirement-design.md): 0 is off, and 0 births-every is the setup's births. */
  liveCap: number; birthSeconds: number; retiredPoints: "banked" | "dropped"; retiredHolds: boolean;
}
export type FieldKey = keyof Draft;
export type Overrides = Partial<Draft>;

export type SectionId = "setup" | "goals" | "agents" | "energy" | "population" | "time" | "players" | "review";
type FieldSection = Exclude<SectionId, "setup" | "players" | "review">;
export type ControlKind = "number" | "segmented" | "switch" | "checklist";

/** v1's units, limits and docs for one field (game-core FieldDoc + settings-form LIMITS). */
export interface FieldSpec {
  label: string; question: string; meaning: string; consequence: string;
  section: FieldSection; tier: "ask" | "more"; control: ControlKind;
  suggested?: readonly (number | string)[]; unit?: string;
  /** Typed in minutes, stored in seconds (v1: game length, planning, pause). */
  minutes?: boolean;
  limit?: { min: number; max?: number; int?: boolean };
  /** Asked only on these setups (defence goals: grids); elsewhere the question is hidden and never sent. */
  only?: (p: Pick<Preset, "variant">) => boolean;
  /** Shown only on a setup with a bid phase (v1: hidden while bidSeconds is 0). */
  onlyWithBid?: boolean;
}
/** A grid setup (defence goals are dealt on grids only, as in v1). */
const onGrids = (p: Pick<Preset, "variant">) => p.variant.startsWith("grid");

/** The sandbox's per-act limits when the room sets none (lib/v2-sandbox limits.ts DEFAULT_LIMITS). */
export const DEFAULT_STEP_BUDGET = 500_000;
export const DEFAULT_COMPUTE_MS = 2000;
/** v1's pause length when the room sets none (convex/v2/loop.ts DEFAULT_PAUSE_SECONDS). */
export const DEFAULT_PAUSE_SECONDS = 180;
export const READ_PRICE_WEIGHTS: readonly number[] = [0, 0.5, 1, 2, 3, 4];

export const FIELDS: Readonly<Record<FieldKey, FieldSpec>> = {
  excludedFamilies: {
    label: "Rules never dealt", section: "goals", tier: "more", control: "checklist",
    question: "Which rules are never dealt?",
    meaning: "Families of rules the setup deals that are never dealt in this room.",
    consequence: "Excluding more families makes goals more predictable, and at least one family per player must stay.",
  },
  bidSeconds: {
    label: "Bidding time", section: "goals", tier: "ask", control: "number", suggested: [0, 20, 30, 45, 60, 120], unit: "s", limit: { min: 0, max: 600, int: true },
    question: "How long may players bid for rules before the game is dealt?",
    meaning: "Before rules are dealt, each player may bid a share of their own score for the rules they want: the highest bid wins a rule for that player alone, the rest are dealt at random, and zero is no bidding.",
    consequence: "Bidding lets players pay for the rule they want, so a strong rule costs its holder part of their score, and it adds up to this many seconds before planning.",
  },
  bidPricing: {
    label: "Bid price", section: "goals", tier: "more", control: "segmented", suggested: ["first", "second"], onlyWithBid: true,
    question: "What does the winner of a bid pay?",
    meaning: "With first price the winner's handicap is their own bid, and with second price it is the highest bid they beat on that rule, or 1% when nobody else bid on it.",
    consequence: "With second price a player can simply bid what a rule is worth to them, while with first price they must guess what the others will bid and bid a little less.",
  },
  bidVisibility: {
    label: "Bids shown", section: "goals", tier: "more", control: "segmented", suggested: ["sealed", "open"], onlyWithBid: true,
    question: "Can players see each other's bids while bidding?",
    meaning: "Sealed bids are seen only by their bidder until bidding ends, while open bids are seen by every player as they are placed.",
    consequence: "Open bidding becomes a live auction where players raise each other, while sealed bidding is quicker and keeps wishes secret.",
  },
  bidDisclosure: {
    label: "Bid results shown", section: "goals", tier: "more", control: "segmented", suggested: ["none", "handicaps", "all"], onlyWithBid: true,
    question: "What are players told about the others after bidding?",
    meaning: "Own result only tells each player their own result, handicaps shows everyone each winner's handicap, and the whole auction shows every bid and who won which rule; after the game everything is shown.",
    consequence: "Showing more tells players who holds which rule and how much they paid for it, which removes part of the guessing from the game.",
  },
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
  defenceGoals: {
    label: "Defence goals", section: "goals", tier: "more", control: "switch", only: onGrids,
    question: "Does every player also get a defence goal?",
    meaning: "Each player is dealt a second, private goal beside their rule: a kind of board they dislike (a hated number, or one number crowding the board). Their bits on a board are their rule's rarity less how bad the board is for them, weighed by the defence weight.",
    consequence: "Defence goals give everyone something to protect, so a board good for one player can be costly for another; off is v1's default.",
  },
  penaltyWeight: {
    label: "Defence weight", section: "goals", tier: "more", control: "segmented", suggested: [0.5, 1, 2, 4], only: onGrids,
    question: "How much does a defence goal weigh?",
    meaning: "How many bits a board's badness takes off a player's own bits, relative to the rarity their rule gives it (1 is v1's default).",
    consequence: "A heavier weight makes defending matter more than climbing; it only matters with defence goals on.",
  },
  commitClause: {
    label: "Conditional moves", section: "agents", tier: "more", control: "switch",
    question: "May agents make their moves conditional?",
    meaning: "Whether agents may wrap moves in only_if_better, so that the moves apply only if they raise their owner's payoff on that object.",
    consequence: "Offering it makes agents safer and accidents rarer, at a few extra summon bits for each agent that uses it.",
  },
  stepBudget: {
    label: "Steps per act", section: "agents", tier: "more", control: "number", suggested: [100_000, 500_000, 2_000_000], unit: "steps", limit: { min: 1, max: 10_000_000, int: true },
    question: "How much may an agent compute per act?",
    meaning: "The fixed number of computation steps an agent may use per act, so the same agent and input always fit or never do.",
    consequence: "Lowering it allows only simple agents, and raising it allows cleverer agents at the cost of a slower world.",
  },
  interactionComputeMs: {
    label: "CPU limit per act", section: "agents", tier: "more", control: "number", suggested: [500, 1000, 2000], unit: "ms", limit: { min: 1, max: 60_000, int: true },
    question: "What is the CPU safety limit per act?",
    meaning: "A CPU-time safety limit per act behind the step budget, excluding compilation and startup.",
    consequence: "It rarely binds, so changing it seldom matters.",
  },
  powerPerSecond: {
    label: "Power per player", section: "energy", tier: "ask", control: "number", suggested: [4, 8, 16, 32, 64, 128], unit: "energy per second", limit: { min: 0, max: 1_000_000 },
    question: "How much power does each player have?",
    meaning: "Each player's fixed energy income per second of world time, shared between their agents as they choose; the unshared rest refills their own energy for summoning.",
    consequence: "Raising it makes every player's agents act more often, so objects change faster; summons and changes are priced in proportion to it.",
  },
  fullChargeSeconds: {
    label: "Energy fills in", section: "energy", tier: "ask", control: "number", suggested: [10, 30, 60, 120, 240, 300], unit: "s", limit: { min: 1, max: 1_000_000 },
    question: "How long does an empty energy store take to fill?",
    meaning: "Every agent, and each player's own energy, stores at most this many seconds of its power, and income past a full store is lost.",
    consequence: "Shortening it stops energy piling up, so players must spend or re-allocate it, and big agents and big changes need more power kept for them.",
  },
  startingObjects: {
    label: "Starting objects", section: "population", tier: "ask", control: "number", suggested: [3, 10, 40, 80, 160], unit: "objects", limit: { min: 0, max: 1000, int: true },
    question: "How many objects does the world start with?",
    meaning: "How many objects the world holds when it starts running.",
    consequence: "Raising it spreads scores across more objects, and each object changes less often.",
  },
  birthsPerSecond: {
    label: "New objects per second", section: "population", tier: "ask", control: "number", suggested: [0, 1 / 240, 0.1, 0.5, 1], unit: "per second", limit: { min: 0, max: 10 },
    question: "How often does a new object appear?",
    meaning: "How many new random objects appear per second of world time.",
    consequence: "Raising it brings more fresh objects to claim, and totals grow faster.",
  },
  liveCap: {
    label: "Live objects at most", section: "population", tier: "more", control: "number", suggested: [0, 3, 5, 8], unit: "objects", limit: { min: 0, max: 50, int: true },
    question: "How many objects are live at once?",
    meaning: "New in v2 (line turnover): when a new object would make more than this many live, the oldest retires first. No agent acts on a retired object again. 0 means no limit.",
    consequence: "A small number with frequent births keeps fresh objects coming and stops players pulling one object back and forth for the whole game.",
  },
  birthSeconds: {
    label: "A new object every", section: "population", tier: "more", control: "number", suggested: [0, 15, 30, 60, 240], unit: "s", limit: { min: 0, max: 3600, int: true },
    question: "Should a new object arrive on a fixed beat?",
    meaning: "New in v2: one new object every this many seconds of world time, on a regular schedule, in place of the rate above. 0 keeps the setup's births.",
    consequence: "With a live limit, this sets how long each object lives.",
  },
  retiredPoints: {
    label: "Retired objects' points", section: "population", tier: "more", control: "segmented", suggested: ["banked", "dropped"],
    question: "Do a retired object's points still count?",
    meaning: "New in v2: kept, a retired object's points stay in every player's total as they stood when it retired. Dropped, they leave the totals.",
    consequence: "Kept rewards what was built before an object retired; dropped makes only the live objects matter.",
  },
  retiredHolds: {
    label: "Retired objects keep their place", section: "population", tier: "more", control: "switch",
    question: "Does a retired object keep its state taken?",
    meaning: "New in v2: no two objects may be in the same state. On, a retired object still holds its last state, so no other object can move there.",
    consequence: "Off frees retired objects' states for the live ones.",
  },
  opportunitiesPerSecond: {
    label: "World speed", section: "time", tier: "ask", control: "number", suggested: [3, 25, 100, 300, 1000], unit: "acts per second", limit: { min: 0, max: 1000 },
    question: "How fast does the world move?",
    meaning: "The maximum number of acts per second across all agents.",
    consequence: "Lowering it makes each score easier to follow, and raising it makes the world busier and harder to read.",
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
    driftSeconds: p.driftSeconds, pauseSeconds: DEFAULT_PAUSE_SECONDS, commitClause: false, defenceGoals: false, penaltyWeight: 1,
    startingObjects: p.startingObjects, birthsPerSecond: p.economy.birthsPerSecond, opportunitiesPerSecond: p.economy.opportunitiesPerSecond,
    powerPerSecond: p.economy.powerPerSecond, fullChargeSeconds: p.economy.fullChargeSeconds,
    stepBudget: DEFAULT_STEP_BUDGET, interactionComputeMs: DEFAULT_COMPUTE_MS,
    excludedFamilies: [], bidPricing: p.bid?.pricing ?? "first", bidVisibility: "sealed", bidDisclosure: p.bid?.disclosure ?? "none", bidSeconds: p.bid?.seconds ?? 0,
    liveCap: p.turnover?.liveCap ?? 0, birthSeconds: 0, retiredPoints: p.turnover?.retiredPoints ?? "banked", retiredHolds: p.turnover?.retiredHolds ?? true,
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
  for (const k of Object.keys(FIELDS) as FieldKey[]) if ((FIELDS[k].only?.(p) ?? true) && !sameValue(d[k], own[k])) out[k] = d[k];
  return out as Overrides;
}
const sameValue = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-9
  : Array.isArray(a) && Array.isArray(b) ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()) : a === b);
/** A field with no effect on this setup (the bid questions without a bid phase; defence goals off grids). */
/** A field with no effect: the bid questions while there is no bid phase (v1: hidden while bidSeconds is 0). */
export const isHidden = (key: FieldKey, p: Pick<Preset, "bid" | "variant">, d?: Pick<Draft, "bidSeconds">) =>
  (!!FIELDS[key].onlyWithBid && !(d ? d.bidSeconds > 0 : p.bid)) || (FIELDS[key].only ? !FIELDS[key].only!(p) : false);

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
export function draftErrors(d: Draft, p?: Pick<Preset, "families" | "minPlayers">): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  for (const k of Object.keys(FIELDS) as FieldKey[]) { const e = fieldError(k, d[k]); if (e) out[k] = e; }
  // One family per player at least (the server's rule: two players on one family climb the same hill unopposed).
  if (p && p.families.filter(f => !d.excludedFamilies.includes(f)).length < Math.min(p.minPlayers, p.families.length)) out.excludedFamilies = `Leave at least ${p.minPlayers} rule families to deal, one for each player.`;
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
  opportunitiesPerSecond: { 25: "Slow", 100: "Normal", 300: "Fast", 1000: "Max" },
};
/** A stepped choice's label: "Normal (5 min)", "every 10 s", "Exact", "2×". */
const BID_WORDS: Record<string, string> = {
  banked: "Kept", dropped: "Dropped",
  first: "First price", second: "Second price", sealed: "Sealed", open: "Open", none: "Own result only", handicaps: "Everyone's handicap", all: "The whole auction",
};
export function choiceLabel(key: FieldKey, v: number | string | boolean): string {
  if (key === "durationMode") return v === "fixed" ? "Fixed duration" : "Half-life";
  if ((key === "bidPricing" || key === "bidVisibility" || key === "bidDisclosure" || key === "retiredPoints") && typeof v === "string") return BID_WORDS[v] ?? v;
  if (typeof v === "boolean") return key === "defenceGoals" ? (v ? "On: everyone" : "Off") : key === "retiredHolds" ? (v ? "On" : "Off") : v ? "Offered" : "Off";
  const named = NAMED[key]?.[String(v)];
  if (typeof v === "number") {
    if (key === "worldSeconds") return named ? `${named} (${duration(v)})` : duration(v);
    if (key === "planningSeconds" || key === "pauseSeconds") return duration(v);
    if (key === "scoreIntervalSeconds") return `every ${duration(v)}`;
    if (key === "driftSeconds") return v === 0 ? "Never" : `every ${duration(v)}`;
    if (key === "bidSeconds") return v === 0 ? "No bidding" : duration(v);
    if (key === "peerNoiseVariance") return v === 0 ? "Exact" : `±${Math.round(Math.sqrt(v) * 10) / 10} bits`;
    if (key === "readPriceWeight") return v === 0 ? "Free" : `${weightText(v)}×`;
    if (key === "penaltyWeight") return v === 0.5 ? "½" : n(v);
    if (key === "opportunitiesPerSecond") return named ? `${named} (${n(v)}/s)` : `${n(v)}/s`;
    if (key === "birthsPerSecond") return v === 0 ? "None" : v < 1 ? `1 every ${n(Math.round(1 / v))} s` : `${n(v)}/s`;
    if (key === "fullChargeSeconds") return duration(v);
    if (key === "liveCap") return v === 0 ? "No limit" : n(v);
    if (key === "birthSeconds") return v === 0 ? "The setup's" : `every ${duration(v)}`;
    if (key === "powerPerSecond") return `${n(v)}/s`;
    return n(v);
  }
  return named ?? v;
}
/** A value in plain words, for summaries and the Review diff: "600 energy", "offered", "never". */
export function formatValue(key: FieldKey, v: unknown): string {
  if (key === "excludedFamilies" && Array.isArray(v)) return v.length ? `${v.length} rule${v.length === 1 ? "" : "s"}` : "none";
  if (key === "commitClause") return v ? "offered" : "off";
  if (key === "defenceGoals") return v ? "every player" : "off";
  if (key === "driftSeconds" && v === 0) return "never";
  if (key === "durationMode" && typeof v === "string") return choiceLabel(key, v).toLowerCase();
  if (key === "startingEnergy" && typeof v === "number") return `${n(v)} energy`;
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return choiceLabel(key, v);
  return String(v);
}

/**
 * The next game's time in one line (v1's lengthLine; planning and the game's length are never added up): "75 s
 * planning, then a 5 min game" for a fixed game; "1 min planning, then about 5 min (ends at a hidden moment, often
 * after 2 to 12 min)" for a half-life one (v1's range: about the 25th to the 80th percentile of its random end).
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

/** A saved setup as `setups.get` returns it (the caller's own; v1's user setups). */
export interface SavedSetup { setupId: string; name: string; preset: string; overrides: Record<string, unknown>; ownerName?: string; mine?: boolean }

/**
 * What Save sends to `room.settings`: the saved setup's id while the page holds exactly that setup (the room then
 * shows its name, v1's owner.settings({setupId})); otherwise the preset (when it changes) and the overrides that
 * differ from it (a change by hand: the room shows no setup).
 */
export function saveArgs(next: { preset: string; draft: Draft }, roomPreset: string, loaded: SavedSetup | null): { setupId: string } | { preset?: string; overrides: Overrides } {
  if (loaded && holdsSetup(next, loaded)) return { setupId: loaded.setupId };
  return { ...(next.preset !== roomPreset ? { preset: next.preset } : {}), overrides: overridesFor(next.draft, presetOf(next.preset)) };
}
/** Whether the page holds exactly this saved setup: its preset, and every value as the setup gives it (a set as a set). */
export function holdsSetup(next: { preset: string; draft: Draft }, s: SavedSetup): boolean {
  if (s.preset !== next.preset) return false;
  const theirs = draftOf(presetOf(s.preset), s.overrides);
  return (Object.keys(FIELDS) as FieldKey[]).every(k => sameValue(next.draft[k], theirs[k]));
}

/** Why a setup name is refused (v1's words), or null. */
export function setupNameProblem(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return !name ? "Give the setup a name." : name.length > SETUP_NAME_MAX ? `At most ${SETUP_NAME_MAX} characters.` : null;
}
