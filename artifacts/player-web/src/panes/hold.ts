/**
 * "Hold lines [2, 5] at y = −x + 59" (the coordinator's item, the deal that pays): settle objects at an agreed state and
 * keep them there, through the starters' TARGET and SETTLE (`agent.hold`). Pure: an object's state as a target, what
 * the player types, and the sentences.
 */
import type { HoldTarget } from "@workspace/v2-agents/pure";
import { intercept, slope, type LineState } from "@workspace/v2-linear";

/** The target an object is at now ("Hold it here"): a line's whole-number y = mx + c, a board's 16 digits; else null. */
export function targetOf(state: unknown, typeId: string): HoldTarget {
  if (typeId === "grid") {
    const digits = String((state as { cells?: readonly number[] }).cells?.join("") ?? "");
    return /^\d{16}$/.test(digits) ? digits : null;
  }
  const l = (state as LineState).lines?.[0];
  if (!l || (state as LineState).lines.length !== 1) return null;
  const m = slope(l), c = intercept(l);
  return m.d === 1n && c.d === 1n ? { m: Number(m.n), c: Number(c.n) } : null;
}

/** y = mx + c as a player reads it ("y = −x + 59", "y = 3x", "y = −7"). */
export function lineText(t: { m: number; c: number }): string {
  const minus = (n: number) => (n < 0 ? `−${-n}` : String(n));
  const mx = t.m === 0 ? "" : t.m === 1 ? "x" : t.m === -1 ? "−x" : `${minus(t.m)}x`;
  const c = t.c === 0 ? (mx ? "" : "0") : mx ? (t.c < 0 ? ` − ${-t.c}` : ` + ${t.c}`) : minus(t.c);
  return `y = ${mx}${c}`;
}

/** The target's words: "y = −x + 59", "the board 9779 8558 7997 9779". */
export function targetText(t: Exclude<HoldTarget, null>): string {
  return typeof t === "string" ? `the board ${t.match(/\d{4}/g)!.join(" ")}` : lineText(t);
}

/** What saving will do, in the game's noun. */
export function holdLine(o: { agent: string; numbers: readonly number[]; target: HoldTarget; one: string; many: string; price: number | null }): string {
  const which = o.numbers.length === 0 ? `every ${o.one}` : o.numbers.length === 1 ? `${o.one} ${o.numbers[0]}` : `${o.many} ${o.numbers.slice(0, -1).join(", ")} and ${o.numbers.at(-1)}`;
  if (o.target === null) return `${o.agent} holds nothing in place.`;
  const cost = o.price === null ? "" : `: only those settings change, for ${o.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⚡`;
  return `${o.agent} ${o.price === null ? "holds" : "will hold"} ${which} at ${targetText(o.target)}, moving ${o.numbers.length === 1 ? "it" : "them"} back whenever anyone moves ${o.numbers.length === 1 ? "it" : "them"} away${cost}.`;
}

/** Whether the form's hold differs from the saved one (key order does not count: readHold lists target first). */
export function holdChanged(next: { numbers: readonly number[]; target: unknown }, now: { numbers: readonly number[]; target: unknown } | null): boolean {
  return !now || JSON.stringify([next.numbers, next.target]) !== JSON.stringify([now.numbers, now.target]);
}
