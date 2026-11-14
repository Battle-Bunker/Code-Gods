/**
 * The replay controller (integration plan W5-5): one ended game's replay on its game page. It downloads the stored
 * file once, with the viewer's token (a one-off download of an immutable file, engine GET /api/v2/replay/<gameId>),
 * keeping a live subscription to `v2/replays:stored` until the file is there (it is built just after the end); it folds
 * it (./fold.ts) and keeps the playhead: the cursor of the human's view state (the `replay.*` affordances, so an
 * assistant or another of their clients moves it too), moved on in world time while the replay plays (./playhead.ts).
 *
 * It answers the SDK hooks at the playhead (sdk/replay.ts), as the player the replay is watched as (`replay.watchAs`,
 * else the viewer's own seat, else the first player), so every pane works unchanged; and it tells the replay bar
 * (./bar.tsx) where the playhead is.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLive } from "@/site/lib/convex";
import { appAccessToken, engineSite } from "@/core/connection";
import { useView } from "@/core/affordance-runtime";
import { GameScopeProvider, ReplaySourceContext, useGameScope, type ReplaySource } from "@/sdk";
import { frameAt, indexReplay, resolveCursor, type ReplayIndex } from "./fold";
import { cursorWorld, playheadAt, type Anchor } from "./playhead";

/** While playing, the panes follow the playhead at most this often (each answer re-renders every pane). */
const ANSWER_MS = 150;

export type ReplayLoad =
  | { status: "waiting" }                       // the file is being built (the game ended a moment ago)
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; index: ReplayIndex };

export interface ReplayControls {
  load: ReplayLoad;
  /** Ask for the file again after a failed download (the player's own press). */
  retry(): void;
  index: ReplayIndex | null;
  /** Events applied at the playhead, and its world time. */
  applied: number;
  world: number;
  /** Where the stored cursor is (behind the playhead while playing). */
  cursorAt: number;
  playing: boolean;
  speed: number;
  /** Whose eyes the replay is watched through. */
  member: string | null;
  /** The viewer's own seat in the game, or null. */
  seat: string | null;
}

const ControlsContext = createContext<ReplayControls | null>(null);
export function useReplayControls(): ReplayControls | null {
  return useContext(ControlsContext);
}

export const replayUrl = (site: string, gameId: string) => `${site.replace(/\/$/, "")}/api/v2/replay/${encodeURIComponent(gameId)}`;

async function download(gameId: string): Promise<ReplayIndex> {
  const token = await appAccessToken();
  const response = await fetch(replayUrl(engineSite(), gameId), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `The engine answered ${response.status}.`);
  }
  return indexReplay(await response.json());
}

/** The game's stored replay, downloaded once it is stored (`active` only: a page that is not replaying asks for nothing). */
function useReplayFile(gameId: string, active: boolean): { load: ReplayLoad; retry(): void } {
  const [state, setState] = useState<{ gameId: string; attempt: number; load: ReplayLoad }>({ gameId, attempt: 0, load: { status: "waiting" } });
  const mine = state.gameId === gameId ? state : { gameId, attempt: 0, load: { status: "waiting" } as ReplayLoad };
  const ready = mine.load.status === "ready";
  const stored = useLive(api.v2.replays.stored, active && !ready ? { gameId } : "skip").data?.stored;
  useEffect(() => {
    if (!active || !stored || mine.load.status !== "waiting") return;
    let cancelled = false;
    setState({ gameId, attempt: mine.attempt, load: { status: "loading" } });
    download(gameId).then(
      index => { if (!cancelled) setState({ gameId, attempt: mine.attempt, load: { status: "ready", index } }); },
      (e: unknown) => { if (!cancelled) setState({ gameId, attempt: mine.attempt, load: { status: "error", message: e instanceof Error ? e.message : String(e) } }); },
    );
    // Left before it arrived (the replay closed): the next open asks again.
    return () => { if (!cancelled) { cancelled = true; setState(s => (s.load.status === "loading" ? { ...s, load: { status: "waiting" } } : s)); } };
  }, [active, stored, gameId, mine.attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = useCallback(() => setState(s => ({ gameId, attempt: s.attempt + 1, load: { status: "waiting" } })), [gameId]);
  return { load: mine.load, retry };
}

/**
 * Wraps the game screen's body. Inactive (not replaying), it only passes its children through; active, it provides
 * the replay's answers to the SDK and the playhead to the bar, and seats the screen as the watched player.
 */
export function ReplayProvider({ gameId, active, seat, children }: { gameId: string; active: boolean; seat: string | null; children: ReactNode }) {
  const { load, retry } = useReplayFile(gameId, active);
  const index = active && load.status === "ready" ? load.index : null;
  const shown = useView().replay;
  // A replay closed here stays on screen as it was until the page leaves it (no jump back to the start on the way out).
  const last = useRef<typeof shown>(null);
  if (shown && shown.gameId === gameId) last.current = shown;
  const view = shown && shown.gameId === gameId ? shown : last.current;
  const cursor = view?.cursor ?? { seq: 0 };
  const cursorKey = JSON.stringify(cursor);
  const playing = !!view?.playing && !!index;
  const speed = view?.speed ?? 1;
  const cursorAt = index ? resolveCursor(index, cursor) : 0;

  // The playhead while playing: anchored where the cursor was put (or where it was when the speed changed).
  const anchor = useRef<Anchor | null>(null);
  const [moving, setMoving] = useState<{ world: number; applied: number } | null>(null);
  useEffect(() => {
    if (!index || !playing) { anchor.current = null; setMoving(null); return; }
    anchor.current = { world: cursorWorld(index, cursor), at: performance.now(), speed };
    setMoving(null);
  }, [index, cursorKey, playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!index || !anchor.current || anchor.current.speed === speed) return;
    const now = performance.now(), p = playheadAt(index, anchor.current, now);
    anchor.current = { world: p.world, at: now, speed };
  }, [index, speed]);

  // At the end, the cursor is written there and the replay stops (the human's other clients stop with it).
  const seek = useAffordance("replay.seek"), pause = useAffordance("replay.pause");
  const finish = useRef(async () => {});
  finish.current = async () => {
    if (!index) return;
    try { await seek.run({ seq: index.end }); await pause.run({}); } catch { /* another client moved it: theirs stands */ }
  };
  useEffect(() => {
    if (!index || !playing) return;
    let raf = 0, last = -Infinity, done = false;
    const frame = (now: number) => {
      const a = anchor.current;
      if (a) {
        const p = playheadAt(index, a, now);
        if (now - last >= ANSWER_MS || p.done) { last = now; setMoving({ world: p.world, applied: p.applied }); }
        if (p.done) { if (!done) { done = true; void finish.current(); } return; }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [index, playing]);

  const applied = playing && moving ? moving.applied : cursorAt;
  const world = index ? (playing && moving ? moving.world : cursorWorld(index, cursor)) : 0;
  const roster = index?.roster ?? [];
  const inRoster = (m: string | null | undefined): m is string => !!m && roster.some(r => r.memberId === m);
  const member = inRoster(view?.as) ? view!.as! : inRoster(seat) ? seat : roster[0]?.memberId ?? null;

  const frame = useMemo(() => (index ? frameAt(index, applied) : null), [index, applied]);
  const source = useMemo((): ReplaySource | null => (index && frame && member ? { index, frame, member } : null), [index, frame, member]);
  const controls = useMemo((): ReplayControls => ({ load, retry, index, applied, world, cursorAt, playing, speed, member, seat }),
    [load, retry, index, applied, world, cursorAt, playing, speed, member, seat]);
  const scope = useGameScope();
  const seated = useMemo(() => ({ ...scope, seated: true }), [scope]);

  if (!active) return <>{children}</>;
  return (
    <ControlsContext.Provider value={controls}>
      <ReplaySourceContext.Provider value={source}>
        <GameScopeProvider scope={source ? seated : scope}>{children}</GameScopeProvider>
      </ReplaySourceContext.Provider>
    </ControlsContext.Provider>
  );
}
