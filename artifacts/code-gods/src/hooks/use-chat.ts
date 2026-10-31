import { useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/lib/convex";
import { rid } from "@/lib/errors";

/** Protocol v3 (lib/player-client VERSION); chat is a v3 command like any player client's. */
const PROTOCOL = "code-gods.player.v3";

/** Post to the room's public channel through `commands.submit`. Rejects when the receipt is not accepted. */
export function useSendChat(roomId: string | null | undefined) {
  const submit = useAction(api.commands.submit);
  return useCallback(async (text: string) => {
    if (!roomId) throw new Error("This room is no longer available");
    const receipt = await submit({ roomId, envelope: { version: PROTOCOL, commandId: rid(), command: { type: "chat", text } } });
    if (!receipt.accepted) throw new Error(receipt.message);
    return receipt;
  }, [roomId, submit]);
}
