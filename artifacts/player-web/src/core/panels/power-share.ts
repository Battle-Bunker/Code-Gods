/**
 * The agents panel's power controls (docs/energy-model.md §6), kept pure so they can be tested: reading the percentage a
 * player types, the most one agent can be given, and the plain-words line for what is left over.
 */
import { roundShare } from "@workspace/game-core";

/** A typed percentage ("25", "12.5%") as a share from 0 to 1, or null if it is not a number from 0 to 100. */
export function parseSharePercent(text: string): number | null {
  const t = text.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const pct = Number(t);
  return pct >= 0 && pct <= 100 ? roundShare(pct / 100) : null;
}

/** The most one agent can have: what the god has not given to its other agents. */
export function maxShareFor(agentShare: number, allocated: number): number {
  return roundShare(Math.max(0, Math.min(1, 1 - (allocated - agentShare))));
}

const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;
/** "your unallocated power: 40% (3.2 bits/s to you)". */
export function unallocatedLine(allocated: number, income: number): string {
  return `your unallocated power: ${pct(Math.max(0, 1 - allocated))} (${Math.round(income * 10) / 10} bits/s to you)`;
}
/** Why a typed share was not sent, or null when it can be. */
export function shareProblem(text: string, agentShare: number, allocated: number): string | null {
  const share = parseSharePercent(text);
  if (share === null) return "Type a percentage from 0 to 100.";
  const max = maxShareFor(agentShare, allocated);
  return share > max ? `You can give this agent at most ${pct(max)}: your other agents hold the rest.` : null;
}
