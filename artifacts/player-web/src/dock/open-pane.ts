/**
 * Opening, moving and closing panes from the app (the next step's "Summon my first agent", a pane's menu, the
 * palette): the same view affordances an assistant uses, in the order v2-client's plans give, so the panes on screen
 * stay (the defaults are stored first when the human had none of their own), the oldest pane is replaced at the
 * maximum and the player is told which (ux-lessons 5.4). An opened pane is brought into view.
 */
import { useCallback, useMemo } from "react";
import type { Place } from "@workspace/v2-affordances";
import { closePlan, openPlan, paneTitle, type GamePhase, type ViewOp } from "@workspace/v2-client";
import { useRuntime, useView } from "@/core/affordance-runtime";
import { toast } from "@/hooks/use-toast";

const listeners = new Set<(pane: string) => void>();
/** The dock listens to bring an opened pane into view (scroll on a phone, focus on a desktop). */
export function onReveal(fn: (pane: string) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export interface PaneOps {
  open(pane: string, place?: Place): Promise<void>;
  close(pane: string): Promise<void>;
}

export function usePaneOps(phase: GamePhase): PaneOps {
  const rt = useRuntime();
  const view = useView();
  const runOps = useCallback(async (ops: ViewOp[]) => {
    for (const op of ops) {
      const out = await rt.perform(op.id, op.args);
      if (!out.ok) { toast({ title: "The screen did not change", description: out.error.message, variant: "destructive" }); return false; }
    }
    return true;
  }, [rt]);
  const open = useCallback(async (pane: string, place?: Place) => {
    const plan = openPlan(view, phase, pane, place);
    if (!await runOps(plan.ops)) return;
    if (plan.replaced) toast({ title: `Opened ${paneTitle(pane)}`, description: `It replaced ${paneTitle(plan.replaced)} (at most five panes at once). Open it again from a pane's menu.` });
    requestAnimationFrame(() => { for (const l of listeners) l(pane); });
  }, [view, phase, runOps]);
  const close = useCallback(async (pane: string) => { await runOps(closePlan(view, phase, pane)); }, [view, phase, runOps]);
  return useMemo(() => ({ open, close }), [open, close]);
}

/** Opening a pane (see usePaneOps). */
export const useOpenPane = (phase: GamePhase) => usePaneOps(phase).open;
