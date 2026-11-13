/**
 * The words of the My agents panel (docs/energy-model.md §2, §6, §7), kept pure so they can be tested: every number the
 * panel shows is written as a short sentence ("Energy 42 ⚡", "Spent 310 ⚡ on 25 acts: 120 reading, 190 changing").
 * A sentence is a list of segments: plain text, or a glossary term (`{ term, text }`) that the panel renders as a hover
 * <Term>. `plain` flattens a sentence to text for titles, aria labels and tests.
 */
import { SCORE_WORDS, type GlossaryId } from "@workspace/ui-kit/core";

export type Seg = string | { term: GlossaryId; text: string };

export const plain = (segs: readonly Seg[]): string => segs.map(s => (typeof s === "string" ? s : s.text)).join("");

/** One decimal at most, thousands separated, a real minus sign: 12.4, 16, −12, 1,200. */
export function num(x: number): string {
  const v = Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
  return (v === 0 ? 0 : v).toLocaleString("en-US", { maximumFractionDigits: 1 }).replace("-", "−");
}
/** An amount of energy: "42 ⚡", "−12 ⚡" (never "bits": that word is kept for ✨ rarity; ui-kit SCORE_WORDS). */
export const bits = (x: number): string => `${num(x)} ${SCORE_WORDS.energyUnit}`;
/** "16 ⚡/s": energy per world second. */
export const perSecond = (x: number): string => `${num(x)} ${SCORE_WORDS.energyUnit}/s`;
/** A share from 0 to 1 as a percentage: 25%, 12.5%. */
export const percent = (share: number): string => `${Math.round(share * 1000) / 10}%`;
const acts = (n: number) => `${n} act${n === 1 ? "" : "s"}`;

/**
 * What an agent is doing now (energy ≤ 0: waiting for income; else eligible: can act). "limit" (positive energy, not
 * eligible) was the per-agent turn limit removed on 11 Nov 2026: the engine no longer reports it, so the legend has no
 * row for it; the state stays for an observation from an older engine.
 */
export type AgentState = "can" | "waiting" | "limit";
export const agentState = (a: { energy: number; eligible: boolean }): AgentState => (a.energy <= 0 ? "waiting" : a.eligible ? "can" : "limit");
/** The timeline lane colour for each state: green can act, dashed waiting for income, grey at its turn limit. */
/**
 * `income` (the agent's energy per second), when given: an agent overdrawn by at most two seconds of it is working
 * (it spends as fast as it earns), so its lane is not the waiting colour; an all-orange timeline read as "is it stuck?".
 */
export const laneKind = (a: { energy: number; eligible: boolean }, income?: number): "ok" | "cool" | "idle" =>
  a.energy <= 0 && income !== undefined && income > 0 && -a.energy <= 2 * income ? "ok" : ({ can: "ok", waiting: "cool", limit: "idle" } as const)[agentState(a)];
export const STATE_LEGEND = [
  { kind: "ok", label: "acting (energy above 0, or spending it as fast as it comes in)" },
  { kind: "cool", label: "waiting for income (overdrawn by more than 2 s of it)" },
] as const;

/** The status beside an agent's name; `wait` is the world seconds until its energy is above 0 again. */
export function statusText(state: AgentState, ended: boolean, wait: number): string {
  const text = state === "waiting" ? "waiting for income" : state === "can" ? (ended ? "could act" : "can act now") : "at its turn limit";
  return (ended ? "at the end: " : "") + text + (state === "waiting" && !ended && Number.isFinite(wait) && wait > 0 ? ` (about ${num(wait)} s)` : "");
}

/** The god's own line at the top. `total` is the whole budget (energy per world second), `allocated` the share (0 to 1) given to agents. */
export function yourPowerLine({ total, allocated, income, energy, settling }: { total: number; allocated: number; income: number; energy: number; /** The split is known to be out of date (allocationSettled): it is not shown. */ settling?: boolean }): Seg[] {
  if (settling) return [`Your `, { term: "power", text: "power" }, `: ${perSecond(total)} — your split is updating after the change you just made`];
  const own = Math.max(0, 1 - allocated);
  const refill: Seg[] = own > 0
    ? [`${percent(own)} (${perSecond(income)}) refills your `, { term: "energy", text: "energy" }, ` (${bits(energy)}) for summoning`]
    : ["nothing is left to refill your ", { term: "energy", text: "energy" }, ` (${bits(energy)}) for summoning`];
  return [`Your `, { term: "power", text: "power" }, `: ${perSecond(total)} — ${percent(Math.min(1, allocated))} to your agents, `, ...refill];
}

/**
 * Whether the player's allocated share agrees with the shares of the agents listed beside it. The two come from two
 * subscriptions, so for a moment after a destroy (or a new share) the total still counts an agent that is gone: the
 * line then would state a figure known to be stale ("75% to your agents" with one 50% agent left). True when a share
 * is unknown (a game without power shares): nothing can be said to disagree.
 */
export function allocationSettled(allocated: number, shares: readonly (number | undefined)[]): boolean {
  if (shares.some(s => s === undefined)) return true;
  return Math.abs(allocated - shares.reduce<number>((n, s) => n + (s ?? 0), 0)) < 0.005;
}

/** "Power share 25% · earns 16 ⚡/s". */
export const shareLine = (share: number, income: number): Seg[] => [{ term: "power-share", text: "Power share" }, ` ${percent(share)} · earns ${perSecond(income)}`];

/** "Energy 42 ⚡" or, at 0 or below, "Energy −12 ⚡: waiting for income". */
export function energyLine(energy: number): Seg[] {
  // The wait is said by the line beside it (energy-capacity.ts agentDebtLine) where the game has capacities.
  return [{ term: "agent-energy", text: "Energy" }, ` ${bits(energy)}` + (energy <= 0 ? ": waiting for income" : "")];
}
/** How many seconds of its income the energy holds, or null with no income. Negative energy holds none. */
export function runwaySeconds(energy: number, income: number): number | null {
  return income > 0 ? Math.max(0, energy) / income : null;
}
/** The energy meter is full at this many seconds of income. */
export const RUNWAY_FULL_SECONDS = 10;
export const runwayFraction = (seconds: number): number => Math.min(1, Math.max(0, seconds) / RUNWAY_FULL_SECONDS);
/** What the meter shows, in words (also its tooltip). */
export function runwayText(energy: number, income: number): string {
  const s = runwaySeconds(energy, income);
  if (s === null) return "No income, so no way to refill.";
  return `Holds ${num(s)} s of its income. The bar is full at ${RUNWAY_FULL_SECONDS} s or more; empty means it is waiting for income.`;
}

/** "Summoned for 84 ⚡ (paid once)". */
export const summonLine = (cost: number): Seg[] => [{ term: "summon", text: "Summoned" }, ` for ${bits(cost)} (paid once)`];

/** "Spent 310 ⚡ on 25 acts: 120 reading, 190 changing" (energy; the split only when the engine reports spentRead). */
export function spentLine(spent: number, spentRead: number | undefined, actCount: number): Seg[] {
  const head = `Spent ${bits(spent)} on ${acts(actCount)}`;
  if (spentRead === undefined || !Number.isFinite(spentRead)) return [head];
  const read = Math.min(spent, Math.max(0, spentRead));
  return [head + ": ", `${num(read)} `, { term: "read-bits", text: "reading" }, `, ${num(spent - read)} `, { term: "change-cost", text: "changing" }];
}
/** "Actual average 12.4 ⚡ per act (estimate was 10.1)". */
export function actualLine(spent: number, actCount: number, estimate: number): Seg[] {
  return actCount > 0 ? [`Actual average ${bits(spent / actCount)} per act (estimate was ${num(estimate)})`] : [`No acts yet (estimate ${bits(estimate)} per act)`];
}
/** The summon-time estimate: "Estimated at summon: 10.1 ⚡ per act (6 reading + 4.1 changing)". */
export function estimateLine(estimate: number, breakdown: { read?: number; change?: number } | undefined): Seg[] {
  const ok = (x: number | undefined): x is number => typeof x === "number" && Number.isFinite(x);
  const parts: Seg[] = ok(breakdown?.read) && ok(breakdown?.change)
    ? [` (${num(breakdown.read)} `, { term: "read-bits", text: "reading" }, ` + ${num(breakdown.change)} `, { term: "change-cost", text: "changing" }, ")"] : [];
  return [`Estimated at summon: ${bits(estimate)} per act`, ...parts];
}
/** "3 skipped (looked, did nothing; cheap)". */
export function skipLine(skips: number): Seg[] {
  return skips > 0 ? [`${skips} `, { term: "skip", text: "skipped" }, " (looked, did nothing; cheap)"] : ["No ", { term: "skip", text: "skips" }, " yet (a skip is a turn that looked and did nothing; cheap)"];
}

/** The slider's caption while a share is being edited: what the player's own share would become. */
export function afterShareLine(newShare: number, agentShare: number, allocated: number, total: number): string {
  const own = Math.max(0, 1 - (allocated - agentShare + newShare));
  return `Then ${percent(newShare)} (${perSecond(newShare * total)}) goes to this agent and ${percent(own)} (${perSecond(own * total)}) stays with you.`;
}

