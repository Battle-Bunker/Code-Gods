/**
 * Actions on the player's behalf: the same authorised command path the room assistant uses
 * (`commands.submit` with a v3 envelope). The engine checks permission, phase, energy and idempotency;
 * a panel can do no more than its player could by hand.
 *
 * Every call returns the engine's receipt ({accepted, message, validation?}). If a call throws (the
 * network dropped), its outcome is unknown: retry the SAME envelope with `retry(envelope)`, never a new
 * command, so a summon is not paid twice.
 */
import { useCallback, useMemo } from "react";
import { useSdkSubmit } from "@sdk-transport";
import { GAME_COMMANDS, VERSION, type Command, type CommandResult, type Envelope } from "@workspace/player-client";
import { useRoom } from "./context";
import { useObservation } from "./hooks";

export type Language = "python" | "typescript";

export function useActions() {
  const { roomId, permission } = useRoom();
  const gameId = useObservation({ hz: 1 })?.gameId;
  const submit = useSdkSubmit();
  const send = useCallback(async (envelope: Envelope): Promise<CommandResult> =>
    await submit(roomId, envelope), [submit, roomId]);
  const run = useCallback((command: Command) => {
    const envelope: Envelope = {
      version: VERSION, commandId: crypto.randomUUID(), command,
      ...(GAME_COMMANDS.includes(command.type) && gameId ? { gameId } : {}),
    };
    return send(envelope);
  }, [send, gameId]);
  return useMemo(() => ({
    /** False with a read-only credential: every action would be refused. */
    canAct: permission !== "read",
    /** Measure an agent without paying: summon price, expected cost per act, diagnostics. */
    validate: (language: Language, source: string) => run({ type: "validate", language, source }),
    /** Pay the summon price from your god energy; the agent then earns its own energy. */
    summon: (language: Language, source: string) => run({ type: "summon", language, source }),
    /** Destroy one of your agents (free; spent energy is not refunded). */
    destroy: (agentId: string) => run({ type: "destroy", agentId }),
    /** Say something in the public chat (1–2000 characters; everyone sees it). */
    chat: (text: string) => run({ type: "chat", text }),
    /** Use your one pause of the game. */
    pause: () => run({ type: "pause" }),
    ready: (ready: boolean) => run({ type: "ready", ready }),
    /** Resubmit an envelope whose outcome is unknown (same commandId and payload). */
    retry: send,
    /** Build and send any v3 command. */
    run,
  }), [run, send, permission]);
}
