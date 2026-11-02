/** The host transport of the SDK (see transport-types.ts): Convex directly, in the player client. */
import { useCallback, useSyncExternalStore } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "@workspace/engine/convex/_generated/api";
import type { CommandResult } from "@workspace/player-client";
import type { GameSettings } from "@workspace/game-core";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import { existingConvexClient } from "../core/connection";
import type { QueryName } from "./bridge-protocol";
import { useReplaySource } from "./replay-source";
import type { LoadTables, UseSdkQuery, UseSdkSubmit } from "./transport-types";

export const QUERY_REFS: Record<QueryName, FunctionReference<"query">> = {
  "player.observation": api.player.observation,
  "player.events": api.player.events,
  "player.myUtility": api.player.myUtility,
  "player.trajectories": api.player.trajectories,
  "rooms.get": api.rooms.get,
};

const noSubscription = () => () => {};

/**
 * A live query; in the dock's replay mode (sdk/replay-source.ts) the replay answers it at the playhead instead, and
 * the engine is not asked.
 */
export const useSdkQuery: UseSdkQuery = (name, args) => {
  const replay = useReplaySource();
  const served = !!replay && args !== "skip" && replay.serves(name);
  const live = useQuery(QUERY_REFS[name], (served ? "skip" : args) as never);
  const fromReplay = useSyncExternalStore(served ? replay!.subscribe : noSubscription,
    () => (served ? replay!.answer(name, args as Record<string, unknown>) : undefined));
  return (served ? fromReplay : live) as never;
};

export const useSdkSubmit: UseSdkSubmit = () => {
  const submit = useAction(api.commands.submit);
  const replay = useReplaySource();
  return useCallback(async (roomId, envelope) => {
    if (replay) return { commandId: envelope.commandId, accepted: false, message: replay.refusal } as CommandResult;
    return await submit({ roomId, envelope }) as CommandResult;
  }, [submit, replay]);
};

const tableCache = new Map<string, Promise<{ reward: unknown; penalty?: unknown }>>();
/**
 * Asks the engine for the tables of your utility (calibration.node.tables: the engine loads them from its file
 * storage; no table data is bundled into the client). Cached per game settings and descriptor.
 */
export const loadTables: LoadTables = async (settings, descriptor) => {
  const d = descriptor as UtilityDescriptor;
  const key = JSON.stringify([settings, d]);
  let found = tableCache.get(key);
  if (!found) {
    const convex = existingConvexClient();
    if (!convex) throw new Error("Not connected to the engine");
    const draws = [{ familyId: d.familyId, params: d.params }, ...(d.penalty ? [{ familyId: d.penalty.familyId, params: d.penalty.params }] : [])];
    found = convex.action(api.calibration.node.tables, { settings: settings as GameSettings, draws }).then(text => {
      const [reward, penalty] = JSON.parse(text) as unknown[];
      return { reward, ...(d.penalty ? { penalty } : {}) };
    });
    tableCache.set(key, found);
    found.catch(() => tableCache.delete(key));
  }
  return found;
};
