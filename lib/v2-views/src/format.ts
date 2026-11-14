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

/** Energy as a player reads it: one decimal and the ⚡ sign. */
export const fmtEnergy = (bits: number): string => `${(Math.round(bits * 10) / 10).toFixed(1)} ⚡`;
/** ✨ rarity, one decimal. */
export const fmtRarity = (bits: number): string => `✨ ${(Math.round(bits * 10) / 10).toFixed(1)}`;
