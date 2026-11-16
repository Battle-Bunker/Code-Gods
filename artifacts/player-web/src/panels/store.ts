/**
 * The file panels' registry state (v1's shell/panel-store.ts), in a module no panel and not the registry edits, so it
 * survives hot updates: when src/panels/ changes, Vite re-executes ./registry.ts, which republishes here. React
 * subscribes with useSyncExternalStore.
 */
import { useSyncExternalStore } from "react";

export interface FilePanelEntry {
  /** Path relative to src/panels, e.g. "my-bits.tsx". */
  file: string;
  /** The file name without its extension: the pane is `file:<id>`. */
  id: string;
  /** Loads the module; re-created on every registry update (an unchanged module resolves to the same module object). */
  load: () => Promise<unknown>;
}

interface State {
  entries: readonly FilePanelEntry[];
  /** Bumped on every registry update: a pane re-imports its module and swaps it only if it changed. */
  generation: number;
  /** Compile errors Vite reported for a panel file. */
  buildErrors: Readonly<Record<string, string>>;
  /** A dev server's last hot update of each panel file (its timestamp): the pane imports exactly that version. */
  stamps: Readonly<Record<string, number>>;
}

let state: State = { entries: [], generation: 0, buildErrors: {}, stamps: {} };
const listeners = new Set<() => void>();
const emit = (next: State) => { state = next; for (const listener of listeners) listener(); };

export const filePanelStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  publish(entries: readonly FilePanelEntry[]) { emit({ ...state, entries, generation: state.generation + 1 }); },
  updated(file: string, timestamp: number) { emit({ ...state, stamps: { ...state.stamps, [file]: timestamp }, generation: state.generation + 1 }); },
  buildError(file: string, message: string) { emit({ ...state, buildErrors: { ...state.buildErrors, [file]: message } }); },
  clearBuildError(file: string) {
    if (!(file in state.buildErrors)) return;
    const { [file]: _cleared, ...buildErrors } = state.buildErrors;
    emit({ ...state, buildErrors });
  },
};

export const useFilePanels = () => useSyncExternalStore(filePanelStore.subscribe, filePanelStore.get, filePanelStore.get);
