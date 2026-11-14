/**
 * An ended game's replay, folded (integration plan §2.2, W5-5; spec §9.2). The stored file (engine
 * convex/v2/replays.ts: the header, every player's rule, every `v2Events` event) is folded once into an index of each
 * line's states and values, each player's moves, scoreboards and agents, each keyed by the number of events applied;
 * `frameAt(index, applied)` answers what the SDK hooks answer live (sdk/hooks.ts), as the game stood after that many
 * events. Nothing is recomputed but what the record leaves out: want and points from the ✨ rarities (spec §8), the act
 * log's rows from an act and its values (as the tick writes `v2Moves`), the names of agents.
 *
 * After the end nothing is private, so every player's rule, values and moves are here, and a frame answers for any
 * player (the replay's point of view, `replay.watchAs`).
 *
 * A cursor counts events applied: 0 is before the first, `end` after the last. A world-time cursor applies every event
 * at or before that time, then `plus` more.
 */
import type { ReplayCursor } from "@workspace/v2-affordances";
import { DEFAULT_REP, familyOf } from "../sdk/rule.ts";
import type { Agent, Digest, Move, MyRuleRow, ObjectSort, PlayObject, Standings, StandingsPoint } from "../sdk/types.ts";

/** The file version this page reads (engine replays.ts STORED_REPLAY_VERSION). */
export const STORED_REPLAY_VERSION = 1;
/** A move concerns a player who did not make it when it changed their points by more than this (engine loop.ts). */
const CONCERN = 0.05;

type Score = (string | null)[] | null;
interface Snap { score: Score; level: number; rarityBits: number; want: number; points: number }
interface ValueAt extends Snap { at: number }
interface StateAt { at: number; state: string; changedAt: number }
interface Timeline { objectId: string; number: number; bornAt: number; born: number; states: StateAt[]; values: Map<string, ValueAt[]> }
interface Tick { at: number; standings: Standings; point: StandingsPoint }
interface Command { at: number; kind: string; agentId: string; language?: string; version?: number; share?: number; shares?: Record<string, number>; worldSeconds: number }
type RawEvent = { seq: number; kind: string; data: Record<string, unknown> };
type RawRule = { memberId: string; family: string; params: unknown; tieBreaker: string | null; ruleKey: string; card: string; layers: string[]; ladder: MyRuleRow["ladder"]; handicap?: number | null };

export interface ReplayIndex {
  gameId: string;
  /** Events in the file: the cursor's last position. */
  end: number;
  /** The world time of the last event, or the game's length if later. */
  endWorld: number;
  roster: { memberId: string; name: string }[];
  /** After each event, the world time (an event without one keeps the time before it). */
  world: number[];
  /** Positions right after each move is complete (its values applied): where a step lands. */
  stops: number[];
  objects: Timeline[];
  byId: Map<string, Timeline>;
  ticks: Tick[];
  moves: Map<string, { at: number; move: Move }[]>;
  commands: Map<string, Command[]>;
  rules: Map<string, MyRuleRow>;
  /** Standings history prefixes by length, so an unchanged prefix keeps its identity across frames. */
  histories: Map<number, StandingsPoint[]>;
}

/** The last index in a sorted-by-`at` list whose position is applied, or -1. */
function lastAt<T extends { at: number }>(list: readonly T[], applied: number): number {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid]!.at <= applied) lo = mid + 1; else hi = mid; }
  return lo - 1;
}
/** How many of an ascending list are at most `x`. */
function countAtMost(list: readonly number[], x: number): number {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid]! <= x) lo = mid + 1; else hi = mid; }
  return lo;
}

function push<T>(map: Map<string, T[]>, key: string, item: T) {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

function ruleRow(r: RawRule): MyRuleRow {
  const f = familyOf(r.family);
  return {
    family: r.family, title: f?.title ?? r.family, params: r.params, layers: r.layers, tieBreaker: r.tieBreaker, card: r.card,
    depends: f ? [...f.depends] : [], primary: f?.main.rep ?? DEFAULT_REP, ladder: r.ladder, ruleKey: r.ruleKey, bid: null, handicap: r.handicap ?? null,
  };
}

/** Reads a downloaded file and folds it once; throws a sentence when it is not a replay this page reads. */
export function indexReplay(file: unknown): ReplayIndex {
  const f = file as { version?: unknown; game?: Record<string, unknown>; rules?: RawRule[]; events?: RawEvent[] } | null;
  if (!f || typeof f !== "object") throw new Error("The download is not a stored replay.");
  if (f.version !== STORED_REPLAY_VERSION) throw new Error(`The stored replay is version ${String(f.version)}; this page reads version ${STORED_REPLAY_VERSION}.`);
  if (!Array.isArray(f.events) || !f.game) throw new Error("The download is not a stored replay.");
  const game = f.game as { gameId: string; roster: { memberId: string; name: string }[]; settings?: { worldSeconds?: number } };
  const rules = new Map((f.rules ?? []).map(r => [r.memberId, ruleRow(r)]));
  const handicap = (m: string) => rules.get(m)?.handicap ?? 0;
  const nameOf = new Map(game.roster.map(m => [m.memberId, m.name]));

  const ix: ReplayIndex = {
    gameId: game.gameId, end: f.events.length, endWorld: game.settings?.worldSeconds ?? 0, roster: game.roster,
    world: [], stops: [], objects: [], byId: new Map(), ticks: [], moves: new Map(), commands: new Map(), rules, histories: new Map(),
  };
  const events = [...f.events].sort((a, b) => a.seq - b.seq);
  let world = 0, moveSeq = 0;
  let pending: { objectId: string; memberId: string; agentId: string; worldSeconds: number; before: string; after: string; charge: number; calls: { mutator: string; site: number; args: Record<string, string>; rep?: string }[] } | null = null;

  events.forEach((e, i) => {
    const at = i + 1, d = e.data ?? {};
    if (typeof d.worldSeconds === "number") world = Math.max(world, d.worldSeconds);
    ix.world.push(world);
    switch (e.kind) {
      case "objectBorn": {
        const t: Timeline = { objectId: String(d.objectId), number: Number(d.number), bornAt: world, born: at, states: [{ at, state: String(d.state), changedAt: world }], values: new Map() };
        ix.objects.push(t);
        ix.byId.set(t.objectId, t);
        break;
      }
      case "act": {
        // Only a committed act changes its line, and its values follow in the next `values` event.
        pending = d.outcome === "committed" ? {
          objectId: String(d.objectId), memberId: String(d.memberId), agentId: String(d.agentId), worldSeconds: world,
          before: String(d.before), after: String(d.after), charge: Number(d.charge ?? 0), calls: (d.calls ?? []) as NonNullable<typeof pending>["calls"],
        } : null;
        break;
      }
      case "values": {
        const t = ix.byId.get(String(d.objectId));
        if (!t) break;
        const own = (d.values ?? []) as { memberId: string; score: Score; level: number; rarityBits: number }[];
        // Points from bits (spec §8, engine world.ts valuesOf): own ✨ rarity × the others' sum, summed in seat order.
        const total = own.reduce((s, v) => s + v.rarityBits, 0);
        const act = pending && pending.objectId === t.objectId ? pending : null;
        pending = null;
        if (act) t.states.push({ at, state: act.after, changedAt: world });
        for (const v of own) {
          const want = total - v.rarityBits;
          const now: ValueAt = { at, score: v.score, level: v.level, rarityBits: v.rarityBits, want, points: v.rarityBits * want };
          const list = t.values.get(v.memberId) ?? [];
          const was = list.at(-1);
          list.push(now);
          t.values.set(v.memberId, list);
          if (!act || !was) continue;
          const mine = v.memberId === act.memberId;
          if (!mine && Math.abs(now.points - was.points) <= CONCERN) continue;
          const snap = (s: Snap): Snap => ({ score: s.score, level: s.level, rarityBits: s.rarityBits, want: s.want, points: s.points });
          const move = {
            seq: moveSeq, worldSeconds: act.worldSeconds, objectId: t.objectId, number: t.number, agentId: mine ? act.agentId : null, mine,
            calls: act.calls.map(c => ({ mutator: c.mutator, site: c.site, args: c.args })), rep: act.calls[0]?.rep ?? "",
            stateBefore: act.before, stateAfter: act.after, before: snap(was), after: snap(now), charge: mine ? act.charge : null,
          } as unknown as Move;
          push(ix.moves, v.memberId, { at, move });
        }
        if (act) { moveSeq += 1; ix.stops.push(at); }
        break;
      }
      case "tick": {
        const rows = (d.standings ?? []) as { memberId: string; total: number; net: number; rank: number }[];
        const seq = ix.ticks.length;
        ix.ticks.push({
          at,
          standings: { seq, worldSeconds: world, rows: rows.map(r => ({ memberId: r.memberId, name: nameOf.get(r.memberId) ?? "", total: r.total, handicap: handicap(r.memberId), net: r.net, rank: r.rank })) } as unknown as Standings,
          point: { seq, worldSeconds: world, totals: rows.map(r => ({ memberId: r.memberId, net: r.net })) } as unknown as StandingsPoint,
        });
        break;
      }
      case "command": {
        push(ix.commands, String(d.memberId), {
          at, kind: String(d.kind), agentId: String(d.agentId ?? ""), worldSeconds: world,
          ...(typeof d.language === "string" ? { language: d.language } : {}), ...(typeof d.version === "number" ? { version: d.version } : {}),
          ...(typeof d.share === "number" ? { share: d.share } : {}), ...(d.shares ? { shares: d.shares as Record<string, number> } : {}),
        });
        break;
      }
    }
  });
  if (world > 0) ix.endWorld = world;
  return ix;
}

/** The position a cursor names, within the game. */
export function resolveCursor(ix: ReplayIndex, cursor: ReplayCursor): number {
  const at = "seq" in cursor ? cursor.seq : countAtMost(ix.world, cursor.worldSeconds) + cursor.plus;
  return Math.max(0, Math.min(ix.end, Math.floor(at)));
}
/** The world time once `applied` events are applied (0 at the start). */
export const worldAt = (ix: ReplayIndex, applied: number): number => (applied > 0 ? ix.world[Math.min(applied, ix.end) - 1]! : 0);
/** Every event at or before a world time. */
export const appliedAtWorld = (ix: ReplayIndex, t: number): number => countAtMost(ix.world, t);
/** Where a step forward lands: right after the next move, else the end. */
export function nextStop(ix: ReplayIndex, applied: number): number {
  return ix.stops.find(s => s > applied) ?? ix.end;
}
/** Where a step back lands: right after the move before, else the start. */
export function prevStop(ix: ReplayIndex, applied: number): number {
  for (let i = ix.stops.length - 1; i >= 0; i--) if (ix.stops[i]! < applied) return ix.stops[i]!;
  return 0;
}

export interface ReplayFrame {
  applied: number;
  worldSeconds: number;
  /** The scoreboard published by then (null before the first). */
  standings: Standings | null;
  history: StandingsPoint[];
  /** A line as it stood, with `member`'s value of it (none for null); null before its birth. */
  object(objectId: string, member: string | null): PlayObject | null;
  objectIds(member: string, sort: ObjectSort): { objectId: string; number: number }[];
  /** The moves that concerned `member`, newest first. */
  moves(member: string): Move[];
  digest(member: string): Digest | null;
  rule(member: string): MyRuleRow | null;
  agents(member: string): Agent[];
}

/** The game as it stood after `applied` events. */
export function frameAt(ix: ReplayIndex, applied: number): ReplayFrame {
  const a = Math.max(0, Math.min(ix.end, applied));
  const born = ix.objects.filter(t => t.born <= a);
  const valueOf = (t: Timeline, m: string) => {
    const list = t.values.get(m);
    const i = list ? lastAt(list, a) : -1;
    return i < 0 ? null : { ...list![i]!, version: i + 1 };
  };
  const tick = lastAt(ix.ticks, a);
  const count = tick + 1;
  let history = ix.histories.get(count);
  if (!history) ix.histories.set(count, history = ix.ticks.slice(0, count).map(t => t.point));
  const objects = new Map<string, PlayObject | null>();
  return {
    applied: a,
    worldSeconds: worldAt(ix, a),
    standings: tick >= 0 ? ix.ticks[tick]!.standings : null,
    history,
    object(objectId, member) {
      const key = `${objectId}|${member ?? ""}`;
      if (objects.has(key)) return objects.get(key)!;
      const t = ix.byId.get(objectId);
      let out: PlayObject | null = null;
      if (t && t.born <= a) {
        const i = lastAt(t.states, a), s = t.states[i]!;
        const v = member ? valueOf(t, member) : null;
        out = {
          objectId: t.objectId, number: t.number, bornAt: t.bornAt, state: s.state, version: i + 1, changedAt: s.changedAt,
          value: v ? { score: v.score, level: v.level, rarityBits: v.rarityBits, want: v.want, points: v.points, version: v.version } : null,
        } as unknown as PlayObject;
      }
      objects.set(key, out);
      return out;
    },
    objectIds(member, sort) {
      const key = (t: Timeline): number => {
        if (sort === "born") return t.number;
        if (sort === "recent") return t.states[lastAt(t.states, a)]!.changedAt;
        const v = valueOf(t, member);
        if (!v) return -Infinity;
        return sort === "points" ? v.points : sort === "rarity" ? v.rarityBits : v.want;
      };
      // The server pages its indexes in descending order, ties newest first.
      return born.map(t => ({ t, k: key(t) })).sort((x, y) => y.k - x.k || y.t.number - x.t.number).map(({ t }) => ({ objectId: t.objectId, number: t.number }));
    },
    moves(member) {
      const list = ix.moves.get(member) ?? [];
      return list.slice(0, lastAt(list, a) + 1).map(m => m.move).reverse();
    },
    digest(member) {
      if (!born.length) return null;
      const packed: number[] = [];
      for (const t of born) {
        const v = valueOf(t, member);
        if (!v) continue;
        const at = 3 * (t.number - 1);
        while (packed.length < at) packed.push(0);
        packed.splice(at, 3, t.number, v.rarityBits, v.want);
      }
      return { version: a, packed };
    },
    rule: member => ix.rules.get(member) ?? null,
    agents(member) {
      const live = new Map<string, { agentId: string; name: string; language: string; version: number; share: number; createdAt: number }>();
      let named = 0;
      for (const c of ix.commands.get(member) ?? []) {
        if (c.at > a) break;
        const agent = live.get(c.agentId);
        if (c.kind === "summon") live.set(c.agentId, { agentId: c.agentId, name: `Agent ${++named}`, language: c.language ?? "typescript", version: c.version ?? 0, share: c.share ?? 0, createdAt: c.worldSeconds });
        else if (c.kind === "destroy") live.delete(c.agentId);
        else if (c.kind === "allocate") for (const [id, share] of Object.entries(c.shares ?? {})) { const x = live.get(id); if (x) x.share = share; }
        else if (agent) { agent.version = c.version ?? agent.version; agent.language = c.language ?? agent.language; }
      }
      return [...live.values()] as unknown as Agent[];
    },
  };
}
