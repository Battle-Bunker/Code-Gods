/**
 * The overview's one next step (docs/research/ui-redesign/player-client.md §2, principle "one next step"): what to do
 * now, why, and the single action that does it. Pure.
 */
import type { PanelId, Phase } from "@workspace/player-client/panels";
import type { RoomStartView } from "../../site/lib/bidding.ts";

export type NextStepAction =
  | { kind: "panel"; panelId: PanelId }
  | { kind: "forge" }
  /** "Summon my first agent": the editor opens and summons the example it holds (dock.summonFirst). */
  | { kind: "summon" }
  | { kind: "start" }
  | { kind: "palette"; command: string };
/** `busy`: a start is pending; the button shows a spinner and does nothing (no second start). */
export type NextStep = { label: string; why: string; action: NextStepAction; busy?: true };
/** `start`: the pending start (@workspace/player-client/start), so the click shows at once and progress follows. */
export type NextStepContext = { phase: Phase; seated: boolean; isOwner: boolean; players: number; agents: number; start?: RoomStartView;
  /** The editor holds code the player wrote or changed: the step opens it and never summons it for them. */ ownDraft?: boolean;
  /** AI seats exist in this room (its owner is an administrator); absent means yes. */ aiEnabled?: boolean };

export function nextStep(s: NextStepContext): NextStep {
  const live = s.phase === "planning" || s.phase === "running" || s.phase === "paused";
  if (s.phase === "lobby") {
    if (s.isOwner && s.start?.phase === "starting") {
      const who = s.start.source === "assistant" ? "your assistant is starting it: " : "";
      return { label: "Starting the game…", why: `${who}dealing secret goals and spawning the world; planning begins at once.`, action: { kind: "start" }, busy: true };
    }
    if (s.isOwner && s.start?.phase === "preparing") {
      return { label: "Preparing the game…", why: `its rule tables are computing (${s.start.ready} of ${s.start.total} ready); it starts by itself.`, action: { kind: "start" }, busy: true };
    }
    // The bid phase (docs/bid-phase.md) is on the room page: its bidding screen has the one button.
    if (s.start?.phase === "bidding") {
      return { label: "Bidding…", why: "the players are bidding for their rules on the room page; the rules are dealt and the game starts by itself when bidding ends.", action: { kind: "start" }, busy: true };
    }
    if (s.isOwner && s.players >= 3) return { label: "Start the game", why: `${s.players} players are in (spectators watch); planning begins at once.`, action: { kind: "start" } };
    if (s.isOwner && s.aiEnabled === false) return { label: "Invite players", why: `a game needs 3 players and the room has ${s.players} (spectators don't count).`, action: { kind: "palette", command: "ui.room.copy-link" } };
    if (s.isOwner) return { label: "Add an AI player", why: `a game needs 3 players and the room has ${s.players} (spectators don't count).`, action: { kind: "palette", command: "rooms.addAi" } };
    return { label: "Read how to play", why: "the owner starts the game; until then, learn the 90-second version.", action: { kind: "panel", panelId: "rules" } };
  }
  if (live && !s.seated) return { label: "Watch the race", why: "you are not dealt into this game; you watch it.", action: { kind: "panel", panelId: "race" } };
  if (s.phase === "planning") {
    return s.agents === 0
      ? { label: "Summon your first agent", why: "agents are how you change the world; testing one is free.", action: s.ownDraft ? { kind: "forge" } : { kind: "summon" } }
      : { label: "Read your secret goal", why: "check your agent aims at what you score for before the world starts.", action: { kind: "panel", panelId: "my-card" } };
  }
  if (s.phase === "running") {
    return s.agents === 0
      ? s.ownDraft
        ? { label: "Write an agent", why: "your own code is in the editor: validate it, then summon it.", action: { kind: "forge" } }
        : { label: "Summon your first agent", why: "a working agent for your goal is ready; nothing in the world moves your way without one.", action: { kind: "summon" } }
      : { label: "See which objects pay", why: "push the objects that pay you, and talk about the ones the others care about.", action: { kind: "panel", panelId: "objects" } };
  }
  if (s.phase === "paused") return { label: "Make a public proposal", why: "the world is stopped: a good moment to negotiate.", action: { kind: "panel", panelId: "public-chat" } };
  return { label: "See how the game went", why: "the final standings and why you finished where you did.", action: { kind: "panel", panelId: "results" } };
}
