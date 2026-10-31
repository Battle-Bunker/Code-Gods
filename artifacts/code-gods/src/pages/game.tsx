/**
 * The game page (palette-and-pages.md §3.4): "Game G9TQ" with its room, one status sentence, then Leaderboard (with
 * the roster), Objects and Public chat; settings, utility functions and timings under "Game details". The owner's
 * actions live in a ⋯ menu (End game asks in a modal). After the end: the results and "Back to room".
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { api, useLive } from "@/lib/convex";
import { catalogOf, type GameView } from "@/lib/types";
import { useRun } from "@/hooks/use-run";
import { useSendChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Page, usePage } from "@/components/layout";
import { Action, Tip } from "@/components/action";
import { StepAction } from "@/components/step-action";
import { ErrorLine, NextStepBar, Section } from "@/components/page-parts";
import { Chat, Leaderboard, Objects, SettingsList, UtilityFamilies } from "@/components/game-panels";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { gameStep } from "@/lib/next-step";
import { errMsg, fmt } from "@/lib/errors";
import { endReasonLabel, fmtDuration, fmtWhen, secsLeft, toMs } from "@/lib/time";
import { MoreHorizontal, Trophy } from "lucide-react";

const RETURN_SECONDS = 15;

/**
 * The engine's clock, ticking locally: a reactive query only re-runs when its data changes, so countdowns advance
 * from the last `serverTime` (corrected for clock skew) instead of polling.
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

/** "Running · world starts in 12 s" / "Paused · resumes in 8 s" / "Ended: time limit". */
function statusLine(game: GameView, now: number) {
  if (game.status !== "active") return `Ended: ${endReasonLabel(game.endReason)}.`;
  const plan = secsLeft(game.planningEndsAt, now), pause = secsLeft(game.pauseEndsAt, now);
  if (game.phase === "recovery") return `Paused for safety${game.recoveryReason ? `: ${game.recoveryReason.replace(/\.$/, "")}` : ""}.`;
  if (pause && pause > 0) return `Paused · resumes in ${fmt(pause, 0)} s.`;
  if (plan && plan > 0) return `Planning · world starts in ${fmt(plan, 0)} s.`;
  return "Running.";
}

function OwnerMenu({ game }: { game: GameView }) {
  const { run, unavailable } = usePage();
  const [confirm, setConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const recovery = game.phase === "recovery";
  return (<>
    <DropdownMenu>
      <Tip text="Owner actions for this game."><DropdownMenuTrigger asChild>
        <button type="button" className="border border-border p-2 hover:bg-muted" aria-label="Owner actions" data-testid="button-owner-menu"><MoreHorizontal className="h-4 w-4" /></button>
      </DropdownMenuTrigger></Tip>
      <DropdownMenuContent align="end">
        {recovery && <DropdownMenuItem onSelect={() => run("rooms.resume")} data-testid="menu-resume">Resume game</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => setConfirm(true)} disabled={!!unavailable("rooms.endActiveGame")} className="text-destructive" data-testid="button-end-game">End game…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End game {game.shortCode} now?</AlertDialogTitle>
          <AlertDialogDescription>The current leaderboard becomes the final result for everyone and the game joins the room's history. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus data-testid="button-cancel-end-game">Keep playing</AlertDialogCancel>
          <AlertDialogAction disabled={ending} onClick={() => { if (!ending) { setEnding(true); run("rooms.endActiveGame"); } }} data-testid="button-confirm-end-game">End game {game.shortCode}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>);
}

function Results({ game, returnIn, onStay }: { game: GameView; returnIn: number | null; onStay: () => void }) {
  return (
    <section className="border-2 border-accent bg-card p-5 space-y-3" data-testid="panel-final-results">
      <div className="flex items-start gap-3">
        <Trophy className="h-8 w-8 text-accent shrink-0" />
        <div>
          <h2 className="font-display text-4xl leading-tight" data-testid="text-winners">{game.winners.length ? game.winners.map(w => w.name).join(", ") : "No winner recorded"}</h2>
          <p className="text-sm text-muted-foreground">{game.winners.length > 1 ? "Tied for first place." : game.winners.length ? "Wins this game." : ""}</p>
        </div>
      </div>
      {game.roomShortCode && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <StepAction id="ui.nav.room" primary roomCode={game.roomShortCode} />
          {returnIn !== null && (
            <span className="text-sm" role="status" data-testid="status-auto-return">
              Returning to the room in <b className="tabular-nums">{returnIn}</b> s · <button type="button" onClick={onStay} className="underline underline-offset-4" data-testid="button-stay-results">Stay here</button>
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function GameBody({ game, room }: { game: GameView; room?: { members: readonly { id: string }[] } | null }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { manifest } = usePage();
  const act = useRun();
  const sendChat = useSendChat(game.roomId);
  const active = game.status === "active";
  const now = useServerNow(game.serverTime, active);

  // Auto-return to the room only when the viewer watched the game end on this page.
  const watched = useRef<{ id: string; sawActive: boolean } | null>(null);
  const [returnAt, setReturnAt] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (watched.current?.id !== game.id) { watched.current = { id: game.id, sawActive: false }; setReturnAt(null); }
    if (game.status === "active") watched.current.sawActive = true;
    else if (watched.current.sawActive && game.roomShortCode) { watched.current.sawActive = false; const t = Date.now(); setTick(t); setReturnAt(t + RETURN_SECONDS * 1000); }
  }, [game.id, game.status, game.roomShortCode]);
  useEffect(() => { if (returnAt === null) return; const t = setInterval(() => setTick(Date.now()), 250); return () => clearInterval(t); }, [returnAt]);
  const returnIn = returnAt === null ? null : Math.max(0, Math.ceil((returnAt - tick) / 1000));
  useEffect(() => { if (returnIn === 0 && game.roomShortCode) { setReturnAt(null); navigate(`/rooms/${game.roomShortCode}`); } }, [returnIn, game.roomShortCode, navigate]);

  const isOwner = !!user && game.ownerId === user.id;
  const seated = game.roster.some(r => r.id === user?.id);
  const isMember = seated || isOwner || !!room?.members.some(m => m.id === user?.id);
  const canPost = active && isMember && !!game.roomShortCode;
  const newer = game.roomActiveGame && game.roomActiveGame.id !== game.id ? game.roomActiveGame : null;
  const step = gameStep(user?.id, game);
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rise">
        <div className="space-y-3 min-w-0">
          <h1 className="font-display text-4xl md:text-5xl leading-none">
            Game <span data-testid="text-game-code">{game.shortCode}</span>{" "}
            <span className="align-middle text-xs font-sans uppercase tracking-widest text-muted-foreground" data-testid="text-game-status">{active ? "live" : "ended"}</span>
          </h1>
          {game.roomShortCode
            ? <p className="text-sm">In room <Link href={`/rooms/${game.roomShortCode}`} className="underline underline-offset-4 font-mono" data-testid="link-room">{game.roomShortCode}</Link></p>
            : <p className="text-sm text-muted-foreground" data-testid="text-room-gone">Its room is no longer available.</p>}
          {active && (
            <NextStepBar status={`${statusLine(game, now)} ${step.status}`} testId="text-viewer-seat"
              primary={step.primary && <StepAction id={step.primary} primary roomCode={game.roomShortCode} gameCode={game.shortCode} />}
              secondary={step.secondary.map(id => <StepAction key={id} id={id} roomCode={game.roomShortCode} gameCode={game.shortCode} />)} />
          )}
        </div>
        {isOwner && active && game.roomShortCode && <OwnerMenu game={game} />}
      </header>
      {newer && (
        <p className="border border-accent px-4 py-3 text-sm" data-testid="banner-newer-game">
          Room {game.roomShortCode} is now playing game {newer.shortCode}. <Link href={`/games/${newer.shortCode}`} className="underline underline-offset-4">Open it</Link>
        </p>
      )}
      {!active && <Results game={game} returnIn={returnIn} onStay={() => setReturnAt(null)} />}
      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <div className="space-y-6 min-w-0">
          <Leaderboard rows={game.leaderboard} roster={game.roster} meId={user?.id} ownerId={game.ownerId} agentCount={game.agentCount}
            emptyBody={active ? "Scores appear once the world begins to run." : "No standings were recorded."} />
          <Chat messages={game.chat} canPost={canPost} pending={act.pending}
            placeholder={!active ? "Game over; chat continues in the room" : canPost ? "Say something to everyone…" : "Join the room to chat"}
            onSend={(text, done) => act.run("chat", () => sendChat(text), done)} />
        </div>
        <Objects objects={game.objects} instance={game.objectInstance} emptyBody={active ? "Objects appear once the world begins to run." : "No objects remained when this game ended."} />
      </div>
      <Section title="Game details" collapsible defaultOpen={false} testId="section-game-details">
        <div className="p-4 grid gap-6 md:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm content-start">
            <dt className="label-mono">Started</dt><dd data-testid="text-started">{fmtWhen(game.startedAt)}</dd>
            <dt className="label-mono">Ended</dt><dd data-testid="text-ended">{game.endedAt ? `${fmtWhen(game.endedAt)} (${fmtDuration(toMs(game.endedAt) - toMs(game.startedAt))})` : "still running"}</dd>
            <dt className="label-mono">End reason</dt><dd data-testid="text-end-reason">{active ? "—" : endReasonLabel(game.endReason)}</dd>
            <dt className="label-mono">World time</dt><dd className="tabular-nums" data-testid="text-world-t">{fmt(game.worldSeconds, 1)} s</dd>
          </dl>
          <SettingsList settings={game.settings} instance={game.objectInstance} />
          <div className="md:col-span-2"><UtilityFamilies catalog={catalogOf(game.utilityCatalog)} classes={manifest?.objectTypes.find(t => t.id === game.settings.objectType)?.classes} /></div>
        </div>
      </Section>
    </div>
  );
}

export default function Game() {
  const { code = "" } = useParams<{ code: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading, error: authError, refetch: refetchAuth } = useAuth();
  // One reactive subscription: the public world updates as the engine commits each tick.
  const q = useLive(api.games.view, isAuthenticated && code ? { code } : "skip");
  const game = q.data;
  const active = game?.status === "active";
  // The room in scope (membership, the owner's commands); the game view itself does not carry it.
  const room = useLive(api.rooms.get, active && game?.roomId ? { room: game.roomId } : "skip");
  useEffect(() => { document.title = `Game ${game?.shortCode ?? code} · Code Gods`; }, [game?.shortCode, code]);
  useEffect(() => { if (game && code !== game.shortCode) navigate(`/games/${game.shortCode}`, { replace: true }); }, [code, game?.shortCode, navigate]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = game ? gameStep(user?.id, game) : null;
  const crumbs = [...(game?.roomShortCode ? [{ label: game.roomShortCode, href: `/rooms/${game.roomShortCode}` }] : []), { label: `Game ${game?.shortCode ?? code.toUpperCase()}` }];
  return (
    <Page game={game ?? null} room={room.data ?? null} crumbs={crumbs} placeholder={`Search or do anything in ${game?.shortCode ?? code.toUpperCase()}`}
      suggested={step?.primary ? [step.primary] : []} conn={game ? { ok: !q.error, label: active ? "live" : "final" } : null}>
      {authError ? <div className="mx-auto max-w-lg px-4 py-20"><ErrorLine message={errMsg(authError)} onRetry={() => void refetchAuth()} /></div>
      : authLoading ? null : !isAuthenticated ? <SignInToWatch code={code} />
      : q.isLoading ? (
        <div className="mx-auto max-w-[1440px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-2 gap-4"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>
      ) : !game ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <h1 className="font-display text-5xl" data-testid="text-game-code">{code}</h1>
          <ErrorLine message={q.error ? errMsg(q.error) : "Game not found. Check the code, or open it from its room."} />
          <Link href="/" className="underline underline-offset-4" data-testid="link-game-home">Your rooms</Link>
        </div>
      ) : <GameBody game={game} room={room.data} />}
    </Page>
  );
}

function SignInToWatch({ code }: { code: string }) {
  const { run } = usePage();
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center rise space-y-4">
      <h1 className="font-display text-5xl">Game {code.toUpperCase()}</h1>
      <p className="text-muted-foreground">Sign in to watch this game.</p>
      <Action k="ui.auth.signIn" tone="primary" onClick={() => run("ui.auth.signIn")} testId="button-login-game" />
    </div>
  );
}
