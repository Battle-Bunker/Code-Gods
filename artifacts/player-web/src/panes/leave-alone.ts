/**
 * "My agent leaves these lines alone" (the coordinator's item 2): a chat deal honoured without touching code. The
 * starters' leave-alone list (LEAVE) is the one line that changes, through `agent.leaveAlone`, priced as that edit.
 * Pure: reading what the player typed, and the sentences.
 */

/** The numbers typed ("3, 19" or "3 19"), sorted without repeats; an error sentence when something is not a number. */
export function parseNumbers(text: string, one: string): { numbers: number[] } | { error: string } {
  const parts = text.split(/[\s,]+/).filter(Boolean);
  const numbers: number[] = [];
  for (const p of parts) {
    const n = Number(p.replace(/^#/, ""));
    if (!Number.isInteger(n) || n < 1) return { error: `"${p}" is not a ${one} number: type numbers like 3, 19.` };
    numbers.push(n);
  }
  return { numbers: [...new Set(numbers)].sort((a, b) => a - b) };
}

/** "lines 3 and 19", "grid 7", "no lines". */
export function listWords(numbers: readonly number[], one: string, many: string): string {
  if (numbers.length === 0) return `no ${many}`;
  if (numbers.length === 1) return `${one} ${numbers[0]}`;
  return `${many} ${numbers.slice(0, -1).join(", ")} and ${numbers.at(-1)}`;
}

/** What saving will do and cost, or that it changes nothing. */
export function leaveLine(o: { agent: string; now: readonly number[]; next: readonly number[]; price: number; one: string; many: string }): string {
  const same = o.now.length === o.next.length && o.now.every((n, i) => n === o.next[i]);
  if (same) return `${o.agent} leaves ${listWords(o.now, o.one, o.many)} alone.`;
  return `${o.agent} will leave ${listWords(o.next, o.one, o.many)} alone: only that part of its code changes, for ${o.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⚡.`;
}
