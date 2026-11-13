/**
 * The words for energy capacity (docs/energy-model.md §6.1), kept pure so they can be tested: every energy store holds
 * at most its power × the game's `fullChargeSeconds`, income past a full store is wasted, and what a store holds above
 * a lowered limit moves with the power to the store that gained it (nothing is lost by a re-allocation). The panel only calls these when the observation carries a capacity (a game
 * started before the rule has none, and looks as it did).
 *
 * Debt (§7.2): an account below zero is overdrawn. The words are always "overdrawn", never "owes" (a first-time player
 * read "Owes 1.4 ⚡" as "It owes energy? To whom?"). An agent may be overdrawn by at most its capacity; the amount moves
 * to the player with its power (all of it when it is destroyed, the fraction of the power taken when its share is
 * lowered), and an overdrawn player cannot summon until their own income has covered it. Raising an agent's share while
 * the player is overdrawn moves the same fraction of the player's amount as of their unallocated power onto the agent
 * (game-core `movePower`).
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

/** How far a balance is overdrawn: 0 unless it shows as a negative number. */
export const owes = (energy: number): number => (energy < 0 && num(energy) !== "0" ? -energy : 0);
/**
 * How an agent below zero stands. Agents normally spend as fast as they earn, so a small overdraft is the routine
 * state of a working agent, not an error (three players asked "am I in trouble?" at red text):
 * - "working": overdrawn by at most WORKING_SECONDS of its income;
 * - "waiting": more than that, but it acts again within STUCK_SECONDS;
 * - "stuck": it cannot act for a long time (more than STUCK_SECONDS of income, or no income at all).
 */
export type Overdraft = "none" | "working" | "waiting" | "stuck";
export const WORKING_SECONDS = 2, STUCK_SECONDS = 10;
export function overdraft(energy: number, income: number): Overdraft {
  const owed = owes(energy);
  if (owed === 0) return "none";
  if (!(income > 0)) return "stuck";
  const seconds = owed / income;
  return seconds <= WORKING_SECONDS ? "working" : seconds > STUCK_SECONDS ? "stuck" : "waiting";
}
/**
 * An agent that acts and holds less than WORKING_SECONDS of its income spends its energy as it earns it: its store
 * will not fill, so "full in 30 s" beside it is false. (One that has not acted yet is filling.)
 */
export function spendsAsItEarns(a: { energy: number; income: number; acts?: number }): boolean {
  // Within two seconds of income either side of 0: deeper in debt it is waiting or stuck, which its own line says.
  return a.income > 0 && (a.acts ?? 0) > 0 && a.energy <= WORKING_SECONDS * a.income && a.energy >= -WORKING_SECONDS * a.income;
}
/** Red is for "stuck" only; everything else, a full store included, is neutral. */
export const overdraftTone = (state: Overdraft): "neutral" | "alarm" => (state === "stuck" ? "alarm" : "neutral");
export const WORKING_TEXT = "Working: it spends energy as fast as it earns it.";

/** The header's energy when the player is overdrawn: "overdrawn by 312 ⚡" (null when they are not). */
export const owedText = (energy: number): string | null => (owes(energy) > 0 ? `overdrawn by ${bits(owes(energy))}` : null);
/** Under an agent's energy: "Overdrawn by 120 ⚡; it waits for income." (the wait only with a power share to earn from). Null when it is not overdrawn or the game has no capacity. */
export function agentDebtLine(energy: number, capacity: number | undefined, income?: number): string | null {
  if (capacity === undefined || owes(energy) === 0) return null;
  if (income !== undefined && overdraft(energy, income) === "working") return WORKING_TEXT;
  return `Overdrawn by ${bits(owes(energy))}${capacity > 0 ? "; it waits for income." : ""}`;
}
/** The detail behind that line (a tooltip, never the main line): how far an agent may be overdrawn. Null with no power or no capacity. */
export function agentDebtDetail(capacity: number | undefined): string | null {
  return capacity !== undefined && capacity > 0 ? `Its acts cost more energy than it held. It may be overdrawn by at most ${num(capacity)}, and it acts again once its income has covered this.` : null;
}

/** When an overdrawn player can summon again: once `income` (energy per world second) has covered `owed`. */
const repaid = (owed: number, income: number): string =>
  income > 0 ? `until your income has covered it (about ${duration(owed / income)})` : "until you keep some power for yourself";
/** The player's own energy after `moved` of debt land on it, with `income` from then on. */
function ownAfterDebt(ownEnergy: number, moved: number, income: number, paid: string): string {
  const after = ownEnergy - moved;
  return owes(after) > 0
    ? `Your own energy will be ${bits(after)}, and you cannot summon ${repaid(-after, income)}.`
    : `${paid}${paid ? " " : " and is paid from it "}(${bits(after)} left).`;
}
/** "206" of the 412 owed, or "all" of them. */
const part = (moved: number, debt: number): string => (num(moved) === num(debt) ? "all" : num(moved));

/**
 * In the Destroy confirmation: what destroying an overdrawn agent does to the player's own energy (the whole amount moves
 * to them, and its share of the power comes back as their income). Null when it is not overdrawn or the game has no capacity.
 */
export function destroyDebtLine({ agentEnergy, agentShare, ownEnergy, allocated, total, fullChargeSeconds }: {
  agentEnergy: number; agentShare: number; ownEnergy: number; allocated: number; total: number; fullChargeSeconds: number | undefined;
}): string | null {
  const debt = owes(agentEnergy);
  if (fullChargeSeconds === undefined || debt === 0) return null;
  const income = Math.max(0, roundShare(1 - (allocated - agentShare))) * total;
  const head = `This agent is overdrawn by ${bits(debt)}: if you destroy it, that moves to your own energy`;
  return owes(ownEnergy - debt) > 0 ? `${head}. ${ownAfterDebt(ownEnergy, debt, income, "")}` : `${head}${ownAfterDebt(ownEnergy, debt, income, "")}`;
}

/** The first words of the preview when a new share leaves the player's own store at 0. */
export const LEAVES_NOTHING = "This leaves you nothing for summoning.";
/** "at most 240 ⚡ (now 480)" or "nothing (now at most 480 ⚡)". */
const holds = (next: number, now: number): string => (next > 0 ? `at most ${bits(next)} (now ${num(now)})` : `nothing (now at most ${bits(now)})`);
/** What leaves a store holding `energy` when its limit becomes `capacity` (it moves with the power: game-core movePower): 0 unless it shows as a number. */
const lost = (energy: number, capacity: number): number => (num(energy - capacity) === "0" ? 0 : Math.max(0, energy - capacity));

/**
 * Under the power-share control, before the player presses Set: what the new share does to this agent's limit and to
 * the player's own (one sentence each; what moves with the power is named only when something does), then, when debt moves with the power,
 * how much of it and what that does (lowering the share of an overdrawn agent; raising one while the player is overdrawn).
 * Empty for a game without the rule.
 */
export function shareCapacityLines({ newShare, agentShare, allocated, total, fullChargeSeconds, agentEnergy, ownEnergy }: {
  newShare: number; agentShare: number; allocated: number; total: number; fullChargeSeconds: number | undefined; agentEnergy: number; ownEnergy: number;
}): string[] {
  if (fullChargeSeconds === undefined) return [];
  const cap = (share: number) => energyCapacity(Math.max(0, share) * total, fullChargeSeconds);
  const agentNow = cap(agentShare), agentNext = cap(newShare);
  const ownNow = cap(1 - allocated), ownNext = cap(roundShare(1 - (allocated - agentShare + newShare)));   // rounded as the engine does: a full allocation is exactly 0
  const agentLoss = lost(agentEnergy, agentNext), ownLoss = lost(ownEnergy, ownNext);
  const agent = `This agent will hold ${holds(agentNext, agentNow)}${agentLoss > 0 ? `: the ${bits(agentLoss)} it holds above that move to your own energy` : ""}.`;
  const own = ownNext > 0
    ? `Your own energy will hold ${holds(ownNext, ownNow)}${ownLoss > 0 ? `: the ${bits(ownLoss)} you hold above that move to this agent` : ""}.`
    : `${LEAVES_NOTHING} Your own energy will hold ${holds(ownNext, ownNow)}: ${ownLoss > 0 ? `the ${bits(ownLoss)} you hold move to this agent, and ` : ""}you cannot summon until you take power back.`;
  // A share that leaves the player nothing says so first.
  const lines = ownNext > 0 ? [agent, own] : [own, agent];
  const agentDebt = owes(agentEnergy), ownDebt = owes(ownEnergy);
  if (newShare < agentShare && agentDebt > 0) {
    const moved = agentDebt * (agentShare - newShare) / agentShare;
    lines.push(`It is overdrawn by ${bits(agentDebt)}: ${part(moved, agentDebt)} of that moves to you. ${ownAfterDebt(ownEnergy, moved, Math.max(0, roundShare(1 - (allocated - agentShare + newShare))) * total, "It is paid from your own energy")}`);
  } else if (newShare > agentShare && ownDebt > 0) {
    const unallocated = roundShare(1 - allocated);
    const moved = ownDebt * Math.min(1, unallocated > 0 ? (newShare - agentShare) / unallocated : 1);
    const after = agentEnergy - moved;
    lines.push(`You are overdrawn by ${bits(ownDebt)}: ${part(moved, ownDebt)} of that moves to this agent.${owes(after) > 0 ? ` It will be overdrawn by ${bits(-after)} and wait for its income to cover it.` : ""}`);
  }
  return lines;
}

/**
 * The player's own store is full and they have exactly one agent: what they can do with the power, the controls one
 * press away, without telling them to spend for its own sake. (With two or more agents the neutral sentence stands.)
 */
export const fullStoreOneAgent = (name: string): string => `Your energy is full. Give ${name} more power so it acts more often, or add another ready-made agent.`;
/**
 * Whether that advice (and its "Give NAME more power" button) is shown: only to a player who can change the share
 * right now. In a replay, as a spectator or seen as another player the neutral line stands (the button would lead to
 * a control that is not there).
 */
export const fullStoreAdvice = (s: { ended: boolean; agents: number; energy: number; capacity: number; canAllocate: boolean; hasShare: boolean; seenAs: boolean }): boolean =>
  !s.ended && !s.seenAs && s.canAllocate && s.hasShare && s.agents === 1 && ownStoreFull(s.energy, s.capacity);
/** In the Destroy confirmation: the energy the agent holds goes back to the player with its power. Null when it holds none (or is overdrawn: destroyDebtLine), and in a game without capacity, where the engine returns nothing. */
export function destroyReturnsLine(agentEnergy: number, fullChargeSeconds: number | undefined): string | null {
  const held = Math.round(agentEnergy);
  return fullChargeSeconds !== undefined && held >= 1 ? `The ${bits(held)} it holds ${held === 1 ? "comes" : "come"} back to you.` : null;
}
/** The tooltip on the player's own full store: the precise rule, never an instruction in the main line. */
export const OWN_FULL_DETAIL = "A full store keeps no more: the income that would refill it is not saved up. That costs you nothing unless you want to summon a dearer agent later; to use that power instead, give an agent a larger share.";
/** Whether the player's own store is full (the line then carries OWN_FULL_DETAIL as its tooltip). */
export const ownStoreFull = (energy: number, capacity: number): boolean => capacity > 0 && energy >= capacity - EPSILON;
/** The player's own energy against its limit, under their power line; below zero, how far they are overdrawn and when they can summon again. */
export function ownEnergyLine({ energy, income, capacity }: { energy: number; income: number; capacity: number }): Seg[] {
  const term: Seg = { term: "energy", text: "energy" };
  const owed = owes(energy);
  if (owed > 0) return income > 0
    ? [`You are overdrawn by ${bits(owed)}: you cannot summon ${repaid(owed, income)}.`]
    : [`You are overdrawn by ${bits(owed)} and keep no power for yourself: take some power back from an agent to cover it.`];
  if (!(capacity > 0)) return ["Your ", term, " can hold nothing: all your power is with your agents. You cannot summon until you take some power back."];
  const head: Seg[] = ["Your ", term, `: ${num(energy)} of ${bits(capacity)}. `];
  // A neutral fact, with no instruction to spend: "its income is being wasted. Summon with it…" led two first-time
  // players to pay for looks and summon copies they did not need. The detail is the tooltip's (OWN_FULL_DETAIL).
  if (energy >= capacity - EPSILON) return ["Your ", term, ` is full (${bits(capacity)}). Energy pays for summoning; your agents run on their own share of your power.`];
  return [...head, `It fills in ${duration(secondsToFull(energy, income, capacity))} and then stops.`];
}
