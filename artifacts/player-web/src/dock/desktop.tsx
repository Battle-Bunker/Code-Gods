/**
 * The desktop dock: dockview-react (loaded only at 768 px and wider; the phone's stacked dock never imports this module
 * or its stylesheet), copied and cleaned from the v1 dock (archive/engine-v1, player-web/src/dock/desktop.tsx).
 *
 * It draws the phase's arrangement (v2-client `dockFor`: the human's arrangement of this screen, else its default,
 * holding exactly the shown panes) through the adapter, and reports the human's own changes back as `view.arrangeDock`:
 * a gesture in the dock (dragging a tab or a gutter, clicking a tab) ends with the dock read back and, when it differs,
 * stored for the room, so it survives a reload, the next game and another device. Arrangements from the server (an
 * assistant, another client, a pane opened) are applied between gestures with fromJSON({ reuseExistingPanels }), so a
 * pane's content survives a rearrangement.
 *
 * Theme: `.dockview-theme-cg` in index.css maps dockview's --dv-* variables onto the app's tokens.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type DockviewTheme, type IDockviewPanelHeaderProps, type IDockviewPanelProps } from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { dockKindOf, formatDock, isGroup, type DockNode } from "@workspace/v2-affordances";
import { dockFor, type GamePhase } from "@workspace/v2-client";
import { useRuntime } from "@/core/affordance-runtime";
import { toast } from "@/hooks/use-toast";
import { fromDockview, toDockview } from "./adapter";
import { PaneBody, PaneHeader, useDockScope, usePaneName } from "./pane-parts";

function PaneContent(props: IDockviewPanelProps) {
  const pane = props.api.id;
  const name = usePaneName();
  return (
    <section data-pane={pane} data-testid={`pane-${pane}`} aria-label={name(pane)} className="flex h-full min-h-0 flex-col bg-card">
      <PaneBody pane={pane} />
    </section>
  );
}
const PaneTab = (props: IDockviewPanelHeaderProps) => <div className="cg-pane-header min-w-0" data-testid={`tab-${props.api.id}`}><PaneHeader pane={props.api.id} className="!py-1" /></div>;
const components = { pane: PaneContent };
const tabComponents = { pane: PaneTab };
const theme: DockviewTheme = { name: "code-gods", className: "dockview-theme-cg", colorScheme: "light", gap: 0, dndOverlayMounting: "absolute", dndPanelOverlay: "group", dndTabIndicator: "line" };

/** The same arrangement, weights within half a point (pixels read back round a little). */
export function sameDock(a: DockNode | null, b: DockNode | null): boolean {
  if (!a || !b) return a === b;
  if (isGroup(a) || isGroup(b)) return isGroup(a) && isGroup(b) && a.active === b.active && a.tabs.join("|") === b.tabs.join("|");
  return a.split === b.split && a.children.length === b.children.length
    && a.children.every((c, i) => Math.abs(a.sizes[i]! - b.sizes[i]!) < 0.5 && sameDock(c, b.children[i]!));
}

export default function DesktopDock({ phase }: { phase: GamePhase }) {
  const { view } = useDockScope();
  const rt = useRuntime();
  const name = usePaneName();
  const tree = useMemo(() => dockFor(view, phase), [view.panes, view.dock, phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const treeNow = useRef(tree);
  treeNow.current = tree;
  const container = useRef<HTMLDivElement>(null);
  const api = useRef<DockviewApi | null>(null);
  const gesture = useRef(false);
  const kind = dockKindOf(phase) ?? "live";

  const apply = useCallback((target: DockNode | null) => {
    const dock = api.current;
    if (!dock || gesture.current) return;
    if (!target) { dock.clear(); return; }
    if (sameDock(fromDockview(dock.toJSON()), target)) return;
    dock.fromJSON(toDockview(target, { width: dock.width, height: dock.height }, name), { reuseExistingPanels: true });
  }, [name]);
  useEffect(() => { apply(tree); }, [tree, apply]);

  /** The human changed the dock: store it when it differs from the arrangement drawn (true when it is being stored). */
  const save = useCallback((): boolean => {
    const dock = api.current;
    if (!dock) return false;
    const now = fromDockview(dock.toJSON());
    if (!now || sameDock(now, treeNow.current)) return false;
    void rt.perform("view.arrangeDock", { dock: formatDock(now), phase: kind }).then(out => {
      if (!out.ok) { toast({ title: "The screen did not change", description: out.error.message, variant: "destructive" }); apply(treeNow.current); }
    });
    return true;
  }, [rt, kind, apply]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    api.current = event.api;
    apply(treeNow.current);
  }, [apply]);

  // A gesture is a drag of a gutter or a tab, or a click on a tab: it starts with a pointer down on a gutter or on a tab
  // outside its buttons, or with an HTML5 drag start, and ends with the pointer up or the drag's end (Chrome cancels the
  // pointer when a drag starts, so pointercancel is not an end). Clicks on buttons and in pane bodies are not gestures:
  // what they change goes through the view affordances. Until a gesture ends, arrangements from the server wait.
  const applyLatest = useRef(apply);
  applyLatest.current = apply;
  const saveLatest = useRef(save);
  saveLatest.current = save;
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    // A stored change reaches the dock as the next arrangement drawn; anything else the gesture left is put back.
    const finish = () => { gesture.current = false; if (!saveLatest.current()) applyLatest.current(treeNow.current); };
    // After dockview has finished the move.
    const end = () => { clearTimeout(watchdog); if (gesture.current) requestAnimationFrame(finish); };
    const start = () => {
      if (gesture.current) finish();   // a release we never saw ends the previous gesture first
      gesture.current = true;
      clearTimeout(watchdog);
      watchdog = setTimeout(end, 30_000);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      const onTab = !!target.closest(".dv-tab, .dv-void-container") && !target.closest("button, a, input, textarea, select, [role=menuitem]");
      if (target.closest(".dv-sash") || onTab) start();
    };
    const onDragStart = () => { if (!gesture.current) start(); };
    el.addEventListener("pointerdown", onPointerDown, true);
    el.addEventListener("dragstart", onDragStart, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("dragend", end, true);
    window.addEventListener("drop", end, true);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown, true);
      el.removeEventListener("dragstart", onDragStart, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("dragend", end, true);
      window.removeEventListener("drop", end, true);
      clearTimeout(watchdog);
    };
  }, []);

  return (
    <div ref={container} className="h-full w-full p-1" data-testid="dock-desktop" data-dock={tree ? formatDock(tree) : ""}>
      <DockviewReact className="cg-dock h-full" components={components} tabComponents={tabComponents} onReady={onReady} theme={theme}
        singleTabMode="fullwidth" disableFloatingGroups />
    </div>
  );
}
