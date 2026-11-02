/**
 * The room's pending start in the player client (@workspace/player-client/start): the overview's next step, the
 * palette and the assistant pane read and drive one tracker, so a click on any of them shows everywhere at once.
 */
import { useSyncExternalStore } from "react";
import { startTracker, startView, type StartView } from "@workspace/player-client/start";
import { useRoom, useRoomInfo } from "@/sdk";

export function useStartView(): StartView {
  const { roomId } = useRoom();
  const room = useRoomInfo();
  const request = useSyncExternalStore(startTracker.subscribe, () => startTracker.get(roomId));
  return startView(request, room ? { activeGame: room.activeGame, preparing: room.preparing } : null, startTracker.now());
}
