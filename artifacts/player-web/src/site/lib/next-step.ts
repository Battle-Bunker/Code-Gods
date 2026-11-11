/**
 * The one "what do I do next?" of the room and game pages (docs/research/ui-redesign/palette-and-pages.md §3.3, P4;
 * onboarding-and-config.md §1). One pure function per page feeds three places: the page's status sentence and its
 * single filled button, its ≤ 2 secondary text actions, and the palette's Suggested group. Steps are command ids
 * (catalogue paths or `ui.*` ids) so the page button and the palette row run the same command.
 */

import type { StartView } from "@workspace/player-client/start";

/** The ids a page's next step can name; every one is a palette command (tested). */
export const STEP_IDS = [
  "ui.auth.signIn", "rooms.join", "rooms.setReady", "ui.copyInviteLink", "rooms.addAi",
  "owner.start", "ui.nav.game", "rooms.resume", "ui.nav.room", "rooms.create", "rooms.setSpectator",
] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface NextStep {
  /** One sentence, ≤ 12 words. */
  status: string;
  primary: StepId | null;
  /** At most two, shown as text links. */
  secondary: StepId[];
}

export interface StepRoom {
  shortCode: string;
  ownerId: string;
  ownerName: string;
  /** `spectator`: watches the next game (docs/unify-apps-plan.md §2); only players count toward the minimum. */
  members: readonly { id: string; kind: string; spectator?: boolean }[];
  activeGame: { shortCode: string; phase: string; roster: readonly { id: string }[] } | null;
  /** A start waiting for rule tables computed on demand (rooms.get `preparing`). */
  preparing?: { ready: number; total: number; error?: string } | null;
}
/** `start`: this browser's pending start (@workspace/player-client/start); the click shows before the room changes. */
export interface StepOptions { minPlayers?: number; maxPlayers?: number; aiAvailable?: boolean; recoveryReason?: string | null; start?: StartView }

export const firstName = (name: string) => name.split(/\s+/)[0] || name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The room page's next step for this viewer (`viewerId` null when signed out). */
export function nextStep(viewerId: string | null | undefined, room: StepRoom, opts: StepOptions = {}): NextStep {
  const min = opts.minPlayers ?? 3, max = opts.maxPlayers ?? 8, ai = opts.aiAvailable ?? true;
  const g = room.activeGame;
  if (!viewerId) return { status: `You were invited to room ${room.shortCode}.`, primary: "ui.auth.signIn", secondary: [] };
  const owner = room.ownerId === viewerId;
  const member = owner || room.members.some(m => m.id === viewerId);
  const seated = !!g && g.roster.some(r => r.id === viewerId);
  const watching = !!room.members.find(m => m.id === viewerId)?.spectator;
  if (!member) {
    return g
      ? { status: `Game ${g.shortCode} is running; join to play the next one.`, primary: "rooms.join", secondary: ["ui.nav.game"] }
      : { status: "Join to play in the next game.", primary: "rooms.join", secondary: [] };
  }
  if (g) {
    if (g.phase === "recovery") {
      if (owner) {
        const reason = opts.recoveryReason?.trim().replace(/\.$/, "");
        return { status: `Game ${g.shortCode} paused for safety${reason ? `: ${reason}` : ""}.`, primary: "rooms.resume", secondary: ["ui.nav.game"] };
      }
      return { status: `Game ${g.shortCode} is paused; waiting for ${firstName(room.ownerName)} to resume it.`, primary: "ui.nav.game", secondary: [] };
    }
    return seated
      ? { status: `You're playing in game ${g.shortCode}.`, primary: "ui.nav.game", secondary: [] }
      : { status: watching ? `Game ${g.shortCode} is running; you're watching.` : `Game ${g.shortCode} is running; you'll play in the next one.`, primary: "ui.nav.game", secondary: [] };
  }
  // The owner's start is pending (also a retry over a failed preparation; startView gives a preparation in progress
  // precedence): the start button stays the primary, rendered busy (components/step-action.tsx), so the click shows in place.
  const p = room.preparing;
  if (owner && opts.start?.phase === "starting") {
    return { status: opts.start.source === "assistant" ? "Your assistant is starting the game…" : "Starting the game: dealing secret goals…", primary: "owner.start", secondary: [] };
  }
  if (p) {
    if (p.error) return owner
      ? { status: "Preparing the game failed; start again to retry.", primary: "owner.start", secondary: [] }
      : { status: `Preparing the game failed; ${firstName(room.ownerName)} can retry.`, primary: null, secondary: [] };
    return { status: `Preparing rule tables: ${p.ready} of ${p.total} ready.`, primary: null, secondary: [] };
  }
  const n = room.members.filter(m => !m.spectator).length;
  if (!owner) {
    if (watching) return n >= max ? { status: "The next game is full; you'll watch it.", primary: null, secondary: [] }
      : { status: "You'll watch the next game.", primary: "rooms.setSpectator", secondary: [] };
    // Below the minimum nobody can start: say what is missing; inviting is the one thing that helps (ready gates nothing).
    if (n < min) return { status: `${plural(min - n, "more player")} needed; then ${firstName(room.ownerName)} can start.`, primary: "ui.copyInviteLink", secondary: ["rooms.setReady", "rooms.setSpectator"] };
    return { status: `Waiting for ${firstName(room.ownerName)} to start the game.`, primary: "rooms.setReady", secondary: ["rooms.setSpectator"] };
  }
  // The owner may switch between watching and playing, beside the AI seats.
  const addAi: StepId[] = ["rooms.setSpectator", ...(ai && n < max ? ["rooms.addAi" as const] : [])];
  if (n < min) return { status: `${plural(min - n, "more player")} needed${watching ? "; you're watching" : ""}.${ai ? " AI players count." : ""}`, primary: "ui.copyInviteLink", secondary: addAi };
  return { status: watching ? `${plural(n, "player")} are in; you're watching. Start when ready.` : `${plural(n, "player")} are in; start when you're ready.`, primary: "owner.start", secondary: addAi };
}

export interface StepGame {
  shortCode: string;
  status: string;
  phase: string;
  roomShortCode?: string | null;
  ownerId?: string | null;
  roster: readonly { id: string }[];
  spectators?: readonly string[];
}

/**
 * The spectator view's next step (site/pages/game.tsx; seated players get their dock, an ended game its replay): the
 * owner resumes a safety pause; anyone else just watches.
 */
export function gameStep(viewerId: string | null | undefined, game: StepGame): NextStep {
  if (game.status !== "active") return { status: "This game has ended.", primary: game.roomShortCode ? "ui.nav.room" : null, secondary: [] };
  const owner = !!viewerId && game.ownerId === viewerId;
  if (game.phase === "recovery" && owner) return { status: "Paused for safety.", primary: "rooms.resume", secondary: [] };
  return { status: "You're watching this game.", primary: null, secondary: [] };
}
