/**
 * The words of the My agents pane (ux-lessons 3.7–3.9), pure so they are unit tested. Power is the energy a player
 * earns each second; each agent gets a share of it (0 to 1) and the player keeps the rest for summoning and
 * replacing. Energy a little below zero is an agent spending as fast as it earns: "about 0 ⚡", the exact figure in
 * the tooltip. A destroy confirmation says what comes back.
 */
import { energyText, one } from "../core/words.ts";

/** A share from 0 to 1 as a percentage: "70%", "12.5%". */
export const percent = (share: number): string => `${Math.round((Number.isFinite(share) ? share : 0) * 1000) / 10}%`;

/** "123.4 ⚡"; between −50 and 0, "about 0 ⚡" (a bare "−8.9 ⚡" read as broken). */
export const energyWords = energyText;
/** The tooltip under "about 0 ⚡": the exact figure and what it means; null when the figure is shown as it is. */
export function energyExact(x: number): string | null {
  return x < 0 && x > -50 ? `Exactly ${one(x)} ⚡: it spends energy as fast as it earns it, so it hovers around 0.` : null;
}
/** Beside "about 0 ⚡": the agent is working, not broken. */
export const WORKING_TEXT = "Working: it spends energy as fast as it earns it.";

/**
 * The player's power in one breath (ux 3.7): "Your power is the energy you earn each second: 25.0 ⚡ a second. 70%
 * of it goes to your agents, which spend it on moves; you keep 7.5 ⚡ a second, saved up for replacing one or adding
 * another."
 */
export function powerSentence(power: number, shares: readonly number[]): string {
  const head = `Your power is the energy you earn each second: ${one(power)} ⚡ a second.`;
  const given = Math.min(1, Math.max(0, shares.reduce((n, s) => n + s, 0)));
  if (shares.length === 0) return `${head} It all goes to your own energy until you summon an agent, which then gets a share of it to spend on moves.`;
  const kept = power * (1 - given);
  const agents = shares.length === 1 ? "your agent, which spends" : "your agents, which spend";
  if (given >= 1) return `${head} All of it goes to ${agents} it on moves; you keep none, so your own energy stays where it is.`;
  return `${head} ${percent(given)} of it goes to ${agents} it on moves; you keep ${one(kept)} ⚡ a second, saved up for replacing ${shares.length === 1 ? "it" : "one"} or adding another.`;
}

/** "Share of your power 70% (17.5 ⚡ a second)". */
export const shareText = (share: number, power: number): string => `Share of your power ${percent(share)} (${one(share * power)} ⚡ a second)`;

const count = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
/** "12 moves · 3 skipped · 1 failed · 84.0 ⚡ spent · +36.5 points gained". */
export function workText(e: { acts: number; skips: number; failures: number; spend: number; pointsGained: number }): string {
  const gained = Math.round(e.pointsGained * 10) / 10;
  return [
    count(e.acts, "move"),
    `${e.skips.toLocaleString("en-US")} skipped`,
    `${e.failures.toLocaleString("en-US")} failed`,
    `${one(e.spend)} ⚡ spent`,
    `${gained > 0 ? "+" : ""}${one(e.pointsGained)} points gained`,
  ].join(" · ");
}

/** The destroy confirmation (ux 3.8): what stops, and what comes back. */
export function destroyConfirm(name: string, energy: number | undefined): string {
  const held = energy === undefined ? null : Math.round(energy);
  const back = held === null ? "The ⚡ it holds come back to you."
    : held >= 1 ? `The ${held.toLocaleString("en-US")} ⚡ it holds ${held === 1 ? "comes" : "come"} back to you.`
    : "It holds no ⚡ now, so none comes back.";
  return `${name} stops for good and makes no more moves. ${back}`;
}
