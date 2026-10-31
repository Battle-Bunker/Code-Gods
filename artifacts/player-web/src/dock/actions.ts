/**
 * The dock actions a human triggers from a lens, a pane header or the palette, bound to the store. Every change goes
 * through store.edit (parseLayout, then a push with ifUpdatedAt); a refused operation becomes a notice.
 */
import { useMemo } from "react";
import { DEFAULT_LAYOUT, PRESET_LAYOUTS, closePane, type DockLayout } from "@workspace/player-client/layout";
import type { LensId } from "@workspace/player-client/lenses";
import { notifyError } from "@/core/notices";
import { composer } from "@/core/chat/composer";
import { runner } from "@/core/game/runner";
import { lastParams } from "./history";
import { addLensNextTo, changeLens, dockAssistant, showLens, showPanel } from "./operations";
import { useDockStore, type DockStore } from "./store";

function attempt(store: DockStore, change: (layout: DockLayout) => DockLayout, after?: () => void) {
  try { store.edit(change); after?.(); } catch (error) { notifyError(error); }
}

export function dockActions(store: DockStore) {
  const focusPane = (find: (layout: DockLayout) => string | undefined) => setTimeout(() => { const id = find(store.layout); if (id) { store.setFocused(id); store.activate(id); } }, 0);
  return {
    show(lensId: LensId) {
      let id: string | undefined;
      attempt(store, layout => { const r = showLens(layout, lensId); id = r.paneId; return r.layout; }, () => focusPane(() => id));
    },
    change(paneId: string, lensId: LensId) {
      attempt(store, layout => changeLens(layout, paneId, lensId, lastParams(store.getSnapshot().history, paneId, lensId)));
    },
    addNextTo(paneId: string) {
      let id: string | undefined;
      attempt(store, layout => { const r = addLensNextTo(layout, paneId, store.getSnapshot().phase); id = r.paneId; return r.layout; }, () => focusPane(() => id));
    },
    close(paneId: string) { attempt(store, layout => closePane(layout, paneId)); },
    dockAssistant(side: "left" | "right" | "bottom") { attempt(store, layout => dockAssistant(layout, side)); },
    preset(name: keyof typeof PRESET_LAYOUTS) { attempt(store, layout => PRESET_LAYOUTS[name](layout)); },
    reset() { attempt(store, () => DEFAULT_LAYOUT(store.getSnapshot().phase)); },
    maximise(paneId: string) { store.maximise(paneId); },
    openPanel(slug: string) { attempt(store, layout => showPanel(layout, { id: "", kind: "stored-panel", slug }).layout); },
    openFile(fileId: string) { attempt(store, layout => showPanel(layout, { id: "", kind: "file-panel", fileId }).layout); },
    /** The forge lens in edit mode (the palette's "Write agent code…", the overview's next step, "Edit a copy"). */
    forgeEdit(source?: string, language?: "python" | "typescript") {
      if (source !== undefined) runner.edit(source, language); else runner.setEditing(true);
      this.show("forge");
    },
    /** "Ask about this view": the composer gets a start, the player finishes the question. */
    askAbout(title: string) { composer.fill(`About the ${title} view: `); },
  };
}
export type DockActions = ReturnType<typeof dockActions>;

export function useDockActions(): DockActions {
  const store = useDockStore();
  return useMemo(() => dockActions(store), [store]);
}
