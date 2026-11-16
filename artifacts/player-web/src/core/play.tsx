/**
 * A game's screen (site/pages/game.tsx routes here on the header it already holds, ux-lessons 4.2): the game bar (your
 * points and energy always visible, also on a phone: ux-lessons 2.5), the clock, the planning line and the dock.
 * Seated players and spectators get the same frame; panes show what the viewer may see.
 *
 * An ended game whose replay the human opened (`replay.open`: the results, the room's past games, or `?replay` on the
 * game's URL) is shown in replay: the replay bar takes the clock's place, the dock takes the replay's arrangement, and
 * every pane answers from the replay at the playhead (src/replay/controller.tsx).
 */
import { DriftToast } from "@/panes/drift";
import { fixedLength } from "./timer-text";
import { summonFirst } from "@/panes/first-summon";
import { memo, useEffect, useMemo, useRef, type ReactNode } from "react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useAffordance } from "@workspace/v2-affordances/react";
import type { GamePhase } from "@workspace/v2-client";
import { AffordanceButton, failureText } from "@/site/components/action";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { Page } from "@/site/components/layout";
import { useAuth } from "@/site/hooks/use-auth";
import { roomPath } from "@/site/lib/routes";
import { GameScopeProvider, useAgentCount, useLeaderboard, useMe, useOthersBlurred } from "@/sdk";
import { useLive } from "@/site/lib/convex";
import type { Header, Room } from "@/sdk/types";
import { Dock } from "@/dock/dock";
import { useOpenPane } from "@/dock/open-pane";
import { LiveErrorPanel } from "@/dock/pane-parts";
import { PANE_COMPONENTS, StoredPanelPane } from "@/panes";
import { ReplayBar } from "@/replay/bar";
import { parseMoment } from "@/replay/moment-link";
import { ReplayProvider, useReplayControls } from "@/replay/controller";
import { toast } from "@/hooks/use-toast";
import { affordanceContext } from "./affordance-context";
import { useReplaying } from "./affordance-runtime";
import { GameTimer, useNow } from "./game-timer";
import { navigate } from "./navigation";
import { planningLine, SUMMON_FIRST } from "./planning-line";
import { countedNote, exactTotalNote, isTied, ownEnergy, myTotalText, ordinal, scoreSentence, totalNote, totalSumNote } from "./words";
import { objectWord } from "../sdk/object-types.ts";
import { LineByLine, TiedMark } from "./score-help";
import { SAFE_MODE } from "./safe-mode";

const PHASE = { planning: "Planning", live: "Running", paused: "Paused", ended: "Ended" } as const;

/** Your total and rank, and your energy: one line under the site header. In a replay: the watched player's, at the playhead. */
function GameBar({ header }: { header: Header }) {
  const blurred = useOthersBlurred();
  const standings = useLeaderboard();
  const me = useMe();
  const replay = useReplayControls();
  const openPane = useOpenPane(header.phase);
  const seat = replay ? replay.member : header.me;
  const mine = standings?.rows.find(r => r.memberId === seat);
  const who = !replay || seat === header.me ? "You" : header.roster.find(m => m.memberId === seat)?.name ?? "This player";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 text-sm" data-testid="game-bar">
      <span className="border px-2 py-0.5 text-xs font-medium uppercase tracking-wide" data-testid="text-phase">{replay ? "Replay" : PHASE[header.phase]}</span>
      {seat ? (<>
        <span data-testid="text-my-total" title={[blurred ? exactTotalNote(objectWord(header.variant).one) : null, scoreSentence(objectWord(header.variant).one, objectWord(header.variant).many), totalNote(totalSumNote(objectWord(header.variant).one), (mine?.handicap ?? 0) > 0), countedNote(standings?.worldSeconds, fixedLength(header))].filter(Boolean).join(" ")}>
          {who}: <span className="font-semibold tabular-nums">{myTotalText(mine)}</span>{mine && standings && standings.rows.length > 1 ? ` · ${ordinal(mine.rank)} of ${standings.rows.length}` : ""}
          {mine && standings && isTied(standings.rows, mine) && <> <TiedMark testId="text-my-tied" /></>}
        </span>
        <LineByLine testId="button-line-by-line-bar" />
        {me && (() => { const e = ownEnergy(me); return <span data-testid="text-my-energy" data-full={e.full || undefined} title={e.title}>Energy <span className="font-semibold tabular-nums">{e.text}</span>
          {/* A full store stops rising: say so where a phone (no hover) can read it, with the way to spend it. */}
          {e.full && !replay && header.phase !== "ended" && <> <button type="button" className="text-xs underline underline-offset-4" onClick={() => void openPane("forge")} data-testid="button-energy-full">spend it on another agent</button></>}
        </span>; })()}
      </>) : <span className="text-muted-foreground" data-testid="text-watching">You're watching this game.</span>}
    </div>
  );
}

/** Planning's one line: the countdown, "Summon my first agent", and the owner's "Start the world now" (ux-lessons 1.7, 1.8). */
function PlanningBar({ header, owner }: { header: Header; owner: boolean }) {
  const now = useNow();
  const openPane = useOpenPane(header.phase);
  // An accepted summon counts at once, even while the subscriptions lag it (ux-lessons 1.8).
  const count = useAgentCount();
  const line = planningLine({ phase: header.phase, seated: header.me !== null, owner, planningEndsAt: header.planningEndsAt, nowMs: now, agents: count });
  if (!line) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-[hsl(var(--muted))]/40 px-3 py-2 text-sm" data-testid="planning-line">
      <span className="flex-1 min-w-[12rem]">{line.text}</span>
      {line.summon && <button type="button" className="bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium" onClick={() => void summonFirst(header.gameId, openPane)} data-testid="button-summon-first">{SUMMON_FIRST}</button>}
      {line.startNow && <AffordanceButton id="game.startWorldNow" args={{}} label="Start the world now" busyLabel="Starting the world…" tone="secondary" testId="button-start-world" />}
    </div>
  );
}

/** A bar whose read failed: plain words, and it comes back by itself on that read's next answer (as a pane does). */
function BarError(props: ErrorFallbackProps) {
  return <LiveErrorPanel {...props} what="Your totals" testId="bar-error" className="flex flex-wrap gap-x-3 border-b px-3 py-1.5 text-xs [&>p]:m-0" />;
}

/**
 * `?replay` on a game's URL opens its replay (`replay.open`) when the game has ended, once; the parameter then leaves
 * the URL whatever happened (a game still running has no replay yet, and must not open one by itself when it ends).
 */
function ReplayRoute({ header }: { header: Header }) {
  const { gameId } = header, ended = header.phase === "ended";
  const replaying = useReplaying();
  const open = useAffordance("replay.open");
  const seek = useAffordance("replay.seek");
  const watchAs = useAffordance("replay.watchAs");
  const done = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (done.current || !q.has("replay")) return;
    if (ended && !replaying && !open.available) return;   // the room is still loading
    done.current = true;
    // A moment link (`&t=…&as=…`, "Copy a link to this moment") opens the replay there, as that player.
    const moment = parseMoment(location.search);
    q.delete("replay"); q.delete("t"); q.delete("as");
    const leave = () => navigate(`${location.pathname}${q.size ? `?${q}` : ""}`, { replace: true });
    if (!ended) { leave(); return; }
    // Then the moment, if the link names one; a replay already open (the view is stored) only moves to it.
    const toMoment = () => Promise.resolve()
      .then(() => moment.as && header.roster.some(m => m.memberId === moment.as) ? watchAs.run({ memberId: moment.as }) : undefined)
      .then(() => moment.worldSeconds !== null ? seek.run({ worldSeconds: moment.worldSeconds }) : undefined);
    (replaying ? toMoment() : open.run({ gameId }).then(toMoment))
      .then(leave, (e: unknown) => { leave(); toast({ title: "The replay did not open", description: failureText(e), variant: "destructive" }); });
  }, [gameId, ended, replaying, open, seek, watchAs, header.roster]);
  return null;
}

/** The dock never re-renders for the replay's clock alone (only what its panes read: the view and the replay's frame). */
const StableDock = memo(Dock);

/** The screen under the site header: the bars and the dock, in play or, for an ended game, in its replay. */
function GameBody({ header, owner }: { header: Header; owner: boolean }) {
  const replaying = useReplaying();
  return (
    <ReplayProvider gameId={header.gameId} active={replaying} seat={header.me}>
      <ErrorBoundary FallbackComponent={BarError}><GameBar header={header} /></ErrorBoundary>
      {replaying ? <ReplayBar /> : <GameTimer header={header} />}
      {!replaying && <ErrorBoundary FallbackComponent={BarError}><PlanningBar header={header} owner={owner} /></ErrorBoundary>}
      <GameDock phase={replaying ? "replay" : header.phase} />
      {!replaying && <DriftToast />}
    </ReplayProvider>
  );
}

/** The dock, once a replay's file is folded (until then the replay bar says where it is). */
function GameDock({ phase }: { phase: GamePhase }): ReactNode {
  const waiting = useReplayControls()?.index === null;
  if (waiting) return null;
  return (
    <>
      {SAFE_MODE && <p className="shrink-0 px-3 py-1 text-xs text-muted-foreground" data-testid="text-safe-mode">Safe mode: your panels are off</p>}
      <div className="min-h-0 flex-1" data-testid="dock"><StableDock phase={phase} panes={PANE_COMPONENTS} stored={SAFE_MODE ? SafeModePanel : StoredPanelPane} /></div>
    </>
  );
}

/** A stored panel's pane in safe mode: it does not run. */
function SafeModePanel({ slug }: { slug: string }) {
  return <p className="p-4 text-sm text-muted-foreground" data-testid="stored-panel-safe-mode">Safe mode is on (?panels=off), so "{slug}" does not run. Open the page without ?panels=off to run your panels.</p>;
}

function Screen({ header }: { header: Header }) {
  const { user, isAuthenticated } = useAuth();
  // Page-level reads keep their errors as values (ux-lessons 4.2): a failed room or account query never tears the screen
  // down; the panes that show them say so in their own frames.
  const room = useLive(api.v2.rooms.get, { roomId: header.roomId }).data as Room | undefined;
  const me = useLive(api.v2.play.me, header.me ? { gameId: header.gameId } : "skip").data;
  const live = useLive(api.v2.games.header, { gameId: header.gameId }).data ?? header;
  const aiOff = useLive(api.v2.assistant.status, { roomId: header.roomId }).data?.off ?? null;
  const context = useMemo(() => affordanceContext({ signedIn: isAuthenticated, admin: !!user?.isAdmin, room: room ?? null, header: live, me: me ?? null, aiOff }),
    [isAuthenticated, user?.isAdmin, room, live, me?.energy, me?.pauseUsed, me?.agents, aiOff]); // eslint-disable-line react-hooks/exhaustive-deps
  const code = room?.code ?? "";
  const owner = !!room?.members.find(m => m.me)?.owner;
  return (
    <Page context={context} scope={{ roomId: header.roomId, gameId: header.gameId }} fill dockPhase={live.phase} noun={objectWord(header.variant)} roomPath={code ? roomPath(code) : undefined}
      crumbs={[{ label: code || "Room", href: code ? roomPath(code) : undefined }, { label: `Game ${header.number}` }]} chip={`Game ${header.number}`}
      placeholder="Search or do anything in this game">
      <ReplayRoute header={live} />
      <GameBody header={live} owner={owner} />
    </Page>
  );
}

export function PlayScreen({ header }: { header: Header }) {
  const scope = useMemo(() => ({ roomId: header.roomId, gameId: header.gameId, seated: header.me !== null }), [header.roomId, header.gameId, header.me]);
  return <GameScopeProvider scope={scope}><Screen header={header} /></GameScopeProvider>;
}
