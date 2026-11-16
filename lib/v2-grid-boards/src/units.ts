/** Cells and lines of an N×N board, named as the digit grid names them (r0c0 …, row0 … col0 …). */
export const cellName = (n: number, i: number): string => `r${Math.floor(i / n)}c${i % n}`;
export const cellLabel = (n: number, i: number): string => `row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`;
export const rowCells = (n: number, r: number): number[] => Array.from({ length: n }, (_, c) => r * n + c);
export const colCells = (n: number, c: number): number[] => Array.from({ length: n }, (_, r) => r * n + c);
export const lineNames = (n: number): string[] => [...Array.from({ length: n }, (_, r) => `row${r}`), ...Array.from({ length: n }, (_, c) => `col${c}`)];
export function lineCells(n: number, name: string): number[] {
  const m = /^(row|col)(\d+)$/.exec(name);
  if (!m || Number(m[2]) >= n) throw new RangeError(`no line ${name}`);
  return m[1] === "row" ? rowCells(n, Number(m[2])) : colCells(n, Number(m[2]));
}
export const lineWords = (name: string): string => {
  const [, kind, i] = /^(row|col)(\d+)$/.exec(name)!;
  return `${kind === "row" ? "row" : "column"} ${Number(i!) + 1}`;
};
/** The up-to-four orthogonal neighbours of cell i. */
export function neighbours(n: number, i: number): number[] {
  const r = Math.floor(i / n), c = i % n, out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}
