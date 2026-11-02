/**
 * The room page once its game has ended: a bar anchored under the dock, where the replay bar sits on the game's own
 * page, that opens the replay (docs/replay-design.md §7, "Watch the replay"). The room stays live above it (results,
 * chat, the owner's next game); the replay is the game's page, {base}rooms/:room/games/:game.
 */
import { useSituation } from "@/core/game/situation";
import { Link } from "../navigation";
import { SPEEDS, endedGameReplay } from "./model";

const speed = (s: number) => `${s === 0.25 ? "¼" : s === 0.5 ? "½" : s}×`;

export function EndedGameBar() {
  const { obs, room, seated, isOwner } = useSituation();
  const target = endedGameReplay(obs, { seated, isOwner });
  const roomCode = obs?.roomShortCode ?? room?.shortCode;
  if (!target || !roomCode) return null;
  return (
    <div role="region" aria-label="Replay" className="flex shrink-0 flex-wrap items-center gap-3 border-t-2 border-[hsl(var(--primary))] bg-card px-3 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
      data-testid="ended-game-bar">
      <Link to={{ kind: "game", room: roomCode, game: target.game }} data-testid="link-watch-replay"
        className="inline-flex h-9 items-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        <span aria-hidden>▶︎</span> Watch the replay
      </Link>
      <span className="text-sm">Game <span className="font-mono">{target.game}</span> is over.</span>
      <span className="text-xs text-muted-foreground">Scrub through every move, play it at {speed(SPEEDS[0])} to {speed(SPEEDS[SPEEDS.length - 1])}, and see every player's goal, agents and code.</span>
    </div>
  );
}
