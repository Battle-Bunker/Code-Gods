import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation } from "convex/react";
import { api, useLive } from "@/lib/convex";
import { catalogOf, type GameView } from "@/lib/types";
import { useRun, type Run } from "@/hooks/use-run";
import { useSendChat } from "@/hooks/use-chat";
import { Shell, Panel, ErrorLine } from "@/components/shell";
import { GameRules } from "@/components/game-rules";
import { Chat, Conn, Leaderboard, Objects, ReadOnlySettings, Repertoire, Roster, ScoringPanel } from "@/components/game-panels";
import { useManifest } from "@/hooks/use-manifest";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { errMsg, fmt } from "@/lib/errors";
import { endReasonLabel, fmtDuration, fmtWhen, secsLeft, toMs } from "@/lib/time";
import { ArrowLeft, ArrowRight, Crown, Radio, RotateCcw, Square, Trophy } from "lucide-react";

const RETURN_SECONDS = 15;

/**
 * The engine's clock, ticking locally: a reactive query only re-runs when its data changes, so
 * countdowns advance from the last `serverTime` (corrected for clock skew) instead of polling.
 */
function useServerNow(serverTime: number, running: boolean) {
  const skew = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { skew.current = serverTime - Date.now(); setNow(Date.now()); }, [serverTime]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now + skew.current;
}

function Header({ game, isOwner }: { game: GameView; isOwner: boolean }) {
  const active = game.status === "active";
  const now = useServerNow(game.serverTime, active);
  const plan = active ? secsLeft(game.planningEndsAt, now) : null;
  const pause = active ? secsLeft(game.pauseEndsAt, now) : null;
  const cells: [string, string, string][] = [
    ["phase", game.phase, "text-phase"],
    ["world t", `${fmt(game.worldSeconds, 1)}s`, "text-world-t"],
    [pause && pause > 0 ? "pause" : "planning", pause && pause > 0 ? `${fmt(pause, 0)}s` : plan !== null && plan > 0 ? `${fmt(plan, 0)}s` : "—", "text-countdown"],
    ["started", fmtWhen(game.startedAt), "text-started"],
    ["ended", game.endedAt ? fmtWhen(game.endedAt) : active ? "running" : "—", "text-ended"],
    ["end reason", active ? "—" : endReasonLabel(game.endReason), "text-end-reason"],
  ];
  return (
    <div className="border-b bg-card/70">
      <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 grid lg:grid-cols-[1fr_auto] gap-6 items-end">
        <div className="rise">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="label-mono">Game</span>
            {game.roomShortCode
              ? <Link href={`/rooms/${game.roomShortCode}`} className="font-mono text-sm border px-2 py-0.5 inline-flex items-center gap-1.5 hover:bg-muted" data-testid="link-room">
                  <ArrowLeft className="h-3 w-3" />room {game.roomShortCode}</Link>
              : <span className="label-mono" data-testid="text-room-gone">room no longer available</span>}
            {isOwner && <span className="label-mono inline-flex items-center gap-1 !text-accent"><Crown className="h-3 w-3" /> you own this room</span>}
            <span className={`label-mono px-2 py-0.5 ${active ? "bg-primary !text-primary-foreground" : "bg-foreground/80 !text-background"}`} data-testid="text-game-status">{active ? "live" : "ended"}</span>
          </div>
          <h1 className="font-display text-5xl md:text-7xl leading-none mt-3" data-testid="text-game-code">{game.shortCode}</h1>
        </div>
        <div className="grid grid-cols-3 gap-px bg-border border font-mono">
          {cells.map(([k, v, t]) => (
            <div key={k} className="bg-card px-4 py-2 min-w-[110px]">
              <div className="label-mono">{k}</div>
              <div className={`${k === "started" || k === "ended" || k === "end reason" ? "text-sm" : "text-lg"} tabular-nums`} data-testid={t}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OwnerControls({ game, act }: { game: GameView; act: Run }) {
  const recovery = game.phase === "recovery";
  const resume = useMutation(api.rooms.resume);
  const end = useMutation(api.rooms.endActiveGame);
  const roomId = game.roomId!;
  return (
    <Panel title="Owner controls" meta="this game">
      <div className="p-3 grid gap-2">
        {recovery && (<>
          <p className="text-xs text-accent" data-testid="text-recovery-reason">Game is in recovery{game.recoveryReason ? `: ${game.recoveryReason}` : "."}</p>
          <button onClick={() => act.run("resume", () => resume({ roomId }))} disabled={act.pending} className="bg-primary text-primary-foreground py-2 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40" data-testid="button-resume"><RotateCcw className="h-4 w-4" /> Resume game</button>
        </>)}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button disabled={act.pending} className="border border-destructive/50 text-destructive py-2 text-sm inline-flex items-center justify-center gap-2 hover:bg-destructive/5 disabled:opacity-40" data-testid="button-end-game"><Square className="h-4 w-4" /> End game</button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>End game {game.shortCode} now?</AlertDialogTitle>
              <AlertDialogDescription>The current leaderboard becomes the final result and the game is added to the room's history. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-end-game">Keep playing</AlertDialogCancel>
              <AlertDialogAction onClick={() => act.run("endGame", () => end({ roomId }))} data-testid="button-confirm-end-game">End game</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Panel>
  );
}

function Results({ game, returnIn, onStay }: { game: GameView; returnIn: number | null; onStay: () => void }) {
  return (
    <section className="border-2 border-accent bg-card rise" data-testid="panel-final-results">
      <div className="p-5 grid md:grid-cols-[1fr_auto] gap-4 items-start">
        <div>
          <p className="label-mono">Final result · {endReasonLabel(game.endReason)}{game.endedAt ? ` · ${fmtDuration(toMs(game.endedAt) - toMs(game.startedAt))} real time` : ""}</p>
          <div className="mt-2 flex items-start gap-3">
            <Trophy className="h-8 w-8 text-accent shrink-0" />
            <h2 className="font-display text-4xl md:text-5xl leading-tight" data-testid="text-winners">
              {game.winners.length ? game.winners.map((w) => w.name).join(", ") : "No winner recorded"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{game.winners.length > 1 ? "Tied for first place." : game.winners.length ? "Wins this game." : ""}</p>
        </div>
        {game.roomShortCode && (
          <div className="grid gap-2 justify-items-stretch">
            <Link href={`/rooms/${game.roomShortCode}`} className="bg-foreground text-background px-6 py-3 text-base inline-flex items-center justify-center gap-2" data-testid="button-back-to-room">
              <ArrowLeft className="h-4 w-4" /> Back to room {game.roomShortCode}</Link>
            {returnIn !== null && (
              <div className="flex items-center justify-between gap-3 text-sm" role="status" data-testid="status-auto-return">
                <span>Returning to the room in <b className="tabular-nums">{returnIn}</b>s</span>
                <button onClick={onStay} className="label-mono underline" data-testid="button-stay-results">Stay on results</button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="border-t">
        <Leaderboard rows={game.leaderboard} agentCount={game.agentCount} title="Final leaderboard" emptyBody="No standings were recorded for this game." />
      </div>
    </section>
  );
}

export default function Game() {
  const { code = "" } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading, error: authError, refetch: refetchAuth, login } = useAuth();
  // One reactive subscription: the public world updates as the engine commits each tick.
  const q = useLive(api.games.view, isAuthenticated && code ? { code } : "skip");
  const game = q.data;
  const manifest = useManifest();
  const active = game?.status === "active";
  // Membership decides who may chat; the game view itself does not carry it.
  const room = useLive(api.rooms.get, active && game?.roomId ? { room: game.roomId } : "skip");
  const act = useRun();
  const sendChat = useSendChat(game?.roomId);

  useEffect(() => { document.title = `Game ${game?.shortCode ?? code} · Code Gods`; }, [game?.shortCode, code]);
  useEffect(() => {
    if (game && code !== game.shortCode) navigate(`/games/${game.shortCode}`, { replace: true });
  }, [code, game?.shortCode, navigate]);

  // Auto-return to the room only when the viewer watched the game end on this page.
  const watched = useRef<{ id: string; sawActive: boolean } | null>(null);
  const [returnAt, setReturnAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!game) return;
    if (watched.current?.id !== game.id) { watched.current = { id: game.id, sawActive: false }; setReturnAt(null); }
    if (game.status === "active") watched.current.sawActive = true;
    else if (watched.current.sawActive && game.roomShortCode) { watched.current.sawActive = false; const t = Date.now(); setNow(t); setReturnAt(t + RETURN_SECONDS * 1000); }
  }, [game?.id, game?.status, game?.roomShortCode]);
  useEffect(() => {
    if (returnAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [returnAt]);
  const returnIn = returnAt === null ? null : Math.max(0, Math.ceil((returnAt - now) / 1000));
  useEffect(() => {
    if (returnIn === 0 && game?.roomShortCode) { setReturnAt(null); navigate(`/rooms/${game.roomShortCode}`); }
  }, [returnIn, game?.roomShortCode, navigate]);

  const isOwner = !!game && !!user && game.ownerId === user.id;
  const seated = !!game && game.roster.some((r) => r.id === user?.id);
  const isMember = seated || isOwner || !!room.data?.members.some((m) => m.id === user?.id);
  const canPost = active && isMember && !!game?.roomShortCode;
  const newer = game?.roomActiveGame && game.roomActiveGame.id !== game.id ? game.roomActiveGame : null;

  return (
    <Shell right={game && <Conn ok={!q.error} label={active ? "live" : "final"} />}>
      {authError ? <div className="mx-auto max-w-lg px-4 py-20"><ErrorLine message={errMsg(authError)} onRetry={() => void refetchAuth()} /></div>
      : authLoading ? null : !isAuthenticated ? (
        <div className="mx-auto max-w-lg px-4 py-20 text-center rise">
          <p className="label-mono">Game {code}</p>
          <h1 className="font-display text-5xl mt-2">A match is underway.</h1>
          <p className="text-muted-foreground mt-3">Sign in to watch this game.</p>
          <button onClick={login} className="mt-8 bg-foreground text-background px-5 py-3" data-testid="button-login-game">Sign in with Google to open game</button>
        </div>
      ) : q.isLoading ? (
        <div className="mx-auto max-w-[1440px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-3 gap-4"><Skeleton className="h-80" /><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>
      ) : !game ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <h1 className="font-display text-5xl" data-testid="text-game-code">{code}</h1>
          <ErrorLine message={q.error ? errMsg(q.error) : "Game not found"} />
          <Link href="/" className="label-mono underline" data-testid="link-game-home">Back to your rooms</Link>
        </div>
      ) : (<>
        <Header game={game} isOwner={isOwner} />
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 pt-4 space-y-3 empty:hidden">
          {newer && (
            <Link href={`/games/${newer.shortCode}`} className="block border border-accent bg-accent/10 hover:bg-accent/20 px-4 py-3" data-testid="banner-newer-game">
              <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
                <Radio className="h-4 w-4 text-accent pulse-dot" />
                <span className="font-display text-2xl">Room {game.roomShortCode} is now playing game {newer.shortCode}</span>
                <span className="label-mono">phase {newer.phase}</span>
                <span className="text-sm">{newer.roster.some((r) => r.id === user?.id) ? "You are seated in it." : "You would spectate it."}</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">Open <ArrowRight className="h-4 w-4" /></span>
              </span>
            </Link>
          )}
          {active && (
            <p className="text-sm" data-testid="text-viewer-seat">{seated ? "You are seated in this game. Act from your player client." : "You are spectating this game."}</p>
          )}
          {!active && <Results game={game} returnIn={returnIn} onStay={() => setReturnAt(null)} />}
        </div>
        <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_360px] items-start">
          <div className="space-y-6 min-w-0">
            {active && <Leaderboard rows={game.leaderboard} agentCount={game.agentCount} />}
            <ScoringPanel objectType={game.objectInstance?.objectType} />
            <Chat messages={game.chat} canPost={canPost} pending={act.pending}
              title={active ? "Public channel" : "Public channel · during this game"}
              placeholder={!active ? "Game over; chat continues in the room" : canPost ? "Speak to all deities" : "Join the room to speak"}
              onSend={(text, done) => act.run("chat", () => sendChat(text), done)} />
            <GameRules settings={game.settings} instance={game.objectInstance} roomCode={game.roomShortCode} gameCode={game.shortCode} note="Uses this game’s settings snapshot." />
          </div>
          <Objects objects={game.objects} instance={game.objectInstance} emptyBody={active ? "Objects appear once the world begins to run." : "No objects remained when this game ended."} />
          <div className="space-y-6 min-w-0">
            {isOwner && active && game.roomShortCode && <OwnerControls game={game} act={act} />}
            <Roster roster={game.roster} meId={user?.id} ownerId={game.ownerId} />
            <ReadOnlySettings settings={game.settings} instance={game.objectInstance} title="Settings used" meta={`started ${fmtWhen(game.startedAt)}`} note="Snapshot taken when this game launched; room changes apply to the next game only." />
            <Repertoire catalog={catalogOf(game.utilityCatalog)} classes={manifest.data?.objectTypes.find(t => t.id === game.settings.objectType)?.classes} />
          </div>
        </div>
      </>)}
    </Shell>
  );
}
