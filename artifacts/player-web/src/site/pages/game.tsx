/**
 * One game's page (/rooms/:room/games/:game, the game's id). It subscribes to the game's cold header and routes on it
 * alone (ux-lessons 4.2: never on a second query, so a transient failure of the room's query never tears the screen
 * down); seated players and spectators get the game screen (core/play.tsx). "No game" and "not in this room" have
 * their own sentences (ux-lessons 4.3).
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLive } from "@/site/lib/convex";
import { useAuth } from "@/site/hooks/use-auth";
import { errCode, errMsg } from "@/site/lib/errors";
import { roomPath } from "@/site/lib/routes";
import { Screen } from "@/core/screen";
import { PlayScreen } from "@/core/play";

export default function Game() {
  const { roomId: code = "", gameId = "" } = useParams<{ roomId: string; gameId: string }>();
  const { isAuthenticated } = useAuth();
  const q = useLive(api.v2.games.header, isAuthenticated && gameId ? { gameId } : "skip");
  useEffect(() => { document.title = `Game ${q.data?.number ?? ""} · Room ${code.toUpperCase()} · Code Gods`; }, [q.data?.number, code]);
  if (q.data) return <PlayScreen header={q.data} />;
  if (q.error) {
    const c = errCode(q.error);
    const message = c === "NOT_FOUND" ? "No such game here. It may belong to another room." : c === "FORBIDDEN" ? "Join the room to watch or play its games." : errMsg(q.error);
    return (
      <Screen title="Game" testId="text-game-error">
        <p className="text-destructive">{message}</p>
        <p className="text-sm"><Link href={roomPath(code.toUpperCase())} className="underline">Back to room {code.toUpperCase()}</Link></p>
      </Screen>
    );
  }
  return <Screen title="Loading…" testId="status-connecting" />;
}
