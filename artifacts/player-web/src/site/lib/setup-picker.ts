/**
 * The room's setup picker and settings (integration plan §1.2; unit-tested): the deployed presets grouped, with the Lab
 * (presets under trial) for admins only; the few settings a room changes for its next game, as the `room.settings`
 * affordance's overrides; and the next game's summary in words.
 */
import type { Preset } from "@workspace/engine/convex/v2/presets.ts";
import { DEFAULT_SCORE_INTERVAL_SECONDS, PEER_NOISE_VARIANCE_OPTIONS, type DurationMode } from "@workspace/engine/convex/v2/duration.ts";
import { BOARDS } from "./rule-gallery.ts";

/** The `room.settings` overrides (the room's `overrides` field). */
export interface Overrides {
  planningSeconds?: number; worldSeconds?: number; startingEnergy?: number;
  durationMode?: DurationMode; scoreIntervalSeconds?: number;
  /** The variance, bits², of each reading of the others' sums while live (owner decision 32). */
  peerNoiseVariance?: number;
  /** v1's paid observation: each object shows as last seen, and a look costs energy (W3 #643). */
  observation?: "free" | "paid";
}

export { PEER_NOISE_VARIANCE_OPTIONS };
/** A noise variance in words: its σ, the "about ±" a reading carries. */
export const noiseWords = (variance: number) => (variance === 0 ? "Exact" : `Blurred by about ${Math.round(Math.sqrt(variance) * 10) / 10} bits`);

/** A preset under trial: the Lab's (`lab-…`) and the local test presets (`test-…`). */
export const isLab = (p: Pick<Preset, "id">) => /^(lab|test)-/.test(p.id);

export interface SetupGroup { label: string; presets: Preset[] }

/** The picker's groups: the setups, then the Lab for an admin (or when the room already plays a Lab preset). */
export function setupGroups(presets: readonly Preset[], who: { admin: boolean; current: string }): SetupGroup[] {
  const lab = presets.filter(p => isLab(p) && (who.admin || p.id === who.current));
  return [{ label: "Setups", presets: presets.filter(p => !isLab(p)) }, ...(lab.length ? [{ label: "Lab (admins only)", presets: lab }] : [])];
}


/** A board said in full where a setup is summed up (the gallery's short titles are for its board picker). */
const BOARD_TITLES: Readonly<Record<string, string>> = { "grid-4-d10": "A 4 × 4 grid of digits", "grid-2-d3": "A 2 × 2 grid of small digits" };

/** A board in words; a variant of one (a trial's "line-q-lenses") is described by the board it plays on. */
function boardTitle(variant: string): string {
  const board = BOARDS.find(b => b.id === variant) ?? BOARDS.find(b => variant.startsWith(`${b.id}-`));
  return BOARD_TITLES[variant] ?? board?.title ?? "A board of its own";
}

/** What a setup plays, in words. */
export function setupBlurb(p: Preset): string {
  const rules = `${p.families.length} kind${p.families.length === 1 ? "" : "s"} of rule`;
  return `${boardTitle(p.variant)}, ${rules}${p.bid ? ", and players bid for the rules they want first" : ""}.`;
}

export interface SettingsForm {
  planningSeconds: string; worldMinutes: string; startingEnergy: string;
  durationMode: DurationMode; scoreIntervalSeconds: string; peerNoiseVariance: string; observation: "free" | "paid";
}
export type FormField = keyof SettingsForm;

const minutes = (s: number) => String(Math.round((s / 60) * 100) / 100);

export function formOf(p: Preset, o: Overrides): SettingsForm {
  return {
    planningSeconds: String(o.planningSeconds ?? p.planningSeconds),
    worldMinutes: minutes(o.worldSeconds ?? p.worldSeconds),
    startingEnergy: String(o.startingEnergy ?? p.startingEnergy),
    durationMode: o.durationMode ?? p.durationMode,
    scoreIntervalSeconds: String(o.scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS),
    peerNoiseVariance: String(o.peerNoiseVariance ?? p.peerNoiseVariance),
    observation: o.observation ?? "free",
  };
}

const num = (s: string): number | null => {
  const t = s.trim().replace(/[−–]/g, "-");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

/**
 * The overrides to send for a form (only what differs from the preset, so a later preset change starts clean), or
 * each field's problem in words. The bounds are the affordance's: planning 5 to 900 whole seconds, a game of 30 to
 * 7,200 seconds (shown in minutes, rounded to whole seconds), starting energy 0 or more.
 */
export function overridesOf(f: SettingsForm, p: Preset): { ok: true; overrides: Overrides } | { ok: false; errors: Partial<Record<FormField, string>> } {
  const errors: Partial<Record<FormField, string>> = {};
  const planning = num(f.planningSeconds), world = num(f.worldMinutes), energy = num(f.startingEnergy);
  if (planning === null || !Number.isInteger(planning) || planning < 5 || planning > 900) errors.planningSeconds = "Planning is 5 to 900 whole seconds.";
  const worldSeconds = world === null ? null : Math.round(world * 60);
  if (worldSeconds === null || worldSeconds < 30 || worldSeconds > 7200) errors.worldMinutes = "A game lasts half a minute to 120 minutes.";
  if (energy === null || energy < 0) errors.startingEnergy = "Starting energy is 0 or more.";
  const interval = num(f.scoreIntervalSeconds), noise = num(f.peerNoiseVariance);
  if (interval === null || !Number.isInteger(interval) || interval < 1 || interval > 3600) errors.scoreIntervalSeconds = "Totals are counted every 1 to 3,600 whole seconds.";
  if (noise === null || !PEER_NOISE_VARIANCE_OPTIONS.includes(noise)) errors.peerNoiseVariance = "The noise's variance is 0, 4, 16, 64 or 256 bits².";
  if (Object.keys(errors).length) return { ok: false, errors };
  const o: Overrides = {};
  if (planning !== p.planningSeconds) o.planningSeconds = planning!;
  if (worldSeconds !== p.worldSeconds) o.worldSeconds = worldSeconds!;
  if (energy !== p.startingEnergy) o.startingEnergy = energy!;
  if (f.durationMode !== p.durationMode) o.durationMode = f.durationMode;
  if (interval !== DEFAULT_SCORE_INTERVAL_SECONDS) o.scoreIntervalSeconds = interval!;
  if (noise !== p.peerNoiseVariance) o.peerNoiseVariance = noise!;
  if (f.observation === "paid") o.observation = "paid";
  return { ok: true, overrides: o };
}

/** "3 or more players · 60 s to plan · 5 min game · 600 ⚡ to start · others' sums blurred (8 bits) · totals every 10 s." */
export function nextGameSummary(p: Preset, o: Overrides): string {
  const length = minutes(o.worldSeconds ?? p.worldSeconds), noise = o.peerNoiseVariance ?? p.peerNoiseVariance;
  const parts = [
    `${p.minPlayers} or more players`,
    ...(p.bid ? [`${p.bid.seconds} s of bidding first`] : []),
    `${o.planningSeconds ?? p.planningSeconds} s to plan`,
    (o.durationMode ?? p.durationMode) === "halfLife" ? `ends at a hidden moment, half of games within ${length} min` : `${length} min game`,
    `${o.startingEnergy ?? p.startingEnergy} ⚡ to start`,
    noise === 0 ? "others' sums exact" : `others' sums blurred (about ±${Math.round(Math.sqrt(noise) * 10) / 10} bits each reading)`,
    `totals every ${o.scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS} s`,
    ...(o.observation === "paid" ? ["players pay to look at the world"] : []),
  ];
  return `${parts.join(" · ")}.`;
}
