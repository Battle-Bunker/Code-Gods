/**
 * The SDK's transport contract. The SDK is built twice with the same hooks and a different `@sdk-transport`:
 *   - host  (src/sdk/transport.ts): Convex's useQuery / useAction in the player client itself;
 *   - frame (src/frame/transport.ts): bridge subscriptions to the host, for stored panels in a sandboxed frame.
 * Both export exactly these functions.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@workspace/engine/convex/_generated/api";
import type { CommandResult, Envelope } from "@workspace/player-client";
import type { QueryName } from "./bridge-protocol";

export type QueryReturns = {
  "player.observation": FunctionReturnType<typeof api.player.observation>;
  "player.events": FunctionReturnType<typeof api.player.events>;
  "player.myUtility": FunctionReturnType<typeof api.player.myUtility>;
  "player.trajectories": FunctionReturnType<typeof api.player.trajectories>;
  "player.objectsPage": FunctionReturnType<typeof api.player.objectsPage>;
  "player.objectIds": FunctionReturnType<typeof api.player.objectIds>;
  "player.object": FunctionReturnType<typeof api.player.object>;
  "player.objectsTop": FunctionReturnType<typeof api.player.objectsTop>;
  "player.objectRank": FunctionReturnType<typeof api.player.objectRank>;
  "player.totals": FunctionReturnType<typeof api.player.totals>;
  "dock.state": FunctionReturnType<typeof api.dock.state>;
  "dock.agents": FunctionReturnType<typeof api.dock.agents>;
  "dock.transformations": FunctionReturnType<typeof api.dock.transformations>;
  "dock.agentSeries": FunctionReturnType<typeof api.dock.agentSeries>;
  "games.standings": FunctionReturnType<typeof api.games.standings>;
  "games.standingsHistory": FunctionReturnType<typeof api.games.standingsHistory>;
  "rooms.chat": FunctionReturnType<typeof api.rooms.chat>;
  "rooms.get": FunctionReturnType<typeof api.rooms.get>;
};

/** A live query (undefined while loading); `hz` is the rate the frame transport asks the host for. */
export type UseSdkQuery = <N extends QueryName>(name: N, args: Record<string, unknown> | "skip", hz?: number) => QueryReturns[N] | undefined;
/**
 * Several live queries of one name from one hook (a list of windows, say): one subscription per args, kept while those
 * args stay in the list and dropped when they leave it; each answer is undefined while it loads.
 */
export type UseSdkQueries = <N extends QueryName>(name: N, args: readonly Record<string, unknown>[], hz?: number) => (QueryReturns[N] | undefined)[];
/** Submit a v3 envelope for this room through the one command path. */
export type UseSdkSubmit = () => (roomId: string, envelope: Envelope) => Promise<CommandResult>;
/** Where your tables are: your seat in a room's current game (player.myUtility's gameId and godId). */
export type TableSeat = { roomId: string; gameId: string; godId: string };
/** The calibration tables of your utility (reward channel, and the defence goal's when dealt). */
export type LoadTables = (settings: unknown, descriptor: unknown, seat: TableSeat) => Promise<{ reward: unknown; penalty?: unknown }>;
