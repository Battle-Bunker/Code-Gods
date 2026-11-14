/**
 * The game screen's dock: the panes the human has open (their view state's `panes`, or the phase's defaults: v2-client
 * `shownPanes`), each with its own error boundary. Desktop (≥ 768 px): dockview columns, rows and tabs laid out by the
 * view state's arrangement (desktop.tsx, loaded only there). Phone: one column in reading order, no inner scroller
 * taller than the screen allows (ux-lessons 5.1), with a row of the panes' names that jumps to any of them.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { readingOrder, shownPanes, storedSlugOf, type GamePhase } from "@workspace/v2-client";
import { useView } from "@/core/affordance-runtime";
import { useWide } from "@/core/use-wide";
import { onReveal } from "./open-pane";
import { DockScopeContext, PaneBody, PaneHeader, usePaneName, type PaneComponents, type StoredPaneComponent } from "./pane-parts";

export type { PaneComponents, StoredPaneComponent } from "./pane-parts";

const DesktopDock = lazy(() => import("./desktop"));

function StackedDock({ panes }: { panes: string[] }) {
  const name = usePaneName();
  const scroller = useRef<HTMLDivElement>(null);
  const jump = useCallback((pane: string) => {
    scroller.current?.querySelector<HTMLElement>(`section[data-pane="${CSS.escape(pane)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  useEffect(() => onReveal(jump), [jump]);
  return (
    <div ref={scroller} className="h-full overflow-y-auto overflow-x-hidden" data-testid="dock-stacked">
      {/* A phone stacks the panes; a long pane (the act log) must never trap the scroll, so each pane is shorter than
          the screen and a row of the panes' names jumps to any of them. */}
      <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b bg-background/95 px-2 py-1.5" aria-label="Jump to a pane" data-testid="dock-jump">
        {panes.map(p => (
          <button key={p} type="button" className="shrink-0 border px-2 py-0.5 text-xs" data-testid={`button-jump-${p}`} onClick={() => jump(p)}>{name(p)}</button>
        ))}
      </nav>
      <div className="space-y-2 p-2">
        {panes.map(p => (
          <div key={p} className="max-h-[60dvh] min-h-[200px] flex scroll-mt-10">
            <section data-pane={p} data-testid={`pane-${p}`} aria-label={name(p)} className="flex min-h-0 flex-1 flex-col border border-[hsl(var(--card-border))] bg-card">
              <PaneHeader pane={p} className="border-b border-[hsl(var(--card-border))]" />
              <PaneBody pane={p} />
            </section>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dock({ phase, panes: components, stored: Stored }: { phase: GamePhase; panes: PaneComponents; stored?: StoredPaneComponent }) {
  const view = useView();
  const wide = useWide();
  const open = useMemo(() => shownPanes(view, phase), [view, phase]);
  const scope = useMemo(() => ({
    phase, open,
    body: (pane: string) => {
      const slug = storedSlugOf(pane);
      if (slug && Stored) return <Stored slug={slug} />;
      const C = components[pane];
      return C ? <C /> : <p className="p-4 text-sm text-muted-foreground">This pane is not on this version of the game yet.</p>;
    },
  }), [phase, open, components, Stored]);
  return (
    <DockScopeContext.Provider value={scope}>
      {wide
        ? <Suspense fallback={<div className="h-full" data-testid="dock-loading" />}><DesktopDock phase={phase} /></Suspense>
        : <StackedDock panes={readingOrder(open)} />}
    </DockScopeContext.Provider>
  );
}
