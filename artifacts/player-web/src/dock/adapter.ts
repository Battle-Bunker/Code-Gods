/**
 * The one adapter between our dock layout (lib/player-client/src/layout.ts: a library-independent tree the engine and
 * the assistant's tools understand) and dockview's serialised JSON. Pure: no React, no dockview runtime (types only),
 * round-trip tested in test/adapter.test.ts.
 *
 * Mapping: a `split` is a dockview branch (row = HORIZONTAL, column = VERTICAL; dockview alternates the orientation
 * per depth, so a split repeating its parent's direction is nested under a one-child branch); a `tabs` node is one
 * group (`views` in tab order, `activeView`); a pane is a panel whose `contentComponent` and `tabComponent` are its
 * kind and whose params carry the pane itself. Weights become pixels of the container size and back.
 *
 * Floating and pop-out groups are not representable in the tree: on the way back they fold in as tab groups on the
 * right of the root. Panels that carry no pane of ours are dropped.
 */
import type { GroupPanelViewState, GroupviewPanelState, Orientation, SerializedDockview, SerializedGridObject } from "dockview-react";
import type { DockLayout, Node, Pane } from "@workspace/player-client/layout";

type Size = { width: number; height: number };
type Direction = "row" | "column";
type Grid = SerializedGridObject<GroupPanelViewState>;

const ORIENTATION = { row: "HORIZONTAL", column: "VERTICAL" } as const;
const other = (d: Direction): Direction => (d === "row" ? "column" : "row");
const DEFAULT_SIZE: Size = { width: 1000, height: 1000 };

/** The dockview group id of a tab node: stable for as long as its first pane stays first. */
export const groupIdOf = (node: Extract<Node, { type: "tabs" }>) => `g-${node.panes[0]}`;
/** The panel of a pane: its kind names both the content and the tab renderer. */
export function panelOf(pane: Pane, title: string): GroupviewPanelState {
  return {
    id: pane.id, contentComponent: pane.kind, tabComponent: pane.kind, title, params: { pane },
    // The chat keeps its draft, scroll position and stream while another tab covers it.
    ...(pane.kind === "assistant" ? { renderer: "always" as const } : {}),
  };
}

/**
 * `node` laid out along its parent's axis with extent `size`; its own children divide `span`, its extent along
 * `orientation`. A split whose direction is not `orientation` is wrapped in a one-child branch of `orientation`.
 */
function toGrid(node: Node, orientation: Direction, size: number, span: number): Grid {
  if (node.type === "tabs") return { type: "leaf", size, data: { id: groupIdOf(node), views: [...node.panes], activeView: node.active } };
  if (node.direction !== orientation) return { type: "branch", size, data: [toGrid(node, other(orientation), span, size)] };
  const total = node.sizes.reduce((a, b) => a + b, 0) || 1;
  return { type: "branch", size, data: node.children.map((child, i) => toGrid(child, other(orientation), (span * node.sizes[i]) / total, size)) };
}

/** Our layout as dockview JSON for a container of `size` (any size works: dockview rescales proportionally). */
export function toDockview(layout: DockLayout, size: Size = DEFAULT_SIZE, title: (pane: Pane) => string = pane => pane.kind): SerializedDockview {
  const width = size.width > 0 ? size.width : DEFAULT_SIZE.width, height = size.height > 0 ? size.height : DEFAULT_SIZE.height;
  const direction: Direction = layout.root.type === "split" ? layout.root.direction : "row";
  const along = direction === "row" ? width : height, across = direction === "row" ? height : width;
  const root: Grid = layout.root.type === "split"
    ? toGrid(layout.root, direction, across, along)
    : { type: "branch", size: across, data: [toGrid(layout.root, other(direction), along, across)] };
  const panels = Object.fromEntries(Object.values(layout.panes).map(pane => [pane.id, panelOf(pane, title(pane))]));
  return { grid: { root, width, height, orientation: ORIENTATION[direction] as Orientation }, panels };
}

const round = (x: number) => Math.round(x * 1000) / 1000;
/** Weights summing to 100, rounded like parseLayout's. */
function weights(sizes: readonly number[]): number[] {
  const total = sizes.reduce((a, b) => a + (Number.isFinite(b) && b > 0 ? b : 0), 0);
  if (total <= 0) return sizes.map(() => round(100 / sizes.length));
  return sizes.map(s => round(((Number.isFinite(s) && s > 0 ? s : 0) / total) * 100));
}

function fromGrid(grid: Grid, orientation: Direction, known: ReadonlySet<string>): Node | null {
  if (grid.type === "leaf") {
    const data = grid.data as GroupPanelViewState;
    const panes = [...new Set((data.views ?? []).filter(id => known.has(id)))];
    if (!panes.length) return null;
    return { type: "tabs", panes, active: data.activeView && panes.includes(data.activeView) ? data.activeView : panes[0] };
  }
  const kept: { node: Node; size: number }[] = [];
  for (const child of grid.data as Grid[]) {
    const node = fromGrid(child, other(orientation), known);
    if (node) kept.push({ node, size: child.size ?? 0 });
  }
  if (!kept.length) return null;
  if (kept.length === 1) return kept[0].node;
  return { type: "split", direction: orientation, sizes: weights(kept.map(k => k.size)), children: kept.map(k => k.node) };
}

function paneOfPanel(panel: GroupviewPanelState | undefined, id: string): Pane | null {
  const pane = (panel?.params as { pane?: unknown } | undefined)?.pane as Pane | undefined;
  if (!pane || typeof pane !== "object" || typeof pane.kind !== "string") return null;
  return { ...pane, id } as Pane;
}

/** Leaves of a nested (floating or pop-out) grid as tab nodes. */
function leavesOf(grid: Grid, known: ReadonlySet<string>): Node[] {
  if (grid.type === "leaf") { const node = fromGrid(grid, "row", known); return node ? [node] : []; }
  return (grid.data as Grid[]).flatMap(child => leavesOf(child, known));
}

/** Dockview JSON back to our layout (normalised like parseLayout; the caller still runs parseLayout on it). */
export function fromDockview(json: SerializedDockview): DockLayout {
  const panes: Record<string, Pane> = {};
  for (const [id, panel] of Object.entries(json.panels ?? {})) {
    const pane = paneOfPanel(panel, id);
    if (pane) panes[id] = pane;
  }
  const known = new Set(Object.keys(panes));
  const direction: Direction = json.grid?.orientation === "VERTICAL" ? "column" : "row";
  let root = json.grid?.root ? fromGrid(json.grid.root as Grid, direction, known) : null;

  // Floating and pop-out windows come back as tab groups on the right.
  const loose: Node[] = [];
  for (const group of [...(json.floatingGroups ?? []), ...(json.popoutGroups ?? [])]) {
    if (group.data) { const node = fromGrid({ type: "leaf", data: group.data, size: 0 }, "row", known); if (node) loose.push(node); }
    else if (group.grid) loose.push(...leavesOf(group.grid.root, known));
  }
  if (loose.length) {
    const share = 25;
    if (!root) root = loose.length === 1 ? loose[0] : { type: "split", direction: "row", sizes: weights(loose.map(() => 1)), children: loose };
    else if (root.type === "split" && root.direction === "row") {
      const total = root.sizes.reduce((a, b) => a + b, 0) || 1;
      root = { type: "split", direction: "row", sizes: weights([...root.sizes.map(s => (s / total) * (100 - share)), ...loose.map(() => share / loose.length)]), children: [...root.children, ...loose] };
    } else {
      root = { type: "split", direction: "row", sizes: weights([100 - share, ...loose.map(() => share / loose.length)]), children: [root, ...loose] };
    }
  }
  const placed = new Set<string>();
  const collect = (node: Node) => { if (node.type === "tabs") node.panes.forEach(id => placed.add(id)); else node.children.forEach(collect); };
  if (root) collect(root);
  return {
    version: 1,
    root: root ?? { type: "tabs", panes: [], active: "" },
    panes: Object.fromEntries(Object.entries(panes).filter(([id]) => placed.has(id))),
  };
}
