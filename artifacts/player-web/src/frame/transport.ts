/**
 * The frame transport of the SDK (see src/sdk/transport-types.ts): every query is a bridge subscription that the
 * host serves (allowlisted, for the current room, throttled to `hz`); commands go through the host, which may ask
 * the player first; calibration tables arrive once per game.
 */
import { useCallback, useEffect, useState } from "react";
import type { CommandResult, Envelope } from "@workspace/player-client";
import type { CalibrationReply } from "../sdk/bridge-protocol";
import type { LoadTables, QueryReturns, UseSdkQuery, UseSdkSubmit } from "../sdk/transport-types";
import { bridge } from "./bridge-client";

type Seen = { key: string; value?: unknown; error?: string };

export const useSdkQuery: UseSdkQuery = (name, args, hz) => {
  const key = args === "skip" ? "" : JSON.stringify([name, args]);
  const [seen, setSeen] = useState<Seen>();
  useEffect(() => {
    if (!key || args === "skip") return;
    return bridge().subscribe(name, args, hz, value => setSeen({ key, value }), error => setSeen({ key, error }));
    // `key` covers name and args.
  }, [key, hz]);
  if (!seen || seen.key !== key) return undefined;
  // Like Convex's useQuery: a failed query throws into the panel's error boundary.
  if (seen.error !== undefined) throw new Error(seen.error);
  return seen.value as QueryReturns[typeof name];
};

export const useSdkSubmit: UseSdkSubmit = () =>
  useCallback((_roomId: string, envelope: Envelope) => bridge().request<CommandResult>({ type: "command", envelope }), []);

let calibration: Promise<CalibrationReply> | undefined;
let calibrationKey = "";
/** The host answers with the tables of the player's own current utility; the descriptor here only keys the cache. */
export const loadTables: LoadTables = async (_settings, descriptor) => {
  const key = JSON.stringify(descriptor);
  if (!calibration || calibrationKey !== key) {
    calibrationKey = key;
    calibration = bridge().request<CalibrationReply>({ type: "calibration" }).catch(error => { calibration = undefined; throw error; });
  }
  const reply = await calibration;
  return { reward: reply.reward, ...(reply.penalty ? { penalty: reply.penalty } : {}) };
};
