export const GENERATOR_ID = "pantheon-of-friction-v1" as const;
export type ObjectValue = number | string;
export type Language = "python" | "typescript";
export type Domain =
  | Readonly<{ objectType: "Int"; intMin: number; intMax: number }>
  | Readonly<{ objectType: "string"; stringMaxLength: number }>;
export type Options = {
  seed: number;
  deityCount?: number;
} & (
  | { objectType: "Int"; intMin?: number; intMax?: number }
  | { objectType: "string"; stringMaxLength?: number }
);
export type Preference =
  | Readonly<{ kind: "cyclic-well"; period: number; center: number; width: number }>
  | Readonly<{ kind: "edit-well"; prototype: string; width: number }>;
export interface Deity {
  readonly id: string;
  readonly preference: Preference;
  readonly evaluate: (object: ObjectValue) => number;
  readonly source: Readonly<Record<Language, string>>;
}
export interface Manifest {
  readonly generatorId: typeof GENERATOR_ID;
  readonly seed: number;
  readonly domain: Domain;
  readonly preferences: readonly Preference[];
}

export function assertObject(x: unknown, domain: Domain): asserts x is ObjectValue {
  if (domain.objectType === "Int") {
    if (typeof x !== "number" || !Number.isSafeInteger(x) || x < domain.intMin || x > domain.intMax) {
      throw new RangeError("Expected an integer within the configured signed-32-bit bounds");
    }
  } else if (typeof x !== "string" || x.length > domain.stringMaxLength || /[^\x00-\x7f]/u.test(x)) {
    throw new RangeError("Expected ASCII within the configured length cap");
  }
}

/** Numerical object payoff only: no private program costs or altered scoring. */
export function payoffs(values: readonly number[]): number[] {
  if (values.some(v => !Number.isFinite(v) || v < 0 || v > 1)) {
    throw new RangeError("Values must be finite and in [0,1]");
  }
  return values.map((v, i) => v * values.reduce((sum, other, j) => sum + (j === i ? 0 : other), 0));
}

/** Levenshtein distance with O(prototype.length) working space. */
export function editDistance(input: string, prototype: string): number {
  let previous = Array.from({ length: prototype.length + 1 }, (_, i) => i);
  for (let i = 0; i < input.length; i++) {
    const current = [i + 1];
    for (let j = 1; j <= prototype.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (input[i] === prototype[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[prototype.length];
}

export function evaluatePreference(x: ObjectValue, domain: Domain, preference: Preference): number {
  assertObject(x, domain);
  let distance: number;
  if (preference.kind === "cyclic-well") {
    const residue = (((x as number) % preference.period) + preference.period) % preference.period;
    const gap = Math.abs(residue - preference.center);
    distance = Math.min(gap, preference.period - gap);
  } else {
    distance = editDistance(x as string, preference.prototype);
  }
  return 1 / (1 + (distance / preference.width) ** 2);
}

/** Versioned xorshift32; seed zero has an explicit nonzero initial state. */
export function random(seed: number): (bound: number) => number {
  let state = seed || 0x6d2b79f5;
  return bound => {
    if (!Number.isSafeInteger(bound) || bound < 1 || bound > 2 ** 32) throw new RangeError("Invalid random bound");
    const limit = Math.floor(2 ** 32 / bound) * bound;
    let word: number;
    do {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      word = state >>> 0;
    } while (word >= limit);
    return word % bound;
  };
}

/** Mirrors uniform rank sampling over ALL capped ASCII strings, not uniform lengths.
 * PRNG sampling is reproducible, not cryptographic entropy for a server.
 */
export function sampleDomain(domain: Domain, below: (bound: number) => number): ObjectValue {
  if (domain.objectType === "Int") return domain.intMin + below(domain.intMax - domain.intMin + 1);
  let missing: number;
  do {
    missing = 0;
    while (missing <= domain.stringMaxLength && below(128) === 0) missing++;
  } while (missing > domain.stringMaxLength);
  return Array.from({ length: domain.stringMaxLength - missing }, () => String.fromCharCode(below(128))).join("");
}
