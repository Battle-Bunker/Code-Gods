/**
 * The human's stored view state in a room, from `v2/layout:current` (`{layout, view, revision}`, or null before they
 * have one): the view operations' state is the row's `view`, written by `v2/ops/view` for every client and delegate.
 */
import { EMPTY_VIEW, type ViewState } from "@workspace/v2-affordances";

export function storedViewOf(row: { view?: unknown } | null | undefined): ViewState {
  return (row?.view as ViewState | null | undefined) ?? EMPTY_VIEW;
}
