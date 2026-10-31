/**
 * Per-pane view history, kept in this client only (docs/research/ui-redesign/player-client.md §2.2): every change the
 * assistant makes to a lens pane pushes the previous view, so the pane header's ‹ returns to it and ↺ resets the lens
 * to its defaults. Both appear only after an assistant change. The lens menu restores the parameters last used for a
 * lens in that pane. Pure; tested in test/layout-sync.test.ts.
 */
import { defaultLensParams, type LensId } from "@workspace/player-client/lenses";
import { lensPanesOf, type DockLayout, type Pane, type SetBy } from "@workspace/player-client/layout";
import { canonical } from "./layout-sync.ts";

export type View = { lensId: LensId; params: Record<string, unknown>; setBy: SetBy };
export type History = {
  stacks: Readonly<Record<string, readonly View[]>>;
  last: Readonly<Record<string, Readonly<Partial<Record<LensId, Record<string, unknown>>>>>>;
};
export const emptyHistory: History = { stacks: {}, last: {} };
const MAX = 10;
type LensPane = Extract<Pane, { kind: "lens" }>;
const viewOf = (pane: LensPane): View => ({ lensId: pane.lensId, params: pane.params, setBy: pane.setBy });

/** Note a layout change: assistant changes push the previous view; every lens pane's parameters are remembered. */
export function observe(history: History, before: DockLayout | null, after: DockLayout): History {
  const stacks: Record<string, readonly View[]> = {};
  const last: Record<string, Partial<Record<LensId, Record<string, unknown>>>> = { ...history.last };
  for (const pane of lensPanesOf(after)) {
    const prev = before?.panes[pane.id];
    let stack = history.stacks[pane.id] ?? [];
    const remembered = { ...last[pane.id] };
    if (prev?.kind === "lens") {
      remembered[prev.lensId] = prev.params;
      const changed = prev.lensId !== pane.lensId || canonical(prev.params) !== canonical(pane.params);
      if (changed && pane.setBy === "assistant") stack = [...stack, viewOf(prev)].slice(-MAX);
    }
    remembered[pane.lensId] = pane.params;
    last[pane.id] = remembered;
    if (stack.length) stacks[pane.id] = stack;
  }
  return { stacks, last };
}

/** ‹ is offered only while the pane shows an assistant's change with something to go back to. */
export const canUndo = (history: History, pane: Pane | undefined): boolean =>
  pane?.kind === "lens" && pane.setBy === "assistant" && (history.stacks[pane.id]?.length ?? 0) > 0;

/** The previous view of a pane, and the history without it. */
export function back(history: History, paneId: string): { view: View; history: History } | null {
  const stack = history.stacks[paneId];
  if (!stack?.length) return null;
  const { [paneId]: _gone, ...rest } = history.stacks;
  const remaining = stack.slice(0, -1);
  return { view: stack[stack.length - 1], history: { ...history, stacks: remaining.length ? { ...rest, [paneId]: remaining } : rest } };
}

/** ↺: the pane's lens at its defaults, chosen by the human. */
export const resetView = (pane: LensPane): View => ({ lensId: pane.lensId, params: defaultLensParams(pane.lensId) ?? pane.params, setBy: "human" });

/** The parameters a lens last had in a pane, for the lens menu. */
export const lastParams = (history: History, paneId: string, lensId: LensId): Record<string, unknown> | undefined => history.last[paneId]?.[lensId];
