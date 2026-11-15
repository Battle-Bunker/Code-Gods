/**
 * Numbers and element values as people read them: a true minus sign, vulgar fractions for the small denominators a
 * 12-year-old knows (½, ⅓, ¾ …), mixed numbers above one ("3⅓"), and every other fraction typeset the same way, a small
 * raised numerator over a lowered denominator ("3¹⁄₇", "⁸⁄₁₁"): never "8/11", which "8/11x" would read as division.
 * Display only: scores and prices are never computed from these strings.
 */
import { Qn, type ElementValue, type Q, type Undef } from "@workspace/v2-core";

export const MINUS = "−";

const GLYPHS: Readonly<Record<string, string>> = {
  "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾", "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘",
  "1/6": "⅙", "5/6": "⅚", "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞",
};

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹", SUB = "₀₁₂₃₄₅₆₇₈₉";
const raised = (n: bigint) => [...n.toString()].map(d => SUP[Number(d)]).join("");
const lowered = (n: bigint) => [...n.toString()].map(d => SUB[Number(d)]).join("");

/** "3", "−2", "½", "3⅓", "−1¾", "⁷⁄₁₁", "−3¹⁄₇". */
export function fmtQ(x: Q): string {
  const sign = x.n < 0n ? MINUS : "";
  const n = x.n < 0n ? -x.n : x.n;
  if (x.d === 1n) return sign + n.toString();
  const whole = n / x.d, rest = n % x.d;
  const w = whole > 0n ? whole.toString() : "";
  return sign + w + (GLYPHS[`${rest}/${x.d}`] ?? `${raised(rest)}⁄${lowered(x.d)}`);
}

/** The largest denominator written as an exact fraction; beyond it a number is written "≈ 2.37". */
/**
 * The one limit for exact fractions, everywhere a number is written (playtest round 12: "≈ 3.07" beside "3¹¹⁄₁₆₂x" on
 * one card): a denominator up to three digits is written exact ("3¹¹⁄₁₆₂"); beyond it, as a decimal with "≈", and an
 * equation holding one reads "≈" for "=" (equation-text.ts).
 */
export const EXACT_DENOMINATOR = 999n;

/**
 * A number on a ruler, a plot or a part: exact while its denominator is at most 100 ("2¹⁹⁄₆₄", "⅓"), else approximate
 * ("≈ 9.90"); whole numbers from 10,000 up grouped ("27,720").
 */
export function readable(q: Q): string {
  if (q.d > EXACT_DENOMINATOR) return `≈ ${fmtNum(Number(q.n) / Number(q.d))}`;
  const t = fmtQ(q);
  return q.d === 1n && (q.n >= 10000n || q.n <= -10000n) ? t.replace(/\d+/, d => Number(d).toLocaleString("en-US")) : t;
}

/**
 * A sentence's plain numbers typeset ("multiply every output by 1/2", "move by -3" → "… by ½", "… by −3"): a mutator's
 * own description, for the moves list and the act log alike.
 */
export function typesetNumbers(text: string): string {
  return text
    .replace(/(^|[\s(,])(-?)(\d+)\/(\d+)/g, (_m, pre: string, sign: string, n: string, d: string) => pre + fmtQ(Qn.parse(`${sign}${n}/${d}`)))
    .replace(/(^|[\s(,])-(?=\d)/g, `$1${MINUS}`);
}

/** A rule's own note ("distance² 784/225, nearest square 4") with its fractions written as every other number is. */
export function typesetNote(text: string): string {
  return text.replace(/(^|[^\d⁄])(-?\d+)\/(\d+)/g, (_m, pre: string, n: string, d: string) => pre + readable(Qn.parse(`${n}/${d}`)));
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
/** Energy as a player reads it: "12.50 energy" (a concept has a name, never only a symbol: the owner, 15 Nov). */
export const fmtEnergy = (energy: number): string => `${fmtNum(energy)} energy`;

const SCALE: readonly (readonly [number, string])[] = [
  [1e12, "trillion"], [1e9, "billion"], [1e6, "million"],
];
/**
 * How rare a number of bits is, as a chance: "1 in N" with N = 2^bits, said the way people say it: "1 in 1.4",
 * "1 in 32", "1 in 16,000", "1 in 1.2 million", "1 in 3.4 billion" (two significant figures from a thousand up), and past
 * a trillion a power of ten: "1 in 2.4 × 10⁴²".
 */
export function chanceText(bits: number): string {
  // Capped at 1,000 bits so 2^bits stays finite (a degenerate calibration never prints "1 in NaN").
  const n = 2 ** Math.min(1000, Math.max(0, Number.isFinite(bits) ? bits : 0));
  if (n < 10) return `1 in ${String(Math.round(n * 10) / 10)}`;
  if (n < 999.5) return `1 in ${Math.round(n)}`;
  const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
  const r = Math.round(n / unit) * unit;
  // Past a trillion the scale words stop meaning anything to a player: a power of ten, two significant figures.
  if (r >= 1e15) {
    let e = Math.floor(Math.log10(r)), m = Math.round((r / 10 ** e) * 10) / 10;
    if (m >= 10) { m = 1; e += 1; }
    const sup = String(e).replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]!);
    return `1 in ${m.toLocaleString("en-US", { maximumFractionDigits: 1 })} × 10${sup}`;
  }
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
export function scoreFormula(yours: number, rawOthers: number, approx = false): string {
  // A blurred sum below zero scores as none (round 11: "about −8.21" read as nonsense): show what is scored.
  const others = Math.max(0, rawOthers);
  // A blurred others' total can read below zero; points never do (yours × max(0, others)).
  const product = yours * Math.max(0, others);
  // Live, the others' numbers are deliberately blurred (peerNoiseBits): never write them as exact.
  // The blurred sum may be negative; points are your bits × max(0, that) (the server's rule, W3 #608).
  if (approx) return `your ${fmtBits(yours)} × others' about ${fmtBits(others)} ≈ ${pointsText(yours * Math.max(0, others))}`;
  const sign = Math.round(hundredths(yours) * hundredths(others) / 100) === hundredths(product) ? "=" : "≈";
  return `your ${fmtBits(yours)} × others' ${fmtBits(others)} ${sign} ${pointsText(product)}`;
}
