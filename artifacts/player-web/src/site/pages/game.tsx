/**
 * One game's page (/rooms/:room/games/:game, the game's id). It subscribes to the game's cold header and routes on it
 * alone (ux-lessons 4.2: never on a second query, so a transient failure of the room's query never tears the screen
 * down); seated players and spectators get the game screen (core/play.tsx). "No game" and "not in this room" have
 * their own sentences (ux-lessons 4.3). A header read that fails for a moment (a timeout) keeps the screen it had; with
 * none yet, the page says so plainly and comes back by itself on the subscription's next answer, or on Try again, which
 * drops that one subscription for a frame and subscribes afresh (no retry loop, read-architecture R6).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLive } from "@/site/lib/convex";
import { useAuth } from "@/site/hooks/use-auth";
import { gameErrorWords, transient } from "@/site/lib/errors";
import { roomPath } from "@/site/lib/routes";
import { Screen } from "@/core/screen";
import { PlayScreen } from "@/core/play";

export default function Game() {
  const { roomId: code = "", gameId = "" } = useParams<{ roomId: string; gameId: string }>();
  const { isAuthenticated } = useAuth();
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const frame = requestAnimationFrame(() => setAsking(false));
    return () => cancelAnimationFrame(frame);
  }, [asking]);
  const q = useLive(api.v2.games.header, isAuthenticated && gameId && !asking ? { gameId } : "skip");
  const last = useRef<{ gameId: string; header: NonNullable<typeof q.data> } | null>(null);
  if (q.data) last.current = { gameId, header: q.data };
  const header = q.data ?? (q.error && transient(q.error) && last.current?.gameId === gameId ? last.current.header : undefined);
  useEffect(() => { document.title = `Game ${header?.number ?? ""} · Room ${code.toUpperCase()} · Code Gods`; }, [header?.number, code]);
  if (header) return <PlayScreen header={header} />;
  if (q.error) {
    const w = gameErrorWords(q.error);
    return (
      <Screen title="Game" testId="text-game-error">
        <p className="text-destructive">{w.text}</p>
        {w.again && <p className="text-sm"><button type="button" className="underline underline-offset-4" onClick={() => setAsking(true)} data-testid="button-game-retry">Try again</button></p>}
        <p className="text-sm"><Link href={roomPath(code.toUpperCase())} className="underline">Back to room {code.toUpperCase()}</Link></p>
      </Screen>
    );
  }
  return <Screen title="Loading…" testId="status-connecting" />;
}
