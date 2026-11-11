/**
 * What the viewer can do here: the one source every panel reads before it renders a control that acts. Pure; the hook
 * that feeds it is ./use-affordances.ts, tested in test/affordances.test.ts.
 *
 * The rules mirror what the engine enforces (game/commands.ts): nothing acts in a replay or with a read-only
 * credential; validate, summon and destroy need a seat in a live game (not after the end); chat goes on after a game.
 * A control the viewer can never use in this context is `hidden` (not rendered at all); one that is off only for now
 * (a command in flight, an outcome unknown, the sandbox warming, the game over) stays visible, disabled, with `reason`.
 * look (paid observation, game/commands.ts "look"): only a seated god of a game whose looking costs energy has it; it is
 * off, with the price and the balance, while their own energy does not pay for one look.
 */
import type { Phase } from "@workspace/player-client/panels";
import { lookOffer } from "./panels/knowledge.ts";

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
  /**
   * Paid observation only (dock.state economy.observation "paid"): what one look at one object costs (economy.lookPrice)
   * and the viewer's own energy (self.energy). Absent where looking is free.
   */
  look?: { price: number; energy: number };
};

export type Affordance = { ok: true } | { ok: false; hidden: boolean; reason: string };

/**
 * editCode: open the forge's editor (Write an agent, Edit a copy, Edit). validate/summon/destroy/allocatePower/chat: the game commands.
 * roomStep: a next step that acts on the room (start the game, a
 * palette command, the forge) rather than only opening a panel. look: pay energy to see one object as it is now (a look
 * at all of them costs the price times their number: the panel checks that total itself, core/panels/knowledge.ts).
 */
export type Action = "editCode" | "validate" | "summon" | "destroy" | "allocatePower" | "look" | "chat" | "roomStep";

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
  const loading = c.hasObservation ? null : off("Waiting for the game to load.");
  const unknown = c.unknownOutcome ? off("A command's outcome is unknown: retry it or dismiss it first, under the header.") : null;
  const transient = first(loading, unknown, c.busy ? off("Another command is still running.") : null);
  const examine = (verb: string) => first(
    ro,
    transient,
    c.phase === "ended" ? off(`The game is over: nothing can be ${verb}. Your code stays for the next game.`) : null,
    c.phase === "lobby" ? off("The game hasn't started yet.") : null,
    !c.seated ? off("You're watching this game; you play in the next one.") : null,
    c.sandbox && !c.sandbox.ready ? off(c.sandbox.text ?? "The agent sandbox isn't ready yet.") : null,
  );
  return {
    readOnly: !!readOnlyReason,
    readOnlyReason,
    can: {
      editCode: first(ro),
      validate: examine("validated"),
      summon: examine("summoned"),
      destroy: first(
        ro,
        c.phase === "ended" ? hide("The game is over: its agents can no longer be destroyed.") : null,
        c.hasObservation && !live(c.phase) ? hide("No game is running.") : null,
        c.hasObservation && !c.seated ? hide("You're watching this game.") : null,
        transient,
      ),
      allocatePower: first(
        ro,
        c.phase === "ended" ? hide("The game is over: power can no longer be re-allocated.") : null,
        c.hasObservation && !live(c.phase) ? hide("No game is running.") : null,
        c.hasObservation && !c.seated ? hide("You're watching this game.") : null,
        transient,
      ),
      look: first(
        !c.look ? hide("Looking is free in this game: every object is shown as it is.") : null,
        ro,
        c.hasObservation && !c.seated ? hide("You're watching this game.") : null,
        c.phase === "ended" ? off("The game is over: every object is shown as it ended.") : null,
        c.phase === "lobby" ? off("The game hasn't started yet.") : null,
        c.phase === "planning" ? off("The world has not started: every object is still exactly as you see it.") : null,
        transient,
        c.look ? (o => (o.ok ? null : off(o.reason!)))(lookOffer(c.look)) : null,
      ),
      // Not off while another command runs: typing goes on (the send button waits for the runner).
      chat: first(ro, loading, unknown),
      roomStep: first(ro),
    },
  };
}

/** Whose things a panel shows: "your", or in a replay seen as another god, that god's ("Opcode Owl's"). */
export function ownerPhrase(seenAs: string | null): string {
  if (!seenAs) return "your";
  return seenAs.endsWith("s") ? `${seenAs}'` : `${seenAs}'s`;
}
