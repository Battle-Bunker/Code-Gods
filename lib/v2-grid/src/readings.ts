/** The board's halves (or its odd and even rows and columns) read as numbers: Divisibility's readings (divisibility.ts) and the `readings` representation. */
export type DivisibilityLayout = "halves" | "alternate";

/** The four readings, each a list of cells in reading order: [first rows, second rows, first columns, second columns]. */
export function divisibilityReadings(n: number, layout: DivisibilityLayout): number[][] {
  const half = n / 2, idx = [...Array(n).keys()];
  const pick = (k: number) => (layout === "halves" ? k < half : k % 2 === 0);
  const rowsOf = (first: boolean) => idx.filter(r => pick(r) === first).flatMap(r => idx.map(c => r * n + c));
  const colsOf = (first: boolean) => idx.filter(c => pick(c) === first).flatMap(c => idx.map(r => r * n + c));
  return [rowsOf(true), rowsOf(false), colsOf(true), colsOf(false)];
}
/** The `readings` element of reading k (0–3) under a layout, and of the rows' (0) or columns' (1) difference. */
export const readingName = (layout: DivisibilityLayout, k: number): string => `${layout === "halves" ? "h" : "a"}${k}`;
export const diffName = (layout: DivisibilityLayout, k: number): string => `${layout === "halves" ? "h" : "a"}${k === 0 ? "rows" : "cols"}`;
