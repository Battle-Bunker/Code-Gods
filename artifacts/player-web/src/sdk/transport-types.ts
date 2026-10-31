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
  "rooms.get": FunctionReturnType<typeof api.rooms.get>;
};

/** A live query (undefined while loading); `hz` is the rate the frame transport asks the host for. */
export type UseSdkQuery = <N extends QueryName>(name: N, args: Record<string, unknown> | "skip", hz?: number) => QueryReturns[N] | undefined;
/** Submit a v3 envelope for this room through the one command path. */
export type UseSdkSubmit = () => (roomId: string, envelope: Envelope) => Promise<CommandResult>;
/** The calibration tables of your utility (reward channel, and the defence goal's when dealt). */
export type LoadTables = (settings: unknown, descriptor: unknown) => Promise<{ reward: unknown; penalty?: unknown }>;
