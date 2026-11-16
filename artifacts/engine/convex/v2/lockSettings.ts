/** Whether a game has locks, and its lock prices: from its settings alone, so the game header (games.ts) does not load
 *  the agents or the value curves (test/unit/v2-values-load.test.ts). locks.ts re-exports these. */
import type { LockRates } from "@workspace/v2-core";
import type { Doc } from "../_generated/dataModel";
import { defaultLockRates } from "./lockWire";

export const locksOn = (game: { settings: object }): boolean => (game.settings as { locks?: boolean }).locks === true;
/** The game's lock prices (resolved at start; a game started before they were resolved takes the §3 defaults). */
export function ratesOf(game: Doc<"v2Games">): LockRates {
  const s = game.settings as { lockRates?: LockRates; economy: { powerPerSecond: number; fullChargeSeconds: number } };
  return s.lockRates ?? defaultLockRates(s.economy);
}
