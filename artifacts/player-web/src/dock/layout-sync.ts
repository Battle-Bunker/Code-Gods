/**
 * How the dock and the engine's `dockLayouts` row stay in step (docs/ui-redesign.md §2.3–2.4). Pure decisions, unit
 * tested in test/layout-sync.test.ts; dock/store.ts runs them against `layout.current` and `layout.set`.
 *
 *   - A server layout (from `layout.current`: this device's own writes, another device, the assistant's tools) is
 *     applied at once, except during a drag or over a local edit not yet pushed: then it is queued.
 *   - A local edit (a drag, the panel menu, the palette) is shown at once and pushed with `ifUpdatedAt` = the server
 *     version it was based on: ~800 ms after a gesture ends, sooner for a discrete action. One push at a time.
 *   - CONFLICT (the row moved in the meantime) adopts the server's version, with the panes the player closed closed
 *     again on it (then pushed), so a close is not undone by someone else's change: once a version newer than the
 *     edit's base is in (it may arrive after the CONFLICT), only a pane still showing what was closed, never the last
 *     panel, and forgotten if the player brings that pane back. The rest of a conflicting edit gives way to the
 *     server's version. Another failure keeps the edit and retries.
 *   - Nothing is pushed before the first server layout arrives, or ever in a read-only dock (safe mode, a replay),
 *     whose own edits stay on screen until the next server layout.
 */
import { defaultPanelParams, type Phase } from "@workspace/player-client/panels";
import { closePane, followPhase, nextPaneId, openPane, paneOrder, panelPanesOf, type DockLayout, type Node, type Pane, type Place } from "@workspace/player-client/layout";

export const PUSH_DELAY_MS = 800;
/** A discrete action (menu, palette): pushed almost at once, coalescing a burst. */
export const PUSH_SOON_MS = 60;
export const RETRY_MS = 5_000;

export type SyncState = {
  /** What the dock shows. */
  local: DockLayout;
  /** `updatedAt` of the server version `local` is based on (null: no row yet), and that version's layout. */
  base: number | null;
  baseLayout: DockLayout | null;
  /** Panes the player closed whose push met a CONFLICT, as they were (id → canonical pane): closed again on the newer version. */
  closing: Record<string, string>;
  /** The newest server version seen, or null before the first one. */
  latest: { layout: DockLayout; updatedAt: number | null } | null;
  gesture: boolean;
  /** `local` holds an edit not yet pushed. */
  dirty: boolean;
  inFlight: boolean;
  /** A server version is waiting to be applied. */
  queued: boolean;
  canWrite: boolean;
};
export type SyncEvent =
  | { type: "server"; layout: DockLayout; updatedAt: number | null }
  | { type: "gesture-start" }
  | { type: "gesture-end" }
  | { type: "edit"; layout: DockLayout }
  | { type: "push-start" }
  | { type: "push-ok"; layout: DockLayout; updatedAt: number }
  | { type: "push-conflict" }
  | { type: "push-failed" };

export const initialSync = (layout: DockLayout, { canWrite = true } = {}): SyncState =>
  ({ local: layout, base: null, baseLayout: null, closing: {}, latest: null, gesture: false, dirty: false, inFlight: false, queued: false, canWrite });

/** The newest server version is newer than the one `local` is based on. */
const newer = (s: SyncState) => !!s.latest && s.latest.updatedAt !== null && (s.base === null || s.latest.updatedAt > s.base);

/** `layout` with the closed panes still showing what was closed taken out (never its last panel: closePane refuses). */
function reclose(layout: DockLayout, closing: Record<string, string>): DockLayout {
  return Object.entries(closing).reduce((l, [id, was]) => {
    if (!l.panes[id] || canonical(l.panes[id]) !== was) return l;
    try { return closePane(l, id); } catch { return l; }
  }, layout);
}

/**
 * Show the newest server version. With closes to replay, only a version newer than the base (the CONFLICT's cause):
 * before it arrives the player's layout stays; on it, the closes are replayed and pushed.
 */
function adopt(state: SyncState): SyncState {
  if (!state.latest) return { ...state, queued: false };
  const pending = Object.keys(state.closing).length > 0;
  if (pending && !newer(state)) return { ...state, queued: false };
  const local = pending ? reclose(state.latest.layout, state.closing) : state.latest.layout;
  return { ...state, local, base: state.latest.updatedAt, baseLayout: state.latest.layout, queued: false, closing: {}, dirty: state.dirty || !sameLayout(local, state.latest.layout) };
}
const busy = (s: SyncState) => s.gesture || s.dirty || s.inFlight;

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case "server": {
      const first = state.latest === null;
      const next = { ...state, latest: { layout: event.layout, updatedAt: event.updatedAt } };
      // An edit made before the first server version is rebased onto it.
      if (first && state.dirty) return { ...next, base: event.updatedAt, baseLayout: event.layout };
      return busy(state) ? { ...next, queued: true } : adopt(next);
    }
    case "gesture-start": return { ...state, gesture: true };
    case "gesture-end": {
      const next = { ...state, gesture: false };
      return next.queued && !next.dirty && !next.inFlight ? adopt(next) : next;
    }
    // A read-only dock never pushes, so its edits are never pending: the next server layout replaces them.
    case "edit": {
      if (sameLayout(state.local, event.layout)) return state;
      // A pane the player brings back (same id) is no longer theirs to close.
      const closing = Object.fromEntries(Object.entries(state.closing).filter(([id]) => !event.layout.panes[id]));
      return { ...state, local: event.layout, dirty: state.canWrite, closing };
    }
    case "push-start": return { ...state, inFlight: true, dirty: false };
    case "push-ok": {
      const newer = state.latest && state.latest.updatedAt !== null && state.latest.updatedAt > event.updatedAt;
      const latest = newer ? state.latest : { layout: event.layout, updatedAt: event.updatedAt };
      const next: SyncState = { ...state, inFlight: false, base: event.updatedAt, baseLayout: event.layout, latest, queued: !!newer };
      if (next.dirty) return next;
      return newer && !next.gesture ? adopt(next) : { ...next, local: next.gesture ? next.local : event.layout };
    }
    case "push-conflict": {
      const next = { ...state, inFlight: false, dirty: false };
      // The panes this push closed: the version it was based on had them, as they were then.
      const closed = Object.fromEntries(Object.entries(state.baseLayout?.panes ?? {}).filter(([id]) => !state.local.panes[id]).map(([id, pane]) => [id, canonical(pane)]));
      const closing = { ...state.closing, ...closed };
      return next.gesture ? { ...next, queued: true, closing } : adopt({ ...next, closing });
    }
    case "push-failed": return { ...state, inFlight: false, dirty: true };
  }
}

/** What to push now, if anything. */
export function pushPlan(state: SyncState): { layout: DockLayout; ifUpdatedAt: number | undefined } | null {
  if (!state.canWrite || !state.dirty || state.gesture || state.inFlight || state.latest === null) return null;
  return { layout: state.local, ifUpdatedAt: state.base ?? undefined };
}

/**
 * The layout as shown in a phase: the first panel nobody (human or assistant) chose follows the phase's default
 * (`followPhase`, the same rule the engine's parse applies). The same object when nothing changes.
 */
export function effectiveLayout(layout: DockLayout, phase: Phase): DockLayout {
  return followPhase(layout, phase);
}

/**
 * A replay's layout (derived for display, never pushed; dock/store.ts shows it until the human closes it): the human's
 * layout from the engine with the Timeline in the assistant's place (the assistant's pane becomes the Timeline, so
 * the bottom half shows the replay), or, with no assistant pane, added as a full-width bottom half. A layout that
 * already has a Timeline is the human's own arrangement and is left alone. The assistant stays reachable from the panel
 * menu and Ctrl+K (opening it puts it back).
 */
export function withTimeline(layout: DockLayout): DockLayout {
  const panels = panelPanesOf(layout);
  // Exempt from LAYOUT_LIMITS (panes, panelPanes): they bound what is saved (parseLayout, layout:set), and this layout is
  // derived for display and never saved, so a full dock still opens an ended game with its Timeline.
  if (panels.some(p => p.panelId === "timeline")) return layout;
  const timeline = (id: string): Pane => ({ id, kind: "panel", panelId: "timeline", params: {}, setBy: "human" });
  const assistant = Object.values(layout.panes).find(p => p.kind === "assistant");
  if (assistant) return { ...layout, panes: { ...layout.panes, [assistant.id]: timeline(assistant.id) } };
  const id = nextPaneId(layout);
  const root: Node = { type: "split", direction: "column", sizes: [50, 50], children: [layout.root, { type: "pane", id }] };
  return { ...layout, root, panes: { ...layout.panes, [id]: timeline(id) } };
}

/** The share of the dock's height the results take when a game has ended (the rest: the replay). */
export const RESULTS_SHARE = 48;

/**
 * An ended game shows how it went first (derived for display like the Timeline, never pushed; dock/store.ts shows it
 * until the human rearranges the replay): the results pane across the top, about half the dock, so the headline
 * ("You finished 1st of 3 …") and the final standings need no scrolling; everything else, the Timeline included, below
 * it. First in reading order too, so the phone's stacked layout opens on it. A layout with no results pane gets one.
 */
export function withResultsFirst(layout: DockLayout): DockLayout {
  const isResults = (p: Pane | undefined) => !!p && p.kind === "panel" && p.panelId === "results";
  const root = layout.root;
  if (root.type === "pane") return layout; // one pane: nothing to arrange
  if (root.direction === "column" && root.children[0]?.type === "pane" && isResults(layout.panes[root.children[0].id])) return layout;
  const existing = panelPanesOf(layout).find(isResults);
  let rest = layout, pane: Pane;
  if (existing) {
    try { rest = closePane(layout, existing.id); } catch { return layout; }
    pane = existing;
  } else {
    pane = { id: nextPaneId(layout), kind: "panel", panelId: "results", params: defaultPanelParams("results") ?? {}, setBy: "default" };
  }
  // Rows under the results join the same column (a column inside a column is one column to the dock).
  const below = rest.root.type === "split" && rest.root.direction === "column" ? rest.root : { sizes: [100], children: [rest.root] };
  const total = below.sizes.reduce((sum, size) => sum + size, 0) || 1;
  const sizes = [RESULTS_SHARE, ...below.sizes.map(size => (size / total) * (100 - RESULTS_SHARE))];
  return {
    ...rest,
    root: { type: "split", direction: "column", sizes, children: [{ type: "pane", id: pane.id }, ...below.children] },
    panes: { ...rest.panes, [pane.id]: pane },
  };
}

/** The share of the dock's height the results take when they are shown with the timeline alone. */
export const RESULTS_ONLY_SHARE = 64;

/**
 * An ended game opens on two things only (derived for display, never pushed): how it went (the results, most of the
 * screen: the headline, the standings and why) and the replay timeline under it. The goal, the code, the agents and
 * the objects were one-line slivers between them, their text cut mid-sentence (five walks); they come back with one
 * button, "Show my panes" (dock/store.ts shows withResultsFirst then). The panes keep the ids withResultsFirst gives
 * them. With the timeline closed, the results alone.
 */
export function withResultsOnly(layout: DockLayout): DockLayout {
  const full = withResultsFirst(layout);
  const panels = panelPanesOf(full);
  const results = panels.find(p => p.panelId === "results"), timeline = panels.find(p => p.panelId === "timeline");
  if (!results) return full;
  if (!timeline) return { ...full, root: { type: "pane", id: results.id }, panes: { [results.id]: results } };
  return {
    ...full,
    root: { type: "split", direction: "column", sizes: [RESULTS_ONLY_SHARE, 100 - RESULTS_ONLY_SHARE], children: [{ type: "pane", id: results.id }, { type: "pane", id: timeline.id }] },
    panes: { [results.id]: results, [timeline.id]: timeline },
  };
}
/** How many panes "Show my panes" would bring back (0: the button is not offered). */
export function hiddenByResultsOnly(layout: DockLayout): number {
  return Object.keys(withResultsFirst(layout).panes).length - Object.keys(withResultsOnly(layout).panes).length;
}

/**
 * A room with no assistant (its owner is not an administrator) shows its layout without the assistant pane: derived for
 * display like the replay's Timeline, so the stored layout keeps it for rooms where it exists.
 */
export function withoutAssistant(layout: DockLayout): DockLayout {
  const pane = Object.values(layout.panes).find(p => p.kind === "assistant");
  if (!pane) return layout;
  try { return closePane(layout, pane.id); } catch { return layout; }
}

/**
 * A change made from the shown layout while the assistant is hidden (withoutAssistant) lacks its pane: put the
 * `stored` layout's assistant pane back where it was (beside the neighbour it had, on the same side), so the saved
 * layout keeps it for when AI is available in the room again.
 */
export function keepAssistantPane(next: DockLayout, stored: DockLayout): DockLayout {
  const pane = Object.values(stored.panes).find(p => p.kind === "assistant");
  if (!pane || Object.values(next.panes).some(p => p.kind === "assistant")) return next;
  const place = placeOf(stored.root, pane.id);
  try {
    const opened = openPane(next, pane, place && next.panes[place.relativeTo] ? place : undefined);
    if (!place || !next.panes[place.relativeTo]) return opened.layout;
    // openPane halves the neighbour to make room. Hidden again, the assistant would give that half to the whole row,
    // so the neighbour would shrink with every change (the editor ended as a sliver). Give the assistant the share it
    // had and leave the others their proportions: hiding it then shows exactly `next` again.
    return { ...opened.layout, root: withShare(opened.layout.root, opened.paneId, place.share, place.direction === "left" || place.direction === "above") };
  } catch { try { return openPane(next, pane).layout; } catch { return next; } }
}

/**
 * `id`, just opened beside a neighbour, gets `share` (0–1) of its split; the others keep their proportions among
 * themselves. `before`: it was put before its neighbour (left or above), else after.
 */
function withShare(node: Node, id: string, share: number, before: boolean): Node {
  if (node.type === "pane") return node;
  const i = node.children.findIndex(c => c.type === "pane" && c.id === id);
  if (i < 0) return { ...node, children: node.children.map(c => withShare(c, id, share, before)) };
  const sizes = [...node.sizes];
  // Joined to a longer row or column, the neighbour was halved to make room: it gets its half back first.
  const neighbour = before ? i + 1 : i - 1;
  if (sizes.length > 2 && sizes[neighbour] !== undefined) sizes[neighbour] *= 2;
  const rest = sizes.reduce((sum, size, j) => (j === i ? sum : sum + size), 0) || 1;
  const mine = Math.min(0.9, Math.max(0.1, share));
  return { ...node, sizes: sizes.map((size, j) => (j === i ? mine * 100 : (size / rest) * (1 - mine) * 100)) };
}

/** Where a pane sits relative to its nearest sibling (the first pane of the sibling after it, else the last before it), and its share of their split. */
function placeOf(node: Node, id: string): { relativeTo: string; direction: Place["direction"]; share: number } | null {
  if (node.type === "pane") return null;
  const i = node.children.findIndex(c => c.type === "pane" && c.id === id);
  if (i < 0) { for (const child of node.children) { const found = placeOf(child, id); if (found) return found; } return null; }
  const row = node.direction === "row";
  const share = (node.sizes[i] ?? 0) / (node.sizes.reduce((a, b) => a + b, 0) || 1);
  const after = node.children[i + 1], before = node.children[i - 1];
  if (after) return { relativeTo: paneOrder(after)[0], direction: row ? "left" : "above", share };
  if (before) return { relativeTo: paneOrder(before).at(-1)!, direction: row ? "right" : "below", share };
  return null;
}

/** A stable JSON text (sorted keys), for comparing panes. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameNode(a: Node, b: Node, tolerance: number): boolean {
  if (a.type === "pane" || b.type === "pane") return a.type === "pane" && b.type === "pane" && a.id === b.id;
  return a.direction === b.direction && a.children.length === b.children.length
    && a.sizes.every((s, i) => Math.abs(s - b.sizes[i]) <= tolerance) && a.children.every((c, i) => sameNode(c, b.children[i], tolerance));
}

/** Same panes and tree, sizes within `tolerance` weight points (dockview's pixel rounding is not a change). */
export function sameLayout(a: DockLayout, b: DockLayout, tolerance = 1): boolean {
  return a === b || (sameNode(a.root, b.root, tolerance) && canonical(a.panes) === canonical(b.panes));
}

/** Whether a scroller has content below its bottom edge (more than a few pixels: rounding is not content). */
export function moreBelow(s: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return s.scrollHeight - s.scrollTop - s.clientHeight > 8;
}
