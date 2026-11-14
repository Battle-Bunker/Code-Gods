/**
 * The one adapter between the dock's arrangement (lib/v2-affordances dock.ts: a library-independent tree the view
 * state stores and an assistant can write) and dockview's serialised JSON. Pure: no React, no dockview runtime (types
 * only), round-trip tested in test/dock-adapter.test.ts. Copied and cleaned from the v1 dock (archive/engine-v1,
 * player-web/src/dock/adapter.ts), with tab groups.
 *
 * Mapping: a split is a dockview branch (row = HORIZONTAL, column = VERTICAL; dockview alternates the orientation per
 * depth, so a split repeating its parent's direction is nested under a one-child branch); a group is a dockview group
 * whose views are its tabs; a pane is a panel whose content and tab renderer are "pane". Weights become pixels of the
 * container and back. Floating and pop-out groups are turned off in the dock, so they are not read back.
 */
import type { GroupviewPanelState, Orientation, SerializedDockview, SerializedGridObject } from "dockview-react";
import { dockPanes, isGroup, normaliseDock, type DockDirection, type DockNode } from "@workspace/v2-affordances";

type Size = { width: number; height: number };
/** A group as dockview serialises it (its type is not exported by name). */
type GroupState = SerializedDockview["grid"]["root"] extends SerializedGridObject<infer T> ? T : never;
type Grid = SerializedGridObject<GroupState>;

const ORIENTATION = { row: "HORIZONTAL", column: "VERTICAL" } as const;
const other = (d: DockDirection): DockDirection => (d === "row" ? "column" : "row");
const DEFAULT_SIZE: Size = { width: 1000, height: 1000 };

/**
 * Panes whose content stays mounted while behind a tab or moved: a stored panel's frame (re-parenting an iframe reloads
 * it) and the assistant's conversation (its draft and stream).
 */
const keepsMounted = (pane: string) => pane.startsWith("panel:") || pane === "assistant";

export function panelOf(pane: string, title: string): GroupviewPanelState {
  return { id: pane, contentComponent: "pane", tabComponent: "pane", title, params: {}, ...(keepsMounted(pane) ? { renderer: "always" as const } : {}) };
}

/** `node` laid out along its parent's axis with extent `size`; its own children divide `span`. */
function toGrid(node: DockNode, orientation: DockDirection, size: number, span: number): Grid {
  if (isGroup(node)) return { type: "leaf", size, data: { id: `g-${node.tabs[0]}`, views: node.tabs, activeView: node.active } };
  if (node.split !== orientation) return { type: "branch", size, data: [toGrid(node, other(orientation), span, size)] };
  const total = node.sizes.reduce((a, b) => a + b, 0) || 1;
  return { type: "branch", size, data: node.children.map((child, i) => toGrid(child, other(orientation), (span * node.sizes[i]!) / total, size)) };
}

/** The arrangement as dockview JSON for a container of `size` (dockview rescales any size proportionally). */
export function toDockview(tree: DockNode, size: Size = DEFAULT_SIZE, title: (pane: string) => string = p => p): SerializedDockview {
  const width = size.width > 0 ? size.width : DEFAULT_SIZE.width, height = size.height > 0 ? size.height : DEFAULT_SIZE.height;
  const direction: DockDirection = isGroup(tree) ? "row" : tree.split;
  const along = direction === "row" ? width : height, across = direction === "row" ? height : width;
  const root: Grid = isGroup(tree)
    ? { type: "branch", size: across, data: [toGrid(tree, other(direction), along, across)] }
    : toGrid(tree, direction, across, along);
  return { grid: { root, width, height, orientation: ORIENTATION[direction] as Orientation }, panels: Object.fromEntries(dockPanes(tree).map(p => [p, panelOf(p, title(p))])) };
}

function fromGrid(grid: Grid, orientation: DockDirection, known: ReadonlySet<string>): DockNode | null {
  if (grid.type === "leaf") {
    const data = grid.data as GroupState;
    const tabs = [...new Set((data.views ?? []).filter(id => known.has(id)))];
    if (!tabs.length) return null;
    return { tabs, active: data.activeView && tabs.includes(data.activeView) ? data.activeView : tabs[0]! };
  }
  const kept: { node: DockNode; size: number }[] = [];
  for (const child of grid.data as Grid[]) {
    const node = fromGrid(child, other(orientation), known);
    if (node) kept.push({ node, size: child.size ?? 0 });
  }
  if (!kept.length) return null;
  return { split: orientation, sizes: kept.map(k => k.size), children: kept.map(k => k.node) };
}

/** Dockview JSON back to an arrangement (normalised; null when it holds no pane). */
export function fromDockview(json: SerializedDockview): DockNode | null {
  const known = new Set(Object.keys(json.panels ?? {}));
  const direction: DockDirection = json.grid?.orientation === "VERTICAL" ? "column" : "row";
  return json.grid?.root ? normaliseDock(fromGrid(json.grid.root as Grid, direction, known)) : null;
}
