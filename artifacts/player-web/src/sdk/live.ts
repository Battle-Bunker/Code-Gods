/**
 * How panes read the server (docs/convex-read-architecture.md R6, ux-lessons §4): every datum is one shared live
 * subscription (Convex shares identical queries across components), read through the site's one live layer
 * (site/lib/convex.tsx useLive, useLivePages), and a failed query throws to the nearest pane's error boundary, so it takes down only the pane that shows it. No retries, no polling, no caches.
 */
import { useMemo } from "react";
import { useConvexAuth, useQueries, type PaginatedQueryArgs, type PaginatedQueryReference } from "convex/react";
import { useLive, useLivePages } from "@/site/lib/convex";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, type Value } from "convex/values";

/** A live query's value (undefined while loading or skipped); its error throws to the pane's boundary. */
export function useLiveValue<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip"): FunctionReturnType<Q> | undefined {
  const r = useLive(query, args);
  if (r.error) throw r.error;
  return r.data;
}

/** Several of the same query (one subscription each, e.g. one row per object), in the order asked. */
export function useLiveValues<Q extends FunctionReference<"query">>(query: Q, argsList: readonly FunctionArgs<Q>[]): (FunctionReturnType<Q> | undefined)[] {
  const { isAuthenticated } = useConvexAuth();
  const keys = argsList.map(a => JSON.stringify(convexToJson(a as Value)));
  const request = useMemo(() => {
    const out: Record<string, { query: Q; args: FunctionArgs<Q> }> = {};
    if (isAuthenticated) argsList.forEach((args, i) => { out[`q${i}`] = { query, args }; });
    return out as Parameters<typeof useQueries>[0];
  }, [isAuthenticated, getFunctionName(query), keys.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const answers = useQueries(request);
  return argsList.map((_, i) => {
    const a = answers[`q${i}`] as FunctionReturnType<Q> | Error | undefined;
    if (a instanceof Error) throw a;
    return a;
  });
}

/** A paged list (every loaded page stays live); `loadMore` asks for the next page. Errors throw to the pane. */
export function useLivePaged<Q extends PaginatedQueryReference>(query: Q, args: PaginatedQueryArgs<Q> | "skip", pageSize: number) {
  return useLivePages(query, args, { initialNumItems: pageSize });
}
