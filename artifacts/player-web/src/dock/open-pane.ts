/**
 * Opening a pane from a button (the next step's "Summon my first agent", a "My agents" link): the same view
 * affordances the palette and an assistant use, in the order `openPlan` gives (the defaults kept, the oldest pane
 * replaced at the maximum, and the player told which: ux-lessons 5.4). The pane is then brought into view.
 */
import { useCallback } from "react";
import type { Place } from "@workspace/v2-affordances";
import { openPlan, paneTitle, type GamePhase } from "@workspace/v2-client";
import { useRuntime, useView } from "@/core/affordance-runtime";
import { toast } from "@/hooks/use-toast";

const listeners = new Set<(pane: string) => void>();
/** The dock listens to bring an opened pane into view (scroll on a phone, focus on a desktop). */
export function onReveal(fn: (pane: string) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function useOpenPane(phase: GamePhase) {
  const rt = useRuntime();
  const view = useView();
  return useCallback(async (pane: string, place?: Place) => {
    const plan = openPlan(view, phase, pane, place);
    for (const op of plan.ops) {
      const out = await rt.perform(op.id, op.args);
      if (!out.ok) { toast({ title: "The pane did not open", description: out.error.message, variant: "destructive" }); return; }
    }
    if (plan.replaced) toast({ title: `Opened ${paneTitle(pane)}`, description: `It replaced ${paneTitle(plan.replaced)} (at most five panes at once). Open it again from the menu.` });
    requestAnimationFrame(() => { for (const l of listeners) l(pane); });
  }, [rt, view, phase]);
}
