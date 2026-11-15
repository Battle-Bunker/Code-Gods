/**
 * The game screen's dock: the panes the human has open (their view state's `panes`, or the phase's defaults: v2-client
 * `shownPanes`), each with its own error boundary. Desktop (≥ 768 px): dockview columns, rows and tabs laid out by the
 * view state's arrangement (desktop.tsx, loaded only there). Phone: one column in reading order, no inner scroller
 * taller than the screen allows (ux-lessons 5.1), with a row of the panes' names that jumps to any of them.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readingOrder, shownPanes, storedSlugOf, type GamePhase } from "@workspace/v2-client";
import { useRuntime, useView } from "@/core/affordance-runtime";
import { useWide } from "@/core/use-wide";
import { onReveal } from "./open-pane";
import { DockScopeContext, PaneBody, PaneHeader, usePaneName, type PaneComponents, type StoredPaneComponent } from "./pane-parts";

export type { PaneComponents, StoredPaneComponent } from "./pane-parts";

const DesktopDock = lazy(() => import("./desktop"));

/** Panes read top to bottom as one page on a phone (persona walk: Results scrolled inside itself, past "What cost you"). */
const UNCAPPED = new Set(["results"]);

function StackedDock({ panes, phase }: { panes: string[]; phase: GamePhase }) {
  const name = usePaneName();
  const scroller = useRef<HTMLDivElement>(null);
  // A new phase opens at its first pane (round 26: at the buzzer the page stayed scrolled to the bottom, on Where am I,
  // with "How the game went" above the fold).
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [phase]);
  const nav = useRef<HTMLElement>(null);
  // A pane jumped to lands below the row of pane names, however many lines it wraps to (round 5: a three-line row hid
  // the Results headline).
  const [navHeight, setNavHeight] = useState(48);
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNavHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const jump = useCallback((pane: string) => {
    const section = scroller.current?.querySelector<HTMLElement>(`section[data-pane="${CSS.escape(pane)}"]`);
    // The pane from its top: its own body may have been scrolled down earlier (round 5: the Results headline hidden).
    section?.querySelector<HTMLElement>("[data-pane-body]")?.scrollTo({ top: 0 });
    section?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);
  useEffect(() => onReveal(jump), [jump]);
  return (
    // No scroll anchoring: a pane above growing as its reads arrive must not pull the reader back to where they were
    // (round 26: scrolling "How the game went" jumped back to Where am I).
    <div ref={scroller} className="h-full overflow-y-auto overflow-x-hidden [overflow-anchor:none]" data-testid="dock-stacked">
      {/* A phone stacks the panes; a long pane (the act log) must never trap the scroll, so each pane is shorter than
          the screen and a row of the panes' names jumps to any of them. */}
      <nav ref={nav} className="sticky top-0 z-10 flex flex-wrap gap-1 border-b bg-background px-2 py-1.5 shadow-sm" aria-label="Jump to a pane" data-testid="dock-jump">
        {panes.map(p => (
          <button key={p} type="button" className="shrink-0 border px-2 py-0.5 text-xs" data-testid={`button-jump-${p}`} onClick={() => jump(p)}>{name(p)}</button>
        ))}
      </nav>
      <div className="space-y-2 p-2">
        {panes.map(p => (
          <div key={p} className={`${UNCAPPED.has(p) ? "" : "max-h-[60dvh] "}min-h-[200px] flex`}>
            <section data-pane={p} data-testid={`pane-${p}`} aria-label={name(p)} style={{ scrollMarginTop: navHeight + 8 }} className="flex min-h-0 flex-1 flex-col border border-[hsl(var(--card-border))] bg-card">
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
  const stored = useView();
  const wide = useWide();
  // A room without AI shows no assistant, even one opened before AI was turned off.
  const aiOff = !!useRuntime().context.room?.aiOff;
  const view = useMemo(() => (aiOff ? { ...stored, panes: stored.panes.filter(p => p.pane !== "assistant") } : stored), [stored, aiOff]);
  const open = useMemo(() => shownPanes(view, phase), [view, phase]);
  const scope = useMemo(() => ({
    phase, view, open,
    body: (pane: string) => {
      const slug = storedSlugOf(pane);
      if (slug && Stored) return <Stored slug={slug} />;
      const C = components[pane];
      return C ? <C /> : <p className="p-4 text-sm text-muted-foreground">This pane is not on this version of the game yet.</p>;
    },
  }), [phase, view, open, components, Stored]);
  return (
    <DockScopeContext.Provider value={scope}>
      {wide
        ? <Suspense fallback={<div className="h-full" data-testid="dock-loading" />}><DesktopDock phase={phase} /></Suspense>
        : <StackedDock panes={readingOrder(open)} phase={phase} />}
    </DockScopeContext.Provider>
  );
}
