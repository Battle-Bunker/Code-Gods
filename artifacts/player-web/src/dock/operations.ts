/**
 * The dock operations a human performs (lens menu, ⋯ menu, palette) as pure functions over the layout, built on the
 * shared operations of lib/player-client/src/layout.ts. The store parses every result with parseLayout.
 */
import { LENSES, defaultLensParams, type LensId, type Phase } from "@workspace/player-client/lenses";
import {
  LAYOUT_LIMITS, activatePane, assistantPaneOf, assistantSide, lensPanesOf, openPane, panesOf, setPaneLens, type DockLayout, type Node, type Pane, type Place,
} from "@workspace/player-client/layout";

/**
 * Show a lens: activate an open pane of it (one pane per lens, like the assistant's open_lens), else add one. With
 * the most lens panes already open (parseLayout keeps four), the focused lens pane (else the last) shows it instead.
 */
export function showLens(layout: DockLayout, lensId: LensId, params?: Record<string, unknown>, focused?: string | null): { layout: DockLayout; paneId: string; replaced?: boolean } {
  const lenses = lensPanesOf(layout);
  const open = lenses.find(p => p.lensId === lensId);
  if (open) return { layout: activatePane(layout, open.id), paneId: open.id };
  const values = params ?? defaultLensParams(lensId);
  if (!values) throw new Error(`${LENSES[lensId].title} needs your assistant to set it up`);
  if (lenses.length >= LAYOUT_LIMITS.lensPanes) {
    const target = lenses.find(p => p.id === focused) ?? lenses[lenses.length - 1];
    return { layout: activatePane(setPaneLens(layout, target.id, lensId, "human", values), target.id), paneId: target.id, replaced: true };
  }
  return openPane(layout, { id: "", kind: "lens", lensId, params: values, setBy: "human" });
}

/** The lens menu: change a pane's lens (parameters as last used there, else defaults), chosen by the human. */
export function changeLens(layout: DockLayout, paneId: string, lensId: LensId, params?: Record<string, unknown>): DockLayout {
  return setPaneLens(layout, paneId, lensId, "human", params ?? defaultLensParams(lensId) ?? undefined);
}

/** Lenses to suggest for a new pane, most useful first for the phase. */
export function lensOrder(phase: Phase): LensId[] {
  const live: LensId[] = ["objects", "race", "agents", "feed", "bits-over-time", "others-care", "public-chat", "forge", "my-card", "overview", "rules", "results"];
  const byPhase: Record<Phase, LensId[]> = {
    lobby: ["overview", "rules", "public-chat", "results", "forge", "my-card"],
    planning: ["my-card", "forge", "overview", "rules", "public-chat", "agents"],
    running: live, paused: ["feed", "public-chat", ...live],
    ended: ["results", "race", "bits-over-time", "objects", "feed", "overview", "rules", "public-chat"],
  };
  return [...new Set(byPhase[phase])];
}

/** "Add lens below / to the right" from a pane's ⋯ menu: the first useful lens not shown yet, next to that pane. */
export function addLensNextTo(layout: DockLayout, paneId: string, phase: Phase): { layout: DockLayout; paneId: string } {
  // openPane refuses a fifth lens pane itself, with the one message every surface shows.
  const open = new Set(lensPanesOf(layout).map(p => p.lensId));
  const lensId = lensOrder(phase).find(id => !open.has(id)) ?? "overview";
  const direction: Place["direction"] = assistantSide(layout) === "row" ? "below" : "right";
  return openPane(layout, { id: "", kind: "lens", lensId, params: defaultLensParams(lensId) ?? {}, setBy: "human" }, { relativeTo: paneId, direction });
}
export const addLensLabel = (layout: DockLayout) => (assistantSide(layout) === "row" ? "Add lens below" : "Add lens to the right");

/** Open a stored or file panel: activate its pane, else add one. */
export function showPanel(layout: DockLayout, pane: Extract<Pane, { kind: "stored-panel" | "file-panel" }>): { layout: DockLayout; paneId: string } {
  const open = panesOf(layout).find(p => (p.kind === "stored-panel" && pane.kind === "stored-panel" && p.slug === pane.slug)
    || (p.kind === "file-panel" && pane.kind === "file-panel" && p.fileId === pane.fileId));
  if (open) return { layout: activatePane(layout, open.id), paneId: open.id };
  return openPane(layout, pane);
}

function without(node: Node, id: string): Node {
  if (node.type === "tabs") return { ...node, panes: node.panes.filter(p => p !== id), active: node.active === id ? node.panes.find(p => p !== id) ?? "" : node.active };
  return { ...node, children: node.children.map(child => without(child, id)) };
}
/** Drop empty tab groups and one-child splits (enough to see the shape of what is left). */
function prune(node: Node): Node | null {
  if (node.type === "tabs") return node.panes.length ? node : null;
  const children = node.children.map(prune).filter((c): c is Node => !!c);
  if (!children.length) return null;
  return children.length === 1 ? children[0] : { ...node, children, sizes: node.sizes.filter((_, i) => !!prune(node.children[i])) };
}
/**
 * Move the assistant to an edge of the whole dock (parse the result). The rest keeps its arrangement, except that its
 * outermost split turns to run along the assistant: lenses stack beside a side assistant and sit side by side above
 * a bottom one (otherwise every pane would join one long row or column).
 */
export function dockAssistant(layout: DockLayout, side: "left" | "right" | "bottom"): DockLayout {
  const assistant = assistantPaneOf(layout);
  if (!assistant) return layout;
  let rest = prune(without(layout.root, assistant.id)) ?? { type: "tabs", panes: [], active: "" };
  const along = side === "bottom" ? "row" : "column";
  if (rest.type === "split" && rest.direction !== along) rest = { ...rest, direction: along };
  const mine: Node = { type: "tabs", panes: [assistant.id], active: assistant.id };
  const root: Node = side === "bottom" ? { type: "split", direction: "column", sizes: [50, 50], children: [rest, mine] }
    : side === "right" ? { type: "split", direction: "row", sizes: [62, 38], children: [rest, mine] }
    : { type: "split", direction: "row", sizes: [38, 62], children: [mine, rest] };
  return { ...layout, root };
}

/** Is a pane in a tab group with others (its header is then a compact tab)? */
export function isTabbed(layout: DockLayout, paneId: string): boolean {
  const find = (node: Node): boolean => node.type === "tabs" ? node.panes.length > 1 && node.panes.includes(paneId) : node.children.some(find);
  return find(layout.root);
}
