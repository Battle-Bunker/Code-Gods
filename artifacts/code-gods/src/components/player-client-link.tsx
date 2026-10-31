import { ExternalLink } from "lucide-react";

/** The hosted player client for a room, opened in a new tab. Room and game headers show it in the same place. */
export function PlayerClientLink({ roomCode }: { roomCode: string }) {
  return (
    <a href={`/player/?room=${encodeURIComponent(roomCode)}`} target="_blank" rel="noreferrer"
      className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
      data-testid="link-player"><ExternalLink className="h-4 w-4" /> Open the player client</a>
  );
}
