/**
 * What a game tells about its bid phase (engine games.auction; docs/bid-phase.md): every player's handicap, or the
 * whole auction, as the setup's `bidDisclosure` allows while it is live and always once it has ended. One small
 * document, one shared live subscription: mount it only where standings, results or the replay render.
 */
import { useMemo } from "react";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { family } from "@workspace/game-utilities";
import { api, useLive } from "@/site/lib/convex";
import { readAuction, type Auction } from "@/site/lib/bidding";

export function useAuction(gameId: string | null | undefined): Auction | null {
  const data = useLive(api.games.auction, gameId ? { gameId: gameId as Id<"games"> } : "skip").data;
  return useMemo(() => readAuction(data), [data]);
}

/** A rule family's name for a line about the auction (its id if this client does not know the family). */
export function ruleName(familyId: string): string {
  try { return family(familyId).name; } catch { return familyId; }
}
