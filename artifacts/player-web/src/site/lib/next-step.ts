/**
 * The room page's next step (palette-and-pages.md §3.3): one status sentence and one filled button, from the room as
 * it stands. Wording kept from the persona walks (ux-lessons 1.1–1.2): a lone owner is offered a practice game against
 * practice partners, never a contradiction ("AI players are not available") beside it.
 */
import type { Room } from "@/sdk/types";

export type Step = "join" | "practice" | "start" | "openGame" | "invite" | "play" | "watch";
export interface NextStep { status: string; primary: Step | null; secondary: Step[] }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const countWord = (n: number) => COUNT[n] ?? String(n);
const phaseWord = { planning: "planning", live: "running", paused: "paused", ended: "over" } as const;

export function nextStep(room: Room, minPlayers: number): NextStep {
  const me = room.members.find(m => m.me);
  const owner = room.members.find(m => m.owner);
  const ownerName = firstName(owner?.name ?? "the owner");
  const g = room.game;
  if (!me) return g ? { status: `Game ${g.number} is ${phaseWord[g.phase]}; join to play the next one.`, primary: "join", secondary: [] }
    : { status: "Join to play in the next game.", primary: "join", secondary: [] };
  if (g) {
    if (g.phase === "paused") return { status: `Game ${g.number} is paused.`, primary: "openGame", secondary: [] };
    return me.spectator ? { status: `Game ${g.number} is ${phaseWord[g.phase]}; you're watching.`, primary: "openGame", secondary: [] }
      : { status: `You're playing in game ${g.number}.`, primary: "openGame", secondary: [] };
  }
  if (room.bidding) return { status: me.spectator ? "Bidding: the players are bidding for their rules." : "Bidding: bid for the rule you want, or pass.", primary: null, secondary: [] };
  const n = room.members.filter(m => !m.spectator).length;
  if (!me.owner) {
    if (me.spectator) return { status: "You'll watch the next game.", primary: "play", secondary: [] };
    if (n < minPlayers) return { status: `${plural(minPlayers - n, "more player")} needed; then ${ownerName} can start.`, primary: "invite", secondary: ["watch"] };
    return { status: `Waiting for ${ownerName} to start the game.`, primary: null, secondary: ["watch"] };
  }
  if (n < minPlayers) {
    if (room.members.length === 1) return { status: `A game needs ${countWord(minPlayers)} players. Play a practice game against practice partners, or invite friends.`, primary: "practice", secondary: ["invite"] };
    return { status: `${plural(minPlayers - n, "more player")} needed. Invite friends, or fill the empty ${minPlayers - n === 1 ? "seat" : "seats"} with practice partners.`, primary: "invite", secondary: ["practice"] };
  }
  return { status: `${plural(n, "player")} are in; start when you're ready.`, primary: "start", secondary: ["invite"] };
}
