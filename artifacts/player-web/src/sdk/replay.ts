/**
 * The replay's answers to the SDK (integration plan W5-5): while the game page shows a replay, the replay controller
 * (src/replay/controller.tsx) provides the game as it stood at the playhead, through the eyes of one player, and every
 * hook in ./hooks.ts answers from it instead of its live query (which it skips), so every pane works in a replay
 * unchanged. Null outside a replay.
 */
import { createContext, useContext } from "react";
import type { ReplayFrame, ReplayIndex } from "../replay/fold.ts";

export interface ReplaySource {
  index: ReplayIndex;
  frame: ReplayFrame;
  /** The player whose eyes the replay is watched through (their rule, values and moves). */
  member: string;
}

export const ReplaySourceContext = createContext<ReplaySource | null>(null);

export function useReplaySource(): ReplaySource | null {
  return useContext(ReplaySourceContext);
}

/** A paged hook's answer from the replay: everything up to the playhead, already loaded. */
export function pagedFrom<T>(results: T[]) {
  return { results, status: "Exhausted" as const, isLoading: false as const, loadMore: (_n: number) => {} };
}
