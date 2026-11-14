/**
 * The game's quantities in player words (ux-lessons 2.1, 3.9): points, ✨ rarity, ⚡ energy, power. Never "bits" or
 * "payoff". Pure.
 */
/** One decimal, en-US grouping, a true minus sign, never "−0.0": every number a player reads. */
export function one(x: number): string {
  const r = Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
  return (r === 0 ? 0 : r).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace("-", "−");
}

/** "12.5 points". */
export const pointsText = (x: number) => `${one(x)} point${one(x) === "1.0" ? "" : "s"}`;
/** "✨ 3.4". */
export const rarityText = (x: number) => `✨ ${one(x)}`;
/**
 * "123.4 ⚡"; energy a little below zero (an agent or a store spending as fast as it earns) reads "about 0 ⚡", since a
 * bare "−8.9 ⚡" read as broken to a first-time player (the exact figure goes in the tooltip).
 */
export const energyText = (x: number) => (x < 0 && x > -50 ? "about 0 ⚡" : `${one(x)} ⚡`);
/** The exact figure, for the tooltip under "about 0 ⚡". */
export const exactEnergy = (x: number) => `${one(x)} ⚡`;
/** Power: "2.5 ⚡ a second". */
export const powerText = (x: number) => `${one(x)} ⚡ a second`;
/** "1st", "2nd", "3rd", "4th". */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
/** "m:ss". */
export const clock = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
