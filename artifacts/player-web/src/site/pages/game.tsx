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
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
// The dock (player view and replay) loads only on a game page: home, room and configure stay light.
const Play = lazy(() => import("@/core/play").then(m => ({ default: m.Play })));
const Replay = lazy(() => import("@/core/play").then(m => ({ default: m.Replay })));
const dockFallback = <div className="p-8 text-sm text-muted-foreground" data-testid="status-loading-dock">Loading the game…</div>;
import { api, useLive } from "@/site/lib/convex";
import { catalogOf, type GameHeader } from "@/site/lib/types";
import { useRun } from "@/site/hooks/use-run";
import { useSendChat } from "@/site/hooks/use-chat";
import { useAuth } from "@/site/hooks/use-auth";
import { Page, usePage } from "@/site/components/layout";
import { Tip } from "@/site/components/action";
import { StepAction } from "@/site/components/step-action";
import { ErrorLine, NextStepBar, Section } from "@/site/components/page-parts";
import { Chat, GameChat, GameStandings, Objects, SettingsList, UtilityFamilies } from "@/site/components/game-panels";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { gameStep } from "@/site/lib/next-step";
import { gamePath, roomPath } from "@/site/lib/routes";
import { errMsg, fmt } from "@/site/lib/errors";
import { endReasonLabel, fmtDuration, fmtWhen, secsLeft, toMs, worldSecondsAt } from "@/site/lib/time";
import type { FunctionReturnType } from "convex/server";
import { DEFAULT_SCORE_INTERVAL_SECONDS, gameTimer } from "@workspace/game-core";
import { GameTimerView } from "@/core/game-timer-view";

type GameInstance = FunctionReturnType<typeof api.games.instance>;
import { MoreHorizontal } from "lucide-react";


/**
 * The time now, ticking locally once a second while the game runs: countdowns and the world clock render time passing
 * towards deadlines that come from subscriptions (the header's, the published scoreboard's), never a per-tick query.
 */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return now;
}

/** The world clock: the last published scoreboard's world time, run on locally while the world runs (games.standings). */
function WorldTime({ game, now }: { game: GameHeader; now: number }) {
  const standings = useLive(api.games.standings, { gameId: game.id }).data;
  const running = game.status === "active" && game.phase === "running" && !(game.pauseEndsAt && toMs(game.pauseEndsAt) > now);
  const world = worldSecondsAt(standings?.world != null && standings.at != null
    ? { world: standings.world, at: standings.at, running, resumedAt: Math.max(game.planningEndsAt ?? 0, game.pauseEndsAt ?? 0),
      interval: game.settings.scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS } : null, now);
  return <dd className="tabular-nums" data-testid="text-world-t">{world === null ? "—" : `${fmt(world, 1)} s`}</dd>;
}

/** "Running · world starts in 12 s" / "Paused · resumes in 8 s" / "Ended: time limit". */
function statusLine(game: GameHeader, now: number) {
  if (game.status !== "active") return `Ended: ${endReasonLabel(game.endReason)}.`;
  const plan = secsLeft(game.planningEndsAt, now), pause = secsLeft(game.pauseEndsAt, now);
  // An idle park, a pause for safety or the engine retrying a failing tick (engine lib/engineErrors.ts gameNotice).
  if (game.notice) return game.notice.text;
  if (pause && pause > 0) return `Paused · resumes in ${fmt(pause, 0)} s.`;
  if (plan && plan > 0) return `Planning · world starts in ${fmt(plan, 0)} s.`;
  // Past its deadline, planning holds until every allowed language's agent sandbox is warm (the engine's tick).
  if (game.phase === "planning") return "Planning · agent sandboxes warming up; the world starts when they are ready.";
  return "Running.";
}

/** The prominent timer: planning's countdown, then the fixed game's exact remaining time or the half-life game's 90% range. */
function SiteGameTimer({ game, now }: { game: GameHeader; now: number }) {
  const standings = useLive(api.games.standings, { gameId: game.id }).data;
  if (game.status !== "active" || game.phase === "recovery") return null;
  const paused = !!game.pauseEndsAt && toMs(game.pauseEndsAt) > now;
  const phase = game.phase === "planning" ? "planning" as const : paused || game.phase === "paused" ? "paused" as const : "running" as const;
  const world = worldSecondsAt(standings?.world != null && standings.at != null
    ? { world: standings.world, at: standings.at, running: phase === "running", resumedAt: Math.max(game.planningEndsAt ?? 0, game.pauseEndsAt ?? 0),
      interval: game.settings.scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS } : null, now) ?? 0;
  return <GameTimerView timer={gameTimer({ phase, durationMode: game.settings.durationMode, lengthSeconds: game.settings.halfLifeSeconds, world, planningEndsAt: game.planningEndsAt, nowMs: now })} />;
}

function OwnerMenu({ game }: { game: GameHeader }) {
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
        {game.status === "active" && game.phase === "planning" && !unavailable("rooms.startWorldNow") && <DropdownMenuItem onSelect={() => run("rooms.startWorldNow")} data-testid="menu-start-world-now">Start the world now</DropdownMenuItem>}
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
/**
 * Each part subscribes to what it renders (docs/convex-read-architecture.md §4.2): the header comes from the page, the
 * leaderboard and the world clock from games.standings, the objects from their skeleton and one query per visible row,
 * the chat from rooms.chat, the object type and utility catalog from games.instance.
 */
function SpectatorView({ game, instance, room }: { game: GameHeader; instance?: GameInstance; room?: { members: readonly { id: string }[] } | null }) {
  const { user } = useAuth();
  const { manifest } = usePage();
  const act = useRun();
  const sendChat = useSendChat(game.roomId);
  const active = game.status === "active";
  const now = useNow(active);

  const isOwner = !!user && game.ownerId === user.id;
  const seated = game.roster.some(r => r.id === user?.id);
  const isMember = seated || isOwner || !!room?.members.some(m => m.id === user?.id);
  const canPost = active && isMember && !!game.roomShortCode;
  const step = gameStep(user?.id, game);
  return (
    <div className="mx-auto max-w-[1440px] px-4 md:px-6 py-8 space-y-6">
      {active && <SiteGameTimer game={game} now={now} />}
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
          <GameStandings gameId={game.id} roster={game.roster} meId={user?.id} ownerId={game.ownerId}
            emptyBody={active ? "Scores appear once the world begins to run." : "No standings were recorded."} />
          {game.roomId ? (
            <GameChat roomId={game.roomId} gameId={game.id} canPost={canPost} pending={act.pending}
              placeholder={canPost ? "Say something to everyone…" : "Join the room to chat"}
              closed={active ? undefined : "Chat closed: the game is over. It continues in the room."}
              onSend={(text, done) => act.run("chat", () => sendChat(text), done)} />
          ) : <Chat messages={[]} canPost={false} pending={false} placeholder="" onSend={() => undefined} closed="Its room is no longer available." />}
        </div>
        <Objects gameId={game.id} instance={instance?.objectInstance} emptyBody={active ? "Objects appear once the world begins to run." : "No objects remained when this game ended."} />
      </div>
      <Section title="Game details" collapsible defaultOpen={false} testId="section-game-details">
        <div className="p-4 grid gap-6 md:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm content-start">
            <dt className="label-mono">Started</dt><dd data-testid="text-started">{fmtWhen(game.startedAt)}</dd>
            <dt className="label-mono">Ended</dt><dd data-testid="text-ended">{game.endedAt ? `${fmtWhen(game.endedAt)} (${fmtDuration(toMs(game.endedAt) - toMs(game.startedAt))})` : "still running"}</dd>
            <dt className="label-mono">End reason</dt><dd data-testid="text-end-reason">{active ? "—" : endReasonLabel(game.endReason)}</dd>
            <dt className="label-mono">World time</dt><WorldTime game={game} now={now} />
          </dl>
          <SettingsList settings={game.settings} instance={instance?.objectInstance} />
          <div className="md:col-span-2"><UtilityFamilies catalog={catalogOf(instance?.utilityCatalog)} classes={manifest?.objectTypes.find(t => t.id === game.settings.objectType)?.classes} /></div>
        </div>
      </Section>
    </div>
  );
}

/** The game page: player view, spectator view or replay, for the signed-in viewer (see the module comment). */
export default function Game() {
  const { roomId: roomCode = "", gameId: code = "" } = useParams<{ roomId: string; gameId: string }>();
  const [location, navigate] = useLocation();
  const { user, kind, permission, isAuthenticated, error: authError, refetch: refetchAuth } = useAuth();
  // The page routes on the game's cold header (play, watch or replay): a tick never re-runs it. The world is read by the
  // components that show it (the spectator view), never under the dock.
  const q = useLive(api.games.header, isAuthenticated && code ? { code } : "skip");
  const game = q.data;
  const active = game?.status === "active";
  // The room (membership, the owner's commands, the replay's room); the header carries only its codes.
  const room = useLive(api.rooms.get, game?.roomId ? { room: game.roomId } : "skip");
  const seated = !!game && game.roster.some(r => r.id === user?.id);
  // The object type and utility catalog (static for the game), for the spectator view and the page's rules text.
  // Only the spectator view reads it: wait for the room (or its absence) to know whether the dock takes the page.
  const roomKnown = !game?.roomId || !!room.data || !!room.error;
  const docked = isAuthenticated && !!game && !!room.data && (!active || seated);
  const instance = useLive(api.games.instance, game && roomKnown && !docked ? { gameId: game.id } : "skip").data;
  const view = useMemo(() => (game ? { ...game, objectInstance: instance?.objectInstance } : null), [game, instance]);
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
    if (active && seated) return <Suspense fallback={dockFallback}><Play roomId={room.data.id} access={access} /></Suspense>;
    if (!active) return <Suspense fallback={dockFallback}><Replay room={room.data} game={game.shortCode} gameId={game.id} meId={user?.id} access={access} /></Suspense>;
  }
  const step = game ? gameStep(user?.id, game) : null;
  const crumbs = [{ label: game?.roomShortCode ?? roomCode.toUpperCase(), href: roomPath(game?.roomShortCode ?? roomCode) }, { label: `Game ${game?.shortCode ?? code.toUpperCase()}` }];
  return (
    <Page game={view} room={room.data ?? null} crumbs={crumbs} placeholder={`Search or do anything in ${game?.shortCode ?? code.toUpperCase()}`}
      suggested={step?.primary ? [step.primary] : []} conn={game ? { ok: !q.error, label: active ? "live" : "final" } : null}>
      {authError ? <div className="mx-auto max-w-lg px-4 py-20"><ErrorLine message={errMsg(authError)} onRetry={() => void refetchAuth()} /></div>
      : !isAuthenticated ? null
      // A game whose room was deleted has no roomId: it is shown without its room.
      : q.isLoading || (game?.roomId && !room.data && !room.error) ? (
        <div className="mx-auto max-w-[1440px] px-6 py-8 space-y-4"><Skeleton className="h-20 w-1/2" /><div className="grid lg:grid-cols-2 gap-4"><Skeleton className="h-80" /><Skeleton className="h-80" /></div></div>
      ) : !game ? (
        <div className="mx-auto max-w-lg px-4 py-20 space-y-4">
          <h1 className="font-display text-5xl" data-testid="text-game-code">{code}</h1>
          <ErrorLine message={q.error ? errMsg(q.error) : "Game not found. Check the code, or open it from its room."} />
          <Link href="/" className="underline underline-offset-4" data-testid="link-game-home">Your rooms</Link>
        </div>
      ) : <SpectatorView game={game} instance={instance} room={room.data} />}
    </Page>
  );
}

