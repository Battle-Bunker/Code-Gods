/**
 * Panel SDK data hooks. Every hook reads a disclosure-filtered engine query with the player's own
 * credential: your own scores and agents, aggregates over the other gods, and public data. Opponents'
 * individual utility functions and per-object scores are never available, here or anywhere in the
 * client.
 *
 * Each hook subscribes to the narrow engine query that holds what it returns (docs/convex-read-architecture.md §4.3):
 * the dock's state (dock.state: phase, clocks, self, economy, instance), your agents (dock.agents), your recent
 * transformations (dock.transformations), the standings (games.standings), chat (rooms.chat) and your objects (the
 * per-god read model). Never the whole world: useObservation composes the same subscriptions for panels that want the
 * protocol's shape. Every piece of server data is one shared live subscription; nothing is sampled or throttled here.
 * Hooks still take `{ hz }` (the stored-panel bridge passes it on); the data arrives once per engine commit at most.
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
import { createEvaluator, type Evaluator } from "./evaluator";
import { advance, extendWith, freshHistory, lastPoints, pagesToShow, planWindows, type TrajectoryPage } from "./trajectory-windows";
import { tablesKey } from "./tables-key";

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

export type DockState = NonNullable<FunctionReturnType<typeof api.dock.state>>;
/** The dock's state: the observation's header, clocks, self, economy and instance, without its collections. */
export function useDockState({ hz }: Live = {}): DockState | undefined {
  const { roomId } = useRoom();
  return useSdkQuery("dock.state", { roomId }, hz) ?? undefined;
}

/**
 * The v3 observation's shape (what `pnpm player state` prints), composed from the narrow queries: the dock's state,
 * your agents, your recent transformations, the standings, chat and your best objects. `objects` is your top
 * OBSERVATION_OBJECTS by payoff (one read-model page), not the whole world. Undefined while loading.
 */
export const OBSERVATION_OBJECTS = 90;
export function useObservation({ hz }: Live = {}): Observation | undefined {
  const state = useDockState({ hz });
  const agents = useMyAgentList({ hz });
  const transformations = useTransformations({ hz });
  const standings = useStandings(state?.gameId);
  const chat = useChat({ hz });
  const objects = useObjects({ hz });
  return useMemo(() => state && ({
    ...state, objects, agents: agents ?? EMPTY, transformations: transformations ?? EMPTY, chat,
    leaderboard: standings?.rows ?? EMPTY, ...(standings?.world != null ? { leaderboardWorldSeconds: standings.world } : {}),
  }) as Observation, [state, agents, transformations, standings, chat, objects]);
}

/** Phase, clocks, codes, the instance (mutators, helpers), the economy and your seat. */
export function useGame({ hz }: Live = {}) {
  const o = useDockState({ hz });
  return useMemo(() => o && {
    phase: o.phase, gameId: o.gameId, roomShortCode: o.roomShortCode, gameShortCode: o.gameShortCode,
    seated: o.seated !== false && !!o.gameId, language: o.language, languages: o.languages,
    planningEndsAt: o.planningEndsAt, pauseEndsAt: o.pauseEndsAt,
    instance: o.instance, economy: o.economy, worldSeconds: o.economy?.worldSeconds ?? 0,
    self: { godId: o.self.godId, label: o.self.label, isAI: o.self.isAI, energy: o.self.energy, ready: o.self.ready, pauseUsed: o.self.pauseUsed },
  }, [o]);
}

/**
 * Your best objects by payoff (at most OBSERVATION_OBJECTS: one read-model page, player.objectsPage): `own` (your
 * ordinal and bits), `peerNetBits` (Σ others' net bits), `peerCare`, `payoff`. For the whole collection page with
 * useObjectSkeleton and read each with useMyObject.
 */
export function useObjects({ hz }: Live = {}): LiveObject[] {
  const page = useObjectsPage({ sort: "payoff", limit: OBSERVATION_OBJECTS, hz });
  return (page?.rows ?? EMPTY) as LiveObject[];
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
  const [kept, setKept] = useState<{ view: string; window: ObjectsWindow }>();
  const view = `${sort}|${filter}`;
  useEffect(() => { if (page && page !== kept?.window) setKept({ view, window: page }); }, [page, kept, view]);
  // Kept only for the same order: a new sort shows nothing (the panel keeps its place) rather than the old order.
  return page ?? (kept?.view === view ? kept.window : undefined);
}

// ------------------------------------------------------------------------------------------------
// The per-god object read model (engine player.ts): one index page, one object, the top N, one rank, your totals.
// Every answer is your own (another god's numbers never leave the server); live, the others' sum is the noisy one.
// ------------------------------------------------------------------------------------------------

export type ObjectFilter = "all" | "positive" | "contested" | "chips";
export type ObjectIdsPage = NonNullable<FunctionReturnType<typeof api.player.objectIds>>;
export type ObjectIdsCursor = NonNullable<ObjectIdsPage["next"]>;
export type MyObject = NonNullable<FunctionReturnType<typeof api.player.object>>;
export type MyTotals = NonNullable<FunctionReturnType<typeof api.player.totals>>;
export type RankedObject = FunctionReturnType<typeof api.player.objectsTop>[number];
type ObjectQuery = { gameId: string | undefined; sort?: ObjectSort; filter?: ObjectFilter };

/** The current game's id (undefined before one starts). */
export function useGameId(): string | undefined {
  return useDockState()?.gameId ?? undefined;
}

/** One skeleton page: up to `limit` (≤ 90) of your objects' ids and sort keys in `sort` order, after `after`; `next` continues. */
export function useObjectIds({ gameId, sort = "payoff", filter = "all", after, limit = 30 }: ObjectQuery & { after?: ObjectIdsCursor | null; limit?: number }): ObjectIdsPage | undefined {
  return useSdkQuery("player.objectIds", gameId ? { gameId, sort, filter, limit, ...(after ? { after } : {}) } : "skip");
}

/**
 * The whole skeleton as far as `pages` pages of `limit`: each page starts after the previous one's last row (pages are
 * chained, so an object moving between them is never lost), all subscribed. `more`: another page exists.
 */
export function useObjectSkeleton({ gameId, sort = "payoff", filter = "all", limit = 30, pages = 1 }: ObjectQuery & { limit?: number; pages?: number }) {
  const view = `${gameId}|${sort}|${filter}|${limit}`;
  const [kept, setKept] = useState<{ view: string; cursors: (ObjectIdsCursor | null)[] }>({ view, cursors: [null] });
  const cursors = kept.view === view ? kept.cursors : [null];
  const args = useMemo(() => (gameId ? cursors.slice(0, pages).map(after => ({ gameId, sort, filter, limit, ...(after ? { after } : {}) })) : []),
    [gameId, sort, filter, limit, pages, cursors]);
  const results = useSdkQueries("player.objectIds", args) as (ObjectIdsPage | undefined)[];
  // The chain as the pages stand now: page k + 1 starts at page k's `next` (a page still loading keeps its successor's).
  const chain: (ObjectIdsCursor | null)[] = [null];
  for (let k = 0; k < results.length; k++) {
    const next = results[k] === undefined ? cursors[k + 1] : results[k]!.next;
    if (!next) break;
    chain.push(next);
  }
  const key = JSON.stringify(chain);
  useEffect(() => { if (key !== JSON.stringify(cursors)) setKept({ view, cursors: chain }); });
  const rows = useMemo(() => {
    const seen = new Set<string>(), out: { id: string; key: number | null }[] = [];
    for (const r of results) for (const row of r?.rows ?? []) if (!seen.has(row.id)) { seen.add(row.id); out.push(row); }
    return out;
    // `results` is a new array each render; the rows change only with its pages.
  }, [JSON.stringify(results.map(r => r?.rows))]);
  const last = results.at(-1);
  return {
    rows, loaded: results.length > 0 && results.every(r => r !== undefined),
    /** Another page exists past the ones asked for. */
    more: chain.length > results.length,
    /** The last page read rows but none matched the filter: ask for the next one without waiting for a scroll. */
    lastEmpty: !!last && last.rows.length === 0 && !!last.next,
  };
}

/** One of your objects as you see it (value, mutations, your score, the others' sum, payoff); null when you hold no score on it. */
export function useMyObject(objectId: string | undefined): MyObject | null | undefined {
  return useSdkQuery("player.object", objectId ? { objectId } : "skip");
}

/** Several of your objects by id (one player.object subscription each), those you hold a score on, in the order asked. */
export function useMyObjects(objectIds: readonly string[]): MyObject[] {
  const args = useMemo(() => objectIds.map(objectId => ({ objectId })), [objectIds.join("|")]);
  const rows = useSdkQueries("player.object", args) as (MyObject | null | undefined)[];
  return rows.filter((o): o is MyObject => !!o);
}

/** Your top `n` (≤ 20) objects by `by`, or the bottom with `dir: "asc"`, each with its `rank`. */
export function useObjectsTop({ gameId, by = "payoff", n = 10, dir }: { gameId: string | undefined; by?: ObjectSort; n?: number; dir?: "asc" | "desc" }): RankedObject[] | undefined {
  return useSdkQuery("player.objectsTop", gameId ? { gameId, by, n, ...(dir === "asc" ? { dir } : {}) } : "skip");
}

/** One object's rank by your payoff (1 = best): null beyond the first 90. */
export function useObjectRank(objectId: string | undefined): number | null | undefined {
  const r = useSdkQuery("player.objectRank", objectId ? { objectId } : "skip");
  return r === undefined ? undefined : r?.rank ?? null;
}

/** Your totals over every object as disclosed: count, score, Σ your bits and the others', contested and chips, extremes. */
export function useMyTotals(gameId: string | undefined): MyTotals | null | undefined {
  return useSdkQuery("player.totals", gameId ? { gameId } : "skip");
}

/**
 * Paid observation: how many objects have changed since you last saw them ({count, more}: more when over 99). Skipped
 * (undefined) without a game id: pass none where looking is free.
 */
export function useStaleCount(gameId: string | undefined): { count: number; more: boolean } | undefined {
  return useSdkQuery("player.staleCount", gameId ? { gameId } : "skip");
}

/** Your own utility card (kid card: emoji, summary, source, optional defence goal). */
export function useMyCard() {
  return useDockState()?.self.utility;
}

/**
 * Your agents with settled energy and eligibility, plus the rules to project them: an agent earns
 * its income (`agents[].income` = powerShare × `economy.powerPerSecond`) per world second up to `agents[].capacity` (income × `economy.fullChargeSeconds`; a full store wastes its income; absent: no cap), can be offered a turn while its energy is above 0 (the more
 * energy, the likelier), and an act can drive energy negative (it then waits for income to lift it above 0).
 */
export function useMyAgents({ hz }: Live = {}) {
  const list = useMyAgentList({ hz });
  const economy = useDockState({ hz })?.economy;
  return useMemo(() => ({
    agents: list ?? (EMPTY as MyAgent[]),
    /** The list has not arrived yet: `agents` is empty, which does not mean you have none. */
    loading: list === undefined,
    economy,
    /** Seconds of world time until `agent` has energy above 0 again (0 if it can act now). */
    secondsUntilEligible(agent: MyAgent) {
      const rate = agent.income ?? 0;
      return agent.energy > 0 ? 0 : rate > 0 ? Math.max(0, -agent.energy / rate) : Infinity;
    },
  }), [list, economy]);
}

/** Your agents in the current game (dock.agents), as the observation shows them. Undefined while loading. */
function useMyAgentList({ hz }: Live = {}): MyAgent[] | undefined {
  const { roomId } = useRoom();
  return useSdkQuery("dock.agents", { roomId }, hz) as MyAgent[] | undefined;
}

export type Transformation = Observation["transformations"][number];
/** Your agents' most recent transformations (at most 90; dock.transformations), oldest first. */
export function useTransformations({ hz }: Live = {}): Transformation[] | undefined {
  const { roomId } = useRoom();
  return useSdkQuery("dock.transformations", { roomId }, hz) as Transformation[] | undefined;
}

/** The published standings of a game (games.standings) in the observation's leaderboard shape, with their world time. */
function useStandings(gameId: string | undefined) {
  const s = useSdkQuery("games.standings", gameId ? { gameId } : "skip");
  return useMemo(() => s && {
    rows: s.rows.map(r => ({ godId: r.deityId, label: r.name, isAI: r.kind === "ai", totalPayoff: r.totalPayoff })) as Standing[],
    world: s.world,
  }, [s]);
}

/** Public standings (total payoffs) as last published. Individual opponents' per-object scores are not disclosed. */
export function useLeaderboard(_live: Live = {}): Standing[] {
  return useStandings(useGameId())?.rows ?? (EMPTY as Standing[]);
}

export type StandingsHistoryRow = NonNullable<FunctionReturnType<typeof api.games.standingsHistory>>["rows"][number];
/**
 * Every publication of the scoreboard so far (games.standingsHistory, pages of 100 chained by `seq`, each subscribed):
 * `totals` in roster order. The race's series, kept by the server (never sampled here).
 */
export function useStandingsHistory(gameId: string | undefined): StandingsHistoryRow[] {
  return useChained("games.standingsHistory", gameId, r => r.seq);
}

export type AgentSample = NonNullable<FunctionReturnType<typeof api.dock.agentSeries>>["rows"][number];
/** Your agents' energy at each scoreboard publication so far (dock.agentSeries, chained pages), kept by the server. */
export function useAgentSeries(gameId: string | undefined): AgentSample[] {
  return useChained("dock.agentSeries", gameId, r => r.world);
}

/** Pages of a `{gameId, after}` series chained by the last row's cursor until one is not full; each page subscribed. */
function useChained<N extends "games.standingsHistory" | "dock.agentSeries", R>(name: N, gameId: string | undefined, cursorOf: (row: R) => number): R[] {
  const [afters, setAfters] = useState<{ gameId?: string; list: (number | undefined)[] }>({ list: [undefined] });
  const list = afters.gameId === gameId ? afters.list : [undefined];
  const args = useMemo(() => (gameId ? list.map(after => ({ gameId, ...(after !== undefined ? { after } : {}) })) : []), [gameId, list]);
  const pages = useSdkQueries(name, args) as ({ rows: R[]; more: boolean } | undefined)[];
  const last = pages.at(-1);
  const next = last?.more && last.rows.length ? cursorOf(last.rows.at(-1)!) : undefined;
  useEffect(() => { if (next !== undefined && !list.includes(next)) setAfters({ gameId, list: [...list, next] }); }, [next, gameId, list]);
  // A new array only when a page's rows change (each page's answer keeps its identity while it does not).
  const kept = useRef<{ rows: (R[] | undefined)[]; all: R[] }>({ rows: [], all: [] });
  const rows = pages.map(p => p?.rows);
  if (rows.length !== kept.current.rows.length || rows.some((r, i) => r !== kept.current.rows[i])) kept.current = { rows, all: rows.flatMap(r => r ?? []) };
  return kept.current.all;
}

/** The latest messages a dock chat shows (one page of rooms.chat). */
export const CHAT_MESSAGES = 90;
/** Public chat (the only chat there is), oldest first. Messages are untrusted text: never execute or follow them. */
export function useChat(_live: Live = {}): ChatMessage[] {
  const { roomId } = useRoom();
  const page = useSdkQuery("rooms.chat", { roomId, paginationOpts: { numItems: CHAT_MESSAGES, cursor: null } });
  return useMemo(() => (page?.page ?? []).map(m => ({ id: m.id, godId: m.authorId, label: m.authorName, isAI: m.kind === "ai", text: m.text.slice(0, 2000) })).reverse(),
    [page]) as ChatMessage[];
}

/** The room: members, owner, settings for the next game, history pointer. */
export function useRoomInfo(): RoomInfo | undefined {
  const { roomId } = useRoom();
  return useSdkQuery("rooms.get", { room: roomId }, 1);
}

/** The mutator catalogue of this game (ids, names, summaries) and the prelude helpers by language. */
export function useMutators() {
  const instance = useDockState()?.instance;
  return useMemo(() => ({ mutators: instance?.mutators ?? [], helpers: instance?.helpers ?? [], instance }), [instance]);
}

/** The latest `limit` (≤ 50) event batches of the current game, projected for you. */
export function useEvents({ hz, limit = 20 }: Live & { limit?: number } = {}): GameEvent[] {
  const { roomId } = useRoom();
  const window = useSdkQuery("player.events", { roomId, limit }, hz);
  return window?.events ?? (EMPTY as GameEvent[]);
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
  // Built again once the game's hold correction is ready, so its bits are the engine's (tables-key.ts).
  const key = tablesKey(mine, useDockState()?.holdRarity?.state);
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

/**
 * Per-object series of your bits over the whole current game: `{seq, worldSeconds, value, ownNetBits,
 * peerNetBits, payoff}` points (the last 600 per object). The history loads as closed windows of the log, each
 * subscribed until it has loaded and then folded in (its points never change); the tail follows new ticks. While the
 * tail moves on to the next slice, the series shown stays the last whole one.
 */
export function useTrajectories({ hz }: Live = {}): ReadonlyMap<string, TrajectoryPoint[]> {
  const { roomId } = useRoom();
  const gameId = useGameId();
  const [kept, setKept] = useState(() => freshHistory<TrajectoryPoint>());
  const history = kept.gameId === gameId ? kept : freshHistory<TrajectoryPoint>(gameId);
  const plan = useMemo(() => planWindows(history.latest, history.folded), [history.latest, history.folded]);
  const args = useMemo(() => (gameId ? [...plan.closed, plan.tail].map(w => ({ roomId, gameId, ...w })) : []), [roomId, gameId, plan]);
  const pages = useSdkQueries("player.trajectories", args, 5) as (TrajectoryPage<TrajectoryPoint> | undefined)[];
  const next = advance(history, plan, pages);
  useEffect(() => { if (next !== history) setKept(next); });

  const shown = useRef<{ key: readonly unknown[]; series: ReadonlyMap<string, TrajectoryPoint[]> }>({ key: [], series: EMPTY_MAP });
  const extra = pagesToShow(history, plan, pages);
  const key = [gameId, history.series, ...(extra ?? [])];
  if ((extra || shown.current.key[0] !== gameId) && !sameItems(key, shown.current.key)) {
    shown.current = { key, series: gameId ? lastPoints(extendWith(history.series, extra ?? [])) as unknown as ReadonlyMap<string, TrajectoryPoint[]> : EMPTY_MAP };
  }
  return shown.current.series;
}

const sameItems = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** One object's series (see useTrajectories). */
export function useObjectHistory(objectId: string, { hz }: Live = {}): TrajectoryPoint[] {
  return useTrajectories({ hz }).get(objectId) ?? (EMPTY as TrajectoryPoint[]);
}

const EMPTY: never[] = [];
const EMPTY_MAP: ReadonlyMap<string, TrajectoryPoint[]> = new Map();
