/**
 * The assistant composer's shared state: what is typed (so the palette's hand-offs, "Ask about this view" and an
 * object clicked in a panel can pre-fill it, never send it), focus and collapse requests, the chosen conversation, the
 * permission the next message asks for, and the status word the pane header shows. The chosen conversation is kept
 * per game (the assistant's context is per (player, game)): it is read with the game the pane shows, so a choice made
 * in one game can never select a conversation in another, and the next game starts from none.
 */
import { useSyncExternalStore } from "react";

export type Permission = "read" | "act" | "owner";
export type ComposerState = {
  draft: string;
  /** Bumped to ask the composer to take focus / the pane to shrink to its composer. */
  focusTick: number;
  collapseTick: number;
  /** The conversation chosen in each game (assistant.status game → a thread id, or "new" for a fresh one); a game
   * without an entry shows its latest. */
  threads: Readonly<Record<string, string>>;
  /** The permission the next message asks for (null: the credential's, or act on first use). */
  permission: Permission | null;
  ownerConsent: boolean;
  /** "thinking…", "waiting for you", "off" or "" — the assistant pane header's status word. */
  status: string;
};

let state: ComposerState = { draft: "", focusTick: 0, collapseTick: 0, threads: {}, permission: null, ownerConsent: false, status: "" };
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
  /** Choose the conversation shown in `game` (null: its latest). */
  setThread(game: string, thread: string | null) {
    const { [game]: _old, ...rest } = state.threads;
    set({ threads: thread === null ? rest : { ...rest, [game]: thread } });
  },
  setPermission(permission: Permission) { set({ permission }); },
  setOwnerConsent(ownerConsent: boolean) { set({ ownerConsent }); },
  setStatus(status: string) { if (status !== state.status) set({ status }); },
};

/** The conversation chosen in this game: an id, "new", or null for the game's latest. */
export const threadIn = (s: ComposerState, game: string) => s.threads[game] ?? null;

export function useComposer(): ComposerState {
  return useSyncExternalStore(composer.subscribe, composer.get, composer.get);
}
