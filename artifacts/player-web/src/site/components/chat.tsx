/**
 * The room's public chat (the room page and the game's public-chat pane): newest page live, earlier pages on demand,
 * and a composer that sends through the `chat.send` affordance. Messages are untrusted text written by players.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useAffordance } from "@workspace/v2-affordances/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { useLivePaged } from "@/sdk/live";
import { EmptyState } from "@/site/components/page-parts";
import { failureText } from "@/site/components/action";

export function RoomChat({ roomId, height = "h-[300px]" }: { roomId: string; height?: string }) {
  const page = useLivePaged(api.v2.rooms.chat, { roomId }, 50);
  const send = useAffordance("chat.send");
  const messages = [...page.results].reverse();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const newest = messages.at(-1)?.id, oldest = messages[0]?.id;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [newest]);
  // An older page loading above keeps what the reader was looking at in place.
  const before = useRef<{ oldest?: string; height: number }>({ height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (before.current.oldest && oldest !== before.current.oldest) el.scrollTop += el.scrollHeight - before.current.height;
    before.current = { oldest, height: el.scrollHeight };
  }, [oldest, messages.length]);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setError(null);
    try { await send.run({ text: t.slice(0, 500) }); setText(""); } catch (e) { setError(failureText(e)); } finally { setBusy(false); }
  };
  if (send.hidden) return null;
  return (
    <div className="flex min-h-0 flex-col" data-testid="chat">
      <div ref={box} className={`${height} overflow-auto px-4 py-2 space-y-2`}>
        {page.status === "CanLoadMore" && <button type="button" onClick={() => page.loadMore(50)} className="text-xs underline underline-offset-4 text-muted-foreground" data-testid="button-chat-older">Earlier messages</button>}
        {page.status !== "LoadingFirstPage" && messages.length === 0 && <EmptyState title="No messages yet" body="Deals start here. Say hello." />}
        {messages.map(c => (
          <div key={c.id} className={c.memberId ? "text-sm" : "text-xs text-muted-foreground py-1"} data-testid={`row-chat-${c.id}`}>
            {c.memberId ? (<>
              <span className="font-medium">{c.from}</span>
              <span className="text-xs text-muted-foreground ml-2">{new Date(c.at).toLocaleTimeString()}</span>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/90">{c.text}</p>
            </>) : <span>{c.text}</span>}
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="border-t px-4 py-2 text-xs text-destructive" role="alert">{error}</p>}
      <form className="border-t flex" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <input disabled={!send.available} value={text} onChange={e => setText(e.target.value)} maxLength={500}
          placeholder={send.available ? "Say something to everyone…" : send.reason ?? "Join the room to chat"} aria-label="Message to everyone"
          className="flex-1 min-w-0 bg-transparent px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50" data-testid="input-chat" />
        <button type="submit" disabled={!send.available || !text.trim() || busy} className="px-4 border-l text-primary disabled:opacity-40" data-testid="button-send-chat" aria-label="Send to everyone"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
