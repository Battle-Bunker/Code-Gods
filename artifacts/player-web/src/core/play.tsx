/**
 * The two views of a game page that are the dock (site/pages/game.tsx chooses): a seated player's live game, and an
 * ended game's replay (with its final state as the fallback when the replay cannot load).
 */
import { useMemo, type ReactNode } from "react";
import { useQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@workspace/engine/convex/_generated/api";
import { RoomProvider, type PlayerRoom } from "@/sdk/context";
import { MyGoalProvider } from "@/sdk/goal";
import { PlayerShell } from "@/dock/shell";
import { CoreBoundary } from "./core-boundary";
import { HistoricGame, type GameView } from "./history/historic-game";
import { ReplayGame } from "./replay/replay-game";
import { Link } from "./navigation";
import { Screen } from "./screen";

type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.get>>;
export type Access = Omit<PlayerRoom, "roomId">;

/** The player view: this human's dock in the room's live game. */
export function Play({ roomId, access }: { roomId: string; access: Access }) {
  const room = useMemo(() => ({ roomId, ...access }), [roomId, access]);
  return (
    // The providers' own queries (your goal) fail and retry like the dock's; the shell's errors remount only the shell.
    <CoreBoundary>
      <RoomProvider room={room}>
        <MyGoalProvider>
          <CoreBoundary>
            <PlayerShell />
          </CoreBoundary>
        </MyGoalProvider>
      </RoomProvider>
    </CoreBoundary>
  );
}

/** An ended game's replay; its final state (player.game) if the replay cannot load. */
export function Replay({ room, game, gameId, meId, access }: { room: RoomState; game: string; gameId: string; meId?: string; access: Access }) {
  return <ReplayGame room={room} gameId={gameId} gameCode={game} access={access} fallback={error => <FinalState room={room} game={game} meId={meId} note={error} />} />;
}

function FinalState({ room, game, meId, note }: { room: RoomState; game: string; meId?: string; note: string }) {
  const queries = useMemo((): Record<string, { query: typeof api.player.game; args: { roomId: string; gameId: string } }> => ({ game: { query: api.player.game, args: { roomId: room.id, gameId: game } } }), [room.id, game]);
  const result = useQueries(queries).game as GameView | Error | undefined;
  if (result instanceof Error) return <GameError room={room} code={game} message={result.message} />;
  if (!result) return <Screen title="Loading…" testId="status-connecting" />;
  return <HistoricGame game={result} roomCode={room.shortCode} meId={meId} note={note} />;
}

export function GameError({ room, code, message }: { room: { shortCode: string }; code: string; message: ReactNode }) {
  return (
    <Screen title={`Game ${code}`} testId="text-game-error">
      <p className="text-destructive">{message}</p>
      <p className="text-sm"><Link to={{ kind: "room", room: room.shortCode }} className="underline">Back to room {room.shortCode}</Link></p>
    </Screen>
  );
}
