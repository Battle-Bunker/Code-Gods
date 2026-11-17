/**
 * One game's page (/rooms/:room/games/:game: the room's code and the game's number in it, v1's short link; a link by the
 * game's document id still opens it and is replaced by the short one). The link resolves to the game's id once (v2/games
 * resolve, immutable); the page then subscribes to the game's cold header and routes on it
 * alone (ux-lessons 4.2: never on a second query, so a transient failure of the room's query never tears the screen
 * down); seated players and spectators get the game screen (core/play.tsx). "No game" and "not in this room" have
 * their own sentences (ux-lessons 4.3). A header read that fails for a moment (a timeout) keeps the screen it had; with
 * none yet, the page says so plainly and comes back by itself on the subscription's next answer, or on Try again, which
 * drops that one subscription for a frame and subscribes afresh (no retry loop, read-architecture R6).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLive } from "@/site/lib/convex";
import { useAuth } from "@/site/hooks/use-auth";
import { gameErrorWords, transient } from "@/site/lib/errors";
import { gamePath, roomPath } from "@/site/lib/routes";
import { Screen } from "@/core/screen";
import { PlayScreen } from "@/core/play";

export default function Game() {
  const { roomId: code = "", gameId: ref = "" } = useParams<{ roomId: string; gameId: string }>();
  const { isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const frame = requestAnimationFrame(() => setAsking(false));
    return () => cancelAnimationFrame(frame);
  }, [asking]);
  const link = useLive(api.v2.games.resolve, isAuthenticated && ref && !asking ? { room: code, game: ref } : "skip");
  const gameId = link.data?.gameId ?? "";
  // The canonical link is the short one: an old long-id (or lower-case) link is replaced in place, keeping ?… and #….
  const canonical = link.data ? gamePath(link.data.room, String(link.data.number)) : null;
  useEffect(() => { if (canonical && location !== canonical) navigate(`${canonical}${window.location.search}${window.location.hash}`, { replace: true }); }, [canonical, location, navigate]);
  const head = useLive(api.v2.games.header, gameId && !asking ? { gameId } : "skip");
  const q = { data: head.data, error: head.error ?? link.error };
  const last = useRef<{ ref: string; header: NonNullable<typeof q.data> } | null>(null);
  if (q.data) last.current = { ref, header: q.data };
  const header = q.data ?? (q.error && transient(q.error) && last.current?.ref === ref ? last.current.header : undefined);
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
