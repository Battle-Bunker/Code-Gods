/**
 * "a × b = product" that multiplies out as displayed (pure). Rounding both factors to one decimal can show
 * "3.2 × 4.7 = 15.3" (the real values are 3.24 and 4.73), which a reader who checks it reads as a mistake. `productText`
 * shows the product at `decimals` and gives the factors as many decimals (up to three more) as it takes for the displayed
 * factors to multiply to the displayed product. If no precision does, the factors are shown at one more decimal and
 * `exact` is false, so the caller writes "≈" instead of "=".
 */
export interface ProductText {
  a: string;
  b: string;
  product: string;
  /** Whether the displayed a × the displayed b, rounded as the product is, equals the displayed product. */
  exact: boolean;
  /** "=" or "≈". */
  sign: "=" | "≈";
}

const finite = (x: number) => (Number.isFinite(x) ? x : 0);
const round = (x: number, d: number) => { const v = Math.round(finite(x) * 10 ** d) / 10 ** d; return v === 0 ? 0 : v; };
const show = (x: number, d: number) => round(x, d).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).replace("-", "−");

export function productText(a: number, b: number, product: number = a * b, decimals = 1): ProductText {
  const shown = round(product, decimals);
  for (let d = decimals; d <= decimals + 3; d++) {
    if (round(round(a, d) * round(b, d), decimals) === shown) return { a: show(a, d), b: show(b, d), product: show(product, decimals), exact: true, sign: "=" };
  }
  return { a: show(a, decimals + 1), b: show(b, decimals + 1), product: show(product, decimals), exact: false, sign: "≈" };
}

/** A displayed number back as a number ("1,204.5" → 1204.5, "−3.2" → −3.2): what a reader would type into a calculator. */
export const readDisplayed = (text: string): number => Number(text.replace(/,/g, "").replace("−", "-"));
