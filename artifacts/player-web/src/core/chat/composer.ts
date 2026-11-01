/**
 * The assistant composer's shared state: what is typed (so the palette's hand-offs, "Ask about this view" and an
 * object clicked in a panel can pre-fill it, never send it), focus and collapse requests, the chosen conversation, the
 * permission the next message asks for, and the status word the pane header shows. The chosen conversation is the
 * current game's only: the assistant's context is per (player, game), so the next game starts from none (enterGame).
 */
import { useSyncExternalStore } from "react";

export type Permission = "read" | "act" | "owner";
export type ComposerState = {
  draft: string;
  /** Bumped to ask the composer to take focus / the pane to shrink to its composer. */
  focusTick: number;
  collapseTick: number;
  /** The conversation shown: an id, "new" for a fresh one, or null for the latest. */
  thread: string | null;
  /** The game `thread` was chosen in (assistant.status allowance.epoch), or null before the pane has seen one. */
  game: string | null;
  /** The permission the next message asks for (null: the credential's, or act on first use). */
  permission: Permission | null;
  ownerConsent: boolean;
  /** "thinking…", "waiting for you", "off" or "" — the assistant pane header's status word. */
  status: string;
};

let state: ComposerState = { draft: "", focusTick: 0, collapseTick: 0, thread: null, game: null, permission: null, ownerConsent: false, status: "" };
const listeners = new Set<() => void>();
function set(patch: Partial<ComposerState>) { state = { ...state, ...patch }; for (const l of listeners) l(); }

export const composer = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  setDraft(draft: string) { set({ draft }); },
  /** Pre-fill (replacing an empty draft, else appending) and focus; never sends. */
  fill(text: string) { set({ draft: state.draft.trim() ? `${state.draft.trimEnd()} ${text}` : text, focusTick: state.focusTick + 1 }); },
  focus() { set({ focusTick: state.focusTick + 1 }); },
  collapse() { set({ collapseTick: state.collapseTick + 1 }); },
  setThread(thread: string | null) { set({ thread }); },
  /** The room's game now: a different one than the choice was made in drops the choice. */
  enterGame(game: string) { if (game !== state.game) set(state.game === null ? { game } : { game, thread: null }); },
  setPermission(permission: Permission) { set({ permission }); },
  setOwnerConsent(ownerConsent: boolean) { set({ ownerConsent }); },
  setStatus(status: string) { if (status !== state.status) set({ status }); },
};

/** The conversation chosen for this game, or null (the latest of this game). */
export const threadFor = (s: ComposerState, game: string | null) => game !== null && (s.game === null || s.game === game) ? s.thread : null;

export function useComposer(): ComposerState {
  return useSyncExternalStore(composer.subscribe, composer.get, composer.get);
}
