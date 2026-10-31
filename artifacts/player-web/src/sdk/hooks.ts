/**
 * Panel SDK data hooks. Every hook reads a disclosure-filtered engine query with the player's own
 * credential: your own scores and agents, aggregates over the other gods, and public data. Opponents'
 * individual utility functions and per-object scores are never available, here or anywhere in the
 * client.
 *
 * Live hooks take `{ hz }` (default 2, max 5) and re-render at most that often. Data arrives once per
 * engine tick (about once a second) at most, so higher rates only help derived local clocks.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSdkQuery } from "@sdk-transport";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@workspace/engine/convex/_generated/api";
import type { Observation } from "@workspace/player-client";
import type { GameSettings } from "@workspace/game-core";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import { useRoom } from "./context";
import { useThrottled } from "./throttle";
import { createEvaluator, type Evaluator } from "./evaluator";

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
    seated: o.seated !== false && !!o.gameId, language: o.language,
    planningEndsAt: o.planningEndsAt, pauseEndsAt: o.pauseEndsAt,
    instance: o.instance, economy: o.economy, worldSeconds: o.economy?.worldSeconds ?? 0,
    self: { godId: o.self.godId, label: o.self.label, isAI: o.self.isAI, energy: o.self.energy, ready: o.self.ready, pauseUsed: o.self.pauseUsed },
  }, [o]);
}

/** Live objects: `own` (your ordinal and bits), `peerNetBits` (Σ others' net bits), `peerCare`, `payoff`. */
export function useObjects({ hz }: Live = {}): LiveObject[] {
  return useObservation({ hz })?.objects ?? EMPTY;
}

/** Your own utility card (kid card: emoji, summary, source, optional defence goal). */
export function useMyCard() {
  return useObservation({ hz: 0.5 })?.self.utility;
}

/**
 * Your agents with settled energy and eligibility, plus the rules to project them: an agent earns
 * `economy.agentEnergyPerSecond` per world second, is eligible while energy ≥ expectedActCost, and an
 * act can drive energy negative (a cooldown).
 */
export function useMyAgents({ hz }: Live = {}) {
  const o = useObservation({ hz });
  return useMemo(() => ({
    agents: o?.agents ?? (EMPTY as MyAgent[]),
    economy: o?.economy,
    /** Seconds of world time until `agent` is eligible again (0 if it is). */
    secondsUntilEligible(agent: MyAgent) {
      const rate = o?.economy?.agentEnergyPerSecond ?? 0;
      return agent.eligible ? 0 : rate > 0 ? Math.max(0, (agent.expectedActCost - agent.energy) / rate) : Infinity;
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
  const mine = useMyUtility();
  const [evaluator, setEvaluator] = useState<{ key: string; value: Evaluator }>();
  const key = mine ? `${mine.gameId}:${mine.godId}` : "";
  useEffect(() => {
    if (!enabled || !mine || evaluator?.key === key) return;
    let live = true;
    void createEvaluator(mine.settings as GameSettings, mine.utility as UtilityDescriptor)
      .then(value => { if (live) setEvaluator({ key, value }); })
      .catch(error => console.warn("[sdk] evaluator unavailable:", error));
    return () => { live = false; };
  }, [enabled, key, mine, evaluator?.key]);
  return enabled && mine && evaluator?.key === key ? evaluator.value : undefined;
}

// ------------------------------------------------------------------------------------------------
// trajectories: one shared, cursor-paged store per game, however many panels read it
// ------------------------------------------------------------------------------------------------

const MAX_POINTS = 600;
type Series = { gameId: string; cursor: number; latest: number; byObject: Map<string, TrajectoryPoint[]>; version: number };
const stores = new Map<string, Series>();
const listeners = new Set<() => void>();

function merge(series: Series, page: { objects: { objectId: string; points: TrajectoryPoint[] }[]; nextCursor: number; latestCursor: number }) {
  if (page.nextCursor <= series.cursor && page.latestCursor === series.latest) return;
  const byObject = new Map(series.byObject);
  for (const { objectId, points } of page.objects) {
    const known = byObject.get(objectId) ?? [];
    const last = known.at(-1)?.seq ?? -Infinity;
    const fresh = points.filter(p => p.seq > last);
    if (fresh.length) byObject.set(objectId, [...known, ...fresh].slice(-MAX_POINTS));
  }
  stores.set(series.gameId, { ...series, byObject, cursor: Math.max(series.cursor, page.nextCursor), latest: page.latestCursor, version: series.version + 1 });
  for (const listener of listeners) listener();
}

/**
 * Per-object series of your bits over the whole current game: `{seq, worldSeconds, value, ownNetBits,
 * peerNetBits, payoff}` points (the last 600 per object). Pages through history once, then follows
 * new ticks.
 */
export function useTrajectories({ hz }: Live = {}): ReadonlyMap<string, TrajectoryPoint[]> {
  const { roomId } = useRoom();
  const gameId = useObservation({ hz: 1 })?.gameId;
  const series = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => (gameId ? stores.get(gameId) : undefined),
  );
  const cursor = series?.cursor ?? -1;
  const page = useSdkQuery("player.trajectories", gameId ? { roomId, gameId, afterSeq: cursor, limit: 200 } : "skip", 5);
  useEffect(() => {
    if (!gameId || !page || page.gameId !== gameId) return;
    const current = stores.get(gameId) ?? { gameId, cursor: -1, latest: -1, byObject: new Map(), version: 0 };
    if (!stores.has(gameId)) stores.set(gameId, current);
    merge(current, page as Parameters<typeof merge>[1]);
  }, [page, gameId]);
  return useThrottled(series?.byObject, hz) ?? EMPTY_MAP;
}

/** One object's series (see useTrajectories). */
export function useObjectHistory(objectId: string, { hz }: Live = {}): TrajectoryPoint[] {
  return useTrajectories({ hz }).get(objectId) ?? (EMPTY as TrajectoryPoint[]);
}

const EMPTY: never[] = [];
const EMPTY_MAP: ReadonlyMap<string, TrajectoryPoint[]> = new Map();
