/**
 * {base}rooms/:room/games: the room's finished games, newest first. The ones the player can open (played in them, or
 * owns the room; between games, the room's last game is open to every member) link to their page; the engine refuses the
 * rest anyway (player.game).
 */
import { useQuery } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { Link } from "../navigation";
import { Screen } from "../screen";
import { pastGames, when } from "./model";

export function PastGames({ room, meId }: { room: { id: string; shortCode: string; ownerId: string; activeGame: unknown }; meId: string | undefined }) {
  const history = useQuery(api.rooms.history, { room: room.id });
  const games = pastGames(history as Parameters<typeof pastGames>[0], meId, room.ownerId, !!room.activeGame);
  return (
    <Screen title={`Past games of room ${room.shortCode}`} testId="screen-past-games" wide>
      <p className="text-sm"><Link to={{ kind: "room", room: room.shortCode }} className="underline" data-testid="link-back-to-room">Back to room {room.shortCode}</Link></p>
      {history === undefined ? <p className="text-muted-foreground">Loading…</p>
      : games.length === 0 ? <p className="text-muted-foreground" data-testid="text-no-past-games">No finished games yet.</p>
      : (
        <ul className="divide-y divide-[hsl(var(--card-border))] border border-[hsl(var(--card-border))] bg-card">
          {games.map(g => (
            <li key={g.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-sm" data-testid={`row-past-game-${g.shortCode}`}>
              {g.canOpen
                ? <Link to={{ kind: "game", room: room.shortCode, game: g.shortCode }} className="font-mono font-semibold underline" data-testid={`link-past-game-${g.shortCode}`}>{g.shortCode}</Link>
                : <span className="font-mono font-semibold text-muted-foreground" title="Only the gods who played in it and the room owner can open it">{g.shortCode}</span>}
              <span className="text-muted-foreground">ended {when(g.endedAt)}</span>
              <span className="min-w-0 flex-1">{g.winners ? `won by ${g.winners}` : "no winner"}</span>
              <span className="label">{g.played ? "you played" : "you did not play"}</span>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
