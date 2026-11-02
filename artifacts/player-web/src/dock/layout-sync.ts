/**
 * How the dock and the engine's `dockLayouts` row stay in step (docs/ui-redesign.md §2.3–2.4). Pure decisions, unit
 * tested in test/layout-sync.test.ts; dock/store.ts runs them against `layout.current` and `layout.set`.
 *
 *   - A server layout (from `layout.current`: this device's own writes, another device, the assistant's tools) is
 *     applied at once, except during a drag or over a local edit not yet pushed: then it is queued.
 *   - A local edit (a drag, the panel menu, the palette) is shown at once and pushed with `ifUpdatedAt` = the server
 *     version it was based on: ~800 ms after a gesture ends, sooner for a discrete action. One push at a time.
 *   - CONFLICT (the row moved in the meantime) adopts the server's version, with the panes the player closed closed
 *     again on it (then pushed): a close is never undone by someone else's change. Another failure keeps the edit and
 *     retries.
 *   - Nothing is pushed before the first server layout arrives, or ever in a read-only dock (safe mode, a replay),
 *     whose own edits stay on screen until the next server layout.
 */
import type { Phase } from "@workspace/player-client/panels";
import { closePane, followPhase, type DockLayout, type Node } from "@workspace/player-client/layout";

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
  /** Panes the player closed whose push met a CONFLICT before the newer version arrived: closed again on it. */
  closing: string[];
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
  ({ local: layout, base: null, baseLayout: null, closing: [], latest: null, gesture: false, dirty: false, inFlight: false, queued: false, canWrite });

const adopt = (state: SyncState): SyncState =>
  state.latest ? { ...state, local: state.latest.layout, base: state.latest.updatedAt, baseLayout: state.latest.layout, queued: false } : { ...state, queued: false };

/** `layout` without the panes in `ids` it still has. */
const withoutPanes = (layout: DockLayout, ids: readonly string[]) => ids.reduce((l, id) => (l.panes[id] ? closePane(l, id) : l), layout);
/** Adopt the newest server version with `closing` replayed on it: an edit to push when that changed anything. */
function adoptClosing(state: SyncState, closing: readonly string[]): SyncState {
  const next = adopt(state);
  const local = withoutPanes(next.local, closing);
  return { ...next, local, closing: [], dirty: !sameLayout(local, next.local) };
}
const busy = (s: SyncState) => s.gesture || s.dirty || s.inFlight;

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case "server": {
      const first = state.latest === null;
      const next = { ...state, latest: { layout: event.layout, updatedAt: event.updatedAt } };
      // An edit made before the first server version is rebased onto it.
      if (first && state.dirty) return { ...next, base: event.updatedAt, baseLayout: event.layout };
      if (busy(state)) return { ...next, queued: true };
      return state.closing.length ? adoptClosing(next, state.closing) : adopt(next);
    }
    case "gesture-start": return { ...state, gesture: true };
    case "gesture-end": {
      const next = { ...state, gesture: false };
      if (!next.queued || next.dirty || next.inFlight) return next;
      return next.closing.length ? adoptClosing(next, next.closing) : adopt(next);
    }
    // A read-only dock never pushes, so its edits are never pending: the next server layout replaces them.
    case "edit": return sameLayout(state.local, event.layout) ? state : { ...state, local: event.layout, dirty: state.canWrite };
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
      // The panes this push closed (the version it was based on had them).
      const closed = state.baseLayout ? Object.keys(state.baseLayout.panes).filter(id => !state.local.panes[id]) : [];
      const closing = [...new Set([...state.closing, ...closed])];
      if (next.gesture) return { ...next, queued: true, closing };
      if (!closing.length) return adopt(next);
      // The version that moved the row has not arrived yet: the closes stay on screen and are replayed on it.
      const newer = next.latest && next.latest.updatedAt !== null && (next.base === null || next.latest.updatedAt > next.base);
      return newer ? adoptClosing(next, closing) : { ...next, closing };
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
