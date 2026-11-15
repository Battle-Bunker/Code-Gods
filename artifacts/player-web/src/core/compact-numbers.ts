/**
 * Very large numbers said compactly (playtest round 26, 07: "−6,973,568,802" and the like ran off a phone row): a power
 * of a small number as the power ("3²⁰"), any other number of a million or more in words ("6.97 billion"). The exact
 * value stays one tap away (CompactText). Pure, so it is unit tested.
 */
const SUP: Record<string, string> = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const sup = (n: number) => String(n).replace(/\d/g, d => SUP[d]!);
const MILLION = 1_000_000n;
const NAMES: [bigint, string][] = [[10n ** 12n, "trillion"], [10n ** 9n, "billion"], [MILLION, "million"]];

/** The compact form of a whole number written with an optional minus (− or -) and commas, or null when it is small. */
export function compactNumber(text: string): string | null {
  const neg = /^[−-]/.test(text);
  const digits = text.replace(/[−,\-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const n = BigInt(digits);
  if (n < MILLION) return null;
  const sign = neg ? "−" : "";
  for (const b of [2n, 3n, 5n, 7n, 10n]) {
    let x = n, e = 0;
    while (x % b === 0n) { x /= b; e++; }
    if (x === 1n && e >= 6) return `${sign}${b}${sup(e)}`;
  }
  for (const [unit, name] of NAMES) {
    if (n < unit) continue;
    if (unit === NAMES[0]![0] && n >= unit * 1000n) {
      const e = digits.length - 1;
      return `${sign}${(Number(digits.slice(0, 3)) / 100).toFixed(2).replace(/\.?0+$/, "")} × 10${sup(e)}`;
    }
    const v = Number(n * 1000n / unit) / 1000;
    return `${sign}${Number(v.toPrecision(3))} ${name}`;
  }
  return null;
}

/** A whole number of seven or more digits, with its sign and thousands commas. */
const BIG = /[−-]?\d{1,3}(?:,\d{3}){2,}|[−-]?\d{7,}/g;

/** A sentence split into plain text and its big numbers (each with its exact text and its short form). */
export function splitBigNumbers(text: string): (string | { exact: string; short: string })[] {
  const out: (string | { exact: string; short: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(BIG)) {
    const short = compactNumber(m[0]);
    if (!short) continue;
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ exact: m[0], short });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}
