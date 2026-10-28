/**
 * Universal codes of ast-bits-v1 (lib/grid-lab/gridlab/openagents/astbits.py; open-agents.md §2.1):
 * Elias γ for positive integers, the string code and the float code. Shared with the description
 * walker (Runtime) and used by the naming bound of the decision estimator (estimators.ts).
 */

/** Elias γ length of n ≥ 1: 2⌊log2 n⌋ + 1. */
export function gammaBits(n: number | bigint): number {
  const b = BigInt(n);
  if (b < 1n) throw new RangeError(`gamma code needs n >= 1, got ${String(n)}`);
  return 2 * (b.toString(2).length - 1) + 1;
}

/** The string code's alphabet: printable ASCII, then "\n" and "\t" (97 symbols); 98 with the escape. */
export const STR_ALPHABET: readonly string[] = Object.freeze([
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)), "\n", "\t",
]);
const STR_SET = new Set(STR_ALPHABET);
const LOG2_98 = Math.log2(STR_ALPHABET.length + 1);

/** The float code's alphabet: the characters of Python's repr(float). */
export const FLOAT_ALPHABET = "0123456789.e+-infa";

/**
 * γ(len + 1) + Σ_chars [log2 98 + (γ(code point + 1) if the char is outside STR_ALPHABET)].
 * Length and characters are Unicode code points, as in Python.
 */
export function stringBits(s: string): number {
  const chars = [...s];
  let b = gammaBits(chars.length + 1);
  for (const ch of chars) {
    b += LOG2_98;
    if (!STR_SET.has(ch)) b += gammaBits(ch.codePointAt(0)! + 1);
  }
  return b;
}

/**
 * Python's repr(float): the shortest round-tripping digits, fixed notation when the decimal
 * exponent is in [-4, 16), else d[.ddd]e±XX; integral values keep ".0"; "inf", "-inf", "nan".
 */
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (x === Infinity) return "inf";
  if (x === -Infinity) return "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const sign = x < 0 ? "-" : "";
  const [mant, expText] = Math.abs(x).toExponential().split("e");
  const digits = mant.replace(".", "");
  const exp = Number(expText);
  if (exp >= -4 && exp < 16) {
    let body: string;
    if (exp < 0) body = "0." + "0".repeat(-exp - 1) + digits;
    else if (digits.length <= exp + 1) body = digits + "0".repeat(exp + 1 - digits.length) + ".0";
    else body = digits.slice(0, exp + 1) + "." + digits.slice(exp + 1);
    return sign + body;
  }
  const m = digits.length === 1 ? digits : digits[0] + "." + digits.slice(1);
  const e = (exp < 0 ? "-" : "+") + String(Math.abs(exp)).padStart(2, "0");
  return sign + m + "e" + e;
}

/** γ(len(repr) + 1) + len(repr) · log2 18. */
export function floatBits(v: number): number {
  const r = pyFloatRepr(v);
  return gammaBits(r.length + 1) + r.length * Math.log2(FLOAT_ALPHABET.length);
}
