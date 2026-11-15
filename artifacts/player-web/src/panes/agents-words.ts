/**
 * The words of the My agents pane (ux-lessons 3.7–3.9), pure so they are unit tested. Power is the energy a player
 * earns each second; each agent gets a share of it (0 to 1) and the player keeps the rest for summoning and
 * replacing. Energy a little below zero is an agent spending as fast as it earns: "about 0 energy", the exact figure in
 * the tooltip. A destroy confirmation says what comes back.
 */
import { energyText, num } from "../core/words.ts";

/** A share from 0 to 1 as a percentage: "70%", "12.5%". */
export const percent = (share: number): string => `${Math.round((Number.isFinite(share) ? share : 0) * 1000) / 10}%`;

/** "123.4 energy"; between −50 and 0, "about 0 energy" (a bare "−8.9 energy" read as broken). */
export const energyWords = energyText;
/** The tooltip under "about 0 energy": the exact figure and what it means; null when the figure is shown as it is. */
export function energyExact(x: number): string | null {
  return x < 0 && x > -50 ? `Exactly ${num(x)} energy: it spends energy as fast as it earns it, so it hovers around 0.` : null;
}
/** Agent debt (docs/energy-model.md §7.2), in the server's words. */
export const DEBT_TEXT = "An agent may borrow up to one full store of energy to finish a change; its own income repays the debt within a full-charge time, and while it owes it gets no new opportunities. If you lower its power or remove it, the debt moves with the power to your own store.";
/** "Owes 326.40 energy, borrowed to finish a change." for a real debt (50 energy or more); null otherwise. */
export const debtText = (x: number): string | null => (x <= -50 ? `Owes ${num(-x)} energy, borrowed to finish a change.` : null);
/** Beside "about 0 energy": the agent is working, not broken. */
export const WORKING_TEXT = "Working: it spends energy as fast as it earns it.";

/**
 * The player's power in one breath (ux 3.7): "Your power is the energy you earn each second: 25.0 energy a second. 70%
 * of it goes to your agents, which spend it on moves; you keep 7.5 energy a second, saved up for replacing one or adding
 * another."
 */
export function powerSentence(power: number, shares: readonly number[]): string {
  const head = `Your power is the energy you earn each second: ${num(power)} a second.`;
  const given = Math.min(1, Math.max(0, shares.reduce((n, s) => n + s, 0)));
  if (shares.length === 0) return `${head} It all goes to your own energy until you summon an agent, which then gets a share of it to spend on moves.`;
  const kept = power * (1 - given);
  const agents = shares.length === 1 ? "your agent, which spends" : "your agents, which spend";
  if (given >= 1) return `${head} All of it goes to ${agents} it on moves; you keep none, so your own energy stays where it is.`;
  return `${head} ${percent(given)} of it goes to ${agents} it on moves; you keep ${num(kept)} a second, saved up for replacing ${shares.length === 1 ? "it" : "one"} or adding another.`;
}

/** "Share of your power 70% (17.5 energy a second)". */
export const shareText = (share: number, power: number): string => `Share of your power ${percent(share)} (${num(share * power)} energy a second)`;

const count = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
/** "12 moves · 3 skipped · 1 failed · 84.00 energy spent · +36.54 points from its moves": only its own moves, while a total also moves with other players' moves. */
export function workText(e: { acts: number; skips: number; failures: number; spend: number; pointsGained: number }): string {
  const gained = Math.round(e.pointsGained * 10) / 10;
  return [
    count(e.acts, "move"),
    `${e.skips.toLocaleString("en-US")} skipped`,
    `${e.failures.toLocaleString("en-US")} failed`,
    `${num(e.spend)} energy spent`,
    `${gained > 0 ? "+" : ""}${num(e.pointsGained)} points from its moves`,
  ].join(" · ");
}

/** The destroy confirmation (ux 3.8): what stops, and what comes back. */
export function destroyConfirm(name: string, energy: number | undefined): string {
  const held = energy === undefined ? null : Math.round(energy);
  const back = held === null ? "The energy it holds comes back to you."
    : held <= -1 ? `It owes ${(-held).toLocaleString("en-US")} energy: that debt moves to your own store.`
    : held >= 1 ? `The ${held.toLocaleString("en-US")} energy it holds comes back to you.`
    : "It holds no energy now, so none comes back.";
  return `${name} stops for good and makes no more moves. ${back}`;
}

/** One row of an agent's versions, newest first (the first is the one running). */
export interface VersionRow { readonly version: number; readonly label: string; readonly moves: number; readonly gained: string; readonly perMove: string }

/** v1's version comparison: what each version of an agent did while it ran (moves, points gained, points a move). */
export function versionRows(programs: readonly { version: number; acts: number; pointsGained: number }[]): VersionRow[] {
  return programs.map((p, i) => ({
    version: p.version,
    label: `Version ${p.version}${i === 0 ? " (running)" : ""}`,
    moves: p.acts,
    gained: num(p.pointsGained),
    perMove: p.acts > 0 ? num(p.pointsGained / p.acts) : "—",
  }));
}

/** v1's "How energy works", in v2's terms. */
export const ENERGY_HOW = "You earn energy every second of world time at your power. Each agent gets its share of that power into its own store; what you keep goes to your own store, for summoning and replacing agents. A store holds at most one full charge (its power × the full-charge time): income above that is not kept. Each chance to move goes to an agent with odds in proportion to the energy it holds, and moves cost energy by how far they change an object; looks cost energy too. An agent may borrow up to one full store to finish a change, and gets no chances until its income repays it.";
