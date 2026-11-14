/**
 * The room's setup picker and settings (integration plan §1.2; unit-tested): the deployed presets grouped, with the Lab
 * (presets under trial) for admins only; the few settings a room changes for its next game, as the `room.settings`
 * affordance's overrides; and the next game's summary in words.
 */
import type { Preset } from "@workspace/engine/convex/v2/presets.ts";

/** The `room.settings` overrides (the room's `overrides` field). */
export interface Overrides { planningSeconds?: number; worldSeconds?: number; startingEnergy?: number }

/** A preset under trial: the Lab's (`lab-…`) and the local test presets (`test-…`). */
export const isLab = (p: Pick<Preset, "id">) => /^(lab|test)-/.test(p.id);

export interface SetupGroup { label: string; presets: Preset[] }

/** The picker's groups: the setups, then the Lab for an admin (or when the room already plays a Lab preset). */
export function setupGroups(presets: readonly Preset[], who: { admin: boolean; current: string }): SetupGroup[] {
  const lab = presets.filter(p => isLab(p) && (who.admin || p.id === who.current));
  return [{ label: "Setups", presets: presets.filter(p => !isLab(p)) }, ...(lab.length ? [{ label: "Lab (admins only)", presets: lab }] : [])];
}

const BOARD: Record<string, string> = { "line-z": "Whole-number lines", "line-q": "Lines with fractions", "line-z4": "Four whole-number lines per object" };

/** What a setup plays, in words. */
export function setupBlurb(p: Preset): string {
  const rules = `${p.families.length} kind${p.families.length === 1 ? "" : "s"} of rule`;
  return `${BOARD[p.variant] ?? p.variant}, ${rules}${p.bid ? ", and players bid for the rules they want first" : ""}.`;
}

export interface SettingsForm { planningSeconds: string; worldMinutes: string; startingEnergy: string }
export type FormField = keyof SettingsForm;

const minutes = (s: number) => String(Math.round((s / 60) * 100) / 100);

export function formOf(p: Preset, o: Overrides): SettingsForm {
  return {
    planningSeconds: String(o.planningSeconds ?? p.planningSeconds),
    worldMinutes: minutes(o.worldSeconds ?? p.worldSeconds),
    startingEnergy: String(o.startingEnergy ?? p.startingEnergy),
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
  if (Object.keys(errors).length) return { ok: false, errors };
  const o: Overrides = {};
  if (planning !== p.planningSeconds) o.planningSeconds = planning!;
  if (worldSeconds !== p.worldSeconds) o.worldSeconds = worldSeconds!;
  if (energy !== p.startingEnergy) o.startingEnergy = energy!;
  return { ok: true, overrides: o };
}

/** "3 or more players · 60 s to plan · 5 min game · 600 ⚡ to start." */
export function nextGameSummary(p: Preset, o: Overrides): string {
  const parts = [
    `${p.minPlayers} or more players`,
    ...(p.bid ? [`${p.bid.seconds} s of bidding first`] : []),
    `${o.planningSeconds ?? p.planningSeconds} s to plan`,
    `${minutes(o.worldSeconds ?? p.worldSeconds)} min game`,
    `${o.startingEnergy ?? p.startingEnergy} ⚡ to start`,
  ];
  return `${parts.join(" · ")}.`;
}
