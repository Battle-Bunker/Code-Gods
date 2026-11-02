/**
 * /rooms/:room/games/:game (docs/unify-apps-plan.md §1.2), calibrated to the viewer:
 *
 *   live, you play in it     the player view: your dock (core/play.tsx Play)
 *   live, you watch it       the spectator view below: "Game G9TQ" with its room, one status sentence, then Leaderboard
 *                            (with the roster), Objects and Public chat; settings, utility functions and timings under
 *                            "Game details"; the owner's actions in a ⋯ menu (End game asks in a modal). A spectator
 *                            sees what any unseated member sees: the public game, never another god's secrets.
 *   ended                    its replay, for its players, its spectators and the room's owner (core/play.tsx Replay);
 *                            the engine refuses anyone else, and that refusal is shown
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { GameError, Play, Replay } from "@/core/play";
import { api, useLive } from "@/site/lib/convex";
import { catalogOf, type GameView } from "@/site/lib/types";
import { useRun } from "@/site/hooks/use-run";
import { useSendChat } from "@/site/hooks/use-chat";
import { useAuth } from "@/site/hooks/use-auth";
import { Page, usePage } from "@/site/components/layout";
import { Action, Tip } from "@/site/components/action";
import { StepAction } from "@/site/components/step-action";
import { ErrorLine, NextStepBar, Section } from "@/site/components/page-parts";
import { Chat, Leaderboard, Objects, SettingsList, UtilityFamilies } from "@/site/components/game-panels";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { gameStep } from "@/site/lib/next-step";
import { gamePath, roomPath } from "@/site/lib/routes";
import { errMsg, fmt } from "@/site/lib/errors";
import { endReasonLabel, fmtDuration, fmtWhen, secsLeft, toMs } from "@/site/lib/time";
import { MoreHorizontal } from "lucide-react";


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
  // Past its deadline, planning holds until every allowed language's agent sandbox is warm (the engine's tick).
  if (game.phase === "planning") return "Planning · agent sandboxes warming up; the world starts when they are ready.";
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

/** The spectator view of a live game: the public game, as every member who does not play in it sees it. */
function SpectatorView({ game, room }: { game: GameView; room?: { members: readonly { id: string }[] } | null }) {
  const { user } = useAuth();
  const { manifest } = usePage();
  const act = useRun();
  const sendChat = useSendChat(game.roomId);
  const active = game.status === "active";
  const now = useServerNow(game.serverTime, active);

  const isOwner = !!user && game.ownerId === user.id;
  const seated = game.roster.some(r => r.id === user?.id);
  const isMember = seated || isOwner || !!room?.members.some(m => m.id === user?.id);
  const canPost = active && isMember && !!game.roomShortCode;
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
      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        <div className="space-y-6 min-w-0">
          <Leaderboard rows={game.leaderboard} roster={game.roster} meId={user?.id} ownerId={game.ownerId} agentCount={game.agentCount}
            emptyBody={active ? "Scores appear once the world begins to run." : "No standings were recorded."} />
          <Chat messages={game.chat} canPost={canPost} pending={act.pending}
            placeholder={canPost ? "Say something to everyone…" : "Join the room to chat"}
            closed={active ? undefined : "Chat closed: the game is over. It continues in the room."}
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

/** The game page: player view, spectator view or replay, for the signed-in viewer (see the module comment). */
export default function Game() {
  const { roomId: roomCode = "", gameId: code = "" } = useParams<{ roomId: string; gameId: string }>();
  const [location, navigate] = useLocation();
  const { user, kind, permission, isAuthenticated, isLoading: authLoading, error: authError, refetch: refetchAuth } = useAuth();
  // One reactive subscription: the public world updates as the engine commits each tick.
  const q = useLive(api.games.view, isAuthenticated && code ? { code } : "skip");
  const game = q.data;
  const active = game?.status === "active";
  // The room (membership, the owner's commands, the replay's room); the game view itself does not carry it.
  const room = useLive(api.rooms.get, game?.roomId ? { room: game.roomId } : "skip");
  const seated = !!game && game.roster.some(r => r.id === user?.id);
  useEffect(() => { document.title = `Game ${game?.shortCode ?? code} · Code Gods`; }, [game?.shortCode, code]);
  // The canonical URL names the game's own room and codes.
  const canonical = game?.roomShortCode ? gamePath(game.roomShortCode, game.shortCode) : null;
  useEffect(() => { if (canonical && location !== canonical) navigate(`${canonical}${window.location.search}${window.location.hash}`, { replace: true }); }, [canonical, location, navigate]);
  // The dock acts with the human's own rights: the site session is the human everywhere (owner where they own the
  // room; the engine checks), a dev server's credential has its own permission.
  const access = useMemo(() => kind === "token"
    ? { permission: permission ?? "read", mode: "devserver" as const }
    : { permission: room.data?.ownerId === user?.id ? "owner" as const : "act" as const, mode: "site" as const }, [kind, permission, room.data?.ownerId, user?.id]);

  if (isAuthenticated && game && room.data) {
    if (active && seated) return <Play roomId={room.data.id} access={access} />;
    if (!active) return <Replay room={room.data} game={game.shortCode} gameId={game.id} meId={user?.id} access={access} />;
  }
  if (isAuthenticated && game && !game.roomShortCode) return <GameError room={{ shortCode: roomCode }} code={code} message="Its room is no longer available." />;
  const step = game ? gameStep(user?.id, game) : null;
  const crumbs = [{ label: game?.roomShortCode ?? roomCode.toUpperCase(), href: roomPath(game?.roomShortCode ?? roomCode) }, { label: `Game ${game?.shortCode ?? code.toUpperCase()}` }];
  return (
    <Page game={game ?? null} room={room.data ?? null} crumbs={crumbs} placeholder={`Search or do anything in ${game?.shortCode ?? code.toUpperCase()}`}
      suggested={step?.primary ? [step.primary] : []} conn={game ? { ok: !q.error, label: "live" } : null}>
      {authError ? <div className="mx-auto max-w-lg px-4 py-20"><ErrorLine message={errMsg(authError)} onRetry={() => void refetchAuth()} /></div>
      : authLoading ? null : !isAuthenticated ? <SignInToWatch code={code} />
      : q.isLoading || (game && !room.data && !room.error) ? (
        <div className="mx-auto max-w-[1440px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-2 gap-4"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>
      ) : !game ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <h1 className="font-display text-5xl" data-testid="text-game-code">{code}</h1>
          <ErrorLine message={q.error ? errMsg(q.error) : "Game not found. Check the code, or open it from its room."} />
          <Link href="/" className="underline underline-offset-4" data-testid="link-game-home">Your rooms</Link>
        </div>
      ) : <SpectatorView game={game} room={room.data} />}
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
