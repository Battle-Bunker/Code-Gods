/**
 * An ended game's page, {base}rooms/:room/games/:game (docs/replay-design.md §4): the player client's own dock in
 * replay mode. Every built-in and stored panel shows the game at the replay's playhead (the SDK's answers come from
 * the replay: sdk/replay-source.ts), the header is the replay's transport, the Timeline panel drives the playhead, and
 * nothing acts. Deep links: `?e=<event>` or `?t=<world seconds>`, `&speed=`, `&play=1`, `&as=<god id>`; the URL
 * follows the playhead whenever it stops. If the replay cannot load, the game's final state (history/historic-game)
 * is shown instead.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { buildReplay, cursorAtWorld, type ReplayPage } from "@workspace/player-client/replay";
import { RoomProvider } from "@/sdk/context";
import { ReplaySourceContext } from "@/sdk/replay-source";
import { MyGoalProvider } from "@/sdk/goal";
import { PlayerShell } from "@/dock/shell";
import { CoreBoundary } from "@/core/core-boundary";
import { Link, hrefTo } from "../navigation";
import { parseReplayParams, replaySearch } from "./model";
import { ReplayController, replaySource } from "./controller";
import { AgentCode, AgentCodeContext, ReplayControllerContext, Transport, useReplayKeys } from "./parts";

type Load = { pages: ReplayPage[]; done: boolean; error?: string };

/** Every page of the game's replay (player.replay), fetched in order. */
export function useReplayPages(roomId: string, gameId: string): Load {
  const convex = useConvex();
  const [load, setLoad] = useState<Load>({ pages: [], done: false });
  useEffect(() => {
    let live = true;
    setLoad({ pages: [], done: false });
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
        if (live) setLoad({ pages, done: true, error: (error as { data?: { message?: string } }).data?.message ?? (error as Error).message });
      }
    })();
    return () => { live = false; };
  }, [convex, roomId, gameId]);
  return load;
}

type Room = { id: string; shortCode: string };
type Access = { permission: "read" | "act" | "owner"; mode: "devserver" | "hosted" };

export function ReplayGame({ room, gameId, gameCode, access, fallback }: { room: Room; gameId: string; gameCode: string; access: Access; fallback: (error: string) => ReactNode }) {
  const load = useReplayPages(room.id, gameId);
  // Folded once, when every page is in: the playhead, a deep link and the curves all need the whole log.
  const replay = useMemo(() => (load.done && load.pages.length ? buildReplay(load.pages) : null), [load.done, load.pages]);
  const controller = useMemo(() => {
    if (!replay) return null;
    const p = parseReplayParams(location.search);
    const pov = replay.game.roster.findIndex(g => g.id === p.as);
    const cursor = p.e !== undefined ? p.e : p.t !== undefined ? cursorAtWorld(replay, p.t) : replay.log.length;
    return new ReplayController(replay, { roomId: room.id, roomShortCode: room.shortCode }, { cursor, speed: p.speed, ...(pov >= 0 ? { pov } : {}) });
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
  // The URL follows the playhead whenever it stops (never while playing).
  useEffect(() => controller.subscribe(() => {
    const v = controller.get();
    if (v.playing) return;
    const search = replaySearch(location.search, { e: v.cursor, speed: v.speed, as: controller.replay.game.roster[v.pov]?.id });
    if (search !== location.search) history.replaceState(history.state, "", `${location.pathname}${search}`);
  }), [controller]);
  const sdkRoom = useMemo(() => ({ roomId: room.id, ...access }), [room.id, access]);
  const source = useMemo(() => replaySource(controller), [controller]);
  const exit = hrefTo({ kind: "room", room: room.shortCode });
  const header = (
    <div data-testid="historic-game" data-game-id={controller.replay.game.id}>
      <div className="flex h-9 items-center gap-3 border-b border-[hsl(var(--card-border))] px-3 text-sm">
        <Link to={{ kind: "room", room: room.shortCode }} className="underline" data-testid="link-room">Room {room.shortCode}</Link>
        <Link to={{ kind: "games", room: room.shortCode }} className="underline" data-testid="link-past-games">Past games</Link>
        <span className="font-serif text-base">Game <span className="font-mono" data-testid="text-game-code">{gameCode}</span></span>
        <span className="label" data-testid="text-game-status">ended · read-only replay</span>
        {partial && <span className="text-xs text-destructive" data-testid="text-replay-partial">Only part of the replay loaded ({partial}).</span>}
      </div>
      <Transport controller={controller} exitHref={exit} />
    </div>
  );
  return (
    <RoomProvider room={sdkRoom}>
      <ReplaySourceContext.Provider value={source}>
        <ReplayControllerContext.Provider value={controller}>
          <AgentCodeContext.Provider value={setAgent}>
            <CoreBoundary>
              {/* The point-of-view god's goal explains every grid, as the live client's own goal does (sdk/goal.tsx). */}
              <MyGoalProvider>
                <PlayerShell replay={{ header }} />
              </MyGoalProvider>
            </CoreBoundary>
            {agent && <AgentCode controller={controller} agentId={agent} onClose={() => setAgent(null)} />}
          </AgentCodeContext.Provider>
        </ReplayControllerContext.Provider>
      </ReplaySourceContext.Provider>
    </RoomProvider>
  );
}
