/**
 * The dock operations a human performs (panel menu, ⋯ menu, palette) as pure functions over the layout, built on the
 * shared operations of lib/player-client/src/layout.ts. The store parses every result with parseLayout.
 */
import { PANELS, defaultPanelParams, type PanelId, type Phase } from "@workspace/player-client/panels";
import {
  LAYOUT_LIMITS, assistantPaneOf, paneAreas, openAssistant, assistantSide, panelPanesOf, openPane, panesOf, setPanePanel, type DockLayout, type Node, type Pane, type Place,
} from "@workspace/player-client/layout";

/**
 * Show a panel: reuse an open pane of it (one pane per panel, like the assistant's open_panel), else add one. With
 * the most built-in panels already open (parseLayout keeps four, as the default dock does), the focused one shows it
 * instead, else the largest panel nobody chose (in the default dock, the objects top right: room for the agent editor),
 * else the largest.
 */
export function showPanel(layout: DockLayout, panelId: PanelId, params?: Record<string, unknown>, focused?: string | null): { layout: DockLayout; paneId: string; replaced?: boolean } {
  const panels = panelPanesOf(layout);
  const open = panels.find(p => p.panelId === panelId);
  if (open) return { layout: layout, paneId: open.id };
  const values = params ?? defaultPanelParams(panelId);
  if (!values) throw new Error(`${PANELS[panelId].title} needs your assistant to set it up`);
  if (panels.length >= LAYOUT_LIMITS.panelPanes) {
    const area = paneAreas(layout.root);
    const largest = (list: typeof panels) => list.reduce<(typeof panels)[number] | undefined>((best, p) => (!best || (area[p.id] ?? 0) > (area[best.id] ?? 0) ? p : best), undefined);
    const target = panels.find(p => p.id === focused) ?? largest(panels.filter(p => p.setBy === "default")) ?? largest(panels)!;
    return { layout: setPanePanel(layout, target.id, panelId, "human", values), paneId: target.id, replaced: true };
  }
  return openPane(layout, { id: "", kind: "panel", panelId, params: values, setBy: "human" });
}

/** The panel menu: change a pane's panel (parameters as last used there, else defaults), chosen by the human. */
export function changePanel(layout: DockLayout, paneId: string, panelId: PanelId, params?: Record<string, unknown>): DockLayout {
  return setPanePanel(layout, paneId, panelId, "human", params ?? defaultPanelParams(panelId) ?? undefined);
}

/** Panels to suggest for a new pane, most useful first for the phase. */
export function panelOrder(phase: Phase): PanelId[] {
  const live: PanelId[] = ["objects", "race", "agents", "feed", "bits-over-time", "others-care", "public-chat", "forge", "my-card", "overview", "rules", "results"];
  const byPhase: Record<Phase, PanelId[]> = {
    lobby: ["overview", "rules", "public-chat", "results", "forge", "my-card"],
    planning: ["my-card", "forge", "overview", "rules", "public-chat", "agents"],
    running: live, paused: ["feed", "public-chat", ...live],
    ended: ["results", "race", "bits-over-time", "objects", "feed", "overview", "rules", "public-chat"],
  };
  return [...new Set(byPhase[phase])];
}

/** "Add panel below / to the right" from a pane's ⋯ menu: the first useful panel not shown yet, next to that pane. */
export function addPanelNextTo(layout: DockLayout, paneId: string, phase: Phase): { layout: DockLayout; paneId: string } {
  // openPane refuses a fifth built-in panel itself, with the one message every surface shows.
  const open = new Set(panelPanesOf(layout).map(p => p.panelId));
  const panelId = panelOrder(phase).find(id => !open.has(id)) ?? "overview";
  const direction: Place["direction"] = assistantSide(layout) === "row" ? "below" : "right";
  return openPane(layout, { id: "", kind: "panel", panelId, params: defaultPanelParams(panelId) ?? {}, setBy: "human" }, { relativeTo: paneId, direction });
}
export const addPanelLabel = (layout: DockLayout) => (assistantSide(layout) === "row" ? "Add panel below" : "Add panel to the right");

/** Open a stored or file panel: reuse its pane, else add one. */
export function showOwnPanel(layout: DockLayout, pane: Extract<Pane, { kind: "stored-panel" | "file-panel" }>): { layout: DockLayout; paneId: string } {
  const open = panesOf(layout).find(p => (p.kind === "stored-panel" && pane.kind === "stored-panel" && p.slug === pane.slug)
    || (p.kind === "file-panel" && pane.kind === "file-panel" && p.fileId === pane.fileId));
  if (open) return { layout: layout, paneId: open.id };
  return openPane(layout, pane);
}

function without(node: Node, id: string): Node | null {
  if (node.type === "pane") return node.id === id ? null : node;
  return { ...node, children: node.children.map(child => without(child, id)).filter((c): c is Node => !!c) };
}
/** Drop one-child splits (enough to see the shape of what is left). */
function prune(node: Node): Node | null {
  if (node.type === "pane") return node;
  const kept = node.children.map((child, i) => ({ node: prune(child), size: node.sizes[i] })).filter((k): k is { node: Node; size: number } => !!k.node);
  if (!kept.length) return null;
  return kept.length === 1 ? kept[0].node : { ...node, children: kept.map(k => k.node), sizes: kept.map(k => k.size) };
}
/**
 * Move the assistant to an edge of the whole dock (parse the result). The rest keeps its arrangement, except that its
 * outermost split turns to run along the assistant: panels stack beside a side assistant and sit side by side above
 * a bottom one (otherwise every pane would join one long row or column).
 */
export function dockAssistant(base: DockLayout, side: "left" | "right" | "bottom"): DockLayout {
  const layout = openAssistant(base).layout;   // a closed assistant comes back at the side asked for
  const assistant = assistantPaneOf(layout);
  if (!assistant) return layout;
  let rest = prune(without(layout.root, assistant.id) ?? { type: "split", direction: "row", sizes: [], children: [] });
  if (!rest) return layout;
  const along = side === "bottom" ? "row" : "column";
  if (rest.type === "split" && rest.direction !== along) rest = { ...rest, direction: along };
  const mine: Node = { type: "pane", id: assistant.id };
  const root: Node = side === "bottom" ? { type: "split", direction: "column", sizes: [50, 50], children: [rest, mine] }
    : side === "right" ? { type: "split", direction: "row", sizes: [62, 38], children: [rest, mine] }
    : { type: "split", direction: "row", sizes: [38, 62], children: [mine, rest] };
  return { ...layout, root };
}
