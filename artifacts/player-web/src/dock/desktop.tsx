/**
 * The desktop dock: dockview-react (loaded only at 768 px and wider; the phone's stacked renderer never imports this
 * module or its stylesheet). It renders the store's layout through the adapter and reports the player's drags back:
 * a pointer gesture in the dock (a drag of a pane header, a gutter, a tab) ends with the dock's layout read back,
 * parsed and handed to the store, which pushes it ~800 ms later. Server layouts are applied between gestures with
 * fromJSON({reuseExistingPanels}), so the chat's draft and stream survive a rearrangement.
 *
 * Theme: `.dockview-theme-cg` in index.css maps dockview's --dv-* variables onto the app's tokens.
 */
import { useCallback, useEffect, useRef } from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type DockviewTheme, type IDockviewPanelHeaderProps, type IDockviewPanelProps } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { DEFAULT_LAYOUT, paneCaption, type DockLayout, type Pane } from "@workspace/player-client/layout";
import { LENSES } from "@workspace/player-client/lenses";
import { fromDockview, toDockview } from "./adapter";
import { PaneHeader } from "./headers";
import { PaneBody } from "./panes";
import { sameLayout } from "./layout-sync";
import { useDock, useDockStore } from "./store";

const Body = (props: IDockviewPanelProps) => <PaneBody paneId={props.api.id} />;
const Tab = (props: IDockviewPanelHeaderProps) => <PaneHeader paneId={props.api.id} desktop />;
const components = { lens: Body, assistant: Body, "stored-panel": Body, "file-panel": Body };
const tabComponents = { lens: Tab, assistant: Tab, "stored-panel": Tab, "file-panel": Tab };
const theme: DockviewTheme = { name: "code-gods", className: "dockview-theme-cg", colorScheme: "light", gap: 0, dndOverlayMounting: "absolute", dndPanelOverlay: "group", dndTabIndicator: "line" };
const titleOf = (pane: Pane) => (pane.kind === "lens" ? LENSES[pane.lensId].title : paneCaption(pane));

export default function DesktopDock() {
  const store = useDockStore();
  const { layout, phase } = useDock();
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<DockviewApi | null>(null);

  const apply = useCallback((target: DockLayout) => {
    const dock = api.current;
    if (!dock || store.gesture) return;
    if (sameLayout(fromDockview(dock.toJSON()), target)) return;
    const size = { width: dock.width, height: dock.height };
    try { dock.fromJSON(toDockview(target, size, titleOf), { reuseExistingPanels: true }); }
    catch (error) {
      console.warn("[dock] layout refused, showing the default", error);
      dock.fromJSON(toDockview(DEFAULT_LAYOUT(phase), size, titleOf), { reuseExistingPanels: true });
    }
  }, [store, phase]);
  useEffect(() => { apply(layout); }, [layout, apply]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    api.current = event.api;
    store.api = event.api;
    apply(store.layout);
    event.api.onDidActivePanelChange(e => { if (e.panel) store.setFocused(e.panel.id); });
  }, [store, apply]);
  useEffect(() => () => { if (store.api === api.current) store.api = null; }, [store]);

  // A gesture starts with any pointer down in the dock and ends with the pointer up, or with the end of an HTML5
  // drag (Chrome cancels the pointer when a drag starts, so pointercancel is not an end).
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const readBack = () => (api.current ? fromDockview(api.current.toJSON()) : undefined);
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      clearTimeout(watchdog);
      if (!store.gesture) return;
      // After dockview has finished the move.
      requestAnimationFrame(() => store.gestureEnd(readBack()));
    };
    const start = () => {
      // A release we never saw (it happened over a panel's frame) ends the previous gesture first.
      if (store.gesture) store.gestureEnd(readBack());
      store.gestureStart();
      clearTimeout(watchdog);
      watchdog = setTimeout(end, 30_000);
    };
    el.addEventListener("pointerdown", start, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("dragend", end, true);
    window.addEventListener("drop", end, true);
    return () => {
      el.removeEventListener("pointerdown", start, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("dragend", end, true);
      window.removeEventListener("drop", end, true);
    };
  }, [store]);

  return (
    <div ref={container} className="h-full w-full">
      <DockviewReact className="cg-dock" components={components} tabComponents={tabComponents} onReady={onReady} theme={theme}
        singleTabMode="fullwidth" disableFloatingGroups />
    </div>
  );
}
