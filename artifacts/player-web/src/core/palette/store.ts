/**
 * Whether the command palette is open, and for which pane (captured when it opens, so "this pane" commands act on
 * the pane the player was in, not on the palette's own input). Cmd/Ctrl+K, the header trigger, the assistant-off
 * composer and the overview's owner steps open it.
 */
import { useSyncExternalStore } from "react";

export type PaletteState = { open: boolean; query?: string; scopePaneId: string | null };
let state: PaletteState = { open: false, scopePaneId: null };
const listeners = new Set<() => void>();
const set = (next: PaletteState) => { state = next; for (const l of listeners) l(); };

export const paletteStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  open(scopePaneId: string | null, query?: string) { set({ open: true, query, scopePaneId }); },
  close() { if (state.open) set({ ...state, open: false }); },
};
export const usePaletteState = () => useSyncExternalStore(paletteStore.subscribe, paletteStore.get, paletteStore.get);
