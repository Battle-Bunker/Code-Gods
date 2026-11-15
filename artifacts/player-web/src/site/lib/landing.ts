/**
 * The landing page's "How a game goes", true of a first game (playtest round 26: it said five minutes for a ten-minute
 * game, and "bargain in chat" though a first practice game has nobody to bargain with). Read from the default preset.
 */
import type { Preset } from "@workspace/engine/convex/v2/presets.ts";

const minutes = (s: number) => `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? "" : "s"}`;

export function landingSteps(p: Pick<Preset, "worldSeconds" | "durationMode">): (readonly [string, string])[] {
  const length = p.durationMode === "halfLife"
    ? `about ${minutes(p.worldSeconds)}, ending at a moment nobody knows in advance`
    : minutes(p.worldSeconds);
  return [
    ["Start a practice game or a room", "A practice game seats you with two practice partners at once; a room is a table for 3 to 8 players, and AI players can fill its seats."],
    ["Write a tiny agent", "Your agents change the shared world toward your secret goal. When other people play too, you can make deals with them in the room's chat."],
    ["Most points wins", `A first game lasts ${length}, with a countdown; your points are what the objects are worth to you and to the others when it ends.`],
  ];
}
