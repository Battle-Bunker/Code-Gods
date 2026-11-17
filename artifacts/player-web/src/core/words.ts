/**
 * The game's quantities in player words (ux-lessons 2.1, 3.9): points, rarity in bits (each bit = twice as rare),
 * energy, power, and how a score is made. Pure.
 *
 * One number rule for every measure on screen: 2 decimal places (`num`, which is v2-views' `fmtNum`, so the faces and
 * the panes round the same way). A line's score is written once, by `scoreFormula`: the product shown is the product of
 * the full values, and "≈" stands in for "=" when the shown figures do not multiply to it.
 */
import { BITS_HELP, chanceText, fmtBits, fmtNum, pointsText, scoreFormula } from "@workspace/v2-views/format";
export { chanceText, pointsText, scoreFormula };
/** The game bar's own total: "…" until the standings hold the viewer's row (not a made-up 0.00 points). */
export const myTotalText = (mine: { net: number } | undefined): string => (mine ? pointsText(mine.net) : "…");

/** A measure in hundredths, as shown. */
const shown = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 100);

/** 2 decimal places, en-US grouping, a true minus sign, never "−0.00": every measure a player reads. */
export const num = fmtNum;
/** "Each bit = twice as rare." */
export { BITS_HELP };

/** "3.40 bits". */
export const bitsText = fmtBits;
/**
 * "123.40 energy"; energy a little below zero (an agent or a store spending as fast as it earns) reads "about 0 energy", since a
 * bare "−8.90 energy" read as broken to a first-time player (the exact figure goes in the tooltip).
 */
/** The amount alone, for beside a label that already says energy ("Energy 576.00", never "Energy 576.00 energy"). */
export const energyAmount = (x: number) => (x < 0 && x > -50 ? "about 0" : num(x));
export const energyText = (x: number) => (x < 0 && x > -50 ? "about 0 energy" : `${num(x)} energy`);
/** The exact figure, for the tooltip under "about 0 energy". */
export const exactEnergy = (x: number) => `${num(x)} energy`;
/** Power: "2.50 energy a second". */
export const powerText = (x: number) => `${num(x)} energy a second`;
/** "1st", "2nd", "3rd", "4th". */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
/**
 * A moment of the world as the countdown says it ("3:39 left"), so the act log and the clock read the same (persona
 * walk: "0:13" beside "Game ends in 3:39"); elapsed ("1:19") without the world's length.
 */
export const timeLeft = (worldSeconds: number, at: number | null | undefined) =>
  at == null ? clock(worldSeconds) : `${clock(Math.max(0, at - worldSeconds))} left`;
/** "m:ss". */
export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

// ------------------------------------------------------------------ how a score is made

/** The one-sentence explanation, where a beginner first meets a score (and the assistant's primer says the same). */
/** How a score is made, in the game's own noun ("line", "grid"; ux-lessons 2.8). */
export const scoreSentence = (one = "line", many = `${one}s`) => `You score on a ${one} when it's rare for you and rare for someone else at the same time: your rarity × theirs. Your total adds up all the ${many}.`;
export const SCORE_SENTENCE = scoreSentence();
/** Under a total: what it is made of, in the game's noun ("line", "grid"). */
export const totalSumNote = (one = "line") => `Your total is the sum of your points on every ${one}.`;
/** Beside the formula's "others' bits". */
/** Said once where the others' numbers show, while the room blurs them (v1 peerNoiseBits: keeps their rules secret). */
export const blurredNote = (one = "line") => `While the game runs, each ${one}'s others' bits are deliberately blurred to keep their rules secret, so a ${one}'s points are estimates. Your totals and the standings are counted exactly.`;
/** Results, once a blurred game has ended (v1's wording). */
export const blurredEndedNote = (one = "line") => `Each ${one}'s figures are exact now the game has ended. During the game, how much the others wanted each ${one} was blurred to keep their rules secret; the totals were exact throughout.`;
/** Beside the total, while the room blurs the others' bits: the total itself is exact (W3 #662, the coordinator's call 15). */
export const exactTotalNote = (one = "line") => `Your total is counted exactly at every count, although the points shown on each ${one} are estimates while the game runs.`;
export const othersNote = (one = "line") => `Others' bits: every other player's energy in bits on this ${one}, added together. A ${one} scores only when it is worth energy both to you and to them.`;
/** When the standings were counted (world seconds): a move's points join a total only at the next count. */
export const countedNote = (worldSeconds: number | null | undefined, length?: number | null): string | null =>
  worldSeconds == null ? null : `Totals are counted every few seconds; this one ${length ? `with ${timeLeft(worldSeconds, length)}` : `at ${clock(worldSeconds)}`}, so a move's points join the total at the next count.`;
/** Under the standings: the same for every player. */
export const totalsSumNote = (one = "line") => `Each total is the sum of that player's points on every ${one}.`;
/** After either note, when a won bid's handicap (the "−N%" beside a total) came off it. */
export const HANDICAP_NOTE = "A won bid's share (the −% beside a total) comes off that sum.";
/** A total's note, with the handicap's when it applies. */
export const totalNote = (note: string, handicapped: boolean) => (handicapped ? `${note} ${HANDICAP_NOTE}` : note);


/**
 * v1's "How scoring works" sheet, in v2's words and the game's noun: one titled paragraph each. The worked example is
 * fixed (3 bits × 2 bits = 6 points).
 */
export function howScoringWorks(one = "line", many = `${one}s`): { title: string; body: string }[] {
  return [
    { title: "Your rule's score.", body: `Your secret rule gives every ${one} a score. Your agents change ${many} to raise it.` },
    { title: "Rarity, in bits.", body: `The game compares that score with thousands of random ${many}: if only 1 random ${one} in 8 does as well, that is 3 bits. ${BITS_HELP} So a better score by your rule gives more bits.` },
    { title: "Points.", body: `For each ${one}: your bits × the others' bits (every other player's bits for it added up, never below 0). For example, your 3 bits × others' 2 bits = 6 points. Your total, the number in the standings, is the points of every ${one} in the world added up.` },
    { title: "If the others don't want it, nobody scores.", body: `A ${one} only you find rare gives you 0 points; one you all find rare gives the most. You see the others only as one total, never one by one, so say in the chat what you want and find overlaps.` },
    { title: "Why +1 on your rule is not +1 point.", body: `Raising a ${one}'s score by your rule makes it rarer, which raises your bits, which are then multiplied by what the others want. So the same move can be worth 0 points on one ${one} and 20 on another.` },
  ];
}

/** Why an object you find rare scores nothing: nobody else does (others' bits show 0.00). Null otherwise. */
export function onlyYouNote(yours: number, others: number, one = "line"): string | null {
  return shown(yours) > 0 && shown(others) === 0
    ? `Only you care about this ${one}, so it scores nothing yet: it needs someone else to find it rare too.`
    : null;
}

// ------------------------------------------------------------------ places

/**
 * Ranks as a player reads them: totals that show the same share a rank and the next rank skips ("1st, 2nd, 2nd, 4th").
 * The server ranks every row apart; two players holding the same lines would read "2nd" and "3rd" with one total.
 */
export function sharedRanks<R extends { net: number; rank: number }>(rows: readonly R[]): R[] {
  return rows.map(r => ({ ...r, rank: 1 + rows.filter(o => shown(o.net) > shown(r.net)).length }));
}
/** Whether another row shares this row's place. */
export const isTied = <R extends { rank: number }>(rows: readonly R[], row: R) => rows.some(r => r !== row && r.rank === row.rank);
/** Beside a shared place. */
export const TIE_NOTE = "Equal totals share a place.";

/**
 * Your own energy in the header: the figure, "(full)" once the store holds all it can (it then stops rising, which a
 * walker read as frozen), and a tooltip that says how it fills.
 */
export function ownEnergy(m: { energy: number; capacity: number; ownPerSecond: number }): { text: string; full: boolean; title: string } {
  // Below zero (debt moved to you with an agent's power, v1's header): overdrawn, and why nothing can be summoned yet.
  if (m.energy < -0.005) {
    const owed = energyAmount(-m.energy).replace(/^about /, "");
    return { text: `overdrawn by ${owed}`, full: false, title: `You owe ${exactEnergy(-m.energy)} of energy: you cannot summon until your income (${powerText(m.ownPerSecond)}) has covered it.` };
  }
  const full = m.capacity > 0 && m.energy >= m.capacity - 0.01;
  const seconds = m.ownPerSecond > 0 ? Math.round(m.capacity / m.ownPerSecond) : 0;
  const title = full
    ? `Your store is full: it holds ${seconds} seconds of your income (${powerText(m.ownPerSecond)}), so it stops rising. Spend it on a summon or a replacement, or give more of your power to your agents.`
    : `Your own energy: ${exactEnergy(m.energy)}. It rises by ${powerText(m.ownPerSecond)}, up to ${exactEnergy(m.capacity)}. Summons and replacements are paid from it.`;
  // Above the cap (a game can start there): say what it refills to once spent.
  const above = m.capacity > 0 && m.energy > m.capacity + 0.01;
  const note = above ? ` (more than your store holds: ${energyAmount(m.capacity)}; it won't refill above that)` : full ? " (full)" : "";
  // Shown beside the label "Energy": the number alone.
  return { text: `${energyAmount(m.energy)}${note}`, full, title };
}

/** During a game: the rule this player won by bid, and the handicap that comes off their total (null when none). */
export function bidNote(r: { bid: number | null; handicap: number | null; title: string }): string | null {
  if (r.bid === null || !r.handicap) return null;
  return `You won ${r.title} in the bid: ${r.handicap}% comes off your total at the end of the game.`;
}

/** "See it line by line" (or grid by grid); for a two-word object, "See each pair of lines". */
export const seeEachText = (w: { one: string }): string => (w.one.includes(" ") ? `See each ${w.one}` : `See it ${w.one} by ${w.one}`);
/** What one entry of the objects list is, without a possessive on a two-word object ("pair of lines's"). */
export const eachEntryText = (w: { one: string }): string =>
  `Each entry is ${w.one.includes(" ") ? `the points of one ${w.one}` : `one ${w.one}'s points`}; all of them added up make your total.`;

/** The one line a bound energy's marker (≤) explains on hover: the estimator's work budget ran out before it found it. */
export const BOUND_NOTE = "At most this much: the estimate ran out of time before it found this line's exact energy for your rule.";
