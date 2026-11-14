/**
 * Numbers and element values as people read them: a true minus sign, vulgar fractions for the small denominators a
 * 12-year-old knows (½, ⅓, ¾ …), mixed numbers above one ("3⅓"), and "p/q" for everything else. Display only: scores and
 * prices are never computed from these strings.
 */
import { Qn, type ElementValue, type Q, type Undef } from "@workspace/v2-core";

export const MINUS = "−";

const GLYPHS: Readonly<Record<string, string>> = {
  "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾", "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘",
  "1/6": "⅙", "5/6": "⅚", "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞",
};

/** "3", "−2", "½", "3⅓", "−1¾", "7/11", "−22/7". */
export function fmtQ(x: Q): string {
  const sign = x.n < 0n ? MINUS : "";
  const n = x.n < 0n ? -x.n : x.n;
  if (x.d === 1n) return sign + n.toString();
  const whole = n / x.d, rest = n % x.d;
  const glyph = GLYPHS[`${rest}/${x.d}`];
  if (glyph) return sign + (whole > 0n ? whole.toString() : "") + glyph;
  return `${sign}${n}/${x.d}`;
}

/** A number written after an operator: "+ 3", "− ½" (the sign becomes the operator). */
export function signedTerm(x: Q): { op: "+" | typeof MINUS; mag: string } {
  return { op: x.n < 0n ? MINUS : "+", mag: fmtQ(Qn.abs(x)) };
}

export const isUndef = (v: Q | Undef): v is Undef => typeof (v as Undef).undefined === "string";

/** A term's value: its number, or its sentence when it is undefined. */
export const fmtTermValue = (v: Q | Undef): string => (isUndef(v) ? v.undefined : fmtQ(v));

const pointText = (x: Q, y: Q) => `(${fmtQ(x)}, ${fmtQ(y)})`;

/** One element value in words: "3", "(0, 10)", "from (−12, 46) to (12, −26)", or the undefined sentence. */
export function fmtValue(v: ElementValue): string {
  switch (v.kind) {
    case "number": return fmtQ(v.q);
    case "point": return pointText(v.x, v.y);
    case "segment": return `from ${pointText(v.from.x, v.from.y)} to ${pointText(v.to.x, v.to.y)}`;
    case "symbol": return v.text;
    case "undefined": return v.reason;
  }
}

/**
 * THE number rule for every measure a player reads (bits, energy, points): 2 decimal places, en-US grouping, a true
 * minus sign, never "−0.00". The app's words (artifacts/player-web/src/core/words.ts) build on this one function, so
 * the screen has one rounding.
 */
export function fmtNum(x: number): string {
  const r = Math.round((Number.isFinite(x) ? x : 0) * 100) / 100;
  return (r === 0 ? 0 : r).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace("-", MINUS);
}
/** Rarity in bits: "4.24 bits" (each bit = twice as rare). */
export const fmtBits = (bits: number): string => { const s = fmtNum(bits); return `${s} ${s === "1.00" ? "bit" : "bits"}`; };
/** What "bits" means, for a hover and a tap. */
export const BITS_HELP = "Each bit = twice as rare.";
/** Energy as a player reads it: "12.50 ⚡". */
export const fmtEnergy = (energy: number): string => `${fmtNum(energy)} ⚡`;

const SCALE: readonly (readonly [number, string])[] = [
  [1e24, "septillion"], [1e21, "sextillion"], [1e18, "quintillion"], [1e15, "quadrillion"], [1e12, "trillion"], [1e9, "billion"], [1e6, "million"],
];
/**
 * How rare a number of bits is, as a chance: "1 in N" with N = 2^bits, said the way people say it: "1 in 1.4",
 * "1 in 32", "1 in 16,000", "1 in 1.2 million", "1 in 3.4 billion" (two significant figures from a thousand up).
 */
export function chanceText(bits: number): string {
  // Capped at 1,000 bits so 2^bits stays finite (a degenerate calibration never prints "1 in NaN").
  const n = 2 ** Math.min(1000, Math.max(0, Number.isFinite(bits) ? bits : 0));
  if (n < 10) return `1 in ${String(Math.round(n * 10) / 10)}`;
  if (n < 999.5) return `1 in ${Math.round(n)}`;
  const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
  const r = Math.round(n / unit) * unit;
  const big = SCALE.find(([v]) => r >= v * 0.9999999);
  if (!big) return `1 in ${r.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const v = Math.round((r / big[0]) * 10) / 10;
  return `1 in ${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 1 : 0 })} ${big[1]}`;
}

/** "12.50 points". */
export const pointsText = (x: number): string => `${fmtNum(x)} point${fmtNum(x) === "1.00" ? "" : "s"}`;
/** A measure in hundredths, as shown. */
const hundredths = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 100);
/**
 * A score: "your 4.24 bits × others' 12.03 bits = 51.01 points" (others' = the other players' bits added together). The
 * product is the full values' product, rounded; "≈" when the shown factors do not multiply to it (the owner's rule:
 * displayed arithmetic is self-consistent). The one place every pane and the end summary write a score.
 */
export function scoreFormula(yours: number, others: number): string {
  const product = yours * others;
  const sign = Math.round(hundredths(yours) * hundredths(others) / 100) === hundredths(product) ? "=" : "≈";
  return `your ${fmtBits(yours)} × others' ${fmtBits(others)} ${sign} ${pointsText(product)}`;
}
