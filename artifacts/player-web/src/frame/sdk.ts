/**
 * `@sdk` version 2 as a stored panel imports it, inside its frame: the app's game hooks (src/sdk/hooks.ts), each
 * answered over the bridge by the real hook running in the app (./protocol.ts PANEL_HOOKS), with the same types and
 * the same meaning: undefined while loading, a failed read throws to the panel's error boundary. The pure helpers
 * (rules, representations, definePanel) are the app's own modules. Nothing here reaches the network: the frame has
 * no connection of its own (CSP connect-src 'none').
 */
import { useMemo, useSyncExternalStore } from "react";
import type * as App from "../sdk/hooks";
import { bridge } from "./bridge-client";
import type { HookName, PagedAnswer } from "./protocol";
import { bitsOf, ruleRefOf, valueOf } from "../sdk/rule";
import type { MyRuleRow } from "../sdk/types";

export { definePanel, PANEL_SDK, type PanelDefinition, type PanelManifest } from "../sdk/panel";
export { useGameScope, type GameScope } from "../sdk/game";
export { decodeState, familyOf, ruleRefOf, valueOf, variantOf, type GameRule } from "../sdk/rule";
export { defaultRepOf, objectTypeOf, objectWord } from "../sdk/object-types";
export type * from "../sdk/types";
export type { MyRule } from "../sdk/hooks";

function useBridged(hook: HookName, args: unknown[]) {
  const w = bridge().watch(hook, args);
  const snapshot = useSyncExternalStore(w.subscribe, w.get);
  if (snapshot.error !== undefined) throw new Error(snapshot.error);
  return { value: snapshot.value, watch: w };
}
const value = <T>(hook: HookName, ...args: unknown[]) => useBridged(hook, args).value as T;

function usePaged(hook: HookName, args: unknown[]) {
  const { value: answer, watch } = useBridged(hook, args);
  const page = answer as PagedAnswer | undefined;
  return useMemo(() => ({
    results: page?.results ?? [],
    status: page?.status ?? "LoadingFirstPage",
    isLoading: page?.isLoading ?? true,
    loadMore: (n: number) => watch.more(n),
  }), [page, watch]);
}

type Hook<K extends keyof typeof App> = (typeof App)[K];

export const useRoomInfo: Hook<"useRoomInfo"> = () => value("useRoomInfo");
export const useGame: Hook<"useGame"> = () => value("useGame");
export const useMe: Hook<"useMe"> = () => value("useMe");
export const useMyAgents: Hook<"useMyAgents"> = () => value("useMyAgents");
export const useAgentCount: Hook<"useAgentCount"> = () => value("useAgentCount");
export const useLeaderboard: Hook<"useLeaderboard"> = () => value("useLeaderboard");
export const useDigest: Hook<"useDigest"> = () => value("useDigest");
export const useMyObject: Hook<"useMyObject"> = objectId => value("useMyObject", objectId ?? null);
export const useMyObjects: Hook<"useMyObjects"> = objectIds => {
  const answer = value<ReturnType<Hook<"useMyObjects">> | undefined>("useMyObjects", [...objectIds]);
  const key = objectIds.join("|");
  // One array per answer (and one while loading), as the app's hook keeps it.
  return useMemo(() => answer ?? objectIds.map(() => undefined), [answer, key]); // eslint-disable-line react-hooks/exhaustive-deps
};
export const useAgentEnergy: Hook<"useAgentEnergy"> = agentId => value("useAgentEnergy", agentId ?? null);
export const useAgentPrograms: Hook<"useAgentPrograms"> = agentId => value("useAgentPrograms", agentId ?? null);
export const useStandingsHistory: Hook<"useStandingsHistory"> = () => value("useStandingsHistory") ?? EMPTY;
const EMPTY: never[] = [];

/** The rule's row crosses the bridge; the drawable rule and the value lookup are built here, as the app does. */
export const useMyRule: Hook<"useMyRule"> = () => {
  const raw = value<{ row: MyRuleRow } | undefined>("useMyRule");
  const variant = useGame()?.variant;
  return useMemo(() => {
    if (!raw || !variant) return undefined;
    const value = valueOf(raw.row.value?.knots, raw.row.value?.tail, (raw.row.value as { uniqueness?: never } | undefined)?.uniqueness);
    return { row: raw.row, rule: ruleRefOf(raw.row, variant), value, bits: bitsOf(value) };
  }, [raw, variant]);
};

export const useObjectIds: Hook<"useObjectIds"> = (sort, pageSize = 30) => usePaged("useObjectIds", [sort, pageSize]) as never;
export const useSpectatorObjectIds: Hook<"useSpectatorObjectIds"> = (pageSize = 30) => usePaged("useSpectatorObjectIds", [pageSize]) as never;
export const useMoves: Hook<"useMoves"> = (pageSize = 30) => usePaged("useMoves", [pageSize]) as never;
export const useChat: Hook<"useChat"> = (pageSize = 50) => usePaged("useChat", [pageSize]) as never;
