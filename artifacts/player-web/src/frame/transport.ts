/**
 * The frame transport of the SDK (see src/sdk/transport-types.ts): every query is a bridge subscription that the
 * host serves (allowlisted, for the current room, throttled to `hz`); commands go through the host, which may ask
 * the player first; calibration tables arrive once per game.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandResult, Envelope } from "@workspace/player-client";
import type { CalibrationReply } from "../sdk/bridge-protocol";
import type { LoadTables, QueryReturns, UseSdkQueries, UseSdkQuery, UseSdkSubmit } from "../sdk/transport-types";
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

/** Several bridge subscriptions of one name: one per args, kept while those args stay in the list. */
export const useSdkQueries: UseSdkQueries = (name, argsList, hz) => {
  const keys = argsList.map(args => JSON.stringify([name, args, hz]));
  const [seen, setSeen] = useState<Record<string, Seen>>({});
  const subs = useRef(new Map<string, () => void>());
  useEffect(() => {
    const wanted = new Set(keys);
    for (const [key, stop] of subs.current) if (!wanted.has(key)) { stop(); subs.current.delete(key); }
    argsList.forEach((args, i) => {
      const key = keys[i];
      if (subs.current.has(key)) return;
      subs.current.set(key, bridge().subscribe(name, args, hz,
        value => setSeen(s => ({ ...s, [key]: { key, value } })), error => setSeen(s => ({ ...s, [key]: { key, error } }))));
    });
    setSeen(s => (Object.keys(s).every(k => wanted.has(k)) ? s : Object.fromEntries(Object.entries(s).filter(([k]) => wanted.has(k)))));
    // `keys` covers name, args and hz.
  }, [keys.join("\n")]);
  useEffect(() => () => { for (const stop of subs.current.values()) stop(); subs.current.clear(); }, []);
  return keys.map(key => {
    const s = seen[key];
    if (s?.error !== undefined) throw new Error(s.error);
    return s?.value;
  }) as never;
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
  return { reward: reply.reward, ...(reply.penalty ? { penalty: reply.penalty } : {}), ...(reply.hold ? { hold: reply.hold } : {}) };
};
