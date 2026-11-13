/**
 * The dock operations a human performs (panel menu, ⋯ menu, palette) as pure functions over the layout, built on the
 * shared operations of lib/player-client/src/layout.ts. The store parses every result with parseLayout.
 */
import { PANELS, defaultPanelParams, type PanelId, type Phase } from "@workspace/player-client/panels";
import {
  LAYOUT_LIMITS, assistantPaneOf, paneAreas, paneExtents, openAssistant, assistantSide, panelPanesOf, openPane, panesOf, setPanePanel, type DockLayout, type Node, type Pane, type Place,
} from "@workspace/player-client/layout";

/**
 * The least room the agent editor needs, as shares of the dock: about 480 by 360 px of a 1440 by 900 screen (the dock
 * is what the header and the planning line leave, about 1440 by 800).
 */
export const EDITOR_MIN = { width: 1 / 3, height: 0.44 };
const ROOMY: ReadonlySet<PanelId> = new Set<PanelId>(["forge"]);

/**
 * Show a panel: reuse an open pane of it (one pane per panel, like the assistant's open_panel), else add one. With
 * the most built-in panels already open (parseLayout keeps four, as the default dock does), the focused one shows it
 * instead, else the largest panel nobody chose (in the default dock, the objects top right: room for the agent editor),
 * else the largest.
 *
 * The agent editor needs room (EDITOR_MIN), and the player needs their goal beside it: it never takes the goal card's
 * pane, takes the focused pane only when that is big enough (and not My agents, while another pane has the room), else
 * the largest other pane, and a pane is split for it only when both halves stay big enough.
 */
/** The panes a player plays from: showing another panel never replaces them while any other pane can give way. */
const KEPT: ReadonlySet<PanelId> = new Set<PanelId>(["my-card", "objects"]);
export function showPanel(layout: DockLayout, panelId: PanelId, params?: Record<string, unknown>, focused?: string | null): { layout: DockLayout; paneId: string; replaced?: boolean } {
  const panels = panelPanesOf(layout);
  const open = panels.find(p => p.panelId === panelId);
  // An editor left as a sliver (an arrangement carried from another room) is given room where it is.
  if (open) return { layout: ROOMY.has(panelId) ? withRoom(layout, open.id) : layout, paneId: open.id };
  const values = params ?? defaultPanelParams(panelId);
  if (!values) throw new Error(`${PANELS[panelId].title} needs your assistant to set it up`);
  const area = paneAreas(layout.root);
  const largest = (list: typeof panels) => list.reduce<(typeof panels)[number] | undefined>((best, p) => (!best || (area[p.id] ?? 0) > (area[best.id] ?? 0) ? p : best), undefined);
  if (ROOMY.has(panelId) && panels.length) {
    const extent = paneExtents(layout.root);
    const fits = (id: string, across = 1, down = 1) => (extent[id]?.width ?? 0) * across >= EDITOR_MIN.width && (extent[id]?.height ?? 0) * down >= EDITOR_MIN.height;
    const others = panels.filter(p => p.panelId !== "my-card");
    if (panels.length < LAYOUT_LIMITS.panelPanes) {
      // A new pane beside the largest pane that leaves both halves usable.
      const side = largest(panels.filter(p => fits(p.id, 0.5))), stack = largest(panels.filter(p => fits(p.id, 1, 0.5)));
      const target = side && stack ? ((area[side.id] ?? 0) >= (area[stack.id] ?? 0) ? side : stack) : side ?? stack;
      if (target) return openPane(layout, { id: "", kind: "panel", panelId, params: values, setBy: "human" }, { relativeTo: target.id, direction: target === side ? "right" : "below" });
    }
    // My agents is where the new agent's moves are told, so it is kept while another pane has the room.
    const candidates = others.length ? others : panels;
    const spare = candidates.filter(p => p.panelId !== "agents" && fits(p.id));
    const target = spare.find(p => p.id === focused) ?? largest(spare) ?? largest(candidates.filter(p => fits(p.id))) ?? largest(candidates)!;
    return { layout: withRoom(setPanePanel(layout, target.id, panelId, "human", values), target.id), paneId: target.id, replaced: true };
  }
  if (panels.length >= LAYOUT_LIMITS.panelPanes) {
    // Never the goal card or the objects while another pane can give way ("Where did my boards go?"): the focused pane
    // unless it is one of those, else the pane the editor is in, else the largest default one.
    const spare = panels.filter(p => !KEPT.has(p.panelId)), from = spare.length ? spare : panels;
    const target = from.find(p => p.id === focused) ?? from.find(p => p.panelId === "forge") ?? largest(from.filter(p => p.setBy === "default")) ?? largest(from)!;
    return { layout: setPanePanel(layout, target.id, panelId, "human", values), paneId: target.id, replaced: true };
  }
  return openPane(layout, { id: "", kind: "panel", panelId, params: values, setBy: "human" });
}

/**
 * The layout with `paneId` at least EDITOR_MIN wide and tall: unchanged when it already is; otherwise the pane's
 * branch gets at least half of every split that is too tight for it, its siblings sharing the rest in proportion.
 */
export function withRoom(layout: DockLayout, paneId: string): DockLayout {
  const extent = paneExtents(layout.root)[paneId];
  if (!extent) return layout;
  const narrow = extent.width < EDITOR_MIN.width, low = extent.height < EDITOR_MIN.height;
  if (!narrow && !low) return layout;
  const holds = (node: Node): boolean => (node.type === "pane" ? node.id === paneId : node.children.some(holds));
  const count = (node: Node, direction: "row" | "column"): number => (node.type === "pane" ? 0 : (node.direction === direction ? 1 : 0) + count(node.children.find(holds)!, direction));
  const rows = count(layout.root, "row"), columns = count(layout.root, "column");
  const grow = (node: Node): Node => {
    if (node.type === "pane") return node;
    const i = node.children.findIndex(holds);
    const children = node.children.map((child, j) => (j === i ? grow(child) : child));
    const tight = node.direction === "row" ? narrow : low;
    if (!tight) return { ...node, children };
    const least = Math.min(0.8, Math.max(0.5, Math.pow(node.direction === "row" ? EDITOR_MIN.width : EDITOR_MIN.height, 1 / (node.direction === "row" ? rows : columns))));
    const total = node.sizes.reduce((a, b) => a + b, 0) || 1, mine = (node.sizes[i] ?? 0) / total;
    if (mine >= least) return { ...node, children };
    const rest = total - (node.sizes[i] ?? 0) || 1;
    return { ...node, children, sizes: node.sizes.map((size, j) => (j === i ? least * 100 : (size / rest) * (1 - least) * 100)) };
  };
  return { ...layout, root: grow(layout.root) };
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
