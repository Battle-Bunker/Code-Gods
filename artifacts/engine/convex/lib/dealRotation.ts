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
/** The utility god `g` holds when the round that began with `base` has passed its rules `shift` seats along. */
const heldAfter = (base: PastDeal, g: string, shift: number) => {
  const P = base.godIds.length;
  return base.utilities[((base.godIds.indexOf(g) - shift) % P + P) % P];
};
/** `game` is `base` passed `shift` seats along, by the base game's seat order (so a new seat order cannot break the round). */
function passedOn(game: PastDeal, base: PastDeal, shift: number): boolean {
  if (!sameSet(game.godIds, base.godIds) || game.dealKey !== base.dealKey || game.bid || base.bid) return false;
  return game.godIds.every((g, k) => canonical(game.utilities[k]) === canonical(heldAfter(base, g, shift)));
}

/**
 * The deal for a game of `godIds` (roster order) given the room's earlier games (newest first), or null for a fresh
 * deal. The round began with the oldest game of the longest run of history[m], …, history[0] in which each game is
 * that first one passed one more seat along (by the first game's seat order). `round` is this game's place in it (2
 * for the first passed-on game), `of` the number of players, and `from[k]` the player who held seat k's rule last game.
 */
export function rotatedDeal(godIds: readonly string[], dealKey: string, history: readonly PastDeal[]): { utilities: UtilityDescriptor[]; round: number; of: number; from: string[] } | null {
  const last = history[0];
  if (!last || last.bid || last.dealKey !== dealKey || !sameSet(godIds, last.godIds)) return null;
  const P = godIds.length;
  let played = 1;
  for (let m = Math.min(P, history.length) - 1; m >= 1; m--) {
    if (history.slice(0, m).every((game, j) => passedOn(game, history[m], m - j))) { played = m + 1; break; }
  }
  if (played >= P) return null;
  const base = history[played - 1];
  // Seat k's rule was held last game by the player before them in the round's first seat order.
  const from = godIds.map(g => base.godIds[(base.godIds.indexOf(g) - 1 + P) % P]);
  return { utilities: godIds.map(g => heldAfter(base, g, played)), round: played + 1, of: P, from };
}
