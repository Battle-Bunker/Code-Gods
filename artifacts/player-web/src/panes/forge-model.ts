/**
 * The forge's plain logic (ux-lessons §1.3–1.9, §3): what the editor opens with, what the primary button does, what a
 * summon or a replace message says, and the frozen before/after comparison of a put-back. Pure, unit-tested.
 */
import { exampleFor, startersFor, summonBits, type ShippedAgent, type ShippedLanguage } from "@workspace/v2-agents/pure";
import { energyText, powerText } from "../core/words.ts";

/** The first agent's share of power (ux-lessons 3.7: close to 75%, leaving room to replace it with any starter). */
export const FIRST_SHARE = 0.7;

export type Language = ShippedLanguage;

/** The program the forge opens with for a dealt rule: the example for its tie-breaker, else the Simple starter. */
export function openingProgram(family: string, tieBreaker: string | null, language: Language): ShippedAgent | null {
  try {
    return (tieBreaker ? exampleFor(family, tieBreaker, language) : null) ?? startersFor(family, language)[0] ?? null;
  } catch {
    return null;   // a family this build has no agents for
  }
}

/** "Other starting points" (ux-lessons 3.4): Simple, Thorough, Bold for the family. */
export function otherStartingPoints(family: string, language: Language): ShippedAgent[] {
  try { return startersFor(family, language); } catch { return []; }
}

/** The summon (or replace) price of a program, in ⚡. */
export const summonPrice = (language: Language, source: string) => summonBits(language, source).energy;

export type Primary = "summonFirst" | "replace" | "summon";
/**
 * The forge's primary button (ux-lessons 3.2): with no agent, "Summon my first agent"; with an agent in the editor and a
 * changed draft, "Replace" first ("Summon beside it" is secondary); with the agent's own code unchanged, nothing to do.
 */
export function primaryAction(o: { agents: number; selected: boolean; draftChanged: boolean }): Primary | null {
  if (o.agents === 0) return "summonFirst";
  if (o.selected) return o.draftChanged ? "replace" : null;
  return "summon";
}

/** Whether the energy pays the price; never a stale "cannot afford" for the code just summoned (ux-lessons 3.6). */
export function affordLine(o: { price: number; energy: number; justRan: boolean }): string | null {
  if (o.justRan) return null;
  return o.price <= o.energy ? `Summoning costs ${energyText(o.price)}; you have ${energyText(o.energy)}.`
    : `Summoning costs ${energyText(o.price)}, and you have ${energyText(o.energy)}: wait for your energy to grow, or shorten the code.`;
}

/** What a first summon did, in the same breath as what power is (ux-lessons 1.9, 3.7). */
export function summonedText(o: { name: string; share: number; power: number }): string {
  const keep = o.power * (1 - o.share);
  return `${o.name} is summoned. Your power is the energy you earn each second. ${Math.round(o.share * 100)}% of it now goes to this agent, ` +
    `which spends it on moves; you keep ${powerText(keep)}, saved up for replacing it or adding another.`;
}

/** What a replace did (ux-lessons 3.3). */
export const replacedText = (name: string) =>
  `${name} now runs your new code. It keeps its stored ⚡ and its share of your power; the price came from your own energy.`;

/**
 * The frozen comparison after a change (ux-lessons 3.5): points a move before and since, from the two versions'
 * counts. Null until the new version has made a move.
 */
export function comparisonText(before: { acts: number; pointsGained: number } | undefined, since: { acts: number; pointsGained: number }): string | null {
  if (!before || before.acts === 0 || since.acts === 0) return null;
  const per = (x: { acts: number; pointsGained: number }) => { const v = x.pointsGained / x.acts; return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} points a move`; };
  return `Before your change: ${per(before)}. Since: ${per(since)}.${since.acts < 10 ? " Early moves are a rough guide." : ""}`;
}
