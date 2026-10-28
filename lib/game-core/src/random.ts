import { gridArgs, type GameSettings, type ObjectValue } from "./settings.ts";
import { spawnGrid } from "./grid.ts";

/** Server injects unbiased random integers; seed/state must never enter public snapshots. */
export type RandomBelow = (exclusiveUpperBound: bigint) => bigint;

function draw(randomBelow: RandomBelow, bound: bigint): bigint {
  const value = randomBelow(bound);
  if (value < 0n || value >= bound) throw new Error("Random source returned an out-of-range value");
  return value;
}

/** Rank all ASCII strings by length, then base-128 lexicographic order. */
export function asciiStringAtRank(rank: bigint, maxLength: number): string {
  if (!Number.isSafeInteger(maxLength) || maxLength < 0) throw new Error("Invalid length cap");
  if (rank < 0n) throw new Error("Invalid string rank");
  let length = 0;
  let size = 1n;
  while (rank >= size && length <= maxLength) {
    rank -= size;
    size *= 128n;
    length++;
  }
  if (length > maxLength) throw new Error("String rank is outside the domain");
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(String.fromCharCode(Number(rank % 128n)));
    rank /= 128n;
  }
  return chars.reverse().join("");
}

export function uniformObject(
  settings: Pick<GameSettings, "objectType" | "intMin" | "intMax" | "stringMaxLength"> &
    Partial<Pick<GameSettings, "gridSize" | "gridSymbols" | "gridColours">>,
  randomBelow: RandomBelow,
): ObjectValue {
  if (settings.objectType === "Grid") return spawnGrid(gridArgs(settings as GameSettings), bound => draw(randomBelow, bound));
  if (settings.objectType === "Int") {
    if (
      !Number.isSafeInteger(settings.intMin) || !Number.isSafeInteger(settings.intMax) ||
      settings.intMin > settings.intMax
    ) throw new Error("Invalid integer domain");
    const min = BigInt(settings.intMin);
    return Number(min + draw(randomBelow, BigInt(settings.intMax) - min + 1n));
  }
  const cap = settings.stringMaxLength;
  if (!Number.isSafeInteger(cap) || cap < 0) throw new Error("Invalid length cap");
  const population = (128n ** BigInt(cap + 1) - 1n) / 127n;
  return asciiStringAtRank(draw(randomBelow, population), cap);
}

/** Inverse survival CDF: a uniform draw of 0.5 yields exactly one half-life. */
export function lifetimeSeconds(halfLifeSeconds: number, uniformOpen: number): number {
  if (!Number.isFinite(halfLifeSeconds) || halfLifeSeconds <= 0) {
    throw new Error("Invalid half-life");
  }
  if (!Number.isFinite(uniformOpen) || uniformOpen <= 0 || uniformOpen >= 1) {
    throw new Error("Random sample must be strictly between zero and one");
  }
  return -Math.log(uniformOpen) * halfLifeSeconds / Math.LN2;
}

export function poissonIntervalSeconds(rateHz: number, uniformOpen: number): number {
  if (!Number.isFinite(rateHz) || rateHz < 0) throw new Error("Invalid event rate");
  return rateHz === 0 ? Infinity : lifetimeSeconds(Math.LN2 / rateHz, uniformOpen);
}
