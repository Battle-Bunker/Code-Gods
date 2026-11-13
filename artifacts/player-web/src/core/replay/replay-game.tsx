/**
 * An ended game's page, {base}rooms/:room/games/:game (docs/replay-design.md §4): the player client's own dock in
 * replay mode. Every built-in and stored panel shows the game at the replay's playhead (the SDK's answers come from
 * the replay: sdk/replay-source.ts), the replay bar at the bottom drives the playhead (so does the Timeline panel), and
 * nothing acts. Deep links: `?e=<event>` or `?t=<world seconds>`, `&speed=`, `&play=1`, `&as=<god id>`; the URL
 * follows the playhead whenever it stops. If the replay cannot load, the game's final state (history/historic-game)
 * is shown instead.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { buildReplay, type ReplayPage } from "@workspace/player-client/replay";
import { RoomProvider } from "@/sdk/context";
import { ReplaySourceContext } from "@/sdk/replay-source";
import { MyGoalProvider } from "@/sdk/goal";
import { PlayerShell } from "@/dock/shell";
import { CoreBoundary } from "@/core/core-boundary";
import { useAccessToken, useLive } from "@/site/lib/convex";
import { engineSite } from "@/core/connection";
import { endReasonLabel } from "@/site/lib/time";
import { Link, hrefTo } from "../navigation";
import { PlayerPalette } from "../header";
import { BackToResults } from "@/dock/results-toggle";
import { parseReplayParams, replaySearch } from "./model";
import { ReplayController, replaySource } from "./controller";
import { AgentCode, AgentCodeContext, ReplayBar, ReplayControllerContext, useReplayKeys } from "./parts";
import { STORED_REPLAY_VERSION, pagesFromStored, storedReplayUrl } from "./stored";

type Load = { pages: ReplayPage[]; done: boolean; error?: string };
const LOADING: Load = { pages: [], done: false };
const errorText = (error: unknown) => (error as { data?: { message?: string } }).data?.message ?? (error as Error).message;

/**
 * The game's whole replay: the file stored when it ended (replays.stored says it is there; an immutable record fetched
 * once from the engine's /api/replay route with the signed-in human's JWT), or its pages
 * for a game whose file is not there (ended before stored replays, until migrations:backfillReplays builds it; or its
 * build failed) or cannot be read (a failed download, another file version).
 */
export function useReplayLoad(roomId: string, gameId: string): Load {
  const stored = useLive(api.replays.stored, { roomId, gameId });
  // The source is chosen once per game: a page opened as the game ends pages its log, and the file stored a moment
  // later does not rebuild the replay under the viewer. A stored file that fails moves it to the pages, once.
  const [source, setSource] = useState<{ gameId: string; stored: boolean } | null>(null);
  const known = stored.data ? { gameId, stored: stored.data.stored } : null;
  useEffect(() => { if (known && source?.gameId !== gameId) setSource(known); }, [known?.gameId, known?.stored, source?.gameId, gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = source?.gameId === gameId ? source : known;
  const fetched = useStoredReplay(chosen?.stored && stored.data?.stored ? { roomId, gameId, viewer: stored.data.viewer } : null);
  const failed = chosen?.stored === true && !!fetched.error;
  useEffect(() => { if (failed) { console.warn("[replay] stored replay unusable, paging the log:", fetched.error); setSource({ gameId, stored: false }); } }, [failed, gameId]); // eslint-disable-line react-hooks/exhaustive-deps
  const paged = useReplayPages(roomId, gameId, chosen?.stored === false);
  if (stored.error && !chosen) return { pages: [], done: true, error: errorText(stored.error) };
  if (!chosen || failed) return LOADING;
  return chosen.stored ? fetched : paged;
}

/**
 * One fetch of the stored file, authorised by the signed-in human's Convex JWT (the engine checks it like
 * player.replay); a failure is reported (the caller then pages the log), never retried.
 */
function useStoredReplay(stored: { roomId: string; gameId: string; viewer: ReplayPage["viewer"] } | null): Load {
  // The token source is read when the download starts; a new source (a refreshed session) never downloads again.
  const accessToken = useAccessToken();
  const fetchToken = useRef(accessToken);
  fetchToken.current = accessToken;
  const [load, setLoad] = useState<{ key: string; load: Load } | null>(null);
  const key = stored ? `${stored.roomId} ${stored.gameId} ${stored.viewer.godId} ${stored.viewer.index}` : "";
  useEffect(() => {
    if (!stored) return;
    let live = true;
    void fetchToken.current()
      .then(token => (token ? fetch(storedReplayUrl(engineSite(), stored.roomId, stored.gameId), { headers: { authorization: `Bearer ${token}` } }) : Promise.reject(new Error("Not signed in."))))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`The stored replay did not download (HTTP ${r.status}).`))))
      .then(file => pagesFromStored(file, STORED_REPLAY_VERSION, stored.viewer))
      .then(pages => { if (live) setLoad({ key, load: { pages, done: true } }); },
        error => { if (live) setLoad({ key, load: { pages: [], done: true, error: errorText(error) } }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return load?.key === key ? load.load : LOADING;
}

/**
 * Every page of the game's replay (player.replay), fetched in order: only for a game without a stored replay, until
 * migrations:backfillReplays reports done everywhere. A failed page shows the game's final state with the error.
 */
function useReplayPages(roomId: string, gameId: string, enabled: boolean): Load {
  const convex = useConvex();
  const [load, setLoad] = useState<Load>(LOADING);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoad(LOADING);
    void (async () => {
      const pages: ReplayPage[] = [];
      let cursor: { afterSeq: number; chatAfter: number; eventOffset?: number } | undefined;
      try {
        for (;;) {
          const page = await convex.query(api.player.replay, { roomId, gameId, ...cursor }) as unknown as ReplayPage;
          if (!live) return;
          pages.push(page);
          setLoad({ pages: [...pages], done: page.done });
          if (page.done) return;
          cursor = { afterSeq: page.nextCursor, chatAfter: page.chatCursor, ...(page.eventOffset !== undefined ? { eventOffset: page.eventOffset } : {}) };
        }
      } catch (error) {
        if (live) setLoad({ pages, done: true, error: errorText(error) });
      }
    })();
    return () => { live = false; };
  }, [convex, roomId, gameId, enabled]);
  return load;
}

type Room = { id: string; shortCode: string };
type Access = { permission: "read" | "act" | "owner"; mode: "devserver" | "site" };

export function ReplayGame({ room, gameId, gameCode, access, fallback }: { room: Room; gameId: string; gameCode: string; access: Access; fallback: (error: string) => ReactNode }) {
  const load = useReplayLoad(room.id, gameId);
  // Folded once, when every page is in: the playhead, a deep link and the curves all need the whole log.
  const replay = useMemo(() => (load.done && load.pages.length ? buildReplay(load.pages) : null), [load.done, load.pages]);
  const controller = useMemo(() => {
    if (!replay) return null;
    const p = parseReplayParams(location.search);
    const pov = replay.game.roster.findIndex(g => g.id === p.as);
    const start = p.e !== undefined ? { cursor: p.e } : p.t !== undefined ? { cursor: 0, world: p.t } : { cursor: replay.log.length, world: Infinity };
    return new ReplayController(replay, { roomId: room.id, roomShortCode: room.shortCode }, { ...start, speed: p.speed, ...(pov >= 0 ? { pov } : {}) });
  }, [replay, room.id, room.shortCode]);
  useEffect(() => {
    if (!controller) return;
    if (parseReplayParams(location.search).play) controller.play();
    return () => controller.dispose();
  }, [controller]);
  if (!replay || !controller) {
    if (load.error) return <>{fallback(load.error)}</>;
    const events = load.pages.reduce((n, p) => n + p.batches.reduce((m, b) => m + b.events.length, 0), 0);
    return <p className="p-6 text-sm text-muted-foreground" data-testid="status-replay-loading">Loading the replay of game {gameCode}… {events ? `${events} events so far` : ""}</p>;
  }
  return <ReplayDock room={room} gameCode={gameCode} access={access} controller={controller} partial={load.error} />;
}

function ReplayDock({ room, gameCode, access, controller, partial }: { room: Room; gameCode: string; access: Access; controller: ReplayController; partial?: string }) {
  const [agent, setAgent] = useState<string | null>(null);
  useReplayKeys(controller);
  // The URL follows the playhead whenever it stops (never while playing or dragging): the exact event after a step, else the time.
  useEffect(() => controller.subscribe(() => {
    const v = controller.get();
    if (v.playing || v.scrubbing) return;
    const onEvent = v.cursor > 0 && v.world === controller.replay.worldMax[v.cursor - 1];
    const as = controller.replay.game.roster[v.pov]?.id;
    const search = replaySearch(location.search, onEvent ? { e: v.cursor, speed: v.speed, as } : { t: v.world, speed: v.speed, as });
    if (search !== location.search) history.replaceState(history.state, "", `${location.pathname}${search}`);
  }), [controller]);
  const sdkRoom = useMemo(() => ({ roomId: room.id, ...access }), [room.id, access]);
  const source = useMemo(() => replaySource(controller), [controller]);
  const exit = hrefTo({ kind: "room", room: room.shortCode });
  const header = (
    <div data-testid="historic-game" data-game-id={controller.replay.game.id}>
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[hsl(var(--card-border))] px-3 py-1 text-sm">
        <Link to={{ kind: "room", room: room.shortCode }} className="underline" data-testid="link-room">Room {room.shortCode}</Link>
        <Link to={{ kind: "room", room: room.shortCode }} className="underline" data-testid="link-past-games">Past games</Link>
        <span className="font-serif text-base">Game <span className="font-mono" data-testid="text-game-code">{gameCode}</span></span>
        <span className="label" data-testid="text-game-status">{controller.replay.game.endReason ? `game over: ${endReasonLabel(controller.replay.game.endReason)}` : "ended"} · read-only replay</span>
        {partial && <span className="text-xs text-destructive" data-testid="text-replay-partial">Only part of the replay loaded ({partial}).</span>}
        <BackToResults />
        <PlayerPalette compact suggested={["ui.replay.toggle", "ui.replay.start", "ui.replay.end"]} />
      </div>
    </div>
  );
  const footer = <ReplayBar controller={controller} exitHref={exit} />;
  return (
    <RoomProvider room={sdkRoom}>
      <ReplaySourceContext.Provider value={source}>
        <ReplayControllerContext.Provider value={controller}>
          <AgentCodeContext.Provider value={setAgent}>
            <CoreBoundary>
              {/* The point-of-view god's goal explains every grid, as the live client's own goal does (sdk/goal.tsx). */}
              <MyGoalProvider>
                <PlayerShell replay={{ header, footer }} />
              </MyGoalProvider>
            </CoreBoundary>
            {agent && <AgentCode controller={controller} agentId={agent} onClose={() => setAgent(null)} />}
          </AgentCodeContext.Provider>
        </ReplayControllerContext.Provider>
      </ReplaySourceContext.Provider>
    </RoomProvider>
  );
}
