/**
 * The overview's one next step (docs/research/ui-redesign/player-client.md §2, principle "one next step"): what to do
 * now, why, and the single action that does it. Pure.
 */
import type { LensId, Phase } from "@workspace/player-client/lenses";

export type NextStepAction =
  | { kind: "lens"; lensId: LensId }
  | { kind: "forge" }
  | { kind: "start" }
  | { kind: "palette"; command: string };
export type NextStep = { label: string; why: string; action: NextStepAction };
export type NextStepContext = { phase: Phase; seated: boolean; isOwner: boolean; members: number; agents: number };

export function nextStep(s: NextStepContext): NextStep {
  const live = s.phase === "planning" || s.phase === "running" || s.phase === "paused";
  if (s.phase === "lobby") {
    if (s.isOwner && s.members >= 3) return { label: "Start the game", why: `everyone here plays (${s.members} players); planning begins at once.`, action: { kind: "start" } };
    if (s.isOwner) return { label: "Add an AI player", why: `a game needs 3 players and the room has ${s.members}.`, action: { kind: "palette", command: "rooms.addAi" } };
    return { label: "Read how to play", why: "the owner starts the game; until then, learn the 90-second version.", action: { kind: "lens", lensId: "rules" } };
  }
  if (live && !s.seated) return { label: "Watch the race", why: "you joined mid-game, so you play in the next one.", action: { kind: "lens", lensId: "race" } };
  if (s.phase === "planning") {
    return s.agents === 0
      ? { label: "Write your first agent", why: "agents are how you change the world; testing one is free.", action: { kind: "forge" } }
      : { label: "Read your secret goal", why: "check your agent aims at what you score for before the world starts.", action: { kind: "lens", lensId: "my-card" } };
  }
  if (s.phase === "running") {
    return s.agents === 0
      ? { label: "Write an agent", why: "without one, nothing in the world moves your way.", action: { kind: "forge" } }
      : { label: "See which objects pay", why: "push the objects that pay you, and talk about the ones the others care about.", action: { kind: "lens", lensId: "objects" } };
  }
  if (s.phase === "paused") return { label: "Make a public proposal", why: "the world is stopped: a good moment to negotiate.", action: { kind: "lens", lensId: "public-chat" } };
  return { label: "See how the game went", why: "the final standings and why you finished where you did.", action: { kind: "lens", lensId: "results" } };
}
