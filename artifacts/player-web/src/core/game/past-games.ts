/** The room's finished games (rooms.history: public results, newest first), for the results panel. */
import { useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useRoom } from "@/sdk";

export type PastGame = {
  id: string; shortCode: string; endedAt: number | null; endReason: string | null; worldSeconds: number;
  leaderboard: { deityId: string; name: string; kind: string; totalPayoff: number; rank: number }[];
};

export function usePastGames(): PastGame[] | undefined {
  const { roomId } = useRoom();
  return useQuery(api.rooms.history, { room: roomId }) as PastGame[] | undefined;
}
