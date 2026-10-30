/**
 * The panel registry's state, in a module that panels and the registry never edit, so it survives hot
 * updates: when src/panels/ changes, Vite re-executes registry.ts, which republishes here. React
 * subscribes with useSyncExternalStore.
 */
export type PanelEntry = {
  /** Path relative to src/panels, e.g. "my-bits.tsx". */
  file: string;
  /** Default id: the file name without extension. */
  id: string;
  /** Loads the module. Re-created on every registry update; an unchanged module resolves to the same module object. */
  load: () => Promise<unknown>;
};

type State = {
  entries: PanelEntry[];
  /** Bumped on every registry update: frames re-import and swap only if their module changed. */
  generation: number;
  /** Compile errors Vite reported for a panel file. */
  buildErrors: Readonly<Record<string, string>>;
};

let state: State = { entries: [], generation: 0, buildErrors: {} };
const listeners = new Set<() => void>();
const emit = (next: State) => { state = next; for (const listener of listeners) listener(); };

export const panelStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get: () => state,
  publish(entries: PanelEntry[]) {
    emit({ ...state, entries, generation: state.generation + 1 });
  },
  buildError(file: string, message: string) {
    emit({ ...state, buildErrors: { ...state.buildErrors, [file]: message } });
  },
  clearBuildError(file: string) {
    if (!(file in state.buildErrors)) return;
    const { [file]: _cleared, ...buildErrors } = state.buildErrors;
    emit({ ...state, buildErrors });
  },
};
