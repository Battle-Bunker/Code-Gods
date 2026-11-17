/**
 * The v2 SDK's data hooks (integration plan §2.2, §2.4): one narrow live subscription per datum, each reading one
 * document or one index page, per viewer. Hook names follow the v1 SDK where the concept survived (useGame,
 * useMyAgents, useLeaderboard, useStandingsHistory, useChat, useRoomInfo, useObjectIds, useMyObject, useMoves …).
 *
 * In a replay (./replay.ts) each game hook skips its query and answers from the replay at the playhead instead, as the
 * player the replay is watched as: the panes work unchanged. The room's own data (the room, its chat) stays live.
 *
 * Disclosure: every answer is the viewer's own (their rule, values, agents, moves) or public (standings, chat). Another
 * player's rule or value never reaches the browser during a live game; a replay is of an ended game, where all is open.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { useGameScope } from "./game";
import { useLivePaged, useLiveValue, useLiveValues } from "./live";
import { pagedFrom, useReplaySource } from "./replay";
import { bitsOf, ruleRefOf, valueOf, type GameRule, type ValueOf } from "./rule";
import type { Score } from "@workspace/v2-core";
import type { FunctionReference } from "convex/server";
import type { OpOutcome } from "@workspace/v2-affordances";
import type { Agent, Header, Move, MyRuleRow, ObjectShow, ObjectSort, PlayObject, StandingsPoint, Tug } from "./types";
import { sharedRanks } from "@/core/words";

/** The room in view: members (≤ 16), owner, preset, current and last game, an open bid phase. */
export function useRoomInfo() {
  return useLiveValue(api.v2.rooms.get, { roomId: useGameScope().roomId });
}

/** Which seats are ready (v2/games:readiness; v1's "Who is here" ✓): one small index page, cold. */
export function useReadiness() {
  const { gameId } = useGameScope();
  return useLiveValue(api.v2.games.readiness, gameId ? { gameId } : "skip");
}

/** The room's rotation round: its ended games and each seat's running total (null outside a rotation). */
export function useRotationRound() {
  return useLiveValue(api.v2.rooms.round, { roomId: useGameScope().roomId });
}

/**
 * The game in view's header: phase, clocks, roster, the viewer's seat. Cold (changes with the phase). In a replay its
 * seat (`me`) is the player the replay is watched as.
 */
export function useGame(): Header | undefined {
  const { gameId } = useGameScope();
  const replay = useReplaySource();
  const live = useLiveValue(api.v2.games.header, gameId ? { gameId } : "skip");
  const member = replay?.member;
  return useMemo(() => (live && member ? { ...live, me: member as Header["me"] } : live), [live, member]);
}

/** The viewer's account in this game (energy, power, ready, pause used, agents): hot, one document. None in a replay. */
export function useMe() {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  return useLiveValue(api.v2.playState.me, gameId && seated && !replay ? { gameId } : "skip");
}

export interface MyRule {
  row: MyRuleRow;
  /** What the view components draw with; null when this build does not know the family. */
  rule: GameRule | null;
  /** The rule's worth at any score, from the server's value function, with its bounds (null without knots). */
  value: ValueOf | null;
  /** Just the bits of `value`: what the faces take (lib/v2-views `value`). */
  bits: ((u: Score) => number) | null;
}
/**
 * Whether the others' numbers are deliberately blurred now (v1's peerNoiseBits, restored): while the game runs, outside a
 * replay, when the room blurs them. Then every figure built on the others' bits is an estimate; the final count is exact.
 */
/** Whether the game blurs the others' sums: the server's default is 8 bits (W3 #608), so unless the header says 0. */
export const blursOthers = (header: unknown): boolean => {
  const noise = (header as { peerNoiseBits?: unknown } | null | undefined)?.peerNoiseBits;
  return typeof noise === "number" ? noise > 0 : true;
};
export function useOthersBlurred(): boolean {
  const header = useGame();
  const replay = useReplaySource();
  return !replay && !!header && header.phase !== "ended" && blursOthers(header);
}

/** The game's details (v2/games:details): settings and timings, and after the end every seat's rule (v1's UtilityFamilies). */
export function useGameDetails() {
  const { gameId } = useGameScope();
  return useLiveValue(api.v2.games.details, gameId ? { gameId } : "skip");
}

/** The viewer's code runs, newest first (code.list; the Code results pane): one live page of at most `limit`. */
export function useCodeRuns(limit = 20) {
  const out = useLiveValue(api.v2.ops.code.list as CodeQuery, { args: { limit } }) as OpOutcome | undefined;
  return out === undefined ? undefined : out.ok ? (out.result as { page: CodeRunRow[]; nextCursor: string | null }).page : [];
}
/** One code run whole (code.get): source, outcome, result, printed output. Null when it is not the viewer's. */
export function useCodeRun(runId: string | null) {
  const out = useLiveValue(api.v2.ops.code.get as CodeQuery, runId ? { args: { runId } } : "skip") as OpOutcome | undefined;
  return out === undefined ? undefined : out.ok ? out.result as CodeRun : null;
}
/** code.list and code.get are defineOp queries (their export's type spans every op kind). */
type CodeQuery = FunctionReference<"query", "public", { args: Record<string, unknown> }, OpOutcome>;
export interface CodeRunRow { runId: string; title: string; language: string; dataset: string; status: "ok" | "error"; ms: number; at: number }
export interface CodeRun extends CodeRunRow { source: string; gameId: string | null; result: unknown; error: string | null; output: string }

/** Every rule this game's dealer could deal (v2/playState:candidates; v1's "Possible gods"): never who holds which. */
export function useRuleCandidates() {
  const { gameId } = useGameScope();
  return useLiveValue(api.v2.playState.candidates, gameId ? { gameId } : "skip");
}

/** The viewer's private rule: family, parameters, card, value function, the primary representation. */
export function useMyRule(): MyRule | undefined {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  const header = useGame();
  const live = useLiveValue(api.v2.play.myRule, gameId && seated && !replay ? { gameId } : "skip");
  const row = replay ? replay.frame.rule(replay.member) ?? undefined : live;
  return useMemo(() => {
    if (!row || !header) return undefined;
    const rule = ruleRefOf(row, header.variant);
    const value = valueOf();
    return { row, rule, value, bits: bitsOf(value) };
  }, [row, header?.variant]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The objects skeleton: ids in the viewer's order, page by page; each row subscribes to its own object. */
export function useObjectIds(sort: ObjectSort, pageSize = 30, show: ObjectShow = "all") {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  const live = useLivePaged(api.v2.playState.objectIds, gameId && seated && !replay ? { gameId, sort, ...(show !== "all" ? { filter: show } : {}) } : "skip", pageSize);
  const frame = replay?.frame, member = replay?.member;
  const replayed = useMemo(() => (frame && member ? pagedFrom(frame.objectIds(member, sort, show)) : null), [frame, member, sort, show]);
  return (replayed ?? live) as typeof live;
}

/** The retired lines' skeleton (turnover), the latest first; each row subscribes to its own object. Empty without turnover. */
export function useBankedIds(pageSize = 30) {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  const live = useLivePaged(api.v2.playState.banked, gameId && seated && !replay ? { gameId } : "skip", pageSize);
  const frame = replay?.frame, member = replay?.member;
  const replayed = useMemo(() => (frame && member ? pagedFrom(frame.banked(member)) : null), [frame, member]);
  return (replayed ?? live) as typeof live;
}

/** A spectator's skeleton: every object by number. */
export function useSpectatorObjectIds(pageSize = 30) {
  const { gameId } = useGameScope();
  const replay = useReplaySource();
  const live = useLivePaged(api.v2.spectate.objectIds, gameId && !replay ? { gameId } : "skip", pageSize);
  const frame = replay?.frame, member = replay?.member;
  const replayed = useMemo(() => (frame && member ? pagedFrom(frame.objectIds(member, "born")) : null), [frame, member]);
  return (replayed ?? live) as typeof live;
}

/** One object: its shared state and the viewer's value of it (null for a spectator). */
export function useMyObject(objectId: string | null | undefined): PlayObject | undefined {
  const replay = useReplaySource();
  const live = useLiveValue(api.v2.play.object, objectId && !replay ? { objectId } : "skip");
  if (!replay) return live;
  return (objectId ? replay.frame.object(objectId, replay.member) : null) ?? undefined;
}
/** Several objects (one subscription each), in the order asked. */
export function useMyObjects(objectIds: readonly string[]): (PlayObject | undefined)[] {
  const replay = useReplaySource();
  const live = useLiveValues(api.v2.play.object, useMemo(() => (replay ? [] : objectIds.map(objectId => ({ objectId }))), [objectIds.join("|"), !replay])); // eslint-disable-line react-hooks/exhaustive-deps
  if (!replay) return live;
  return objectIds.map(id => replay.frame.object(id, replay.member) ?? undefined);
}

/** Moves that concern the viewer, newest first (the act log). */
export function useMoves(pageSize = 30, { replayOnly = false }: { replayOnly?: boolean } = {}) {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  const live = useLivePaged(api.v2.playState.moves, gameId && seated && !replay && !replayOnly ? { gameId } : "skip", pageSize);
  const frame = replay?.frame, member = replay?.member;
  const replayed = useMemo(() => (frame && member ? pagedFrom<Move>(frame.moves(member)) : null), [frame, member]);
  return (replayed ?? live) as typeof live;
}

/**
 * The viewer's tugs-of-war over the whole game, as the tick folds them (≤ 20, most-flipped first). Null in a replay,
 * where the summary folds the frame's moves instead; undefined while loading.
 */
export function useTugs(): Tug[] | null | undefined {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  const live = useLiveValue(api.v2.playState.tugs, gameId && seated && !replay ? { gameId } : "skip");
  return replay ? null : live;
}

/**
 * The public log (v1's): every move in the game, newest first, for room members. In a replay too: the game has ended, so
 * the log is exact and attributed; the pane shows the part up to the playhead.
 */
export function usePublicLog(pageSize = 50) {
  const { gameId } = useGameScope();
  return useLivePaged(api.v2.playState.log, gameId ? { gameId } : "skip", pageSize);
}

/** The first page of `v2/playState:agents` (the server's page is at most 50). */
const FIRST_AGENTS_PAGE = { numItems: 50, cursor: null };
/**
 * The viewer's live agents (a player may hold 200, call 35): for now the first page of 50, oldest first, as one list.
 * Undefined while loading, which never means none.
 */
export function useMyAgents(): Agent[] | undefined {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  const live = useLiveValue(api.v2.playState.agents, gameId && seated && !replay ? { gameId, paginationOpts: FIRST_AGENTS_PAGE } : "skip");
  const frame = replay?.frame, member = replay?.member;
  const replayed = useMemo(() => (frame && member ? frame.agents(member) : null), [frame, member]);
  return replayed ?? live?.page;
}
/** All of the viewer's agents, page by page (≤ 200 a player, 50 a page: W3 #898), for My agents; none in a replay. */
export function useMyAgentPages() {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  return useLivePaged(api.v2.playState.agents, gameId && seated && !replay ? { gameId } : "skip", 50);
}
/** An agent's energy account; not in the record, so none in a replay. */
export function useAgentEnergy(agentId: string | null | undefined) {
  const replay = useReplaySource();
  return useLiveValue(api.v2.playState.agentEnergy, agentId && !replay ? { agentId } : "skip");
}
/**
 * An agent's programs, newest first. In a replay, the versions the record keeps (its `programs`: every player's, open
 * after the end), without the live counts: `acts` and `pointsGained` are 0 there, and `recorded` says so.
 */
export function useAgentPrograms(agentId: string | null | undefined) {
  const replay = useReplaySource();
  const live = useLiveValue(api.v2.playState.agentPrograms, agentId && !replay ? { agentId } : "skip");
  const index = replay?.index;
  const recorded = useMemo(() => (index && agentId ? [...index.programs.values()].filter(p => p.agentId === agentId).sort((a, b) => b.version - a.version)
    .map(p => ({ version: p.version, language: p.language as "typescript" | "python", source: p.source, price: 0, summonedAt: p.summonedAt, acts: 0, pointsGained: 0, recorded: true as const })) : null), [index, agentId]);
  return recorded ?? live;
}

/** The published scoreboard (null before the first). */
export function useLeaderboard() {
  const { gameId } = useGameScope();
  const replay = useReplaySource();
  const live = useLiveValue(api.v2.games.standings, gameId && !replay ? { gameId } : "skip");
  const standings = replay ? replay.frame.standings : live;
  // Equal shown totals share a rank (the server ranks every row apart).
  return useMemo(() => (standings ? { ...standings, rows: sharedRanks(standings.rows) } : standings), [standings]);
}

/**
 * Every scoreboard publication so far: pages of ≤ 100 chained by `seq`, each subscribed (a full page asks for the
 * next). The race's series, kept by the server, never sampled here.
 */
export function useStandingsHistory(): StandingsPoint[] {
  const { gameId } = useGameScope();
  const replay = useReplaySource();
  const [afters, setAfters] = useState<{ gameId: string | null; list: number[] }>({ gameId, list: [-1] });
  const list = afters.gameId === gameId ? afters.list : [-1];
  const pages = useLiveValues(api.v2.games.standingsHistory, useMemo(() => (gameId && !replay ? list.map(after => ({ gameId, after })) : []), [gameId, list, !replay])); // eslint-disable-line react-hooks/exhaustive-deps
  const last = pages.at(-1);
  const next = last && last.length >= 100 ? last.at(-1)!.seq : undefined;
  useEffect(() => { if (next !== undefined && !list.includes(next)) setAfters({ gameId, list: [...list, next] }); }, [next, gameId, list]);
  const kept = useRef<{ pages: unknown[]; all: StandingsPoint[] }>({ pages: [], all: [] });
  if (pages.length !== kept.current.pages.length || pages.some((p, i) => p !== kept.current.pages[i])) kept.current = { pages, all: pages.flatMap(p => p ?? []) };
  return replay ? replay.frame.history : kept.current.all;
}

/** Public chat of the room, newest first, paged. Messages are untrusted text. */
export function useChat(pageSize = 50) {
  return useLivePaged(api.v2.rooms.chat, { roomId: useGameScope().roomId }, pageSize);
}

/** The viewer's packed [number, own rarity, want] per object (others-care). */
export function useDigest() {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  const live = useLiveValue(api.v2.playState.digest, gameId && seated && !replay ? { gameId } : "skip");
  const frame = replay?.frame, member = replay?.member;
  const replayed = useMemo(() => (frame && member ? frame.digest(member) : undefined), [frame, member]);
  return replay ? replayed : live;
}

// ------------------------------------------------------------------ the in-client assistant (the viewer's own rows only)

/** The viewer's assistant in this room: mode, grant, this game's allowance, the latest turn, what waits. */
export function useAssistantStatus() {
  return useLiveValue(api.v2.assistant.status, { roomId: useGameScope().roomId as Id<"v2Rooms"> });
}
/** The viewer's conversations in the game in view (the room's current game before one), newest first (≤ 20). */
export function useAssistantThreads() {
  const { roomId, gameId } = useGameScope();
  return useLiveValue(api.v2.assistant.threads, { roomId: roomId as Id<"v2Rooms">, ...(gameId ? { gameId: gameId as Id<"v2Games"> } : {}) });
}
/** One conversation's messages, newest first, paged (≤ 30 a page); every loaded page stays live. */
export function useAssistantTranscript(threadId: string | null | undefined, pageSize = 30) {
  return useLivePaged(api.v2.assistant.transcript, threadId ? { threadId: threadId as Id<"v2AssistantThreads"> } : "skip", pageSize);
}
/** One turn: its status and its tool calls (the activity chips), live while it runs. */
export function useAssistantTurn(turnId: string | null | undefined) {
  return useLiveValue(api.v2.assistant.turn, turnId ? { turnId: turnId as Id<"v2AssistantTurns"> } : "skip");
}
/** One tool call of a turn in full (v1's ToolDetail): what was sent and what came back, subscribed only while shown. */
export function useAssistantCall(turnId: string | null | undefined, index: number | null) {
  return useLiveValue(api.v2.assistant.call, turnId && index !== null ? { turnId: turnId as Id<"v2AssistantTurns">, index } : "skip");
}

// ------------------------------------------------------------------ the viewer's stored panels (across rooms; not in the panel SDK)

/** The viewer's stored panels (metadata, no code): one index page, shared by the dock's titles and "Your panels". */
export function useMyPanels() {
  return useLiveValue(api.v2.panels.list, {});
}
/** One version of one of the viewer's panels (immutable per version); null when there is no such panel or version. */
export function usePanelCode(slug: string | null | undefined, version?: number) {
  return useLiveValue(api.v2.panels.code, slug ? { slug, ...(version !== undefined ? { version } : {}) } : "skip");
}

// ------------------------------------------------------------------ an accepted summon counts at once (ux-lessons 1.8)

const accepted = new Set<string>();
const acceptedListeners = new Set<() => void>();
/** The forge records an accepted summon, so nothing offers "Summon my first agent" while the subscriptions catch up. */
export function noteSummoned(gameId: string) {
  if (accepted.has(gameId)) return;
  accepted.add(gameId);
  for (const l of acceptedListeners) l();
}
/**
 * How many agents the viewer has, as far as anything on this page knows: the account's count, the agent list, or a
 * summon this page saw accepted. Undefined while nothing is known yet (never read as "none").
 */
export function useAgentCount(): number | undefined {
  const { gameId } = useGameScope();
  const me = useMe();
  const agents = useMyAgents();
  const local = useSyncExternalStore(
    fn => { acceptedListeners.add(fn); return () => { acceptedListeners.delete(fn); }; },
    () => !!gameId && accepted.has(gameId),
  );
  if (me === undefined && agents === undefined) return local ? 1 : undefined;
  return Math.max(me?.agents ?? 0, agents?.length ?? 0, local ? 1 : 0);
}

/**
 * The others' total bits on an object after each candidate move (at most four calls, applied by the server to the live
 * state), live, keyed by the state after the move (its wire), with the object already holding a candidate's state. Only the sum over the other players: never one player's
 * rule or bits. While a new set of candidates loads (the object moved), the last answer stays, so the list does not
 * flicker; none in a replay or for no candidates.
 */
export function useOthersAt(objectId: string | null | undefined, calls: readonly { mutator: string; site: number; args: Record<string, string> }[]): OthersAtMaps | undefined {
  const replay = useReplaySource();
  const key = JSON.stringify(calls);
  const args = useMemo(() => (objectId && !replay && calls.length ? { objectId, calls: calls.map(c => ({ mutator: c.mutator, site: c.site, args: c.args })) } : "skip" as const), [objectId, !replay, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = useLiveValue(api.v2.play.othersAt, args);
  const last = useRef<{ objectId: string; maps: OthersAtMaps } | null>(null);
  return useMemo(() => {
    if (live) {
      const rows = live.after.flatMap(a => (a ? [a] : []));
      last.current = { objectId: objectId!, maps: { want: new Map(rows.map(a => [a.state, a.want])), taken: new Map(rows.flatMap(a => (a.taken !== null ? [[a.state, a.taken] as const] : []))) } };
    }
    return last.current && last.current.objectId === objectId ? last.current.maps : undefined;
  }, [live, objectId]);
}
/** The others' totals after each candidate, and the object (by number) already holding a candidate's state, by state. */
export interface OthersAtMaps { want: ReadonlyMap<string, number>; taken: ReadonlyMap<string, number> }
/** The viewer's own moves on each of a few objects, by number (one subscription each, ≤ 50 rows); none in a replay. */
export function useObjectMovesOf(numbers: readonly number[]) {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  return useLiveValues(api.v2.playState.objectMoves, useMemo(() => (replay || !gameId || !seated ? [] : numbers.map(number => ({ gameId, number }))), [numbers.join("|"), !replay, gameId, seated])); // eslint-disable-line react-hooks/exhaustive-deps
}
/** The viewer's own moves on one object, by number (≤ 50, newest first); none in a replay or without a number. */
export function useObjectMoves(number: number | null | undefined) {
  const { gameId, seated } = useGameScope();
  const replay = useReplaySource();
  return useLiveValue(api.v2.playState.objectMoves, gameId && seated && !replay && number != null ? { gameId, number } : "skip");
}

/**
 * An object's live locks (docs/engine-v2/locks.md §5): program, energy, upkeep, history (amounts and times, the
 * viewer's own marked), the viewer's own share. None when the game has no locks or in a replay.
 */
export function useObjectLocks(objectId: string | null | undefined) {
  const { gameId } = useGameScope();
  const replay = useReplaySource();
  const locks = useGame()?.locks ?? null;
  return useLiveValue(api.v2.locks.ofObject, gameId && locks && !replay && objectId ? { gameId, objectId: objectId as Id<"v2Objects"> } : "skip");
}
export type ObjectLock = NonNullable<ReturnType<typeof useObjectLocks>>[number];
