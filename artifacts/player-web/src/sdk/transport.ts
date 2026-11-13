/** The host transport of the SDK (see transport-types.ts): Convex directly, in the player client. */
import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useAction, useQueries } from "convex/react";
import { PaneErrorContext } from "./pane-error-context";
import { queryErrors } from "./query-errors";
import type { FunctionReference } from "convex/server";
import { api } from "@workspace/engine/convex/_generated/api";
import type { CommandResult } from "@workspace/player-client";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import { appAccessToken, engineSite } from "../core/connection";
import type { QueryName } from "./bridge-protocol";
import { useReplaySource } from "./replay-source";
import type { LoadTables, UseSdkQueries, UseSdkQuery, UseSdkSubmit } from "./transport-types";

export const QUERY_REFS: Record<QueryName, FunctionReference<"query">> = {
  "player.observation": api.player.observation,
  "player.events": api.player.events,
  "player.myUtility": api.player.myUtility,
  "player.trajectories": api.player.trajectories,
  "player.objectsPage": api.player.objectsPage,
  "player.objectIds": api.player.objectIds,
  "player.object": api.player.object,
  "player.objectsTop": api.player.objectsTop,
  "player.objectRank": api.player.objectRank,
  "player.totals": api.player.totals,
  "player.staleCount": api.player.staleCount,
  "dock.state": api.dock.state,
  "dock.agents": api.dock.agents,
  "dock.transformations": api.dock.transformations,
  "dock.agentSeries": api.dock.agentSeries,
  "games.standings": api.games.standings,
  "games.standingsHistory": api.games.standingsHistory,
  "rooms.chat": api.rooms.chat,
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
  // Through useQueries, which hands a failure back as a value: one failed query must not throw through the root and
  // take the page down (query-errors.ts). The consumer gets "not loaded"; the failure is recorded for the pane it is
  // in (which says so above its content), or for the dock when it is outside any pane (the header, the dock's own
  // state). No retry here: the live subscription re-delivers by itself, and the record clears when it does.
  const off = served || args === "skip";
  const key = off ? "" : `${name}:${JSON.stringify(args)}`;
  const request = useMemo(() => (off ? {} : { q: { query: QUERY_REFS[name], args: args as Record<string, unknown> } }),
    // `key` covers name and args.
    [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const answered = (useQueries(request as Parameters<typeof useQueries>[0]) as Record<string, unknown>).q;
  const failure = answered instanceof Error ? answered : null;
  const pane = useContext(PaneErrorContext);
  useEffect(() => {
    if (!key) return;
    const record = pane ?? queryErrors;
    if (failure) record.report(key, failure.message);
    else if (answered !== undefined) record.clear(key);
    // Gone with its consumer: a failure nobody is subscribed to any more is not shown.
    return () => { if (failure) record.clear(key); };
  }, [key, failure, answered, pane]);
  const live = failure ? undefined : answered;
  const fromReplay = useSyncExternalStore(served ? replay!.subscribe : noSubscription,
    () => (served ? replay!.answer(name, args as Record<string, unknown>) : undefined));
  return (served ? fromReplay : live) as never;
};

/** Several live queries of one name (useQueries); in replay mode the replay answers each. A failed one is "not loaded", like useSdkQuery's. */
export const useSdkQueries: UseSdkQueries = (name, argsList) => {
  const replay = useReplaySource();
  const served = !!replay && replay.serves(name);
  const key = JSON.stringify(argsList);
  const request = useMemo(() => (served ? {} : Object.fromEntries(argsList.map((args, i) => [String(i), { query: QUERY_REFS[name], args }]))),
    // `key` covers argsList.
    [served, name, key]);
  const live = useQueries(request as Parameters<typeof useQueries>[0]);
  // The replay's answers as one snapshot: the same array while every answer is the same object.
  const answers = useRef<unknown[]>([]);
  const fromReplay = useSyncExternalStore(served ? replay!.subscribe : noSubscription, () => {
    if (!served) return answers.current;
    const next = argsList.map(args => replay!.answer(name, args));
    if (next.length !== answers.current.length || next.some((a, i) => a !== answers.current[i])) answers.current = next;
    return answers.current;
  });
  return argsList.map((_args, i) => {
    if (served) return fromReplay[i];
    const result = live[String(i)];
    // A failed one is "not loaded" for its consumer, like useSdkQuery's (the page stands).
    if (result instanceof Error) return undefined;
    return result;
  }) as never;
};

export const useSdkSubmit: UseSdkSubmit = () => {
  const submit = useAction(api.commands.submit);
  const replay = useReplaySource();
  return useCallback(async (roomId, envelope) => {
    if (replay) return { commandId: envelope.commandId, accepted: false, message: replay.refusal } as CommandResult;
    return await submit({ roomId, envelope }) as CommandResult;
  }, [submit, replay]);
};

/** Requests in flight per path (two panels mounting together ask once); dropped when answered: no result cache. */
const inFlight = new Map<string, Promise<{ reward: unknown; penalty?: unknown; hold?: unknown }>>();
/**
 * A seat's tables from the engine (GET /api/calibration/<roomId>/<gameId>/<godId>, with your Convex JWT; the engine
 * loads them from its file storage; no table data is bundled into the client). With the game's hold correction once
 * computed (`hold`, docs/energy-model.md §8); from then on the answer never changes and the browser caches it per path
 * (`Cache-Control: private, immutable`); while it is computing the answer is not cached.
 */
export const loadTables: LoadTables = (_settings, descriptor, seat) => {
  const path = [seat.roomId, seat.gameId, seat.godId].map(encodeURIComponent).join("/");
  let request = inFlight.get(path);
  if (!request) {
    request = (async () => {
      const token = await appAccessToken();
      if (!token) throw new Error("Not signed in");
      const response = await fetch(`${engineSite().replace(/\/$/, "")}/api/calibration/${path}`, { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`The calibration tables did not load (HTTP ${response.status}).`);
      return await response.json() as { reward: unknown; penalty?: unknown; hold?: unknown };
    })();
    inFlight.set(path, request);
    void request.finally(() => inFlight.delete(path)).catch(() => {});
  }
  return request.then(({ reward, penalty, hold }) => ({ reward, ...((descriptor as UtilityDescriptor).penalty ? { penalty } : {}), ...(hold ? { hold } : {}) }));
};
