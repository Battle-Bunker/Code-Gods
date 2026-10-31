/** The host transport of the SDK (see transport-types.ts): Convex directly, in the player client. */
import { useCallback } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "@workspace/engine/convex/_generated/api";
import type { CommandResult } from "@workspace/player-client";
import type { GameSettings } from "@workspace/game-core";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import type { QueryName } from "./bridge-protocol";
import type { LoadTables, UseSdkQuery, UseSdkSubmit } from "./transport-types";

export const QUERY_REFS: Record<QueryName, FunctionReference<"query">> = {
  "player.observation": api.player.observation,
  "player.events": api.player.events,
  "player.myUtility": api.player.myUtility,
  "player.trajectories": api.player.trajectories,
  "rooms.get": api.rooms.get,
};

export const useSdkQuery: UseSdkQuery = (name, args) => useQuery(QUERY_REFS[name], args as never);

export const useSdkSubmit: UseSdkSubmit = () => {
  const submit = useAction(api.commands.submit);
  return useCallback(async (roomId, envelope) => await submit({ roomId, envelope }) as CommandResult, [submit]);
};

/** Looks the tables up in the shipped calibration data (game-utilities, loaded lazily: it is large). */
export const loadTables: LoadTables = async (settings, descriptor) => {
  const [core, utilities] = await Promise.all([import("@workspace/game-core"), import("@workspace/game-utilities")]);
  const s = settings as GameSettings, d = descriptor as UtilityDescriptor;
  const inst = core.instantiationOf(s);
  const prior = s.priorId === utilities.UNIFORM_PRIOR.id ? utilities.UNIFORM_PRIOR : undefined;
  if (!prior) throw new Error(`Unknown prior ${s.priorId}`);
  const tableOf = (draw: { familyId: string; params: UtilityDescriptor["params"] }) => {
    const table = utilities.tableFor(draw, inst, prior);
    if (!table) throw new Error(`No calibration table for ${draw.familyId} in ${inst.key}`);
    return table;
  };
  return { reward: tableOf(d), ...(d.penalty ? { penalty: tableOf(d.penalty) } : {}) };
};
