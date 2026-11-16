/**
 * The game screen's dock: the panes the human has open (their view state's `panes`, or the phase's defaults: v2-client
 * `shownPanes`), each with its own error boundary. Desktop (≥ 768 px): dockview columns, rows and tabs laid out by the
 * view state's arrangement (desktop.tsx, loaded only there). Phone: one column in reading order, no inner scroller
 * taller than the screen allows (ux-lessons 5.1), with a row of the panes' names that jumps to any of them.
 */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fileIdOf, readingOrder, shownPanes, storedSlugOf, type GamePhase } from "@workspace/v2-client";
import { useRuntime, useView } from "@/core/affordance-runtime";
import { useWide } from "@/core/use-wide";
import { onReveal } from "./open-pane";
import { DockScopeContext, PaneBody, PaneHeader, PaneMenu, usePaneName, type PaneComponents, type StoredPaneComponent } from "./pane-parts";

export type { PaneComponents, StoredPaneComponent } from "./pane-parts";

const DesktopDock = lazy(() => import("./desktop"));

/** Panes read top to bottom as one page on a phone (persona walk: Results scrolled inside itself, past "What cost you"). */
const UNCAPPED = new Set(["results"]);
/** On a phone the assistant is a sheet at the bottom of the screen (v1), reachable over whatever pane is being read. */
const SHEET = "assistant";

/** The phone's assistant sheet: a bar at the bottom until opened, then most of the screen; open when it first appears. */
function AssistantSheet({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const name = usePaneName();
  return (
    <div className={`fixed inset-x-0 bottom-0 z-20 flex flex-col border-t bg-card shadow-[0_-4px_12px_rgba(0,0,0,0.08)] ${open ? "h-[60dvh]" : ""}`}
      data-testid="assistant-sheet" data-open={open || undefined}>
      {/* One header: the name and the toggle, and the pane's own menu (move, close, open another). */}
      <div className="flex h-11 shrink-0 items-center gap-2 pr-2">
        <button type="button" className="flex h-full min-w-0 flex-1 items-center justify-between pl-4 pr-2 text-sm font-semibold" aria-expanded={open}
          onClick={() => setOpen(!open)} data-testid="button-assistant-sheet">
          <span className="truncate">{name(SHEET)}</span><span className="text-xs font-normal text-muted-foreground">{open ? "Lower ▾" : "Open ▴"}</span>
        </button>
        <PaneMenu pane={SHEET} />
      </div>
      {open && (
        <section data-pane={SHEET} data-testid={`pane-${SHEET}`} aria-label={name(SHEET)} className="flex min-h-0 flex-1 flex-col border-t">
          <PaneBody pane={SHEET} />
        </section>
      )}
    </div>
  );
}

function StackedDock({ panes: all, phase }: { panes: string[]; phase: GamePhase }) {
  const name = usePaneName();
  const sheet = all.includes(SHEET);
  const panes = useMemo(() => all.filter(p => p !== SHEET), [all]);
  // Opened now (by the menu, the palette or a model) the sheet rises; open from before (the view is kept for the room) it
  // waits lowered, so a game never starts under it. After that it stays as the player leaves it.
  const [sheetOpen, setSheetOpen] = useState(false);
  const hadSheet = useRef(sheet);
  useEffect(() => { if (sheet && !hadSheet.current) setSheetOpen(true); hadSheet.current = sheet; }, [sheet]);
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
    if (pane === SHEET) { setSheetOpen(true); return; }
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
      <div className={`space-y-2 p-2 ${sheet ? "pb-14" : ""}`}>
        {panes.map(p => (
          <div key={p} className={`${UNCAPPED.has(p) ? "" : "max-h-[60dvh] "}min-h-[200px] flex`}>
            <section data-pane={p} data-testid={`pane-${p}`} aria-label={name(p)} style={{ scrollMarginTop: navHeight + 8 }} className="flex min-h-0 flex-1 flex-col border border-[hsl(var(--card-border))] bg-card">
              <PaneHeader pane={p} className="border-b border-[hsl(var(--card-border))]" />
              <PaneBody pane={p} />
            </section>
          </div>
        ))}
      </div>
      {sheet && <AssistantSheet open={sheetOpen} setOpen={setSheetOpen} />}
    </div>
  );
}

/** A file panel's pane (`file:<id>`: src/panels/<id>.tsx). */
export type FilePaneComponent = (props: { id: string }) => ReactNode;

export function Dock({ phase, panes: components, stored: Stored, file: File }: { phase: GamePhase; panes: PaneComponents; stored?: StoredPaneComponent; file?: FilePaneComponent }) {
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
      const fileId = fileIdOf(pane);
      if (fileId && File) return <File id={fileId} />;
      const C = components[pane];
      return C ? <C /> : <p className="p-4 text-sm text-muted-foreground">This pane is not on this version of the game yet.</p>;
    },
  }), [phase, view, open, components, Stored, File]);
  return (
    <DockScopeContext.Provider value={scope}>
      {wide
        ? <Suspense fallback={<div className="h-full" data-testid="dock-loading" />}><DesktopDock phase={phase} /></Suspense>
        : <StackedDock panes={readingOrder(open)} phase={phase} />}
    </DockScopeContext.Provider>
  );
}
