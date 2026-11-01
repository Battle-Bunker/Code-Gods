/**
 * The code-output panel's reading of a run's result (code-output.tsx): the table in it, its columns, and each cell as
 * text. Pure, so test/code-table.test.ts covers it.
 */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Row = Record<string, Json>;
export const MAX_COLUMNS = 12, MAX_ROWS = 200;

const isRow = (v: Json): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
/** The table in a result: a list of objects, or the `rows` (else the first list of objects) of an object. */
export function tableOf(result: Json): { rows: Row[]; summary?: string } | null {
  if (Array.isArray(result) && result.length && result.every(isRow)) return { rows: result };
  if (isRow(result)) {
    const list = Array.isArray(result.rows) ? result.rows : Object.values(result).find(v => Array.isArray(v) && v.length > 0 && v.every(isRow));
    if (Array.isArray(list) && list.length && list.every(isRow)) {
      return { rows: list as Row[], ...(typeof result.summary === "string" ? { summary: result.summary } : {}) };
    }
  }
  return null;
}
export function columnsOf(rows: readonly Row[]): string[] {
  const seen: string[] = [];
  for (const row of rows.slice(0, MAX_ROWS)) for (const k of Object.keys(row)) if (!seen.includes(k) && seen.length < MAX_COLUMNS) seen.push(k);
  return seen;
}
export function cellText(v: Json | undefined): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  const text = JSON.stringify(v);
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

