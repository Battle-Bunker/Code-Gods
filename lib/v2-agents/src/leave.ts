/**
 * The deal knob every starter carries (starters.ts, grid-starters.ts): `const LEAVE = [];` (TypeScript) or
 * `LEAVE = []` (Python), the numbers of the objects the agent leaves alone. Read and rewritten as that one line, so
 * a player (or an assistant) can honour a chat deal without touching the rest of the code, priced as the small edit
 * it is (owner decision 21).
 */

const LINE = /^(\s*(?:const\s+)?LEAVE\s*=\s*)\[([^\]]*)\](\s*;?)(.*)$/m;

/** The numbers in a program's leave-alone list, or null when the program has no such line. */
export function readLeave(source: string): number[] | null {
  const m = LINE.exec(source);
  if (!m) return null;
  return [...new Set(m[2]!.split(",").map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
}

/** The program with its leave-alone list set to `numbers` (sorted, without repeats), or null without such a line. */
export function setLeave(source: string, numbers: readonly number[]): string | null {
  if (!LINE.test(source)) return null;
  const list = [...new Set(numbers.filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  return source.replace(LINE, (_all, head: string, _old: string, semi: string, rest: string) => `${head}[${list.join(", ")}]${semi}${rest}`);
}

// ------------------------------------------------------------------ settle and hold (TARGET, SETTLE)

/** A line's y = mx + c, or a board's 16 digits row by row; null: holding is off. */
export type HoldTarget = { m: number; c: number } | string | null;
export interface Hold { target: HoldTarget; numbers: number[] }

const TARGET_LINE = /^(\s*(?:const\s+)?TARGET\s*=\s*)(.*?)(;?)(\s+(?:\/\/|#).*)?$/m;
const SETTLE_LINE = /^(\s*(?:const\s+)?SETTLE\s*=\s*)\[([^\]]*)\](\s*;?)(.*)$/m;

function parseTarget(v: string): HoldTarget | undefined {
  const t = v.trim();
  if (t === "null" || t === "None") return null;
  const board = /^"(\d{16})"$/.exec(t);
  if (board) return board[1]!;
  const m = /\{\s*"?m"?\s*:\s*(-?\d+)\s*,\s*"?c"?\s*:\s*(-?\d+)\s*\}/.exec(t);
  return m ? { m: Number(m[1]), c: Number(m[2]) } : undefined;
}

/** The hold knobs (TARGET: where, SETTLE: which numbers; [] = every object), or null without them. */
export function readHold(source: string): Hold | null {
  const t = TARGET_LINE.exec(source), s = SETTLE_LINE.exec(source);
  if (!t || !s) return null;
  const target = parseTarget(t[2]!);
  if (target === undefined) return null;
  const numbers = [...new Set(s[2]!.split(",").map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  return { target, numbers };
}

/** The program with TARGET and SETTLE set (both languages: `const … ;` with null, else Python with None), or null without them. */
export function setHold(source: string, hold: Hold): string | null {
  const t = TARGET_LINE.exec(source);
  if (!t || !SETTLE_LINE.test(source)) return null;
  const ts = /const\s+TARGET/.test(t[1]!);
  const value = hold.target === null ? (ts ? "null" : "None")
    : typeof hold.target === "string" ? `"${hold.target}"`
    : ts ? `{ m: ${hold.target.m}, c: ${hold.target.c} }` : `{"m": ${hold.target.m}, "c": ${hold.target.c}}`;
  const list = [...new Set(hold.numbers.filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  return source
    .replace(TARGET_LINE, (_a, head: string, _v: string, semi: string, comment?: string) => `${head}${value}${semi}${comment ?? ""}`)
    .replace(SETTLE_LINE, (_a, head: string, _l: string, semi: string, rest: string) => `${head}[${list.join(", ")}]${semi}${rest}`);
}
