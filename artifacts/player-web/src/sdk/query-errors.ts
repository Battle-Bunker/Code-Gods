/**
 * Live queries that have failed, kept so that ONE failed query takes down one pane and not the page. A failed
 * subscription hands its consumer "not loaded" (and, inside a pane, throws to that pane's own boundary) instead of
 * throwing through the root; it is recorded here, the dock says so in one line, and the record clears when the
 * subscription next delivers a value. Nothing here retries or polls: a live Convex subscription re-delivers by itself
 * when its data changes or the connection returns. The state changes are pure, so they are unit-tested.
 */
export interface QueryErrors { readonly failed: ReadonlyMap<string, string>; /** How many failed queries have delivered a value again: a pane waiting on one remounts when this rises. */ readonly recovered: number }
export const NO_ERRORS: QueryErrors = { failed: new Map(), recovered: 0 };

/** `key` failed with `message`: the same state back when that is already recorded. */
export function reportError(state: QueryErrors, key: string, message: string): QueryErrors {
  if (state.failed.get(key) === message) return state;
  return { failed: new Map(state.failed).set(key, message), recovered: state.recovered };
}
/** `key` delivered a value: cleared, and counted as recovered when it had failed. The same state back when it had not. */
export function clearError(state: QueryErrors, key: string): QueryErrors {
  if (!state.failed.has(key)) return state;
  const failed = new Map(state.failed);
  failed.delete(key);
  return { failed, recovered: state.recovered + 1 };
}
/** The one line the dock shows while something has failed; null when nothing has. `dock.state` gets its own words: the layout and the phase come from it. */
export function errorsLine(state: QueryErrors): string | null {
  if (!state.failed.size) return null;
  return [...state.failed.keys()].some(key => key.startsWith("dock.state"))
    ? "The game's state could not load, so this shows the default layout for now. It comes back by itself when the game sends new data."
    : "Some live data could not load. It comes back by itself when the game sends new data.";
}
export const PANE_ERROR_LINE = "This pane could not load. It comes back by itself when the game sends new data.";

let state = NO_ERRORS;
const listeners = new Set<() => void>();
const set = (next: QueryErrors) => { if (next !== state) { state = next; for (const l of listeners) l(); } };
export const queryErrors = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  report(key: string, message: string) { set(reportError(state, key, message)); },
  clear(key: string) { set(clearError(state, key)); },
};
