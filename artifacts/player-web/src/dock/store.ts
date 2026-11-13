/**
 * The dock's state for one room: the layout this client shows, kept in step with the engine's `dockLayouts` row by
 * the pure decisions of layout-sync.ts (server layouts between gestures, pushes with ifUpdatedAt, CONFLICT adopts the
 * server). Everything that comes in (the server, the boot cache, dockview after a drag, a menu) goes through
 * parseLayout. The first built-in panel follows the phase while nobody chose its panel (effectiveLayout); per-pane history
 * feeds the header's ‹ and ↺. localStorage is a boot cache only.
 *
 * The desktop dock attaches its dockview api for the operations only dockview can do (maximise, sizes).
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import type { DockviewApi } from "dockview-react";
import { DEFAULT_LAYOUT, parseLayout, panesOf, type DockLayout, type Pane } from "@workspace/player-client/layout";
import type { Phase } from "@workspace/player-client/panels";
import { PUSH_DELAY_MS, PUSH_SOON_MS, RETRY_MS, effectiveLayout, initialSync, pushPlan, sameLayout, syncReducer, keepAssistantPane, hiddenByResultsOnly, withResultsFirst, withResultsOnly, withTimeline, withoutAssistant, type SyncEvent, type SyncState } from "./layout-sync";
import { back, emptyHistory, observe, resetView, type History } from "./history";

export type Pusher = (layout: DockLayout, ifUpdatedAt: number | undefined) => Promise<{ layout: unknown; updatedAt: number }>;
export type DockSnapshot = {
  /** The layout as shown (phase rule applied). */
  layout: DockLayout;
  history: History;
  /** This room has an assistant (its owner is an administrator); when not, its pane is not in `layout` and no menu offers it. */
  assistantAvailable: boolean;
  focused: string | null;
  /** An ended game shows its results and timeline only (layout-sync.ts withResultsOnly): "Show my panes" brings the rest back. */
  hiddenPanes: boolean;
  phase: Phase;
  loaded: boolean;
  canWrite: boolean;
};

const cacheKey = (roomId: string) => `cg.dock.v1:${roomId}`;
const codeOf = (error: unknown) => (error as { data?: { code?: string } })?.data?.code;

export class DockStore {
  private sync: SyncState;
  private history: History = emptyHistory;
  private phase: Phase = "lobby";
  private storedSlugs: readonly string[] | null = null;
  private fileIds: readonly string[] | undefined;
  private focused: string | null = null;
  /** The last layout the server sent, unparsed (re-parsed when the panels this client knows change). */
  private raw: unknown = undefined;
  private editedInGesture = false;
  private replayTimeline = false;
  private timelineClosed = false;
  /** The human rearranged the replay's dock: their arrangement stays (the results are no longer moved to the top). */
  private replayArranged = false;
  /** "Show my panes" was pressed: the ended game shows every pane, the results first. */
  private myPanes = false;
  /** The player's arrangement as it was before a change made in the results-only view, for "Show my panes". */
  private keptLocal: DockLayout | undefined;
  private assistantAvailable = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pusher: Pusher | undefined;
  private listeners = new Set<() => void>();
  private snapshot: DockSnapshot;
  api: DockviewApi | null = null;

  constructor(private readonly roomId: string, private readonly options: { canWrite: boolean; fileIds?: readonly string[] }) {
    this.fileIds = options.fileIds;
    let boot = DEFAULT_LAYOUT("lobby");
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(roomId)) ?? "null") as unknown;
      if (cached) boot = this.parse(cached);
    } catch { /* no cache: the default */ }
    this.sync = initialSync(boot, { canWrite: options.canWrite });
    this.history = observe(emptyHistory, null, boot);
    this.snapshot = this.build();
  }

  // ----- reading -----
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  get layout() { return this.snapshot.layout; }
  pane(id: string): Pane | undefined { return this.snapshot.layout.panes[id]; }

  private build(): DockSnapshot {
    const shown = effectiveLayout(this.sync.local, this.phase);
    const timeline = this.replayTimeline && !this.timelineClosed ? withTimeline(shown) : shown;
    // An ended game opens on how it went: the results across the top (layout-sync.ts withResultsFirst).
    // Two things only until "Show my panes": the results and the timeline (withResultsOnly).
    const derived = this.replayTimeline && !this.replayArranged;
    const withT = !derived ? timeline : this.myPanes ? withResultsFirst(timeline) : withResultsOnly(timeline);
    // Offered only when it would bring something back, counted on what is shown (a room without an assistant does not show its pane).
    const hiddenPanes = (derived && !this.myPanes && hiddenByResultsOnly(this.shownOf(timeline)) > 0) || !!this.keptLocal;
    return { layout: this.assistantAvailable ? withT : withoutAssistant(withT), hiddenPanes, history: this.history, assistantAvailable: this.assistantAvailable, focused: this.focused, phase: this.phase, loaded: this.sync.latest !== null, canWrite: this.options.canWrite };
  }
  private emit() {
    const next = this.build();
    const same = sameLayout(next.layout, this.snapshot.layout, 0) && next.history === this.snapshot.history && next.assistantAvailable === this.snapshot.assistantAvailable && next.focused === this.snapshot.focused && next.hiddenPanes === this.snapshot.hiddenPanes
      && next.phase === this.snapshot.phase && next.loaded === this.snapshot.loaded;
    if (same) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /** parseLayout with what this client knows: stored panels once listed (else trust the layout), file panels in a dev server. */
  parse(raw: unknown): DockLayout {
    const named = (raw as { panes?: Record<string, { kind?: string; slug?: string }> } | null)?.panes;
    const slugs = this.storedSlugs ?? Object.values(named ?? {}).flatMap(p => (p?.kind === "stored-panel" && typeof p.slug === "string" ? [p.slug] : []));
    return parseLayout(raw, { phase: this.phase, storedSlugs: slugs, fileIds: this.fileIds }).layout;
  }

  // ----- inputs -----
  setPusher(pusher: Pusher | undefined) { this.pusher = pusher; this.schedule(PUSH_SOON_MS); }
  setPhase(phase: Phase) { if (phase === this.phase) return; this.phase = phase; this.emit(); }
  /**
   * The stored panels (null until listed) and file panels this client can show; panes of others are dropped. The
   * server's layout is parsed again from what it sent, so a pane dropped while its panel was off or not yet listed
   * comes back when it is.
   */
  setPanels(storedSlugs: readonly string[] | null, fileIds: readonly string[] | undefined) {
    this.storedSlugs = storedSlugs; this.fileIds = fileIds;
    const latest = this.sync.latest && (this.raw !== undefined ? { ...this.sync.latest, layout: this.parse(this.raw) } : this.sync.latest);
    const clean = !this.sync.dirty && !this.sync.gesture && !this.sync.inFlight;
    const local = clean && latest ? latest.layout : this.parse(this.sync.local);
    this.noteReplaced(local);
    this.sync = { ...this.sync, local, latest };
    this.history = observe(this.history, null, local);
    this.emit();
  }
  server(raw: unknown, updatedAt: number | null) {
    const first = this.sync.latest === null;
    this.raw = raw;
    const before = this.sync.local;
    this.dispatch({ type: "server", layout: this.parse(raw), updatedAt }, first);
    if (this.sync.local !== before) { this.noteReplaced(this.sync.local, before); this.emit(); }
    // An edit made before the first server layout arrived had nothing to push against; now it does.
    if (this.sync.dirty) this.schedule(PUSH_SOON_MS);
  }
  /** A replay shows its Timeline over every layout (layout-sync.ts withTimeline) until the human closes it. */
  setReplayTimeline(on: boolean) { if (on !== this.replayTimeline) { this.replayTimeline = on; this.emit(); } }
  /** Rooms run by a non-admin have no assistant (assistant.status `available`): its pane is not shown. */
  setAssistantAvailable(on: boolean) { if (on !== this.assistantAvailable) { this.assistantAvailable = on; this.emit(); } }
  /**
   * While the assistant is hidden (withoutAssistant), a change starts from the shown layout, which lacks its pane: put
   * the stored pane back, so the saved layout keeps it for when AI is available in the room again.
   */
  private keepAssistant(next: DockLayout): DockLayout { return this.assistantAvailable ? next : keepAssistantPane(next, this.sync.local); }
  private shownOf(layout: DockLayout) { return this.assistantAvailable ? layout : withoutAssistant(layout); }
  /** A change that removes the shown Timeline closes it for this page. */
  private noteTimeline(next: DockLayout) {
    const has = (l: DockLayout) => Object.values(l.panes).some(p => p.kind === "panel" && p.panelId === "timeline");
    if (this.replayTimeline && !this.timelineClosed && has(this.snapshot.layout) && !has(next)) this.timelineClosed = true;
  }
  /** A change of the human's in a replay starts from the shown arrangement and is kept in `local`: it is theirs from now on. */
  private noteArranged() {
    if (!this.replayTimeline) return;
    // A change made in the results-only view: the arrangement it hid is kept for "Show my panes".
    if (!this.replayArranged && !this.myPanes) this.keptLocal = this.sync.local;
    this.replayArranged = true;
  }
  /**
   * The server's layout (or a re-parse of it) replaced `local`: what the human arranged in this replay, and the
   * arrangement kept for "Show my panes", belonged to the layout that is gone, so the derived view starts again.
   */
  private noteReplaced(next: DockLayout, before: DockLayout = this.sync.local) {
    if (sameLayout(next, before, 0)) return;
    this.keptLocal = undefined;
    this.replayArranged = false;
  }
  /** "Show my panes": the ended game's other panes come back, the results first (a replay's dock is never saved). */
  showMyPanes() {
    this.myPanes = true;
    if (this.keptLocal) {
      const kept = this.keptLocal;
      this.keptLocal = undefined;
      this.replayArranged = false;
      this.dispatch({ type: "edit", layout: kept });
      return;
    }
    this.emit();
  }
  setFocused(paneId: string | null) { if (paneId !== this.focused) { this.focused = paneId; this.emit(); } }

  /** A human's change (menu, palette, a drag's result): shown at once, pushed soon (a drag: after PUSH_DELAY_MS). */
  edit(change: (layout: DockLayout) => DockLayout, delay = PUSH_SOON_MS) {
    const next = this.keepAssistant(this.parse(change(this.snapshot.layout)));
    this.noteTimeline(next);
    this.noteArranged();
    if (this.sync.gesture) this.editedInGesture = true;
    this.dispatch({ type: "edit", layout: next });
    this.schedule(delay);
  }
  gestureStart() { if (!this.sync.gesture) { this.editedInGesture = false; this.dispatch({ type: "gesture-start" }); } }
  /** The end of a drag: dockview's layout, read back. A store edit made meanwhile (a click during it) wins. */
  gestureEnd(result?: DockLayout) {
    if (!this.sync.gesture) return;
    if (result && !this.editedInGesture) {
      const next = this.keepAssistant(this.parse(result));
      this.noteTimeline(next);
      if (!sameLayout(this.shownOf(next), this.snapshot.layout)) { this.noteArranged(); this.dispatch({ type: "edit", layout: next }); }
    }
    this.dispatch({ type: "gesture-end" });
    this.schedule(PUSH_DELAY_MS);
  }
  get gesture() { return this.sync.gesture; }
  /** Dockview changed its structure outside a gesture we saw (a touch drag): adopt it like a drag's result. */
  dockChanged(result: DockLayout) {
    const next = this.keepAssistant(this.parse(result));
    if (sameLayout(this.shownOf(next), this.snapshot.layout)) return;
    this.noteTimeline(next);
    this.noteArranged();
    this.dispatch({ type: "edit", layout: next });
    this.schedule(PUSH_DELAY_MS);
  }

  /** ‹: the view before the assistant's last change to a pane (the step back is not itself a change to go back from). */
  undo(paneId: string) {
    const step = back(this.history, paneId);
    const pane = this.pane(paneId);
    if (!step || pane?.kind !== "panel") return;
    this.edit(layout => ({ ...layout, panes: { ...layout.panes, [paneId]: { ...pane, ...step.view } } }));
    this.history = { stacks: step.history.stacks, last: this.history.last };
    this.emit();
  }
  /** ↺: the pane's panel at its defaults. */
  reset(paneId: string) {
    const pane = this.pane(paneId);
    if (pane?.kind !== "panel") return;
    this.edit(layout => ({ ...layout, panes: { ...layout.panes, [paneId]: { ...pane, ...resetView(pane) } } }));
  }

  // ----- dockview-only operations -----
  maximise(paneId: string) {
    const panel = this.api?.getPanel(paneId);
    if (!panel) return;
    if (panel.api.isMaximized()) panel.api.exitMaximized(); else panel.api.maximize();
  }
  /** Bring a pane to the player: dockview activates it; the phone's stacked layout scrolls to it (onReveal). */
  activate(paneId: string) {
    this.api?.getPanel(paneId)?.api.setActive();
    for (const listener of this.revealListeners) listener(paneId);
  }
  private revealListeners = new Set<(paneId: string) => void>();
  onReveal = (listener: (paneId: string) => void) => { this.revealListeners.add(listener); return () => { this.revealListeners.delete(listener); }; };

  // ----- sync machinery -----
  private dispatch(event: SyncEvent, quiet = false) {
    const before = this.sync.local;
    this.sync = syncReducer(this.sync, event);
    if (this.sync.local !== before) {
      // The first server layout replaces the boot cache: not an assistant change to undo.
      this.history = observe(this.history, quiet ? null : before, this.sync.local);
      // A replay's dock (canWrite off) keeps its changes to itself: never the room's boot cache.
      if (this.options.canWrite) try { localStorage.setItem(cacheKey(this.roomId), JSON.stringify(this.sync.local)); } catch { /* a boot cache only */ }
    }
    this.emit();
  }
  private schedule(delay: number) {
    if (!pushPlan(this.sync)) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), delay);
  }
  private async flush() {
    const plan = pushPlan(this.sync);
    if (!plan || !this.pusher) return;
    this.dispatch({ type: "push-start" });
    try {
      const result = await this.pusher(plan.layout, plan.ifUpdatedAt);
      if ((this.sync.latest?.updatedAt ?? 0) <= result.updatedAt) this.raw = result.layout;
      this.dispatch({ type: "push-ok", layout: this.parse(result.layout), updatedAt: result.updatedAt });
      this.schedule(PUSH_SOON_MS);
    } catch (error) {
      if (codeOf(error) === "CONFLICT") { this.dispatch({ type: "push-conflict" }); this.schedule(PUSH_SOON_MS); }
      else { this.dispatch({ type: "push-failed" }); this.schedule(RETRY_MS); }
    }
  }
  dispose() { clearTimeout(this.timer); this.pusher = undefined; }

  /** Pane ids in reading order with their kinds (for the palette). */
  panes() { return panesOf(this.snapshot.layout); }
}

export const DockContext = createContext<DockStore | null>(null);
export function useDockStore(): DockStore {
  const store = useContext(DockContext);
  if (!store) throw new Error("The dock store is provided by PlayerShell");
  return store;
}
export function useDock(): DockSnapshot {
  const store = useDockStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
