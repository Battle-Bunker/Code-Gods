/**
 * The player client's screen: the header, the dock of panes and, over them, the panel confirmations and the palette.
 * PlayerShell owns the dock store for the room and keeps it in step with the engine: `layout.current` comes in
 * (parsed), `layout.set` goes out with ifUpdatedAt; the phase and the panel registry feed parseLayout. At 768 px and
 * wider the dockview dock is loaded; below, the stacked renderer (dockview is never downloaded on phones).
 *
 * Keys: Cmd/Ctrl+K opens the palette everywhere; `/` focuses the assistant's composer and `?` opens the palette when
 * no input has focus; Ctrl+` focuses the assistant.
 */
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useRoom } from "@/sdk";
import { Confirmations } from "@/shell/confirmations";
import { SAFE_MODE } from "@/shell/safe-mode";
import { Header, HeaderBanners } from "@/core/header";
import { composer } from "@/core/chat/composer";
import { useSituation } from "@/core/game/situation";
import { paletteStore } from "@/core/palette/store";
import { useWide } from "@/core/use-wide";
import { dockActions } from "./actions";
import { PanelsProvider, usePanelRegistry, type Panels } from "./panels";
import StackedDock from "./stacked";
import { DockContext, DockStore, useDockStore } from "./store";

const DesktopDock = lazy(() => import("./desktop"));

/** Counts real input as human activity (at most once a minute): it keeps the engine from idle-parking. */
function useHumanActivity() {
  const touch = useMutation(api.activity.touch);
  useEffect(() => {
    let last = 0;
    const onInput = (event: Event) => {
      if (!event.isTrusted || Date.now() - last < 60_000) return;
      last = Date.now();
      void touch({}).catch(() => {});
    };
    window.addEventListener("pointerdown", onInput); window.addEventListener("keydown", onInput);
    return () => { window.removeEventListener("pointerdown", onInput); window.removeEventListener("keydown", onInput); };
  }, [touch]);
}

const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};
function useShortcuts(store: DockStore) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); paletteStore.open(store.getSnapshot().focused); return; }
      if (e.ctrlKey && e.key === "`") { e.preventDefault(); composer.focus(); return; }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); composer.focus(); }
      else if (e.key === "?") { e.preventDefault(); paletteStore.open(store.getSnapshot().focused); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);
}

const SEEN_KEY = "cg.filePanels.seen";
const readSeen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]); } catch { return new Set(); } };
/** A file panel the player has never seen in this browser opens as a pane by itself (a new src/panels file appears live). */
function useNewFilePanels(store: DockStore, fileIds: readonly string[] | undefined, loaded: boolean) {
  useEffect(() => {
    if (!fileIds || !loaded) return;
    const seen = readSeen();
    const fresh = fileIds.filter(id => !seen.has(id));
    if (!fresh.length) return;
    const actions = dockActions(store);
    for (const id of fresh) { actions.openFile(id); seen.add(id); }
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* opens again next time */ }
  }, [store, fileIds, loaded]);
}

export function PlayerShell() {
  const room = useRoom();
  const panels = usePanelRegistry();
  // The registry is published at import, so the file panels are known for the first parse.
  const store = useMemo(() => new DockStore(room.roomId, { canWrite: !SAFE_MODE, fileIds: panels.fileIds }), [room.roomId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => store.dispose(), [store]);
  return (
    <DockContext.Provider value={store}>
      <PanelsProvider value={panels}>
        <Screen panels={panels} />
      </PanelsProvider>
    </DockContext.Provider>
  );
}

function Screen({ panels }: { panels: Panels }) {
  useHumanActivity();
  const { roomId } = useRoom();
  const store = useDockStore();
  const wide = useWide();
  const { phase, obs } = useSituation();
  const current = useQuery(api.layout.current, { roomId });
  const setLayout = useMutation(api.layout.set);
  useShortcuts(store);

  useEffect(() => { store.setPusher((layout, ifUpdatedAt) => setLayout({ roomId, layout, ...(ifUpdatedAt !== undefined ? { ifUpdatedAt } : {}) })); return () => store.setPusher(undefined); }, [store, setLayout, roomId]);
  useEffect(() => { store.setPhase(obs?.phase ?? current?.phase ?? phase); }, [store, obs?.phase, current?.phase, phase]);
  useEffect(() => { store.setPanels(SAFE_MODE ? [] : panels.stored ? panels.stored.filter(p => p.enabled).map(p => p.slug) : null, panels.fileIds); }, [store, panels.stored, panels.fileIds]);
  useEffect(() => { if (current) store.server(current.layout, current.updatedAt); }, [store, current]);
  useNewFilePanels(store, panels.fileIds, current !== undefined);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <Header />
      <HeaderBanners />
      <main data-testid="dock" className="min-h-0 flex-1">
        {wide ? <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading the dock…</p>}><DesktopDock /></Suspense> : <StackedDock />}
      </main>
      <Confirmations entries={panels.entries} />
    </div>
  );
}
