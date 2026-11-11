/**
 * The words for energy capacity (docs/energy-model.md §6.1), kept pure so they can be tested: every energy store holds
 * at most its power × the game's `fullChargeSeconds`, income past a full store is wasted, and a store whose power falls
 * loses what it holds above its new limit. The panel only calls these when the observation carries a capacity (a game
 * started before the rule has none, and looks as it did).
 */
import { energyCapacity, roundShare, secondsToFull } from "@workspace/game-core";
import { bits, num, type Seg } from "./agent-labels.ts";

/** A store that is this close to its limit counts as full (settled balances are floats). */
const EPSILON = 1e-6;

/** "full in 23 s", "full in 5 min": whole seconds (never 0 while it is still filling), minutes from two minutes on. */
export function fullIn(seconds: number): string {
  return `full in ${duration(seconds)}`;
}
function duration(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds - EPSILON));
  return s < 120 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** What a store is doing: in debt (0 or below), filling, full with its income wasted, or idle (no income). */
export type StoreState = "debt" | "filling" | "full" | "idle";
export function storeState(energy: number, income: number, capacity: number): StoreState {
  if (energy <= 0) return "debt";
  if (!(income > 0)) return "idle";
  return energy >= capacity - EPSILON ? "full" : "filling";
}

/** "Energy 336 of 480 ⚡". */
export const storedLine = (energy: number, capacity: number): Seg[] => [{ term: "agent-energy", text: "Energy" }, ` ${num(energy)} of ${bits(capacity)}`];

/** How full the meter is, from 0 to 1. */
export const storeFraction = (energy: number, capacity: number): number => (capacity > 0 ? Math.min(1, Math.max(0, energy) / capacity) : 0);

export const FULL_TEXT = "Full: its income is being wasted. Use it or re-allocate it.";
/** Beside the meter: "full in 9 s", the full warning, or "no income". */
export function fillText(energy: number, income: number, capacity: number): string {
  const state = storeState(energy, income, capacity);
  if (state === "full") return FULL_TEXT;
  return income > 0 ? fullIn(secondsToFull(energy, income, capacity)) : "no income";
}

/** "at most 240 ⚡ (now 480)" or "nothing (now at most 480 ⚡)". */
const holds = (next: number, now: number): string => (next > 0 ? `at most ${bits(next)} (now ${num(now)})` : `nothing (now at most ${bits(now)})`);
/** What a store holding `energy` loses when its limit becomes `capacity`: 0 unless it shows as a number. */
const lost = (energy: number, capacity: number): number => (num(energy - capacity) === "0" ? 0 : Math.max(0, energy - capacity));

/**
 * Under the power-share control, before the player presses Set: what the new share does to this agent's limit and to
 * the player's own (one sentence each; a loss is named only when there is one). Empty for a game without the rule.
 */
export function shareCapacityLines({ newShare, agentShare, allocated, total, fullChargeSeconds, agentEnergy, ownEnergy }: {
  newShare: number; agentShare: number; allocated: number; total: number; fullChargeSeconds: number | undefined; agentEnergy: number; ownEnergy: number;
}): string[] {
  if (fullChargeSeconds === undefined) return [];
  const cap = (share: number) => energyCapacity(Math.max(0, share) * total, fullChargeSeconds);
  const agentNow = cap(agentShare), agentNext = cap(newShare);
  const ownNow = cap(1 - allocated), ownNext = cap(roundShare(1 - (allocated - agentShare + newShare)));   // rounded as the engine does: a full allocation is exactly 0
  const agentLoss = lost(agentEnergy, agentNext), ownLoss = lost(ownEnergy, ownNext);
  const agent = `This agent will hold ${holds(agentNext, agentNow)}${agentLoss > 0 ? `: ${bits(agentLoss)} it holds above that will be lost` : ""}.`;
  const own = ownNext > 0
    ? `Your own energy will hold ${holds(ownNext, ownNow)}${ownLoss > 0 ? `: ${bits(ownLoss)} above that will be lost` : ""}.`
    : `Your own energy will hold ${holds(ownNext, ownNow)}: ${ownLoss > 0 ? `the ${bits(ownLoss)} you hold will be lost, and ` : ""}you cannot summon until you take power back.`;
  return [agent, own];
}

/** The player's own energy against its limit, under their power line. */
export function ownEnergyLine({ energy, income, capacity }: { energy: number; income: number; capacity: number }): Seg[] {
  const term: Seg = { term: "energy", text: "energy" };
  if (!(capacity > 0)) return ["Your ", term, " can hold nothing: all your power is with your agents. You cannot summon until you take some power back."];
  const head: Seg[] = ["Your ", term, `: ${num(energy)} of ${bits(capacity)}. `];
  if (energy >= capacity - EPSILON) return [...head, "It is full: its income is being wasted. Summon with it or give your agents more power."];
  return [...head, `It fills in ${duration(secondsToFull(energy, income, capacity))} and then stops.`];
}
