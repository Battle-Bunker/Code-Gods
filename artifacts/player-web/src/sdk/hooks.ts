/**
 * The v2 SDK's data hooks (integration plan §2.2, §2.4): one narrow live subscription per datum, each reading one
 * document or one index page, per viewer. Hook names follow the v1 SDK where the concept survived (useGame,
 * useMyAgents, useLeaderboard, useStandingsHistory, useChat, useRoomInfo, useObjectIds, useMyObject, useMoves …).
 *
 * Disclosure: every answer is the viewer's own (their rule, values, agents, moves) or public (standings, chat). Another
 * player's rule or value never reaches the browser during a live game.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useGameScope } from "./game";
import { useLivePaged, useLiveValue, useLiveValues } from "./live";
import { ruleRefOf, rungRarities, type LineRule } from "./rule";
import type { Agent, MyRuleRow, ObjectSort, StandingsPoint } from "./types";
import { sharedRanks } from "@/core/words";

/** The room in view: members (≤ 16), owner, preset, current and last game, an open bid phase. */
export function useRoomInfo() {
  return useLiveValue(api.v2.rooms.get, { roomId: useGameScope().roomId });
}

/** The game in view's header: phase, clocks, roster, the viewer's seat. Cold (changes with the phase). */
export function useGame() {
  const { gameId } = useGameScope();
  return useLiveValue(api.v2.games.header, gameId ? { gameId } : "skip");
}

/** The viewer's account in this game (energy, power, ready, pause used, agents): hot, one document. */
export function useMe() {
  const { gameId, seated } = useGameScope();
  return useLiveValue(api.v2.play.me, gameId && seated ? { gameId } : "skip");
}

export interface MyRule {
  row: MyRuleRow;
  /** What the view components draw with; null when this build does not know the family. */
  rule: LineRule | null;
  /** ✨ rarity per level of the dealt ladder. */
  rarities: number[];
}
/** The viewer's private rule: family, parameters, card, ladder with rung rarities, the primary representation. */
export function useMyRule(): MyRule | undefined {
  const { gameId, seated } = useGameScope();
  const header = useGame();
  const row = useLiveValue(api.v2.play.myRule, gameId && seated ? { gameId } : "skip");
  return useMemo(() => (row && header ? { row, rule: ruleRefOf(row, header.variant), rarities: rungRarities(row) } : undefined), [row, header?.variant]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The objects skeleton: ids in the viewer's order, page by page; each row subscribes to its own object. */
export function useObjectIds(sort: ObjectSort, pageSize = 30) {
  const { gameId, seated } = useGameScope();
  return useLivePaged(api.v2.play.objectIds, gameId && seated ? { gameId, sort } : "skip", pageSize);
}

/** A spectator's skeleton: every object by number. */
export function useSpectatorObjectIds(pageSize = 30) {
  const { gameId } = useGameScope();
  return useLivePaged(api.v2.spectate.objectIds, gameId ? { gameId } : "skip", pageSize);
}

/** One object: its shared state and the viewer's value of it (null for a spectator). */
export function useMyObject(objectId: string | null | undefined) {
  return useLiveValue(api.v2.play.object, objectId ? { objectId } : "skip");
}
/** Several objects (one subscription each), in the order asked. */
export function useMyObjects(objectIds: readonly string[]) {
  return useLiveValues(api.v2.play.object, useMemo(() => objectIds.map(objectId => ({ objectId })), [objectIds.join("|")])); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Moves that concern the viewer, newest first (the act log). */
export function useMoves(pageSize = 30) {
  const { gameId, seated } = useGameScope();
  return useLivePaged(api.v2.play.moves, gameId && seated ? { gameId } : "skip", pageSize);
}

/** The viewer's live agents (≤ 20). Undefined while loading, which never means none. */
export function useMyAgents(): Agent[] | undefined {
  const { gameId, seated } = useGameScope();
  return useLiveValue(api.v2.play.agents, gameId && seated ? { gameId } : "skip");
}
export function useAgentEnergy(agentId: string | null | undefined) {
  return useLiveValue(api.v2.play.agentEnergy, agentId ? { agentId } : "skip");
}
export function useAgentPrograms(agentId: string | null | undefined) {
  return useLiveValue(api.v2.play.agentPrograms, agentId ? { agentId } : "skip");
}

/** The published scoreboard (null before the first). */
export function useLeaderboard() {
  const { gameId } = useGameScope();
  const standings = useLiveValue(api.v2.games.standings, gameId ? { gameId } : "skip");
  // Equal shown totals share a rank (the server ranks every row apart).
  return useMemo(() => (standings ? { ...standings, rows: sharedRanks(standings.rows) } : standings), [standings]);
}

/**
 * Every scoreboard publication so far: pages of ≤ 100 chained by `seq`, each subscribed (a full page asks for the
 * next). The race's series, kept by the server, never sampled here.
 */
export function useStandingsHistory(): StandingsPoint[] {
  const { gameId } = useGameScope();
  const [afters, setAfters] = useState<{ gameId: string | null; list: number[] }>({ gameId, list: [-1] });
  const list = afters.gameId === gameId ? afters.list : [-1];
  const pages = useLiveValues(api.v2.games.standingsHistory, useMemo(() => (gameId ? list.map(after => ({ gameId, after })) : []), [gameId, list]));
  const last = pages.at(-1);
  const next = last && last.length >= 100 ? last.at(-1)!.seq : undefined;
  useEffect(() => { if (next !== undefined && !list.includes(next)) setAfters({ gameId, list: [...list, next] }); }, [next, gameId, list]);
  const kept = useRef<{ pages: unknown[]; all: StandingsPoint[] }>({ pages: [], all: [] });
  if (pages.length !== kept.current.pages.length || pages.some((p, i) => p !== kept.current.pages[i])) kept.current = { pages, all: pages.flatMap(p => p ?? []) };
  return kept.current.all;
}

/** Public chat of the room, newest first, paged. Messages are untrusted text. */
export function useChat(pageSize = 50) {
  return useLivePaged(api.v2.rooms.chat, { roomId: useGameScope().roomId }, pageSize);
}

/** The viewer's packed [number, own rarity, want] per object (others-care). */
export function useDigest() {
  const { gameId, seated } = useGameScope();
  return useLiveValue(api.v2.play.digest, gameId && seated ? { gameId } : "skip");
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
