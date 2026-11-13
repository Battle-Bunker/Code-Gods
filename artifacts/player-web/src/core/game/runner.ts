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

import { bothText, pendingReplaceOnReceipt, pendingReplaceOnSend, putBackText, replaceStep, replacedText, type PendingReplace, type PreviousVersion } from "@/core/panels/first-agent";
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
   * takes the request. The time of the press (0: none), so a request never outlives its click (firstSummonStep).
   */
  firstSummon: number;
  /**
   * The editor holds code the player wrote or changed (not empty, not the untouched example): the forge's Editor says
   * so while it is mounted, and loading other code into the editor (`edit`) sets it. The next step reads it.
   */
  ownDraft: boolean;
  /**
   * The id of the player's agent the draft started from (its code was in the editor, edited or not), or null: an
   * edited draft of it is offered as a replacement (panels/first-agent.ts draftOrigin). Kept here so it outlives the pane.
   */
  origin: string | null;
  /**
   * A replace in flight (panels/first-agent.ts PendingReplace): its summon's command id and the agent to destroy once
   * that summon is accepted, on whichever path the receipt arrives (the first send, "Try again", "Retry the same
   * command"). Abandoned by any other command, a refusal, a dismissal or its age; then nothing is destroyed.
   */
  replace: PendingReplace | null;
  /** How the last replace ended, for the forge: said only while the editor still holds the code it was for. */
  replaced: { ok: boolean; text: string; source: string } | null;
  /**
   * The version the last replace replaced (its code, name, share and what its moves had earned), remembered for this
   * page: My agents compares the two versions and offers "Put the previous version back" (a replace with that code).
   */
  previous: PreviousVersion | null;
  /** "See it in My agents": the agent whose row My agents brings into view and rings (a number so a second press is a new request). */
  reveal: { agentId: string; at: number } | null;
  /** An act line was pressed: the object whose detail ("why") the Objects panel opens. */
  revealObject: { objectId: string; at: number } | null;
};

let state: RunnerState = { busy: null, notice: null, unknown: null, retrying: null, failed: null, validation: null, draft: { source: "", language: null }, editing: false, firstSummon: 0, ownDraft: false, origin: null, replace: null, replaced: null, previous: null, reveal: null, revealObject: null };
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
  /**
   * `origin`: the id of the player's agent this code is (My agents' "Edit a copy"), so a changed draft of it is
   * offered as its replacement. Code loaded with no origin (a draft, a template) is nobody's new version.
   */
  edit(source: string, language?: Lang, origin?: string) { set({ draft: { source, language: language ?? state.draft.language }, editing: true, ownDraft: source.trim().length > 0, origin: origin ?? null }); },
  showObject(objectId: string) { set({ revealObject: { objectId, at: Date.now() } }); },
  revealAgent(agentId: string) { set({ reveal: { agentId, at: Date.now() } }); },
  clearPrevious() { if (state.previous) set({ previous: null }); },
  /** The new version's agent, once the agent list shows it (panels/first-agent.ts previousTarget). */
  /** The remembered agent's first counted moves, as they accumulate (score-line.ts accumulateFirstMoves). */
  setPreviousSince(since: NonNullable<PreviousVersion["since"]>) { if (state.previous && state.previous.since !== since) set({ previous: { ...state.previous, since } }); },
  adoptPrevious(agentId: string) { if (state.previous && state.previous.agentId !== agentId) set({ previous: { ...state.previous, agentId } }); },
  setOrigin(origin: string | null) { if (state.origin !== origin) set({ origin }); },
  setOwnDraft(ownDraft: boolean) { if (state.ownDraft !== ownDraft) set({ ownDraft }); },
  /** Ignored while a summon is in flight: a second press can never buy a second copy. */
  requestFirstSummon() {
    if (state.busy === "summon") return;
    const at = Date.now();
    set({ firstSummon: at, editing: true });
    // Whatever happens to the editor, no request is left standing (the buttons would say "Getting ready…" for ever).
    setTimeout(() => { if (state.firstSummon === at) set({ firstSummon: 0 }); }, 60_000);
  },
  /** `olderThanMs`: only a request at least that old (an editor going away leaves a fresh one for the editor that opens). */
  takeFirstSummon(olderThanMs = 0) { if (state.firstSummon && Date.now() - state.firstSummon >= olderThanMs) set({ firstSummon: 0 }); },
  /** "It didn't apply": an uncertain replace summon is given up with it, so nothing is destroyed later. */
  dismissUnknown() { set({ unknown: null, ...(state.replace && state.unknown?.envelope.commandId === state.replace.commandId ? { replace: null } : {}) }); },
  clearNotice() { set({ notice: null }); },
};

export function useRunner(): RunnerState {
  return useSyncExternalStore(runner.subscribe, runner.get, runner.get);
}


/** Run game commands: `run` builds a fresh envelope; `retry` resends the unknown one unchanged. */
export function useGameCommands() {
  const actions = useActions();
  const gameId = useDockState({ hz: 1 })?.gameId;
  const send = useCallback(async function send(envelope: Envelope, say?: string): Promise<CommandResult | undefined> {
    const command = envelope.command;
    // A pending replace lives only while its own summon is the command in hand: anything else abandons it.
    const abandoned = pendingReplaceOnSend(state.replace, envelope.commandId, Date.now()) === "clear";
    set({ busy: command.type, notice: null, failed: null, retrying: null, ...(abandoned ? { replace: null } : {}) });
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
      // The summon of a replace, accepted now or on a retry: the old agent is destroyed (free), and only then.
      const step = pendingReplaceOnReceipt(state.replace, envelope.commandId, result);
      if (step === "clear") set({ replace: null });
      if (step === "destroy") {
        const pending = state.replace!;
        set({ replace: null });
        const said = pending.putBack ? putBackText(pending.name, { cost: pending.cost, lost: pending.lost, refill: pending.refill })
          : replacedText(pending.name, { share: pending.share, oldShare: pending.oldShare, cost: pending.cost, lost: pending.lost, refill: pending.refill });
        const end = replaceStep("destroying", await send({ version: VERSION, commandId: crypto.randomUUID(), command: { type: "destroy", agentId: pending.oldId }, ...(envelope.gameId ? { gameId: envelope.gameId } : {}) }, said));
        const done = "done" in end && end.done === "replaced";
        const both = bothText(pending.name, "done" in end && end.done === "both" ? end.message : "no answer from the game");
        // Both versions are running: said as an error under the header too, so it is seen wherever the player is.
        if (!done) noticeStore.push(both, "error");
        // A put-back done: the editor, if it still holds the version that went away, is given the restored code (its
        // origin is then the restored agent, by the forge's draftOrigin), so the next press cannot summon the gone version beside it.
        const restore = done && pending.putBack && pending.outgoingSource !== undefined && state.draft.source === pending.outgoingSource;
        set({
          ...(done ? { previous: pending.previous ?? null } : {}),
          ...(restore ? { draft: { source: pending.source, language: (pending.language as Lang | undefined) ?? state.draft.language }, origin: null, ownDraft: true } : {}),
          replaced: done ? { ok: true, text: said, source: pending.source } : { ok: false, text: both, source: pending.source },
        });
      }
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
  /**
   * Replace an agent: summon the new version, and destroy `old.oldId` only when that summon is accepted, including
   * through a later retry of the same envelope (the pending replace is kept in the state until then).
   */
  const replace = useCallback((command: Extract<Command, { type: "summon" }>, old: Omit<PendingReplace, "commandId" | "at">) => {
    if (state.busy) return Promise.resolve(undefined);
    const envelope: Envelope = { version: VERSION, commandId: crypto.randomUUID(), command, ...(gameId ? { gameId } : {}) };
    set({ replace: { ...old, commandId: envelope.commandId, at: Date.now() }, replaced: null });
    return send(envelope);
  }, [send, gameId]);
  return useMemo(() => ({ run, retry, replace, canAct: actions.canAct }), [run, retry, replace, actions.canAct]);
}
