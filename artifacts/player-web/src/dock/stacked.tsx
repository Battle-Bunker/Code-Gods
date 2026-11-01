/**
 * The phone renderer (under 768 px): the same synced layout without dockview. Every panel's pane in reading order,
 * stacked and scrolled (tabs become stacked panes), each at least 280 px; the assistant is always a bottom sheet
 * (peek / half / full), wherever it sits on desktop. No drag, no gutters: phones read the synced layout, and the panel
 * menu still works.
 */
import { useEffect, useRef, useState } from "react";
import { assistantPaneOf, panesOf } from "@workspace/player-client/layout";
import { composer, useComposer } from "@/core/chat/composer";
import { PaneHeader } from "./headers";
import { PaneBody } from "./panes";
import { useDock } from "./store";

type Snap = "peek" | "half" | "full";
const HEIGHT: Record<Snap, string> = { peek: "8.5rem", half: "55dvh", full: "calc(100dvh - 44px)" };
const NEXT: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };

export default function StackedDock() {
  const { layout } = useDock();
  const assistant = assistantPaneOf(layout);
  const panes = panesOf(layout).filter(p => p.kind !== "assistant");
  const [snap, setSnap] = useState<Snap>("peek");
  const { collapseTick } = useComposer();
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => { if (collapseTick) setSnap("peek"); }, [collapseTick]);
  // Focusing the composer opens the sheet halfway.
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => { if ((e.target as HTMLElement).tagName === "TEXTAREA") setSnap(s => (s === "peek" ? "half" : s)); };
    el.addEventListener("focusin", onFocus);
    return () => el.removeEventListener("focusin", onFocus);
  }, []);
  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden" style={{ paddingBottom: HEIGHT.peek }} data-testid="dock-stacked">
      <div className="divide-y divide-[hsl(var(--card-border))]">
        {panes.map(pane => (
          <section key={pane.id} className="flex min-h-[280px] flex-col bg-card" aria-label={pane.kind === "panel" ? pane.panelId : pane.kind}>
            <div className="border-b border-[hsl(var(--card-border))]"><PaneHeader paneId={pane.id} desktop={false} /></div>
            <div className="min-h-0 flex-1"><PaneBody paneId={pane.id} /></div>
          </section>
        ))}
      </div>
      {assistant && (
        <div ref={sheet} className="cg-sheet fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-[hsl(var(--card-border))] bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
          style={{ height: HEIGHT[snap] }} data-snap={snap}>
          <button type="button" data-testid="button-sheet" onClick={() => setSnap(NEXT[snap])} aria-label={snap === "full" ? "Shrink your assistant" : "Enlarge your assistant"}
            className="flex h-4 shrink-0 items-center justify-center"><span className="h-1 w-10 bg-[hsl(var(--input))]" aria-hidden /></button>
          <div className="border-b border-[hsl(var(--card-border))]" onClick={() => { if (snap === "peek") { setSnap("half"); composer.focus(); } }}>
            <PaneHeader paneId={assistant.id} desktop={false} />
          </div>
          <div className="min-h-0 flex-1"><PaneBody paneId={assistant.id} /></div>
        </div>
      )}
    </div>
  );
}
