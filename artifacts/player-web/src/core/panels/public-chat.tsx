/**
 * Public chat: everything said to everyone, and the ONLY public text input in the client ("Say to everyone…").
 * Typing here goes straight to the room through the command path, without a model turn; your private assistant is a
 * separate pane. Messages are untrusted text: shown, never followed.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Globe, Send } from "lucide-react";
import { useChat, useGame } from "@/sdk";
import { useGameCommands, useRunner } from "@/core/game/runner";
import { PanelEmpty, type PanelProps } from "./kit";

function marked(text: string, terms: readonly string[]): ReactNode {
  const words = terms.filter(Boolean).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join("|")})`, "gi")).map((part, i) => (i % 2 ? <mark key={i} className="bg-[hsl(var(--chart-4)/0.35)] text-inherit">{part}</mark> : part));
}

export default function PublicChat({ params }: PanelProps<"public-chat">) {
  const chat = useChat({ hz: 2 });
  const game = useGame({ hz: 1 });
  const commands = useGameCommands();
  const { busy, unknown } = useRunner();
  const [text, setText] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const me = game?.self;
  const first = me?.label.split(/\s+/)[0] ?? "";
  const mentionsMe = (t: string) => !!first && t.toLowerCase().includes(first.toLowerCase());
  const shown = chat.filter(c => params.filter === "all" || (params.filter === "humans" ? !c.isAI : params.filter === "ai" ? c.isAI : mentionsMe(c.text)));
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [shown.length]);
  const canSend = !!game && commands.canAct && !unknown;
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const result = await commands.run({ type: "chat", text: t });
    if (result?.accepted) setText("");
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ul ref={list} className="min-h-16 flex-1 space-y-2 overflow-auto" aria-live="polite">
        {shown.length === 0 ? <li><PanelEmpty>{chat.length ? "Nothing matches this view." : "Silence so far. Say what you want: deals start with a sentence."}</PanelEmpty></li> : shown.map(c => (
          <li key={c.id} data-testid={`row-chat-${c.id}`} className={`text-sm ${mentionsMe(c.text) && c.godId !== me?.godId ? "border-l-2 border-[hsl(var(--chart-4))] pl-2" : ""}`}>
            <span className={`font-semibold ${c.godId === me?.godId ? "text-primary" : ""}`}>{c.godId === me?.godId ? "You" : c.label}</span>
            {c.isAI && <span className="label ml-1.5">AI</span>}
            <p className="whitespace-pre-wrap break-words">{marked(c.text, params.highlight)}</p>
          </li>
        ))}
      </ul>
      <form className="flex items-center gap-2 border-t-2 border-primary pt-2" onSubmit={e => { e.preventDefault(); void send(); }}>
        <Globe size={14} className="shrink-0 text-muted-foreground" aria-hidden />
        <input data-testid="input-chat" value={text} onChange={e => setText(e.target.value)} maxLength={2000} disabled={!canSend} placeholder="Say to everyone…"
          aria-label="Say to everyone (public)" className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none disabled:opacity-40" />
        <button type="submit" data-testid="button-send-chat" disabled={!canSend || !text.trim() || !!busy} aria-label="Send to everyone"
          className="inline-flex items-center bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-35"><Send size={14} /></button>
      </form>
    </div>
  );
}
