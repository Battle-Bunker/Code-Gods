/**
 * What the viewer can do here: the one source every panel reads before it renders a control that acts. Pure; the hook
 * that feeds it is ./use-affordances.ts, tested in test/affordances.test.ts.
 *
 * The rules mirror what the engine enforces (game/commands.ts): nothing acts in a replay or with a read-only
 * credential; validate, summon and destroy need a seat in a live game (not after the end); chat goes on after a game.
 * A control the viewer can never use in this context is `hidden` (not rendered at all); one that is off only for now
 * (a command in flight, an outcome unknown, the sandbox warming, the game over) stays visible, disabled, with `reason`.
 */
import type { Phase } from "@workspace/player-client/panels";

export type AffordanceContext = {
  /** The dock shows an ended game's replay (sdk/replay-source.ts): nothing can act. */
  replay: boolean;
  permission: "read" | "act" | "owner";
  /** Undefined until the observation arrives (in a replay: the phase at the playhead). */
  phase: Phase | undefined;
  seated: boolean;
  hasObservation: boolean;
  /** A command's outcome is unknown and waits for its identical retry. */
  unknownOutcome: boolean;
  /** A game command is in flight. */
  busy: boolean;
  /** The current language's agent sandbox (core/game/language.ts forgeSandbox); absent means ready. */
  sandbox?: { ready: boolean; text?: string };
};

export type Affordance = { ok: true } | { ok: false; hidden: boolean; reason: string };

/**
 * editCode: open the forge's editor (Write an agent, Edit a copy, Edit). validate/summon/destroy/chat: the game commands.
 * approve: act on the assistant's confirmation cards. roomStep: a next step that acts on the room (start the game, a
 * palette command, the forge) rather than only opening a panel.
 */
export type Action = "editCode" | "validate" | "summon" | "destroy" | "chat" | "approve" | "roomStep";

export type Affordances = { readOnly: boolean; readOnlyReason: string | null; can: Record<Action, Affordance> };

export const REPLAY_REASON = "Read-only replay: nothing can be done in an ended game's replay.";
export const READ_CREDENTIAL_REASON = "This connection is read-only.";

const OK: Affordance = { ok: true };
const hide = (reason: string): Affordance => ({ ok: false, hidden: true, reason });
const off = (reason: string): Affordance => ({ ok: false, hidden: false, reason });
const first = (...checks: (Affordance | null)[]): Affordance => checks.find(c => c && !c.ok) ?? OK;
const live = (phase: Phase | undefined) => phase === "planning" || phase === "running" || phase === "paused";

export function deriveAffordances(c: AffordanceContext): Affordances {
  const readOnlyReason = c.replay ? REPLAY_REASON : c.permission === "read" ? READ_CREDENTIAL_REASON : null;
  const ro = readOnlyReason ? hide(readOnlyReason) : null;
  const transient = first(
    c.hasObservation ? null : off("Waiting for the game to load."),
    c.unknownOutcome ? off("A command's outcome is unknown: retry it or dismiss it first, under the header.") : null,
    c.busy ? off("Another command is still running.") : null,
  );
  const examine = first(
    ro,
    transient,
    c.phase === "ended" ? off("The game is over: nothing can be summoned. Your code stays for the next game.") : null,
    c.phase === "lobby" ? off("The game hasn't started yet.") : null,
    !c.seated ? off("You're watching this game; you play in the next one.") : null,
    c.sandbox && !c.sandbox.ready ? off(c.sandbox.text ?? "The agent sandbox isn't ready yet.") : null,
  );
  return {
    readOnly: !!readOnlyReason,
    readOnlyReason,
    can: {
      editCode: first(ro),
      validate: examine,
      summon: examine,
      destroy: first(
        ro,
        c.phase === "ended" ? hide("The game is over: its agents can no longer be destroyed.") : null,
        c.hasObservation && !live(c.phase) ? hide("No game is running.") : null,
        c.hasObservation && !c.seated ? hide("You're watching this game.") : null,
        transient,
      ),
      chat: first(ro, transient),
      // Approving is the assistant's own permission (assistant.confirm), not the room credential's: only a replay stops it.
      approve: c.replay ? hide("This is a replay: approve your assistant's requests from the live room.") : OK,
      roomStep: first(ro),
    },
  };
}

/** Whose things a panel shows: "your", or in a replay seen as another god, that god's ("Opcode Owl's"). */
export function ownerPhrase(seenAs: string | null): string {
  if (!seenAs) return "your";
  return seenAs.endsWith("s") ? `${seenAs}'` : `${seenAs}'s`;
}
