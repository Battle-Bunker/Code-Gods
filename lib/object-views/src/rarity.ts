/**
 * Kid-facing wording for information scores (lib/grid-lab/docs/kid-cards.md §2,
 * lib/grid-lab/docs/defence-goals.md §6). Framework-free so it is unit tested under Node.
 *
 * ✨ reward bits s: only 1 random object in N = 2^s is at least this good ("1 in N" never saturates).
 * ⚠️ penalty bits h = η(s⁻), the soft hinge of the bad event's surprisal; we invert η to say
 * "redder than 90% of grids".
 */

const finite = (x: number) => (Number.isFinite(x) ? x : 0);

/** N in "1 in N": how many random objects it takes, on average, to find one at least this good. */
export const oneInN = (bits: number) => 2 ** Math.max(0, finite(bits));

const BIG: readonly [number, string][] = [
  [1e15, "quadrillion"], [1e12, "trillion"], [1e9, "billion"], [1e6, "million"],
];

function twoSig(n: number): string {
  const digits = Math.floor(Math.log10(n));
  const step = 10 ** (digits - 1);
  return (Math.round(n / step) * step).toLocaleString("en-US");
}

/** "2.5", "14", "145", "2,300", "1.2 million", "1.1 trillion", "3.4 × 10^18". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n >= 1e18) {
    const exp = Number.isFinite(n) ? Math.floor(Math.log10(n)) : Infinity;
    if (!Number.isFinite(exp)) return "more than a quintillion";
    const mant = n / 10 ** exp;
    return `${mant.toFixed(1)} × 10^${exp}`;
  }
  if (n < 10) return String(Math.round(n * 10) / 10);
  if (n < 1000) return String(Math.round(n));
  for (const [scale, word] of BIG) {
    if (n >= scale) {
      const v = n / scale;
      const s = v >= 100 ? String(Math.round(v)) : v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
      return `${s} ${word}`;
    }
  }
  return twoSig(n);
}

/** Better than how many of 1,000 random objects (floored, so it never claims 1,000 of 1,000). */
export function rarerThanPerMille(bits: number): number {
  const b = Math.max(0, finite(bits));
  return Math.min(999, Math.max(0, Math.floor(1000 * (1 - 2 ** -b) + 1e-9)));
}

/** One decimal, no "-0". */
export function formatBits(bits: number): string {
  const v = Math.round(finite(bits) * 10) / 10;
  return (v === 0 ? 0 : v).toFixed(1);
}

export interface RarityText {
  /** "1 in 145", or "an everyday grid" when N < 2. */
  oneIn: string;
  everyday: boolean;
  /** "rarer than 993 of 1,000 grids". */
  rarerThan: string;
  /** "7.2" (shown as ✨ 7.2). */
  sparkles: string;
  /** "Only 1 random grid in 145 does this well." */
  sentence: string;
}

const plural = (noun: string) => (noun.endsWith("s") ? noun : `${noun}s`);

/** Rarity wording for reward bits; `noun` is the object type's kid word ("grid", "number", "string"). */
export function rarityText(bits: number, noun = "object"): RarityText {
  const n = oneInN(bits);
  const everyday = n < 2;
  const count = formatCount(n);
  return {
    oneIn: everyday ? `an everyday ${noun}` : `1 in ${count}`,
    everyday,
    rarerThan: `rarer than ${rarerThanPerMille(bits).toLocaleString("en-US")} of 1,000 ${plural(noun)}`,
    sparkles: formatBits(bits),
    sentence: everyday ? `An everyday ${noun}: about half of all random ${plural(noun)} do this well.`
      : `Only 1 random ${noun} in ${count} does this well.`,
  };
}

/** The kid word for an object type. */
export function objectNoun(objectType: string | undefined): string {
  return objectType === "Grid" ? "grid" : objectType === "Int" ? "number" : objectType === "string" ? "string" : "object";
}

// ---------------------------------------------------------------------------------------------
// ⚠️ penalties

/** η⁻¹: the bad event's surprisal s⁻ from penalty bits h = log2(1 + 2^(s−1)) − log2(1.5). */
export function penaltySurprisal(h: number): number {
  const x = 1.5 * 2 ** Math.max(0, finite(h)) - 1;
  return x <= 0 ? 0 : Math.max(0, 1 + Math.log2(x));
}

/** Worse than this percentage of random objects (floored). */
export function penaltyPercent(h: number): number {
  return Math.min(99, Math.max(0, Math.floor(100 * (1 - 2 ** -penaltySurprisal(h)) + 1e-9)));
}

/** "⚠️ redder than 90% of grids", or "⚠️ fine" when the object is no worse than half of all objects. */
export function penaltyLine(h: number, comparative: string, noun = "object"): string {
  const pct = penaltyPercent(h);
  return pct > 50 ? `⚠️ ${comparative} than ${pct}% of ${plural(noun)}` : "⚠️ fine";
}
