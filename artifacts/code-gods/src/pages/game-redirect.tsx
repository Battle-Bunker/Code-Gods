import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { getGetGameLinkQueryKey, useGetGameLink } from "@workspace/api-client-react";
import { Shell, ErrorLine } from "@/components/shell";
import { useAuth } from "@/hooks/use-auth";
import { useActivityReady, useServerIdle } from "@/hooks/use-server-idle";
import { errMsg } from "@/lib/errors";

export default function GameRedirect() {
  const { code = "" } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const auth = useAuth();
  const activityReady = useActivityReady();
  const idle = useServerIdle();
  const game = useGetGameLink(code, {
    query: {
      queryKey: getGetGameLinkQueryKey(code),
      enabled: activityReady && !idle && auth.isAuthenticated && !!code,
      staleTime: 0,
      retry: false,
    },
  });
  useEffect(() => { document.title = `Game ${code} · Code Gods`; }, [code]);
  useEffect(() => {
    if (!auth.isAuthenticated || !game.data) return;
    const { status, shortCode, roomShortCode } = game.data;
    if (status === "current" && roomShortCode) {
      setLocation(`/rooms/${roomShortCode}?game=${shortCode}`, { replace: true });
    } else if (code !== shortCode) {
      setLocation(`/games/${shortCode}`, { replace: true });
    }
  }, [auth.isAuthenticated, game.data, code, setLocation]);

  return (
    <Shell>
      <div className="mx-auto max-w-lg px-4 py-16 rise">
        <p className="label-mono">Game link</p>
        <h1 className="font-display text-5xl mt-2" data-testid="text-game-code">{game.data?.shortCode ?? code}</h1>
        {auth.error ? <ErrorLine message={errMsg(auth.error)} onRetry={() => void auth.refetch()} /> :
          auth.isLoading ? <p className="mt-6" role="status" data-testid="status-game-auth">Checking login…</p> :
          !auth.isAuthenticated ? (
            <button onClick={auth.login} className="mt-8 bg-foreground text-background px-5 py-3" data-testid="button-login-game">Log in to open game</button>
          ) : game.error ? <div className="mt-6"><ErrorLine message={errMsg(game.error)} onRetry={() => void game.refetch()} /></div> :
          !game.data || game.data.status === "current" ? <p className="mt-6" role="status" data-testid="status-game-loading">Opening game…</p> : (
            <div className="mt-6 space-y-4">
              <p role="status" data-testid="status-game-unavailable">
                {game.data.status === "historical"
                  ? "This is a historical game. Its room no longer displays this game, and historical playback is not available."
                  : "This game's room is no longer available. Historical playback is not available."}
              </p>
              {game.data.roomShortCode && (
                <Link href={`/rooms/${game.data.roomShortCode}`} className="block underline text-sm" data-testid="link-game-current-room">
                  Open the room instead (not this game)
                </Link>
              )}
              <Link href="/" className="block underline text-sm" data-testid="link-game-home">Back to your rooms</Link>
            </div>
          )}
      </div>
    </Shell>
  );
}
