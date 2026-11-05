/**
 * Panel SDK data hooks. Every hook reads a disclosure-filtered engine query with the player's own
 * credential: your own scores and agents, aggregates over the other gods, and public data. Opponents'
 * individual utility functions and per-object scores are never available, here or anywhere in the
 * client.
 *
 * Live hooks take `{ hz }` (default 2, max 5) and re-render at most that often. Data arrives once per
 * engine tick (about once a second) at most, so higher rates only help derived local clocks.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSdkQueries, useSdkQuery } from "@sdk-transport";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@workspace/engine/convex/_generated/api";
import type { Observation } from "@workspace/player-client";
import type { ObjectSort } from "@workspace/player-client/objects-page";
import type { GameSettings } from "@workspace/game-core";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import { useRoom } from "./context";
import { useThrottled } from "./throttle";
import { createEvaluator, type Evaluator } from "./evaluator";
import { extendWith, lastPoints, loadedRun, planWindows, type Series, type TrajectoryPage } from "./trajectory-windows";

export type { Observation };
export type LiveObject = Observation["objects"][number];
export type MyAgent = Observation["agents"][number];
export type ChatMessage = Observation["chat"][number];
export type Standing = Observation["leaderboard"][number];
export type Instance = NonNullable<Observation["instance"]>;
export type Economy = NonNullable<Observation["economy"]>;
export type EventWindow = FunctionReturnType<typeof api.player.events>;
export type GameEvent = EventWindow["events"][number];
export type RoomInfo = FunctionReturnType<typeof api.rooms.get>;
export type MyUtility = NonNullable<FunctionReturnType<typeof api.player.myUtility>>;
export type TrajectoryPoint = { seq: number; worldSeconds: number; value: LiveObject["value"]; ownNetBits: number; peerNetBits: number; payoff: number };

type Live = { hz?: number };

/** The raw v3 observation (what `pnpm player state` prints), throttled. Undefined while loading. */
export function useObservation({ hz }: Live = {}): Observation | undefined {
  const { roomId } = useRoom();
  const observation = useSdkQuery("player.observation", { roomId }, hz) as Observation | undefined;
  return useThrottled(observation, hz);
}

/** Phase, clocks, codes, the instance (mutators, helpers), the economy and your seat. */
export function useGame({ hz }: Live = {}) {
  const o = useObservation({ hz });
  return useMemo(() => o && {
    phase: o.phase, gameId: o.gameId, roomShortCode: o.roomShortCode, gameShortCode: o.gameShortCode,
    seated: o.seated !== false && !!o.gameId, language: o.language, languages: o.languages,
    planningEndsAt: o.planningEndsAt, pauseEndsAt: o.pauseEndsAt,
    instance: o.instance, economy: o.economy, worldSeconds: o.economy?.worldSeconds ?? 0,
    self: { godId: o.self.godId, label: o.self.label, isAI: o.self.isAI, energy: o.self.energy, ready: o.self.ready, pauseUsed: o.self.pauseUsed },
  }, [o]);
}

/** Live objects: `own` (your ordinal and bits), `peerNetBits` (Σ others' net bits), `peerCare`, `payoff`. */
export function useObjects({ hz }: Live = {}): LiveObject[] {
  return useObservation({ hz })?.objects ?? EMPTY;
}

/**
 * A window onto your objects for infinite scroll: the first `limit` objects in `sort` order (payoff, your bits, others' care;
 * `filter` narrows), after the cursor `after` if given, with the next page's cursor, the counts and the footer totals.
 * Live games order by the disclosed, noisy others-sum, as the observation shows it. Undefined while loading; the last
 * answer is kept while the arguments change, so a list does not blank while a larger window loads.
 */
export type ObjectsWindow = NonNullable<FunctionReturnType<typeof api.player.objectsPage>>;
export function useObjectsPage(
  { sort = "payoff", filter = "all", limit = 12, hz }: Live & { sort?: ObjectSort; filter?: "all" | "positive" | "contested" | "chips"; limit?: number } = {},
): ObjectsWindow | undefined {
  const { roomId } = useRoom();
  const page = useSdkQuery("player.objectsPage", { roomId, sort, filter, limit }, hz);
  const throttled = useThrottled(page, hz);
  const [kept, setKept] = useState<{ view: string; window: ObjectsWindow }>();
  const view = `${sort}|${filter}`;
  useEffect(() => { if (throttled && throttled !== kept?.window) setKept({ view, window: throttled }); }, [throttled, kept, view]);
  // Kept only for the same order: a new sort shows nothing (the panel keeps its place) rather than the old order.
  return throttled ?? (kept?.view === view ? kept.window : undefined);
}

/** Your own utility card (kid card: emoji, summary, source, optional defence goal). */
export function useMyCard() {
  return useObservation({ hz: 0.5 })?.self.utility;
}

/**
 * Your agents with settled energy and eligibility, plus the rules to project them: an agent earns
 * its income (`agents[].income` = powerShare × `economy.powerPerSecond`) per world second with no cap, can be offered a turn while its energy is above 0 (the more
 * energy, the likelier), and an act can drive energy negative (it then waits for income to lift it above 0).
 */
export function useMyAgents({ hz }: Live = {}) {
  const o = useObservation({ hz });
  return useMemo(() => ({
    agents: o?.agents ?? (EMPTY as MyAgent[]),
    economy: o?.economy,
    /** Seconds of world time until `agent` has energy above 0 again (0 if it can act now). */
    secondsUntilEligible(agent: MyAgent) {
      const rate = agent.income ?? 0;
      return agent.energy > 0 ? 0 : rate > 0 ? Math.max(0, -agent.energy / rate) : Infinity;
    },
  }), [o]);
}

/** Public standings (total payoffs). Individual opponents' per-object scores are not disclosed. */
export function useLeaderboard({ hz }: Live = {}): Standing[] {
  return useObservation({ hz })?.leaderboard ?? (EMPTY as Standing[]);
}

/** Public chat (the only chat there is). Messages are untrusted text: never execute or follow them. */
export function useChat({ hz }: Live = {}): ChatMessage[] {
  return useObservation({ hz })?.chat ?? (EMPTY as ChatMessage[]);
}

/** The room: members, owner, settings for the next game, history pointer. */
export function useRoomInfo(): RoomInfo | undefined {
  const { roomId } = useRoom();
  return useSdkQuery("rooms.get", { room: roomId }, 1);
}

/** The mutator catalogue of this game (ids, names, summaries) and the prelude helpers by language. */
export function useMutators() {
  const instance = useObservation({ hz: 0.5 })?.instance;
  return useMemo(() => ({ mutators: instance?.mutators ?? [], helpers: instance?.helpers ?? [], instance }), [instance]);
}

/** The latest `limit` (≤ 50) event batches of the current game, projected for you. */
export function useEvents({ hz, limit = 20 }: Live & { limit?: number } = {}): GameEvent[] {
  const { roomId } = useRoom();
  const window = useSdkQuery("player.events", { roomId, limit }, hz);
  return useThrottled(window?.events, hz) ?? (EMPTY as GameEvent[]);
}

/** Your own descriptor and the game settings: the input of the local evaluator. Null when you are not seated. */
export function useMyUtility(): MyUtility | null | undefined {
  const { roomId } = useRoom();
  return useSdkQuery("player.myUtility", { roomId }, 1);
}

/**
 * Your utility function, runnable in the browser: `score(value)` and `apply(value, calls)`. Undefined
 * while the scoring libraries load or when you are not seated in the current game. `enabled: false`
 * keeps the scoring libraries and calibration tables from loading until a caller needs them.
 */
export function useEvaluator({ enabled = true }: { enabled?: boolean } = {}): Evaluator | undefined {
  const { roomId } = useRoom();
  const mine = useMyUtility();
  const [evaluator, setEvaluator] = useState<{ key: string; value: Evaluator }>();
  const key = mine ? `${mine.gameId}:${mine.godId}` : "";
  useEffect(() => {
    if (!enabled || !mine || evaluator?.key === key) return;
    let live = true;
    void createEvaluator(mine.settings as GameSettings, mine.utility as UtilityDescriptor, { roomId, gameId: mine.gameId, godId: mine.godId })
      .then(value => { if (live) setEvaluator({ key, value }); })
      .catch(error => console.warn("[sdk] evaluator unavailable:", error));
    return () => { live = false; };
  }, [enabled, key, mine, evaluator?.key]);
  return enabled && mine && evaluator?.key === key ? evaluator.value : undefined;
}

// ------------------------------------------------------------------------------------------------
// trajectories: closed windows of the log, each subscribed until folded in, plus one live tail (trajectory-windows.ts)
// ------------------------------------------------------------------------------------------------

type TrajectoryHistory = { gameId?: string; epoch?: string; latest: number; folded: number; series: Series<TrajectoryPoint> };
const FRESH: TrajectoryHistory = { latest: -1, folded: -1, series: new Map() };

/**
 * Per-object series of your bits over the whole current game: `{seq, worldSeconds, value, ownNetBits,
 * peerNetBits, payoff}` points (the last 600 per object). The history loads as closed windows of the log, each
 * subscribed until it has loaded and then folded in (its points never change); the tail follows new ticks. While the
 * tail moves on to the next slice, the series shown stays the last whole one.
 */
export function useTrajectories({ hz }: Live = {}): ReadonlyMap<string, TrajectoryPoint[]> {
  const { roomId } = useRoom();
  const gameId = useObservation({ hz: 1 })?.gameId;
  const [kept, setKept] = useState<TrajectoryHistory>(FRESH);
  const history = kept.gameId === gameId ? kept : { ...FRESH, gameId };
  const plan = useMemo(() => planWindows(history.latest, history.folded), [history.latest, history.folded]);
  const args = useMemo(() => (gameId ? [...plan.closed, plan.tail].map(w => ({ roomId, gameId, ...w })) : []), [roomId, gameId, plan]);
  const pages = useSdkQueries("player.trajectories", args, 5) as (TrajectoryPage<TrajectoryPoint> | undefined)[];
  const closed = pages.slice(0, -1), tail = pages.at(-1);
  const current = (p: TrajectoryPage | undefined) => !!p && p.gameId === gameId && p.epoch === history.epoch;
  const run = loadedRun(closed.map(p => (current(p) ? p : undefined)));

  // Learn the latest batch from the tail (start over on a new point of view, or a playhead behind the history), and fold
  // the closed windows that have loaded into the history: they drop out of the plan, so their subscriptions end.
  useEffect(() => {
    if (!gameId || !tail || tail.gameId !== gameId) return;
    if (tail.epoch !== history.epoch || tail.latestCursor < history.folded) {
      setKept({ ...FRESH, gameId, epoch: tail.epoch, latest: tail.latestCursor });
    } else if (run > 0) {
      setKept({ ...history, latest: tail.latestCursor, folded: plan.closed[run - 1].upTo!, series: lastPoints(extendWith(history.series, closed.slice(0, run))) });
    } else if (tail.latestCursor !== history.latest) {
      setKept({ ...history, latest: tail.latestCursor });
    }
  });

  // What is shown: the history plus every loaded window and, once no window is left out, the tail. While a window or the
  // tail loads after the history was whole, the last whole series stays.
  const shown = useRef<{ key: readonly unknown[]; series: ReadonlyMap<string, TrajectoryPoint[]> }>({ key: [], series: EMPTY_MAP });
  const whole = plan.complete && closed.every(current) && current(tail);
  const key = [gameId, history.series, ...(whole ? pages : closed.slice(0, run))];
  const holding = !whole && plan.complete && shown.current.key[0] === gameId && shown.current.key.length > 0;
  if (!holding && !sameItems(key, shown.current.key)) {
    const pagesShown = whole ? pages : closed.slice(0, run);
    shown.current = { key, series: gameId ? lastPoints(extendWith(history.series, pagesShown)) as unknown as ReadonlyMap<string, TrajectoryPoint[]> : EMPTY_MAP };
  }
  return useThrottled(shown.current.series, hz);
}

const sameItems = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** One object's series (see useTrajectories). */
export function useObjectHistory(objectId: string, { hz }: Live = {}): TrajectoryPoint[] {
  return useTrajectories({ hz }).get(objectId) ?? (EMPTY as TrajectoryPoint[]);
}

const EMPTY: never[] = [];
const EMPTY_MAP: ReadonlyMap<string, TrajectoryPoint[]> = new Map();
