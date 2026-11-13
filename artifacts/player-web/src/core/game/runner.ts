/**
 * The one path for the player's own game commands, shared by every panel and the palette: the same authorised
 * `commands.submit` the assistant's tools use (through the SDK's useActions). One command at a time; the engine's
 * receipt becomes a notice; a transport failure leaves the outcome UNKNOWN and keeps the envelope, so the banner
 * under the header retries exactly the same command (a summon is never paid twice). Validate and summon wait for the
 * sandbox, so they have a deadline (command-deadline.ts): while the game is busy checking agents the same envelope is
 * sent again a few times, then the forge says so beside one "Try again" and works again.
 *
 * The forge's draft (source, language, edit mode, last validation) lives here too, so the palette's "Write agent
 * code…" and the agents panel's "Edit a copy" reach the same editor. State survives hot updates of the panels.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Language } from "@workspace/game-core";
import { GAME_COMMANDS, VERSION, type Command, type CommandResult, type Envelope } from "@workspace/player-client";
import { useActions, useDockState } from "@/sdk";
import { errorText, noticeStore } from "@/core/notices";
import { BUSY_ATTEMPTS, BUSY_RETRY_MS, busyMessage, createAttempts, deadlineFor, headerNotice, isBusy, receiptNotice, type Examined } from "./command-deadline";

export type Lang = Language;
export type Unknown = { envelope: Envelope; error: string };
export type Validation = { source: string; language: Lang; result: CommandResult };
export type RunnerState = {
  busy: Command["type"] | null;
  notice: { ok: boolean; text: string } | null;
  unknown: Unknown | null;
  /** Which try of a validate or summon is in flight while the game is busy checking agents (the forge says so). */
  retrying: { attempt: number; of: number } | null;
  /** A validate or summon given up after every try: the forge's one "Try again" sends this same envelope again. */
  failed: Envelope | null;
  validation: Validation | null;
  /**
   * The forge editor's draft. `language` is null until the player picks one or edits an agent; the forge shows it when
   * the game allows it, else the game's first allowed language (core/game/language.ts).
   */
  draft: { source: string; language: Lang | null };
  editing: boolean;
  /**
   * "Summon my first agent" was pressed outside the forge (the planning banner, an empty pane): the editor, once it is
   * showing, summons the untouched example or leads to its Summon button (panels/first-agent.ts firstSummonStep), and
   * takes the request. A number so a second press is a new request.
   */
  firstSummon: number;
};

let state: RunnerState = { busy: null, notice: null, unknown: null, retrying: null, failed: null, validation: null, draft: { source: "", language: null }, editing: false, firstSummon: 0 };
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
  requestFirstSummon() { set({ firstSummon: state.firstSummon + 1, editing: true }); },
  takeFirstSummon() { if (state.firstSummon) set({ firstSummon: 0 }); },
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
  const send = useCallback(async (envelope: Envelope, say?: string): Promise<CommandResult | undefined> => {
    const command = envelope.command;
    set({ busy: command.type, notice: null, failed: null, retrying: null });
    const examined = command.type === "validate" || command.type === "summon";
    let outcome = await attempts.run(() => actions.retry(envelope), deadlineFor(command.type));
    // The game is busy checking agents: the SAME envelope goes again by itself (its command id makes a second arrival
    // a no-op, so a summon is never paid twice), with the try said in the forge.
    for (let attempt = 2; examined && isBusy(outcome) && attempt <= BUSY_ATTEMPTS; attempt++) {
      set({ retrying: { attempt, of: BUSY_ATTEMPTS } });
      const waited = await attempts.run(() => new Promise<void>(resolve => setTimeout(resolve, BUSY_RETRY_MS)), null);
      if (waited.status === "stale") return undefined;
      outcome = await attempts.run(() => actions.retry(envelope), deadlineFor(command.type));
    }
    // A newer attempt began meanwhile: the state (busy included) is that one's.
    if (outcome.status === "stale") return undefined;
    if (outcome.status === "done") {
      const result = outcome.value;
      // A failed validation lists its diagnostics in the forge; they are not repeated as a notice.
      const notice = receiptNotice(command.type, result);
      set({
        busy: null, unknown: null, retrying: null, notice,
        ...(command.type === "validate" && result.validation ? { validation: { source: command.source, language: command.language, result } } : {}),
      });
      // The forge shows its own notices; anything else is said under the header.
      if (!examined && !(command.type === "chat" && result.accepted)) noticeStore.push(headerNotice(command.type, result, say), result.accepted ? "info" : "error");
      return result;
    }
    // Still busy after every try: the forge says so in plain words beside one "Try again" (the same envelope), and its
    // buttons work again. Whatever an abandoned request answers later is never read.
    if (examined && isBusy(outcome)) {
      set({ busy: null, retrying: null, unknown: null, failed: envelope, notice: { ok: false, text: busyMessage(command.type as Examined) } });
      return undefined;
    }
    // The engine could not run it, or the connection failed: the outcome is unknown, and the envelope is kept for an
    // identical retry under the header (a summon is never paid twice).
    const text = errorText(outcome.status === "failed" ? outcome.error : "No answer");
    set({ busy: null, retrying: null, ...(examined ? { notice: { ok: false, text } } : {}), unknown: { envelope, error: text } });
    return undefined;
  }, [actions]);
  /** `say`: what an accepted command did, in the caller's words (it knows the names), for the notice under the header. */
  const run = useCallback((command: Command, say?: string) => {
    if (state.busy) return Promise.resolve(undefined);
    const envelope: Envelope = {
      version: VERSION, commandId: crypto.randomUUID(), command,
      ...(GAME_COMMANDS.includes(command.type) && gameId ? { gameId } : {}),
    };
    return send(envelope, say);
  }, [send, gameId]);
  const retry = useCallback((envelope: Envelope) => send(envelope), [send]);
  return useMemo(() => ({ run, retry, canAct: actions.canAct }), [run, retry, actions.canAct]);
}
