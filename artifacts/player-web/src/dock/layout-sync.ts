/**
 * How the dock and the engine's `dockLayouts` row stay in step (docs/ui-redesign.md §2.3–2.4). Pure decisions, unit
 * tested in test/layout-sync.test.ts; dock/store.ts runs them against `layout.current` and `layout.set`.
 *
 *   - A server layout (from `layout.current`: this device's own writes, another device, the assistant's tools) is
 *     applied at once, except during a drag or over a local edit not yet pushed: then it is queued.
 *   - A local edit (a drag, the panel menu, the palette) is shown at once and pushed with `ifUpdatedAt` = the server
 *     version it was based on: ~800 ms after a gesture ends, sooner for a discrete action. One push at a time.
 *   - CONFLICT (the row moved in the meantime) adopts the server's version; another failure keeps the edit and retries.
 *   - Nothing is pushed before the first server layout arrives, or ever in a read-only (safe-mode) dock.
 */
import { defaultPanelFor, defaultPanelParams, type Phase } from "@workspace/player-client/panels";
import { panelPanesOf, type DockLayout, type Node } from "@workspace/player-client/layout";

export const PUSH_DELAY_MS = 800;
/** A discrete action (menu, palette): pushed almost at once, coalescing a burst. */
export const PUSH_SOON_MS = 60;
export const RETRY_MS = 5_000;

export type SyncState = {
  /** What the dock shows. */
  local: DockLayout;
  /** `updatedAt` of the server version `local` is based on (null: no row yet). */
  base: number | null;
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
  ({ local: layout, base: null, latest: null, gesture: false, dirty: false, inFlight: false, queued: false, canWrite });

const adopt = (state: SyncState): SyncState =>
  state.latest ? { ...state, local: state.latest.layout, base: state.latest.updatedAt, queued: false } : { ...state, queued: false };
const busy = (s: SyncState) => s.gesture || s.dirty || s.inFlight;

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case "server": {
      const first = state.latest === null;
      const next = { ...state, latest: { layout: event.layout, updatedAt: event.updatedAt } };
      // An edit made before the first server version is rebased onto it.
      if (first && state.dirty) return { ...next, base: event.updatedAt };
      return busy(state) ? { ...next, queued: true } : adopt(next);
    }
    case "gesture-start": return { ...state, gesture: true };
    case "gesture-end": {
      const next = { ...state, gesture: false };
      return next.queued && !next.dirty && !next.inFlight ? adopt(next) : next;
    }
    case "edit": return sameLayout(state.local, event.layout) ? state : { ...state, local: event.layout, dirty: true };
    case "push-start": return { ...state, inFlight: true, dirty: false };
    case "push-ok": {
      const newer = state.latest && state.latest.updatedAt !== null && state.latest.updatedAt > event.updatedAt;
      const latest = newer ? state.latest : { layout: event.layout, updatedAt: event.updatedAt };
      const next: SyncState = { ...state, inFlight: false, base: event.updatedAt, latest, queued: !!newer };
      if (next.dirty) return next;
      return newer && !next.gesture ? adopt(next) : { ...next, local: next.gesture ? next.local : event.layout };
    }
    case "push-conflict": {
      const next = { ...state, inFlight: false, dirty: false };
      return next.gesture ? { ...next, queued: true } : adopt(next);
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
 * The layout as shown in a phase: the first built-in panel follows the phase's default while nobody (human or
 * assistant) chose its panel. The same object when nothing changes.
 */
export function effectiveLayout(layout: DockLayout, phase: Phase): DockLayout {
  const first = panelPanesOf(layout)[0];
  const panelId = defaultPanelFor(phase);
  if (!first || first.setBy !== "default" || first.panelId === panelId) return layout;
  return { ...layout, panes: { ...layout.panes, [first.id]: { ...first, panelId, params: defaultPanelParams(panelId) ?? {} } } };
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
  if (a.type === "tabs" || b.type === "tabs") {
    return a.type === "tabs" && b.type === "tabs" && a.active === b.active && a.panes.length === b.panes.length && a.panes.every((p, i) => p === b.panes[i]);
  }
  return a.direction === b.direction && a.children.length === b.children.length
    && a.sizes.every((s, i) => Math.abs(s - b.sizes[i]) <= tolerance) && a.children.every((c, i) => sameNode(c, b.children[i], tolerance));
}

/** Same panes and tree, sizes within `tolerance` weight points (dockview's pixel rounding is not a change). */
export function sameLayout(a: DockLayout, b: DockLayout, tolerance = 1): boolean {
  return a === b || (sameNode(a.root, b.root, tolerance) && canonical(a.panes) === canonical(b.panes));
}
