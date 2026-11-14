/**
 * A game's screen (site/pages/game.tsx routes here on the header it already holds, ux-lessons 4.2): the game bar (your
 * points and energy always visible, also on a phone: ux-lessons 2.5), the clock, the planning line and the dock.
 * Seated players and spectators get the same frame; panes show what the viewer may see.
 *
 * An ended game whose replay the human opened (`replay.open`: the results, the room's past games, or `?replay` on the
 * game's URL) is shown in replay: the replay bar takes the clock's place, the dock takes the replay's arrangement, and
 * every pane answers from the replay at the playhead (src/replay/controller.tsx).
 */
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
import { GameScopeProvider, useAgentCount, useLeaderboard, useMe } from "@/sdk";
import { useLive } from "@/site/lib/convex";
import type { Header, Room } from "@/sdk/types";
import { Dock } from "@/dock/dock";
import { useOpenPane } from "@/dock/open-pane";
import { PANE_COMPONENTS } from "@/panes";
import { ReplayBar } from "@/replay/bar";
import { ReplayProvider, useReplayControls } from "@/replay/controller";
import { toast } from "@/hooks/use-toast";
import { affordanceContext } from "./affordance-context";
import { useReplaying } from "./affordance-runtime";
import { GameTimer, useNow } from "./game-timer";
import { navigate } from "./navigation";
import { planningLine, SUMMON_FIRST } from "./planning-line";
import { energyText, exactEnergy, ordinal, pointsText } from "./words";

const PHASE = { planning: "Planning", live: "Running", paused: "Paused", ended: "Ended" } as const;

/** Your total and rank, and your energy: one line under the site header. In a replay: the watched player's, at the playhead. */
function GameBar({ header }: { header: Header }) {
  const standings = useLeaderboard();
  const me = useMe();
  const replay = useReplayControls();
  const seat = replay ? replay.member : header.me;
  const mine = standings?.rows.find(r => r.memberId === seat);
  const who = !replay || seat === header.me ? "You" : header.roster.find(m => m.memberId === seat)?.name ?? "This player";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-1.5 text-sm" data-testid="game-bar">
      <span className="border px-2 py-0.5 text-xs font-medium uppercase tracking-wide" data-testid="text-phase">{replay ? "Replay" : PHASE[header.phase]}</span>
      {seat ? (<>
        <span data-testid="text-my-total" title="Points: the sum over every line of the player's ✨ rarity times how much the others want it.">
          {who}: <span className="font-semibold tabular-nums">{pointsText(mine?.net ?? 0)}</span>{mine && standings && standings.rows.length > 1 ? ` · ${ordinal(mine.rank)} of ${standings.rows.length}` : ""}
        </span>
        {me && <span data-testid="text-my-energy" title={`Your own energy: ${exactEnergy(me.energy)}. Summons and replacements are paid from it.`}>Energy <span className="font-semibold tabular-nums">{energyText(me.energy)}</span></span>}
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

function BarError({ error }: ErrorFallbackProps) {
  return <p className="border-b px-3 py-1.5 text-xs text-destructive" role="alert">Your totals could not load: {error instanceof Error ? error.message : String(error)}</p>;
}

/**
 * `?replay` on a game's URL opens its replay (`replay.open`) when the game has ended, once; the parameter then leaves
 * the URL whatever happened (a game still running has no replay yet, and must not open one by itself when it ends).
 */
function ReplayRoute({ header }: { header: Header }) {
  const { gameId } = header, ended = header.phase === "ended";
  const replaying = useReplaying();
  const open = useAffordance("replay.open");
  const done = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (done.current || !q.has("replay")) return;
    if (ended && !replaying && !open.available) return;   // the room is still loading
    done.current = true;
    q.delete("replay");
    const leave = () => navigate(`${location.pathname}${q.size ? `?${q}` : ""}`, { replace: true });
    if (!ended || replaying) { leave(); return; }
    open.run({ gameId }).then(leave, (e: unknown) => { leave(); toast({ title: "The replay did not open", description: failureText(e), variant: "destructive" }); });
  }, [gameId, ended, replaying, open]);
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
    </ReplayProvider>
  );
}

/** The dock, once a replay's file is folded (until then the replay bar says where it is). */
function GameDock({ phase }: { phase: GamePhase }): ReactNode {
  const waiting = useReplayControls()?.index === null;
  if (waiting) return null;
  return <div className="min-h-0 flex-1" data-testid="dock"><StableDock phase={phase} panes={PANE_COMPONENTS} /></div>;
}

function Screen({ header }: { header: Header }) {
  const { user, isAuthenticated } = useAuth();
  // Page-level reads keep their errors as values (ux-lessons 4.2): a failed room or account query never tears the screen
  // down; the panes that show them say so in their own frames.
  const room = useLive(api.v2.rooms.get, { roomId: header.roomId }).data as Room | undefined;
  const me = useLive(api.v2.play.me, header.me ? { gameId: header.gameId } : "skip").data;
  const live = useLive(api.v2.games.header, { gameId: header.gameId }).data ?? header;
  const context = useMemo(() => affordanceContext({ signedIn: isAuthenticated, admin: !!user?.isAdmin, room: room ?? null, header: live, me: me ?? null }),
    [isAuthenticated, user?.isAdmin, room, live, me?.energy, me?.pauseUsed, me?.agents]); // eslint-disable-line react-hooks/exhaustive-deps
  const code = room?.code ?? "";
  const owner = !!room?.members.find(m => m.me)?.owner;
  return (
    <Page context={context} scope={{ roomId: header.roomId, gameId: header.gameId }} fill dockPhase={live.phase} roomPath={code ? roomPath(code) : undefined}
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
