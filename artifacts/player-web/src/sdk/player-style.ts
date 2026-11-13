/**
 * Each player's colour and dash, as every built-in pane draws them (sdk/player-colour.ts): by the game's roster order,
 * with the person at the screen in the accent colour, also in a replay. For panels that draw players as lines or swatches.
 */
import { useCallback } from "react";
import { useDockState, useGame } from "./hooks";
import { useReplaySource } from "./replay-source";
import { playerColour, playerDash, viewerIndex } from "./player-colour";

/** `style(godId)`: that player's `{ colour, dash }`, or `{}` while the roster is not known (the chart's defaults). */
export function usePlayerStyle(): (godId: string) => { colour?: string; dash?: string } {
  const roster = useDockState()?.roster;
  const me = useGame({ hz: 1 })?.self.godId;
  const replay = useReplaySource();
  const accent = viewerIndex(roster, { selfId: me, replay: !!replay, replayViewerId: replay?.viewerId });
  return useCallback((godId: string) => {
    const i = roster ? roster.indexOf(godId) : -1;
    return i >= 0 ? { colour: playerColour(i, accent), dash: playerDash(i, accent) } : {};
  }, [roster, accent]);
}
