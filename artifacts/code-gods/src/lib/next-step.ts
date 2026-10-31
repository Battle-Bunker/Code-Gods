/**
 * The one "what do I do next?" of the engine UI (docs/research/ui-redesign/palette-and-pages.md §3.3, P4;
 * onboarding-and-config.md §1). One pure function per page feeds three places: the page's status sentence and its
 * single filled button, its ≤ 2 secondary text actions, and the palette's Suggested group. Steps are command ids
 * (catalogue paths or `ui.*` ids) so the page button and the palette row run the same command.
 */

export type StepId =
  | "ui.auth.signIn" | "rooms.join" | "ui.nav.playerClient" | "rooms.setReady" | "ui.copyInviteLink" | "rooms.addAi"
  | "owner.start" | "ui.nav.game" | "rooms.resume" | "ui.nav.room" | "rooms.create";

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
  members: readonly { id: string; kind: string }[];
  activeGame: { shortCode: string; phase: string; roster: readonly { id: string }[] } | null;
}
export interface StepOptions { minPlayers?: number; maxPlayers?: number; aiAvailable?: boolean; recoveryReason?: string | null }

const firstName = (name: string) => name.split(/\s+/)[0] || name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The room page's next step for this viewer (`viewerId` null when signed out). */
export function nextStep(viewerId: string | null | undefined, room: StepRoom, opts: StepOptions = {}): NextStep {
  const min = opts.minPlayers ?? 3, max = opts.maxPlayers ?? 8, ai = opts.aiAvailable ?? true;
  const g = room.activeGame;
  if (!viewerId) return { status: `You were invited to room ${room.shortCode}.`, primary: "ui.auth.signIn", secondary: [] };
  const owner = room.ownerId === viewerId;
  const member = owner || room.members.some(m => m.id === viewerId);
  const seated = !!g && g.roster.some(r => r.id === viewerId);
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
      return { status: `Game ${g.shortCode} is paused; waiting for ${firstName(room.ownerName)} to resume it.`, primary: seated ? "ui.nav.playerClient" : "ui.nav.game", secondary: seated ? ["ui.nav.game"] : [] };
    }
    return seated
      ? { status: `You're playing in game ${g.shortCode}.`, primary: "ui.nav.playerClient", secondary: ["ui.nav.game"] }
      : { status: `Game ${g.shortCode} is running; you'll play in the next one.`, primary: "ui.nav.game", secondary: [] };
  }
  const n = room.members.length;
  if (!owner) return { status: `Waiting for ${firstName(room.ownerName)} to start the game.`, primary: "ui.nav.playerClient", secondary: ["rooms.setReady"] };
  // The owner plays too: the player client stays one click away beside the AI seats.
  const addAi: StepId[] = [...(ai && n < max ? ["rooms.addAi" as const] : []), "ui.nav.playerClient"];
  if (n < min) return { status: `${plural(min - n, "more player")} needed.${ai ? " AI players count." : ""}`, primary: "ui.copyInviteLink", secondary: addAi };
  return { status: `${plural(n, "player")} are in; start when you're ready.`, primary: "owner.start", secondary: addAi };
}

export interface StepGame {
  shortCode: string;
  status: string;
  phase: string;
  roomShortCode?: string | null;
  ownerId?: string | null;
  roster: readonly { id: string }[];
}

/** The game page's next step: seated players play; spectators watch (no button); after the end, back to the room. */
export function gameStep(viewerId: string | null | undefined, game: StepGame): NextStep {
  const active = game.status === "active";
  if (!active) return { status: "This game has ended.", primary: game.roomShortCode ? "ui.nav.room" : null, secondary: [] };
  const owner = !!viewerId && game.ownerId === viewerId;
  const seated = !!viewerId && game.roster.some(r => r.id === viewerId);
  if (game.phase === "recovery" && owner) return { status: "Paused for safety.", primary: "rooms.resume", secondary: seated ? ["ui.nav.playerClient"] : [] };
  if (seated && game.roomShortCode) return { status: "You're playing in this game.", primary: "ui.nav.playerClient", secondary: [] };
  return { status: "You're watching this game.", primary: null, secondary: [] };
}
