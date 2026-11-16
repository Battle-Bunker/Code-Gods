/**
 * The game bar's way to chat (playtest round 34: in a game with other people chat was invisible, though the tug note
 * and the end advice say to talk there): "Chat", with how many messages from others have come since you last had it
 * open; it opens the chat pane. Only in a game with another person in it.
 */
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLivePaged } from "@/sdk/live";
import { useGame, useGameScope } from "@/sdk";
import { useOpenPane } from "@/dock/open-pane";
import { useRuntime } from "@/core/affordance-runtime";
import { onSeen, seenAt, unreadCount } from "./chat-unread";

export function ChatButton() {
  const header = useGame();
  const { roomId } = useGameScope();
  const page = useLivePaged(api.v2.rooms.chat, roomId ? { roomId } : "skip", 50);
  const openPane = useOpenPane(header?.phase ?? "live");
  const [seen, setSeen] = useState(() => (roomId ? seenAt(roomId) : 0));
  useEffect(() => { if (roomId) setSeen(seenAt(roomId)); return onSeen((r, at) => { if (r === roomId) setSeen(at); }); }, [roomId]);
  const people = (header?.roster ?? []).filter(r => r.kind === "human").length;
  // Only once the room has loaded and says you are in it: before that, opening a pane is refused ("Join the room first").
  const member = !!useRuntime().context.principal?.member;
  if (!header || people < 2 || !member) return null;
  const n = unreadCount(page.results, seen, header.me);
  return (
    <button type="button" onClick={() => void openPane("public-chat")} data-testid="button-chat" data-unread={n || undefined}
      className={`inline-flex items-center gap-1 border px-2 py-0.5 text-xs ${n ? "border-primary font-semibold text-primary" : "text-muted-foreground"}`}
      aria-label={n ? `Chat: ${n} new message${n === 1 ? "" : "s"}` : "Chat"} title={n ? `${n} new message${n === 1 ? "" : "s"} from the other players` : "Talk to the other players"}>
      <MessageSquare className="h-3.5 w-3.5" aria-hidden />Chat{n ? ` · ${n} new` : ""}
    </button>
  );
}
