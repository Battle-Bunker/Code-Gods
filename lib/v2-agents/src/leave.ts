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
