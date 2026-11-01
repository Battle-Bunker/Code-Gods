/**
 * The one path for the player's own game commands, shared by every panel and the palette: the same authorised
 * `commands.submit` the assistant's tools use (through the SDK's useActions). One command at a time; the engine's
 * receipt becomes a notice; a transport failure leaves the outcome UNKNOWN and keeps the envelope, so the banner
 * under the header retries exactly the same command (a summon is never paid twice).
 *
 * The forge's draft (source, language, edit mode, last validation) lives here too, so the palette's "Write agent
 * code…" and the agents panel's "Edit a copy" reach the same editor. State survives hot updates of the panels.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { GAME_COMMANDS, VERSION, type Command, type CommandResult, type Envelope } from "@workspace/player-client";
import { useActions, useObservation } from "@/sdk";
import { errorText, noticeStore } from "@/core/notices";

export type Lang = "python" | "typescript";
export type Unknown = { envelope: Envelope; error: string };
export type Validation = { source: string; language: Lang; result: CommandResult };
export type RunnerState = {
  busy: Command["type"] | null;
  notice: { ok: boolean; text: string } | null;
  unknown: Unknown | null;
  validation: Validation | null;
  /** The forge editor's draft. `language` is null until the player picks one (the room's language is shown). */
  draft: { source: string; language: Lang | null };
  editing: boolean;
};

let state: RunnerState = { busy: null, notice: null, unknown: null, validation: null, draft: { source: "", language: null }, editing: false };
const listeners = new Set<() => void>();
function set(patch: Partial<RunnerState>) { state = { ...state, ...patch }; for (const l of listeners) l(); }

export const runner = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  setDraft(draft: Partial<RunnerState["draft"]>) { set({ draft: { ...state.draft, ...draft } }); },
  setEditing(editing: boolean) { set({ editing }); },
  /** Load code into the editor (the agents panel's "Edit a copy", the assistant's draft) and open edit mode. */
  edit(source: string, language?: Lang) { set({ draft: { source, language: language ?? state.draft.language }, editing: true }); },
  dismissUnknown() { set({ unknown: null }); },
  clearNotice() { set({ notice: null }); },
};

export function useRunner(): RunnerState {
  return useSyncExternalStore(runner.subscribe, runner.get, runner.get);
}


/** Run game commands: `run` builds a fresh envelope; `retry` resends the unknown one unchanged. */
export function useGameCommands() {
  const actions = useActions();
  const gameId = useObservation({ hz: 1 })?.gameId;
  const send = useCallback(async (envelope: Envelope): Promise<CommandResult | undefined> => {
    const command = envelope.command;
    set({ busy: command.type, notice: null });
    try {
      const result = await actions.retry(envelope);
      // A failed validation lists its diagnostics in the forge; don't repeat them as a notice.
      const quiet = command.type === "validate" && !!result.validation?.diagnostics.length;
      const text = result.message || (result.accepted ? "Accepted." : "Rejected.");
      set({
        unknown: null,
        notice: quiet ? null : { ok: result.accepted, text },
        ...(command.type === "validate" && result.validation ? { validation: { source: command.source, language: command.language, result } } : {}),
      });
      // The forge shows its own notices; anything else is said under the header.
      if (command.type !== "validate" && command.type !== "summon" && !(command.type === "chat" && result.accepted)) noticeStore.push(text, result.accepted ? "info" : "error");
      return result;
    } catch (error) {
      // A transport failure leaves the outcome unknown: keep the envelope for an identical retry.
      set({ unknown: { envelope, error: errorText(error) } });
      return undefined;
    } finally { set({ busy: null }); }
  }, [actions]);
  const run = useCallback((command: Command) => {
    if (state.busy) return Promise.resolve(undefined);
    const envelope: Envelope = {
      version: VERSION, commandId: crypto.randomUUID(), command,
      ...(GAME_COMMANDS.includes(command.type) && gameId ? { gameId } : {}),
    };
    return send(envelope);
  }, [send, gameId]);
  return useMemo(() => ({ run, retry: send, canAct: actions.canAct }), [run, send, actions.canAct]);
}
