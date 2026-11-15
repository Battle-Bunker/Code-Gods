/**
 * Every game pays to look (owner decisions 33 and 35; v1's paid observation): a seated player sees each
 * object as they were last told it (at its birth, by their own agents' moves, or by a paid look), and how many times it
 * has changed since (public). These are the words for that; pure, so they are unit tested.
 */
import { clock } from "../core/words.ts";

export interface Seen { readonly knownAt?: number | null; readonly changesSince?: number }

/** Whether this object read comes from a paid game (only then does the server send `knownAt`). */
export const isPaid = (o: Seen | null | undefined): boolean => !!o && o.knownAt !== undefined;

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** "As you saw it at 0:40 · changed 3 times since", or null in a free game. */
export function seenWords(o: Seen): string | null {
  if (!isPaid(o)) return null;
  const n = o.changesSince ?? 0;
  if (o.knownAt === null) return `Not seen yet · ${n ? `changed ${times(n)} since it was born` : "unchanged since it was born"}`;
  return `As you saw it at ${clock(o.knownAt!)} · ${n ? `changed ${times(n)} since` : "up to date"}`;
}

/** The row's short form: "seen 0:40 · changed 3×", "seen 0:40", or null in a free game. */
export function seenShort(o: Seen): string | null {
  if (!isPaid(o)) return null;
  const n = o.changesSince ?? 0;
  return `${o.knownAt === null ? "not seen yet" : `seen ${clock(o.knownAt!)}`}${n ? ` · changed ${n}×` : o.knownAt === null ? "" : " · up to date"}`;
}

/** The mark beside it: "fresh" when nothing changed since you last saw it, "stale" otherwise; null in a free game. */
export function freshness(o: Seen): "fresh" | "stale" | null {
  if (!isPaid(o)) return null;
  return o.knownAt !== null && (o.changesSince ?? 0) === 0 ? "fresh" : "stale";
}

/** "Look now (1.10 energy)", or null when there is no price (no look possible: planning, the end, a spectator). */
export const lookLabel = (price: number | undefined): string | null => (price === undefined ? null : `Look now (${price.toFixed(2)} energy)`);

/** What looking at every loaded row costs (the sum of their prices), or null when none has one. */
export function lookAllPrice(rows: readonly ({ lookPrice?: number } | undefined)[]): number | null {
  const prices = rows.flatMap(r => (r?.lookPrice === undefined ? [] : [r.lookPrice]));
  return prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

/** The Watcher a board needs (lib/v2-agents watcherFor): one program per object type. */
export const watcherTypeOf = (variant: string): "lines" | "grids" => (variant.startsWith("grid") ? "grids" : "lines");
/** Its share of power: lines about 15 s fresh, most turns left to the climber (W2, #674). */
export const KEEP_FRESH_SHARE = 0.2;
