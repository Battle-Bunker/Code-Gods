/**
 * The one path for the player's own game commands, shared by every panel and the palette: the same authorised
 * `commands.submit` the assistant's tools use (through the SDK's useActions). One command at a time; the engine's
 * receipt becomes a notice; a transport failure leaves the outcome UNKNOWN and keeps the envelope, so the banner
 * under the header retries exactly the same command (a summon is never paid twice). Validate and summon wait for the
 * sandbox, so they have a deadline (command-deadline.ts): past it the forge says the sandbox is busy and works again.
 *
 * The forge's draft (source, language, edit mode, last validation) lives here too, so the palette's "Write agent
 * code…" and the agents panel's "Edit a copy" reach the same editor. State survives hot updates of the panels.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Language } from "@workspace/game-core";
import { GAME_COMMANDS, VERSION, type Command, type CommandResult, type Envelope } from "@workspace/player-client";
import { useActions, useDockState } from "@/sdk";
import { errorText, noticeStore } from "@/core/notices";
import { busyMessage, createAttempts, deadlineFor, receiptNotice, type Examined } from "./command-deadline";

export type Lang = Language;
export type Unknown = { envelope: Envelope; error: string };
export type Validation = { source: string; language: Lang; result: CommandResult };
export type RunnerState = {
  busy: Command["type"] | null;
  notice: { ok: boolean; text: string } | null;
  unknown: Unknown | null;
  validation: Validation | null;
  /**
   * The forge editor's draft. `language` is null until the player picks one or edits an agent; the forge shows it when
   * the game allows it, else the game's first allowed language (core/game/language.ts).
   */
  draft: { source: string; language: Lang | null };
  editing: boolean;
};

let state: RunnerState = { busy: null, notice: null, unknown: null, validation: null, draft: { source: "", language: null }, editing: false };
const listeners = new Set<() => void>();
/** One command at a time, each with its deadline; only the latest attempt's outcome reaches the state. */
const attempts = createAttempts();
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
  const gameId = useDockState({ hz: 1 })?.gameId;
  const send = useCallback(async (envelope: Envelope): Promise<CommandResult | undefined> => {
    const command = envelope.command;
    set({ busy: command.type, notice: null });
    const examined = command.type === "validate" || command.type === "summon";
    const outcome = await attempts.run(() => actions.retry(envelope), deadlineFor(command.type));
    // A newer attempt began meanwhile: the state (busy included) is that one's.
    if (outcome.status === "stale") return undefined;
    if (outcome.status === "done") {
      const result = outcome.value;
      // A failed validation lists its diagnostics in the forge; they are not repeated as a notice.
      const notice = receiptNotice(command.type, result);
      set({
        busy: null, unknown: null, notice,
        ...(command.type === "validate" && result.validation ? { validation: { source: command.source, language: command.language, result } } : {}),
      });
      // The forge shows its own notices; anything else is said under the header.
      if (!examined && !(command.type === "chat" && result.accepted)) noticeStore.push(result.message || (result.accepted ? "Accepted." : "Rejected."), result.accepted ? "info" : "error");
      return result;
    }
    // No answer by the deadline (a congested sandbox queue), or the engine could not run it: the forge says so and its
    // buttons work again. Whatever the abandoned request answers later is never read.
    const text = outcome.status === "timeout" ? busyMessage(command.type as Examined, deadlineFor(command.type)!) : errorText(outcome.error);
    set({
      busy: null,
      ...(examined ? { notice: { ok: false, text } } : {}),
      // A validation changes nothing, so a timed-out one is simply run again. Anything else may still have arrived: its
      // outcome is unknown, and the envelope is kept for an identical retry (a summon is never paid twice).
      ...(outcome.status === "timeout" && command.type === "validate" ? {} : { unknown: { envelope, error: text } }),
    });
    return undefined;
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
