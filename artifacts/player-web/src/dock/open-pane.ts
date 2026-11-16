/**
 * Opening, moving and closing panes from the app (the next step's "Summon my first agent", a pane's menu, the
 * palette): the same view affordances an assistant uses, in the order v2-client's plans give, so the panes on screen
 * stay (the defaults are stored first when the human had none of their own) and nothing is closed to make room: on a
 * desktop an opened pane joins the dock in front of its tab group. An opened pane is brought into view (a phone
 * scrolls to it).
 */
import { useCallback, useMemo } from "react";
import type { Place } from "@workspace/v2-affordances";
import { closePlan, openPlan, spectatorArrange, viewerView, type GamePhase, type ViewOp } from "@workspace/v2-client";
import { useIsSeated } from "@/sdk";
import { useRuntime, useView } from "@/core/affordance-runtime";
import { toast } from "@/hooks/use-toast";

const listeners = new Set<(pane: string) => void>();
/** The dock listens to bring an opened pane into view (scroll on a phone, focus on a desktop). */
export function onReveal(fn: (pane: string) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export interface PaneOps {
  /** False when the screen did not change (the player was told why). */
  open(pane: string, place?: Place): Promise<boolean>;
  close(pane: string): Promise<void>;
}

export function usePaneOps(phase: GamePhase): PaneOps {
  const rt = useRuntime();
  const stored = useView();
  const seated = useIsSeated();
  // A spectator's first change stores the spectator screen it starts from (spectatorArrange), then plans from it.
  const view = useMemo(() => viewerView(stored, phase, seated), [stored, phase, seated]);
  const setup = useMemo(() => spectatorArrange(stored, phase, seated), [stored, phase, seated]);
  const runOps = useCallback(async (ops: ViewOp[]) => {
    for (const op of ops) {
      const out = await rt.perform(op.id, op.args);
      if (!out.ok) { toast({ title: "The screen did not change", description: out.error.message, variant: "destructive" }); return false; }
    }
    return true;
  }, [rt]);
  const open = useCallback(async (pane: string, place?: Place) => {
    if (!await runOps([...setup, ...openPlan(view, phase, pane, place)])) return false;
    requestAnimationFrame(() => { for (const l of listeners) l(pane); });
    return true;
  }, [setup, view, phase, runOps]);
  const close = useCallback(async (pane: string) => { await runOps([...setup, ...closePlan(view, phase, pane)]); }, [setup, view, phase, runOps]);
  return useMemo(() => ({ open, close }), [open, close]);
}

/** Opening a pane (see usePaneOps). */
export const useOpenPane = (phase: GamePhase) => usePaneOps(phase).open;
