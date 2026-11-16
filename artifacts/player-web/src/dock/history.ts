/**
 * "Back to the previous view" (v1's per-pane view history, archive dock/history.ts), kept in this client only: a
 * change to a pane's own view (the objects' sort and filter; the object pane's object and representations), whether
 * an assistant made it, another screen or the human, keeps the view before it (at most ten), so the pane's menu can
 * go back. Going back is done through the view operations that set that view; the change it causes is not itself kept
 * (`restoring`). Pure; tested in test/view-history.test.ts.
 */
import type { ViewState } from "@workspace/v2-affordances";

/** The panes with a view of their own, and that view. */
export type ViewPane = "objects" | "object";
type Params = { objects: ViewState["objects"] } | { focus: NonNullable<ViewState["focus"]> };
export type History = {
  stacks: Readonly<Partial<Record<ViewPane, readonly Params[]>>>;
  /** A view this client is restoring: its arrival is not a change to go back from. */
  expect: Readonly<Partial<Record<ViewPane, string>>>;
};
export const emptyHistory: History = { stacks: {}, expect: {} };
const MAX = 10;
const PANES: readonly ViewPane[] = ["objects", "object"];
const key = (p: Params | null) => JSON.stringify(p);

function paramsOf(view: Pick<ViewState, "objects" | "focus">, pane: ViewPane): Params | null {
  if (pane === "objects") return { objects: view.objects };
  return view.focus ? { focus: view.focus } : null;
}

export const isViewPane = (pane: string): pane is ViewPane => (PANES as readonly string[]).includes(pane);

/** Note a change of the stored view: each pane whose own view changed keeps the one before (unless it was being restored). */
export function observe(h: History, before: Pick<ViewState, "objects" | "focus"> | null, after: Pick<ViewState, "objects" | "focus">): History {
  if (!before) return h;
  const stacks = { ...h.stacks }, expect = { ...h.expect };
  for (const pane of PANES) {
    const was = paramsOf(before, pane), now = paramsOf(after, pane);
    if (key(was) === key(now)) continue;
    // A restore in flight (it may take two operations): nothing on the way is kept, and it ends when it lands.
    if (expect[pane] !== undefined) {
      if (expect[pane] === key(now)) delete expect[pane];
      continue;
    }
    if (was) stacks[pane] = [...(stacks[pane] ?? []), was].slice(-MAX);
  }
  return { stacks, expect };
}

export const canBack = (h: History, pane: string): boolean => isViewPane(pane) && (h.stacks[pane]?.length ?? 0) > 0;

/** The pane's previous view, and the history without it. */
export function back(h: History, pane: string): { params: Params; history: History } | null {
  if (!isViewPane(pane)) return null;
  const stack = h.stacks[pane];
  if (!stack?.length) return null;
  return { params: stack[stack.length - 1]!, history: { ...h, stacks: { ...h.stacks, [pane]: stack.slice(0, -1) } } };
}

/** Forgets a restore that failed, so the next change is kept again. */
export const restored = (h: History, pane: ViewPane): History => { const { [pane]: _gone, ...expect } = h.expect; return { ...h, expect }; };

/** Marks a view as being restored, so its arrival is not kept as a change. */
export const restoring = (h: History, pane: ViewPane, params: Params): History => ({ ...h, expect: { ...h.expect, [pane]: key(params) } });

export type ViewOp =
  | { id: "view.sortObjects"; args: { sort: ViewState["objects"]["sort"] } }
  | { id: "view.filterObjects"; args: { mine?: boolean; minBits?: number; show?: string } }
  | { id: "view.openObject"; args: { objectId: string } }
  | { id: "view.compareRepresentations"; args: { objectId: string; reps: string[] } };

/** The view operations that bring a pane back to `params`. */
export function opsFor(pane: ViewPane, params: Params): ViewOp[] {
  if (pane === "objects" && "objects" in params) {
    const f = params.objects.filter;
    return [
      { id: "view.sortObjects", args: { sort: params.objects.sort } },
      { id: "view.filterObjects", args: { ...(f.mine !== undefined ? { mine: f.mine } : {}), ...(f.minBits !== undefined ? { minBits: f.minBits } : {}), show: f.show ?? "all" } },
    ];
  }
  if (pane === "object" && "focus" in params) {
    const { objectId, reps } = params.focus;
    return [reps.length ? { id: "view.compareRepresentations", args: { objectId, reps: [...reps] } } : { id: "view.openObject", args: { objectId } }];
  }
  return [];
}
