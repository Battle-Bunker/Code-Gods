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
import { chatFilter, type ChatFilter } from "./chat-filter";

/** Who wrote what, for the filters (a game knows its roster): member kinds by id, your name and member id. */
export interface ChatWho { kinds: ReadonlyMap<string, string>; myName: string | null; me: string | null }

export function RoomChat({ roomId, height = "h-[300px]", who }: { roomId: string; height?: string; who?: ChatWho }) {
  const page = useLivePaged(api.v2.rooms.chat, { roomId }, 50);
  const send = useAffordance("chat.send");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const all = [...page.results].reverse();
  const messages = who ? chatFilter(all, filter, who) : all;
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const newest = all.at(-1)?.id, oldest = all[0]?.id;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [newest]);
  // An older page loading above keeps what the reader was looking at in place.
  const before = useRef<{ oldest?: string; height: number }>({ height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (before.current.oldest && oldest !== before.current.oldest) el.scrollTop += el.scrollHeight - before.current.height;
    before.current = { oldest, height: el.scrollHeight };
  }, [oldest, all.length]);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setError(null);
    try { await send.run({ text: t.slice(0, 500) }); setText(""); } catch (e) { setError(failureText(e)); } finally { setBusy(false); }
  };
  if (send.hidden) return null;
  return (
    <div className="flex min-h-0 flex-col" data-testid="chat">
      {who && (
        <div className="flex gap-2 border-b px-3" role="group" aria-label="Whose messages">
          {([["all", "Everyone"], ["people", "People"], ["ai", "AI players"], ["mentions", "Mentions of you"]] as const).map(([f, label]) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`button-chat-filter-${f}`}
              className={`px-2 py-1 text-xs ${filter === f ? "border-b-2 border-primary font-semibold" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
      )}
      <div ref={box} className={`${height} overflow-auto px-4 py-2 space-y-2`}>
        {page.status === "CanLoadMore" && <button type="button" onClick={() => page.loadMore(50)} className="text-xs underline underline-offset-4 text-muted-foreground" data-testid="button-chat-older">Earlier messages</button>}
        {page.status !== "LoadingFirstPage" && all.length === 0 && <EmptyState title="No messages yet" body="Deals start here. Say hello." />}
        {all.length > 0 && messages.length === 0 && <p className="py-2 text-sm text-muted-foreground" data-testid="chat-filtered-empty">No loaded message matches. {page.status === "CanLoadMore" ? "Earlier messages may." : ""}</p>}
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
        <textarea ref={input} rows={Math.min(6, Math.max(1, text.split("\n").length))} disabled={!send.available} value={text} onChange={e => setText(e.target.value)} maxLength={500}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }}
          placeholder={send.available ? "Say something to everyone…" : send.reason ?? "Join the room to chat"} aria-label="Message to everyone"
          className="flex-1 min-w-0 resize-none bg-transparent px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50" data-testid="input-chat" />
        <button type="submit" disabled={!send.available || !text.trim() || busy} className="px-4 border-l text-primary disabled:opacity-40" data-testid="button-send-chat" aria-label="Send to everyone"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
