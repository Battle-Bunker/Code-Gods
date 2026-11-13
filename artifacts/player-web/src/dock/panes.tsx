/**
 * A pane's body, by kind, shared by the desktop dock (dockview components) and the phone's stacked renderer: a
 * built-in panel through PanelHost, the assistant pane, or one of the player's own panels (a stored panel in its
 * sandboxed frame, a file panel in-process).
 * Pointer and focus inside a pane make it the focused pane (the palette's "this pane").
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { moreBelow } from "./layout-sync";
import { AssistantPane } from "@/core/chat/pane";
import { PanelHost } from "@/core/panels";
import { PanelPaneBody, entryFor, usePanels } from "./panels";
import { useDock, useDockStore } from "./store";

/** The bottom fade of a pane with more content below. */
const FADE = "linear-gradient(to bottom, #000 calc(100% - 32px), transparent)";

function Frame({ paneId, children, className = "", attrs }: { paneId: string; children: ReactNode; className?: string; attrs?: Record<string, string> }) {
  const store = useDockStore();
  const focus = () => store.setFocused(paneId);
  // A pane that scrolls says so: while more content is below its bottom edge, the last lines fade out (a soft mask),
  // instead of a sentence sliced through at the divider with no hint that the pane scrolls.
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setMore(moreBelow({ scrollHeight: el.scrollHeight, scrollTop: el.scrollTop, clientHeight: el.clientHeight }));
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", measure); observer?.disconnect(); };
  }, []);
  const fade = more ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined;
  return (
    <div ref={box} data-testid={`pane-${paneId}`} data-more-below={more || undefined} style={fade} onPointerDownCapture={focus} onFocusCapture={focus} className={`h-full min-h-0 bg-card ${className}`} {...attrs}>
      {children}
    </div>
  );
}

export function PaneBody({ paneId }: { paneId: string }) {
  const { layout, phase } = useDock();
  const panels = usePanels();
  const pane = layout.panes[paneId];
  if (!pane) return null;
  switch (pane.kind) {
    case "panel":
      return <Frame paneId={paneId} className="overflow-auto p-4"><div key={pane.panelId} className="rise h-full"><PanelHost paneId={paneId} panelId={pane.panelId} params={pane.params} phase={phase} /></div></Frame>;
    case "assistant":
      return <Frame paneId={paneId}><AssistantPane paneId={paneId} /></Frame>;
    case "stored-panel":
    case "file-panel": {
      const entry = entryFor(panels, pane.kind, pane.kind === "stored-panel" ? pane.slug : pane.fileId);
      return (
        <Frame paneId={paneId} className="overflow-auto p-3" attrs={entry ? { "data-panel-file": entry.file, "data-panel-origin": entry.origin } : undefined}>
          <PanelPaneBody entry={entry} missing={pane.kind === "stored-panel" ? `Your panel "${pane.slug}" is loading or was turned off.` : `src/panels/${pane.fileId}.tsx is not in this player app.`} />
        </Frame>
      );
    }
  }
}
