/**
 * Live queries that have failed, kept so that ONE failed query takes down one pane and not the page. A failed
 * subscription hands its consumer "not loaded" instead of throwing through the root; it is held here (for consumers
 * outside any pane: the header, the dock's own state) or in its pane's own record, the dock or the pane says so in one
 * line, and the hold is released when the subscription next delivers a value or its consumer goes away. Nothing here
 * retries or polls: a live Convex subscription re-delivers by itself when its data changes or the connection returns.
 * Many components share one subscription, so a failure is counted per holder and cleared when the last lets go. The
 * state changes are pure, so they are unit-tested.
 */
export interface QueryErrors { readonly failed: ReadonlyMap<string, { readonly message: string; readonly holders: number }> }
export const NO_ERRORS: QueryErrors = { failed: new Map() };

/** One more consumer has `key` failing with `message`. */
export function holdError(state: QueryErrors, key: string, message: string): QueryErrors {
  const held = state.failed.get(key);
  return { failed: new Map(state.failed).set(key, { message, holders: (held?.holders ?? 0) + 1 }) };
}
/** One consumer of `key` lets go (it got a value, or unmounted): cleared when it was the last. The same state back when nobody held it. */
export function releaseError(state: QueryErrors, key: string): QueryErrors {
  const held = state.failed.get(key);
  if (!held) return state;
  const failed = new Map(state.failed);
  if (held.holders > 1) failed.set(key, { ...held, holders: held.holders - 1 }); else failed.delete(key);
  return { failed };
}

/**
 * Whether a failure will not go away by trying again, and why. The viewer is signed out (UNAUTHENTICATED), lost
 * access (FORBIDDEN, NOT_FOUND), or one of two ordinary states the engine reports as an error (player.ts seatedGame):
 * the room has no game yet (the live subscription fills in when one starts), or the viewer is not seated in the game
 * (they watch; the data is for its players). Each gets its own true sentence; none says "it comes back by itself"
 * except the one where that is so.
 */
export type Lasting = "signedOut" | "access" | "notSeated" | "noGame";
export function lasting(message: string): Lasting | null {
  if (/UNAUTHENTICATED|not signed in/i.test(message)) return "signedOut";
  if (/no game in this room yet/i.test(message)) return "noGame";
  if (/not seated in/i.test(message)) return "notSeated";
  if (/FORBIDDEN|NOT_FOUND/i.test(message)) return "access";
  return null;
}
const ORDER: readonly Lasting[] = ["signedOut", "access", "notSeated", "noGame"];
const worst = (messages: readonly string[]): Lasting | null => { const kinds = new Set(messages.map(lasting)); return ORDER.find(k => kinds.has(k)) ?? null; };

/** The one line the dock shows while something outside the panes has failed; null when nothing has. `dock.state` gets its own words: the layout and the phase come from it. */
export function errorsLine(state: QueryErrors): string | null {
  if (!state.failed.size) return null;
  const kind = worst([...state.failed.values()].map(f => f.message));
  if (kind === "signedOut") return "You are signed out. Sign in again to see this game.";
  if (kind === "access") return "You no longer have access to this game.";
  if (kind === "notSeated") return "You are watching, not playing: some of this is for the game's players.";
  if (kind === "noGame") return "There is no game in this room yet. This fills in by itself when a game starts.";
  return [...state.failed.keys()].some(key => key.startsWith("dock.state"))
    ? "The game's state could not load, so this shows the default layout for now. It comes back by itself when the game sends new data."
    : "Some live data could not load. It comes back by itself when the game sends new data.";
}
/** The line a pane shows above its content while one of its own queries has failed (their messages); null when none has. */
export function paneErrorLine(messages: readonly string[]): string | null {
  if (!messages.length) return null;
  const kind = worst(messages);
  if (kind === "signedOut") return "This pane could not load: you are signed out. Sign in again to see it.";
  if (kind === "access") return "This pane could not load: you no longer have access to this game.";
  if (kind === "notSeated") return "You are watching, not playing: this pane is for the game's players.";
  if (kind === "noGame") return "There is no game in this room yet. This pane fills in by itself when a game starts.";
  return "This pane could not load. It comes back by itself when the game sends new data.";
}

/** Where a consumer records its failed query: the dock's record here, or its pane's own (pane-error-context.ts). */
export interface ErrorRecord { hold(key: string, message: string): void; release(key: string): void }

let state = NO_ERRORS;
const listeners = new Set<() => void>();
const set = (next: QueryErrors) => { if (next !== state) { state = next; for (const l of listeners) l(); } };
export const queryErrors: ErrorRecord & { subscribe(listener: () => void): () => void; get(): QueryErrors } = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  hold(key, message) { set(holdError(state, key, message)); },
  release(key) { set(releaseError(state, key)); },
};
