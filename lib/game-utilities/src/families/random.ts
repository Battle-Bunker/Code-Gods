import type { Rng } from "../types.ts";

export const pick = <T>(rng: Rng, items: ArrayLike<T>): T => items[rng(items.length)];

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const CONSONANTS = "bdfgklmnprstvz", VOWELS = "aeiou";
/** Pronounceable lowercase word so players can say it out loud in negotiations. */
export const word = (rng: Rng, length: number) =>
  Array.from({ length }, (_, i) => pick(rng, i % 2 ? VOWELS : CONSONANTS)).join("");
