/**
 * The query-cost gate's budget table for engine v2 (docs/convex-read-architecture.md R8; integration plan §2.2).
 * Every live v2 query a page subscribes to has one row. `pending` rows are declared but not yet measured: M1's
 * `v2-query-cost.test.ts` measures every row in a 1,000-object game against LIMITS (≤ 100 documents, ≤ 64 KiB,
 * ≤ 50 ms), checks that `cold` rows survive tick commits, and refuses signed-out callers; then `pending` goes.
 * test/unit/v2-query-budgets.test.ts checks this table lists exactly the public queries under convex/v2.
 */
export const LIMITS = { docs: 100, bytes: 64 * 1024, ms: 50 } as const;

export interface V2Budget {
  /** "<module path>:<export>", e.g. "v2/play:object". */
  query: string;
  /** What it reads (one document, or one index page), as plan §2.2 says. */
  reads: string;
  /** Its answer does not depend on what a tick writes. */
  cold: boolean;
  /** Not measured yet (until M1's gate runs). */
  pending?: true;
}

export const V2_BUDGETS: readonly V2Budget[] = [
  { query: "v2/rooms:list", reads: "v2Members by_user page", cold: true, pending: true },
  { query: "v2/rooms:get", reads: "room + ≤ 16 members + current and last game header", cold: true, pending: true },
  { query: "v2/rooms:byCode", reads: "1 v2Rooms by_code + the caller's v2Members row", cold: true, pending: true },
  { query: "v2/rooms:chat", reads: "v2Chat by_room page", cold: true, pending: true },
  { query: "v2/rooms:history", reads: "v2Games by_room_phase page", cold: true, pending: true },
  { query: "v2/games:header", reads: "1 v2Games + the caller's member and player rows", cold: true, pending: true },
  { query: "v2/games:standings", reads: "1 v2Standings", cold: false, pending: true },
  { query: "v2/games:standingsHistory", reads: "v2StandingsHistory by_game_seq, ≤ 100", cold: false, pending: true },
  { query: "v2/play:myRule", reads: "the caller's v2Rules row", cold: true, pending: true },
  { query: "v2/play:me", reads: "the caller's v2Players row", cold: false, pending: true },
  { query: "v2/play:objectIds", reads: "v2ObjectValues by_game_member_<sort> page", cold: false, pending: true },
  { query: "v2/play:object", reads: "v2Objects + v2ObjectStates + the caller's v2ObjectValues", cold: false, pending: true },
  { query: "v2/play:agents", reads: "the caller's v2Agents, ≤ 20", cold: true, pending: true },
  { query: "v2/play:agentEnergy", reads: "1 v2Agents + 1 v2AgentEnergy", cold: false, pending: true },
  { query: "v2/play:agentPrograms", reads: "v2AgentPrograms by_agent, ≤ 20", cold: false, pending: true },
  { query: "v2/play:moves", reads: "v2Moves by_game_member_seq page", cold: false, pending: true },
  { query: "v2/play:digest", reads: "1 v2Digests", cold: false, pending: true },
  { query: "v2/spectate:objectIds", reads: "v2Objects by_game page", cold: true, pending: true },
  { query: "v2/spectate:object", reads: "v2Objects + v2ObjectStates", cold: false, pending: true },
  { query: "v2/layout:current", reads: "1 v2Layouts", cold: true, pending: true },
  { query: "v2/replays:stored", reads: "1 v2Games", cold: true, pending: true },
  { query: "v2/bids:state", reads: "room + v2RoomBids by_room (≤ 16) + members (≤ 16)", cold: true, pending: true },
];
