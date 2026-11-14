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
import { boardsIn, onChatDraft, takeChatDraft } from "@/panes/chat-draft";

/** A message's text, with any board in it (a proposal's four rows of four digits) drawn as a small board. */
function MessageText({ text }: { text: string }) {
  return (<>{boardsIn(text).map((part, i) => "board" in part
    ? <span key={i} className="my-1 inline-grid grid-cols-4 gap-px rounded border bg-border font-mono text-sm" data-testid="chat-board" aria-label={`A board: ${part.board.map(r => r.join(" ")).join(", ")}`}>
        {part.board.flat().map((d, j) => <span key={j} className="flex h-6 w-6 items-center justify-center bg-background">{d}</span>)}
      </span>
    : <p key={i} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/90">{part.text}</p>)}</>);
}

export function RoomChat({ roomId, height = "h-[300px]" }: { roomId: string; height?: string }) {
  const page = useLivePaged(api.v2.rooms.chat, { roomId }, 50);
  const send = useAffordance("chat.send");
  const messages = [...page.results].reverse();
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  // A proposal from a line or board (its "Propose this in chat") arrives written in the box, to read and send.
  useEffect(() => {
    const take = () => { const d = takeChatDraft(); if (d !== null) { setText(d.slice(0, 500)); requestAnimationFrame(() => input.current?.focus()); } };
    take();
    return onChatDraft(take);
  }, []);
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
              <MessageText text={c.text} />
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
