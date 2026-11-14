/**
 * The deals held this game, for the end summary (playtest round 8: "the end summary doesn't mention a held deal"):
 * the objects the player's agents were set to hold (TARGET and SETTLE in any version of their code, the newest first, so
 * a later hold claims its objects before an earlier one) that reached the
 * target; who held each (every player whose move put it at the target: "you", by name otherwise); and the player's own
 * points on it before the hold began and at the end. Pure: from the act log (newest first) and the agents' holds.
 */
import type { HoldTarget } from "@workspace/v2-agents/pure";

export interface HeldMove {
  seq: number; number: number; worldSeconds: number; stateAfter: string; mine: boolean;
  before: { points: number }; after: { points: number };
  by: { memberId: string; name: string } | null;
}
export interface HeldDeal { number: number; stateAfter: string; by: string[]; before: number; after: number }

const same = (a: HoldTarget, b: HoldTarget) =>
  a !== null && b !== null && (typeof a === "string" || typeof b === "string" ? a === b : a.m === b.m && a.c === b.c);

/** `targetOf(wire)`: an object's state (its wire) as a hold target. */
export function heldDeals(moves: readonly HeldMove[], holds: readonly { target: HoldTarget; numbers: readonly number[] }[], targetOf: (wire: string) => HoldTarget): HeldDeal[] {
  // Each state's target once; each distinct hold once (the code's versions repeat it), newest first as given.
  const targets = new Map<string, HoldTarget>();
  const targetAt = (w: string) => { if (!targets.has(w)) targets.set(w, targetOf(w)); return targets.get(w)!; };
  const distinct = [...new Map(holds.map(h => [JSON.stringify([h.target, h.numbers]), h])).values()];
  const byNumber = new Map<number, HeldMove[]>();
  for (const m of [...moves].sort((a, b) => a.seq - b.seq)) byNumber.set(m.number, [...(byNumber.get(m.number) ?? []), m]);
  const out = new Map<number, HeldDeal>();
  for (const h of distinct) {
    if (h.target === null) continue;
    for (const [number, ms] of byNumber) {
      if (out.has(number) || (h.numbers.length && !h.numbers.includes(number))) continue;
      const at = ms.map(m => same(targetAt(m.stateAfter), h.target));
      const start = at.indexOf(true);
      if (start < 0) continue;
      const holders = ms.slice(start).filter((_, i) => at[start + i]);
      const by = [...new Set(holders.map(m => (m.mine ? "you" : m.by?.name ?? "another player")))].sort((a, b) => (a === "you" ? -1 : b === "you" ? 1 : 0));
      out.set(number, { number, stateAfter: ms[start]!.stateAfter, by, before: ms[start]!.before.points, after: ms.at(-1)!.after.points });
    }
  }
  return [...out.values()].sort((a, b) => a.number - b.number);
}
