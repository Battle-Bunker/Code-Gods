/**
 * The human's stored view state in a room, from `v2/layout:current` (`{layout, view, revision}`, or null before they
 * have one): the view operations' state is the row's `view`, written by `v2/ops/view` for every client and delegate.
 */
import { EMPTY_VIEW, readView, type ViewState } from "@workspace/v2-affordances";

export function storedViewOf(row: { view?: unknown } | null | undefined): ViewState {
  // Loaded with no stored view yet: an empty view of its own, so a screen can tell it from the one drawn while loading.
  const view = row?.view as ViewState | null | undefined;
  return view ? readView(view) : row === undefined ? EMPTY_VIEW : NO_STORED_VIEW;
}
/** The view of a room whose stored view has loaded and is empty (equal to EMPTY_VIEW, but not the same object). */
export const NO_STORED_VIEW: ViewState = { ...EMPTY_VIEW };
/** Whether this is the empty view drawn before the stored one has loaded (not a view anyone chose). */
export const isLoadingView = (v: ViewState) => v === EMPTY_VIEW;

/** What the screen shows: a local change while it is ahead of the stored view, else the stored view. */
export function shownView(local: ViewState | null, stored: ViewState): ViewState {
  return local && local.version > stored.version ? local : stored;
}

/**
 * The local view after the server refused or failed the change `applied`. With nothing on top of it
 * the change just goes (null: the stored view shows). When a newer local change was made on top of it (a "watch as" sent
 * while a seek was in flight), that one stays, one version lower: the server stores one change fewer, so its view takes
 * over as soon as the newer change commits, without the failed one.
 */
export function undoFailed(current: ViewState, applied: ViewState): ViewState | null {
  return current === applied ? null : { ...current, version: current.version - 1 };
}
