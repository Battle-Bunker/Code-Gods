import type { Rng } from "../src/index.ts";

/**
 * Exact output distribution of a function of an Rng, by enumerating every sequence of draws
 * (depth-first odometer). Each path has probability Π 1/bound. Only for small bounded draws.
 */
export function distribution<V>(f: (rng: Rng) => V, key: (v: V) => string): Map<string, number> {
  const out = new Map<string, number>();
  const choices: number[] = [];
  for (;;) {
    const bounds: number[] = [];
    let i = 0, p = 1;
    const pick = (bound: number) => {
      if (bound > 1e6) throw new Error("bound too large to enumerate");
      const x = i < choices.length ? choices[i] : (choices.push(0), 0);
      bounds.push(bound); p /= bound; i++;
      return x;
    };
    const rng: Rng = { int: pick, big: b => BigInt(pick(Number(b))) };
    const k = key(f(rng));
    out.set(k, (out.get(k) ?? 0) + p);
    choices.length = bounds.length;
    let j = bounds.length - 1;
    while (j >= 0 && choices[j] === bounds[j] - 1) j--;
    if (j < 0) return out;
    choices[j]++;
    choices.length = j + 1;
  }
}

/** Pearson χ² statistic of observed counts against equal expected counts. */
export function chiSquare(counts: readonly number[]): number {
  const total = counts.reduce((a, b) => a + b, 0), e = total / counts.length;
  return counts.reduce((s, o) => s + (o - e) ** 2 / e, 0);
}

/** Upper 0.1% point of χ²(df), Wilson–Hilferty approximation. */
export function chiCritical(df: number): number {
  const z = 3.0902;
  return df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3;
}
