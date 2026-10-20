import type { Domain, ObjectValue, Rng } from "../src/index.ts";

export const DEFAULT_DOMAINS: Record<"Int" | "string", Domain> = {
  Int: { objectType: "Int", intMin: -2147483648, intMax: 2147483647, stringMaxLength: 128 },
  string: { objectType: "string", intMin: -2147483648, intMax: 2147483647, stringMaxLength: 128 },
};

/** Deterministic test RNG (mulberry32). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return bound => Math.floor(next() * bound);
}

/** Same distribution as the engine: uniform integers, or uniform rank over all capped ASCII strings. */
export function spawnSample(domain: Domain, rng: Rng): ObjectValue {
  if (domain.objectType === "Int") {
    const span = domain.intMax - domain.intMin + 1;
    return domain.intMin + Math.floor((rng(2 ** 16) * 2 ** 16 + rng(2 ** 16)) / 2 ** 32 * span);
  }
  // P(length = L) ∝ 128^L: each step down in length is 128× less likely.
  let length = domain.stringMaxLength;
  while (length > 0 && rng(128) === 0) length--;
  return Array.from({ length }, () => String.fromCharCode(rng(128))).join("");
}
