/**
 * The words of the My agents panel (docs/energy-model.md §2, §6, §7), kept pure so they can be tested: every number the
 * panel shows is written as a short sentence ("Energy 42 bits", "Spent 310 bits on 25 acts: 120 reading, 190 changing").
 * A sentence is a list of segments: plain text, or a glossary term (`{ term, text }`) that the panel renders as a hover
 * <Term>. `plain` flattens a sentence to text for titles, aria labels and tests.
 */
import type { GlossaryId } from "@workspace/ui-kit";

export type Seg = string | { term: GlossaryId; text: string };

export const plain = (segs: readonly Seg[]): string => segs.map(s => (typeof s === "string" ? s : s.text)).join("");

/** One decimal at most, thousands separated, a real minus sign: 12.4, 16, −12, 1,200. */
export function num(x: number): string {
  const v = Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
  return (v === 0 ? 0 : v).toLocaleString("en-US", { maximumFractionDigits: 1 }).replace("-", "−");
}
/** "42 bits", "1 bit", "−12 bits". */
export const bits = (x: number): string => `${num(x)} ${num(x) === "1" ? "bit" : "bits"}`;
/** "16 bits/s": bits per world second. */
export const perSecond = (x: number): string => `${num(x)} bits/s`;
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
export const laneKind = (a: { energy: number; eligible: boolean }): "ok" | "cool" | "idle" => ({ can: "ok", waiting: "cool", limit: "idle" } as const)[agentState(a)];
export const STATE_LEGEND = [
  { kind: "ok", label: "can act now (energy above 0)" },
  { kind: "cool", label: "waiting for income (energy 0 or below)" },
] as const;

/** The status beside an agent's name; `wait` is the world seconds until its energy is above 0 again. */
export function statusText(state: AgentState, ended: boolean, wait: number): string {
  const text = state === "waiting" ? "waiting for income" : state === "can" ? (ended ? "could act" : "can act now") : "at its turn limit";
  return (ended ? "at the end: " : "") + text + (state === "waiting" && !ended && Number.isFinite(wait) && wait > 0 ? ` (about ${num(wait)} s)` : "");
}

/** The god's own line at the top. `total` is the whole budget (bits per world second), `allocated` the share (0 to 1) given to agents. */
export function yourPowerLine({ total, allocated, income, energy }: { total: number; allocated: number; income: number; energy: number }): Seg[] {
  const own = Math.max(0, 1 - allocated);
  const refill: Seg[] = own > 0
    ? [`${percent(own)} (${perSecond(income)}) refills your `, { term: "energy", text: "energy" }, ` (${bits(energy)}) for summoning`]
    : ["nothing is left to refill your ", { term: "energy", text: "energy" }, ` (${bits(energy)}) for summoning`];
  return [`Your `, { term: "power", text: "power" }, `: ${perSecond(total)} — ${percent(Math.min(1, allocated))} to your agents, `, ...refill];
}

/** "Power share 25% · earns 16 bits/s". */
export const shareLine = (share: number, income: number): Seg[] => [{ term: "power-share", text: "Power share" }, ` ${percent(share)} · earns ${perSecond(income)}`];

/** "Energy 42 bits" or, at 0 or below, "Energy −12 bits: waiting for income". */
export function energyLine(energy: number): Seg[] {
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

/** "Summoned for 84 bits (paid once)". */
export const summonLine = (cost: number): Seg[] => [{ term: "summon", text: "Summoned" }, ` for ${bits(cost)} (paid once)`];

/** "Spent 310 bits on 25 acts: 120 reading, 190 changing" (energy; the split only when the engine reports spentRead). */
export function spentLine(spent: number, spentRead: number | undefined, actCount: number): Seg[] {
  const head = `Spent ${bits(spent)} on ${acts(actCount)}`;
  if (spentRead === undefined || !Number.isFinite(spentRead)) return [head];
  const read = Math.min(spent, Math.max(0, spentRead));
  return [head + ": ", `${num(read)} `, { term: "read-bits", text: "reading" }, `, ${num(spent - read)} `, { term: "change-cost", text: "changing" }];
}
/** "Actual average 12.4 bits per act (estimate was 10.1)". */
export function actualLine(spent: number, actCount: number, estimate: number): Seg[] {
  return actCount > 0 ? [`Actual average ${bits(spent / actCount)} per act (estimate was ${num(estimate)})`] : [`No acts yet (estimate ${bits(estimate)} per act)`];
}
/** The summon-time estimate: "Estimated at summon: 10.1 bits per act (6 reading + 4.1 changing)". */
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

/** Each failure kind in a few words (the engine's `outcomes.failures`; its diagnosis names the main one). */
export const FAILURE_LABELS = {
  collision: "another object already had the value",
  noChange: "changed nothing",
  commit: "kept by the commit clause",
  invalid: "invalid call",
  error: "code raised or ran out of time",
  unaffordable: "could not afford the change",
} as const;
/** "Failed acts: 30 × another object already had the value · 2 × could not afford the change"; null when none failed. A kind absent from the data counts as 0. */
export function failureKindsLine(failures: Partial<Record<keyof typeof FAILURE_LABELS, number>> | undefined): string | null {
  const parts = (Object.keys(FAILURE_LABELS) as (keyof typeof FAILURE_LABELS)[]).flatMap(k => ((failures?.[k] ?? 0) > 0 ? [`${failures![k]} × ${FAILURE_LABELS[k]}`] : []));
  return parts.length ? `Failed acts: ${parts.join(" · ")}` : null;
}
