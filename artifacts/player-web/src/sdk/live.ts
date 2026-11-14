/**
 * How panes read the server (docs/convex-read-architecture.md R6, ux-lessons §4): every datum is one shared live
 * subscription (Convex shares identical queries across components), and a failed query throws to the nearest pane's
 * error boundary, so it takes down only the pane that shows it. No retries, no polling, no caches.
 */
import { useMemo } from "react";
import { useConvexAuth, usePaginatedQuery, useQueries, type PaginatedQueryArgs, type PaginatedQueryReference } from "convex/react";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { convexToJson, type Value } from "convex/values";

/** A live query's value (undefined while loading or skipped); its error throws to the pane's boundary. */
export function useLiveValue<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q> | "skip"): FunctionReturnType<Q> | undefined {
  const { isAuthenticated } = useConvexAuth();
  const skip = args === "skip" || !isAuthenticated;
  const key = skip ? "" : `${getFunctionName(query)}:${JSON.stringify(convexToJson(args as Value))}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const request = useMemo((): Parameters<typeof useQueries>[0] => (skip ? {} : { q: { query, args: args as FunctionArgs<Q> } }), [key]);
  const answer = useQueries(request).q as FunctionReturnType<Q> | Error | undefined;
  if (answer instanceof Error) throw answer;
  return answer;
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
  const { isAuthenticated } = useConvexAuth();
  return usePaginatedQuery(query, isAuthenticated && args !== "skip" ? args : "skip", { initialNumItems: pageSize });
}
