/**
 * {base}rooms/:room/games/:game for a game the room no longer runs: a read-only page of its final state (standings,
 * winners, last objects, chat), loaded once from player.game, which the engine serves only to the gods who played in
 * it and the room owner. Nothing here acts: no commands, no panels, no assistant. A replay builds on this page.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@workspace/engine/convex/_generated/api";
import { Link } from "../navigation";
import { when } from "./model";

export type GameView = FunctionReturnType<typeof api.player.game>;
const reason = (r: string | null) => (r === "owner" ? "ended by the owner" : r === "lifetime" ? "its time ran out" : r ? r : "ended");

export function HistoricGame({ game, roomCode, meId }: { game: GameView; roomCode: string; meId: string | undefined }) {
  const winners = new Set(game.winners.map(w => w.deityId));
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8" data-testid="historic-game" data-game-id={game.id}>
      <header className="space-y-2">
        <p className="text-sm">
          <Link to={{ kind: "room", room: roomCode }} className="underline" data-testid="link-room">Room {roomCode}</Link>
          {" · "}<Link to={{ kind: "games", room: roomCode }} className="underline" data-testid="link-past-games">Past games</Link>
        </p>
        <h1 className="font-serif text-3xl">Game <span className="font-mono" data-testid="text-game-code">{game.shortCode}</span> <span className="label align-middle" data-testid="text-game-status">ended · read-only</span></h1>
        <p className="text-sm text-muted-foreground" data-testid="text-game-summary">
          Started {when(game.startedAt)}, {reason(game.endReason)} {when(game.endedAt)}, after {game.worldSeconds.toFixed(1)} s of world time.
          {game.seated ? " You played in it." : " You did not play in it."}
        </p>
      </header>
      <section className="space-y-2">
        <h2 className="label">Final standings</h2>
        <table className="w-full border border-[hsl(var(--card-border))] bg-card text-sm" data-testid="table-final-standings">
          <tbody>
            {game.leaderboard.map(row => (
              <tr key={row.deityId} className="border-t border-[hsl(var(--card-border))]" data-testid={`row-standing-${row.deityId}`}>
                <td className="w-10 px-3 py-2 font-mono tabular-nums">{row.rank}</td>
                <td className="px-3 py-2">{row.name}{row.deityId === meId ? " (you)" : ""}{winners.has(row.deityId) ? " · winner" : ""}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{row.totalPayoff.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="space-y-2">
        <h2 className="label">Objects when it ended ({game.objects.length})</h2>
        <ul className="flex flex-wrap gap-2 font-mono text-xs" data-testid="list-final-objects">
          {game.objects.map(o => <li key={o.id} className="max-w-full truncate border border-[hsl(var(--card-border))] bg-card px-2 py-1">{typeof o.value === "string" ? o.value : JSON.stringify(o.value)}</li>)}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="label">Chat during the game</h2>
        {game.chat.length === 0 ? <p className="text-sm text-muted-foreground">No messages.</p> : (
          <ul className="space-y-1 text-sm" data-testid="list-game-chat">
            {game.chat.map(m => <li key={m.id}><span className="font-semibold">{m.authorName}</span>: {m.text}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
