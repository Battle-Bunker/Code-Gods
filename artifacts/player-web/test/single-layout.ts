import type { DockLayout } from "@workspace/player-client/layout";

/** One objects panel over the assistant, 50/50: the smallest layout the dock mechanics tests can read from. */
export const SINGLE_LAYOUT: DockLayout = {
  version: 1,
  root: { type: "split", direction: "column", sizes: [50, 50], children: [{ type: "pane", id: "p1" }, { type: "pane", id: "p2" }] },
  panes: {
    p1: { id: "p1", kind: "panel", panelId: "objects", params: { sortBy: "payoff", filter: "all", limit: 12, highlight: [], layout: "list" }, setBy: "default" },
    p2: { id: "p2", kind: "assistant" },
  },
};
