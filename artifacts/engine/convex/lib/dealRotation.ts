/**
 * The rotated deal (docs/beginner-pool.md §6): when a room plays again with the same players and the same dealing
 * settings, the last game's rules pass one seat along, so over as many games as there are players everyone holds every
 * rule once; then the next game is dealt afresh. Which rule a player is dealt decides most single games (the measured
 * win share by rule, same doc), and no score scaling or choice of deal levels it for every way of playing; rotating
 * makes a room's run of games fair by construction and leaves each game, and the first one, exactly as it was.
 *
 * Stateless: it reads the room's last games (newest first) and stores nothing. A deal made with bids is never rotated,
 * and never continues a rotation (the bids decided it).
 */
import type { UtilityDescriptor } from "@workspace/game-utilities";

export interface PastDeal {
  /** The game's roster order. */
  readonly godIds: readonly string[];
  /** The utility each roster god was dealt, in roster order. */
  readonly utilities: readonly UtilityDescriptor[];
  /** dealKeyOf the game's settings: two games deal alike when their keys are equal. */
  readonly dealKey: string;
  /** Whether the deal was made with winning bids. */
  readonly bid: boolean;
}

/** The settings that decide what can be dealt: a change to any of them starts a fresh deal. */
export function dealKeyOf(settings: Record<string, unknown>): string {
  const pick = ["objectType", "typeArgs", "excludedFamilies", "utilitySelectorId", "defenceGoals", "excludedDefenceFamilies", "priorId", "ruleTiers"];
  return canonical(Object.fromEntries(pick.map(k => [k, settings[k] ?? null])));
}

/** A canonical JSON text (object keys sorted): equal values give equal texts whatever their key order. */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(x ?? null);
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
/** `newer` is `older` passed one seat along (each player holds the rule of the player before them in `older`). */
function passedOn(newer: PastDeal, older: PastDeal): boolean {
  if (!sameSet(newer.godIds, older.godIds) || newer.dealKey !== older.dealKey || newer.bid || older.bid) return false;
  const P = older.godIds.length;
  return newer.godIds.every((g, k) => canonical(newer.utilities[k]) === canonical(older.utilities[(older.godIds.indexOf(g) - 1 + P) % P]));
}

/**
 * The deal for a game of `godIds` (roster order) given the room's earlier games (newest first), or null for a fresh
 * deal. `round` is this game's place in the rotation (2 for the first passed-on game), `of` the number of players, and
 * `from[k]` the player whose rule seat k now holds.
 */
export function rotatedDeal(godIds: readonly string[], dealKey: string, history: readonly PastDeal[]): { utilities: UtilityDescriptor[]; round: number; of: number; from: string[] } | null {
  const last = history[0];
  if (!last || last.bid || last.dealKey !== dealKey || !sameSet(godIds, last.godIds)) return null;
  const P = godIds.length;
  let played = 1;
  while (played < history.length && passedOn(history[played - 1], history[played])) played++;
  if (played >= P) return null;
  const from = godIds.map(g => last.godIds[(last.godIds.indexOf(g) - 1 + P) % P]);
  return { utilities: from.map(f => last.utilities[last.godIds.indexOf(f)]), round: played + 1, of: P, from };
}
