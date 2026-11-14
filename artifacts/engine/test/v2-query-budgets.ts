/**
 * The query-cost gate's budget table for engine v2 (docs/convex-read-architecture.md R8; integration plan §2.2).
 * Every live v2 query a page subscribes to has one row. `pending` rows are declared but not yet measured: M1's
 * `v2-query-cost.test.ts` measures every row in a 1,000-object game against LIMITS (≤ 100 documents, ≤ 64 KiB,
 * ≤ 50 ms), that it refuses signed-out callers, and that a `cold` row's answer survives tick commits.
 * test/unit/v2-query-budgets.test.ts checks this table lists exactly the public queries under convex/v2.
 */
export const LIMITS = { docs: 100, bytes: 64 * 1024, ms: 50 } as const;

/** What the measured game provides for the queries' arguments. */
export interface V2Fixture { roomId: string; gameId: string; objectId: string; agentId: string }
const page = { paginationOpts: { numItems: 50, cursor: null } };

export interface V2Budget {
  /** "<module path>:<export>", e.g. "v2/play:object". */
  query: string;
  args: (f: V2Fixture) => Record<string, unknown>;
  /** What it reads (one document, or one index page), as plan §2.2 says. */
  reads: string;
  /** Its answer does not depend on what a tick writes. */
  cold: boolean;
}

export const V2_BUDGETS: readonly V2Budget[] = [
  { query: "v2/rooms:list", args: () => page, reads: "v2Members by_user page", cold: true },
  { query: "v2/rooms:get", args: f => ({ roomId: f.roomId }), reads: "room + ≤ 16 members + current and last game header", cold: true },
  { query: "v2/rooms:chat", args: f => ({ roomId: f.roomId, ...page }), reads: "v2Chat by_room page", cold: true },
  { query: "v2/rooms:round", args: f => ({ roomId: f.roomId }), reads: "≤ 16 ended game headers + their v2Standings", cold: true },
  { query: "v2/rooms:history", args: f => ({ roomId: f.roomId, ...page }), reads: "v2Games by_room_phase page", cold: true },
  { query: "v2/games:header", args: f => ({ gameId: f.gameId }), reads: "1 v2Games + the caller's member and player rows", cold: true },
  { query: "v2/games:standings", args: f => ({ gameId: f.gameId }), reads: "1 v2Standings", cold: false },
  { query: "v2/games:standingsHistory", args: f => ({ gameId: f.gameId, after: -1 }), reads: "v2StandingsHistory by_game_seq, ≤ 100", cold: false },
  { query: "v2/play:myRule", args: f => ({ gameId: f.gameId }), reads: "the caller's v2Rules row", cold: true },
  { query: "v2/play:me", args: f => ({ gameId: f.gameId }), reads: "the caller's v2Players row", cold: false },
  { query: "v2/play:objectIds", args: f => ({ gameId: f.gameId, sort: "points", ...page }), reads: "v2ObjectValues by_game_member_<sort> page", cold: false },
  { query: "v2/play:object", args: f => ({ objectId: f.objectId }), reads: "v2Objects + v2ObjectStates + the caller's v2ObjectValues", cold: false },
  { query: "v2/play:agents", args: f => ({ gameId: f.gameId }), reads: "the caller's v2Agents, ≤ 20", cold: true },
  { query: "v2/play:agentEnergy", args: f => ({ agentId: f.agentId }), reads: "1 v2Agents + 1 v2AgentEnergy", cold: false },
  { query: "v2/play:agentPrograms", args: f => ({ agentId: f.agentId }), reads: "v2AgentPrograms by_agent, ≤ 20", cold: false },
  { query: "v2/play:moves", args: f => ({ gameId: f.gameId, ...page }), reads: "v2Moves by_game_member_seq page", cold: false },
  { query: "v2/play:digest", args: f => ({ gameId: f.gameId }), reads: "1 v2Digests", cold: false },
  { query: "v2/spectate:objectIds", args: f => ({ gameId: f.gameId, ...page }), reads: "v2Objects by_game page", cold: false },
  { query: "v2/spectate:object", args: f => ({ objectId: f.objectId }), reads: "v2Objects + v2ObjectStates", cold: false },
  { query: "v2/layout:current", args: f => ({ roomId: f.roomId }), reads: "1 v2Layouts", cold: true },
  { query: "v2/replays:stored", args: f => ({ gameId: f.gameId }), reads: "1 v2Games", cold: true },
  { query: "v2/bids:state", args: f => ({ roomId: f.roomId }), reads: "room + v2RoomBids by_room (≤ 16) + members (≤ 16)", cold: true },
];
