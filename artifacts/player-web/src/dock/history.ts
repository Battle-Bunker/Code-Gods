/**
 * Per-pane view history, kept in this client only (docs/research/ui-redesign/player-client.md §2.2): every change the
 * assistant makes to a built-in panel pushes the previous view, so the pane header's ‹ returns to it and ↺ resets the panel
 * to its defaults. Both appear only after an assistant change. The panel menu restores the parameters last used for a
 * panel in that pane. Pure; tested in test/layout-sync.test.ts.
 */
import { defaultPanelParams, type PanelId } from "@workspace/player-client/panels";
import { panelPanesOf, type DockLayout, type Pane, type SetBy } from "@workspace/player-client/layout";
import { canonical } from "./layout-sync.ts";

export type View = { panelId: PanelId; params: Record<string, unknown>; setBy: SetBy };
export type History = {
  stacks: Readonly<Record<string, readonly View[]>>;
  last: Readonly<Record<string, Readonly<Partial<Record<PanelId, Record<string, unknown>>>>>>;
};
export const emptyHistory: History = { stacks: {}, last: {} };
const MAX = 10;
type PanelPane = Extract<Pane, { kind: "panel" }>;
const viewOf = (pane: PanelPane): View => ({ panelId: pane.panelId, params: pane.params, setBy: pane.setBy });

/** Note a layout change: assistant changes push the previous view; every built-in panel's parameters are remembered. */
export function observe(history: History, before: DockLayout | null, after: DockLayout): History {
  const stacks: Record<string, readonly View[]> = {};
  const last: Record<string, Partial<Record<PanelId, Record<string, unknown>>>> = { ...history.last };
  for (const pane of panelPanesOf(after)) {
    const prev = before?.panes[pane.id];
    let stack = history.stacks[pane.id] ?? [];
    const remembered = { ...last[pane.id] };
    if (prev?.kind === "panel") {
      remembered[prev.panelId] = prev.params;
      const changed = prev.panelId !== pane.panelId || canonical(prev.params) !== canonical(pane.params);
      if (changed && pane.setBy === "assistant") stack = [...stack, viewOf(prev)].slice(-MAX);
    }
    remembered[pane.panelId] = pane.params;
    last[pane.id] = remembered;
    if (stack.length) stacks[pane.id] = stack;
  }
  return { stacks, last };
}

/** ‹ is offered only while the pane shows an assistant's change with something to go back to. */
export const canUndo = (history: History, pane: Pane | undefined): boolean =>
  pane?.kind === "panel" && pane.setBy === "assistant" && (history.stacks[pane.id]?.length ?? 0) > 0;

/** The previous view of a pane, and the history without it. */
export function back(history: History, paneId: string): { view: View; history: History } | null {
  const stack = history.stacks[paneId];
  if (!stack?.length) return null;
  const { [paneId]: _gone, ...rest } = history.stacks;
  const remaining = stack.slice(0, -1);
  return { view: stack[stack.length - 1], history: { ...history, stacks: remaining.length ? { ...rest, [paneId]: remaining } : rest } };
}

/** ↺: the pane's panel at its defaults, chosen by the human. */
export const resetView = (pane: PanelPane): View => ({ panelId: pane.panelId, params: defaultPanelParams(pane.panelId) ?? pane.params, setBy: "human" });

/** The parameters a panel last had in a pane, for the panel menu. */
export const lastParams = (history: History, paneId: string, panelId: PanelId): Record<string, unknown> | undefined => history.last[paneId]?.[panelId];
