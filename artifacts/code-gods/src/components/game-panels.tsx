import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, PublicObject, RosterEntry, Settings, Standing, UtilityFamily } from "@workspace/api-client-react";
import { Panel, Empty } from "@/components/shell";
import { fmt } from "@/lib/errors";
import { toMs } from "@/lib/time";
import { Bot, Send, User } from "lucide-react";

export function Conn({ ok, updatedAt, fetching, label = "live / 1s poll", staleAfter = 4 }: { ok: boolean; updatedAt: number; fetching: boolean; label?: string; staleAfter?: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const age = updatedAt ? Math.round((Date.now() - updatedAt) / 1000) : null;
  const stale = age !== null && age > staleAfter;
  return (
    <span className="flex items-center gap-2 label-mono" data-testid="status-connection">
      <span className={`h-2 w-2 rounded-full ${!ok ? "bg-destructive" : stale ? "bg-accent" : "bg-primary"} ${fetching ? "pulse-dot" : ""}`} />
      {!ok ? "poll failing" : stale ? `stale ${age}s` : label}
    </span>
  );
}

export function Leaderboard({ rows, agentCount, title = "Leaderboard", emptyBody = "Scores appear once the world begins to run." }: { rows: Standing[]; agentCount?: number; title?: string; emptyBody?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.totalScore)));
  return (
    <Panel title={title} meta={agentCount !== undefined ? `${agentCount} agents` : undefined}>
      <p className="px-4 py-2 text-xs text-muted-foreground">Total score = sum of your scores for all current objects.</p>
      {rows.length === 0 ? <Empty title="No standings yet" body={emptyBody} /> : (
        <ol className="divide-y">
          {[...rows].sort((a, b) => a.rank - b.rank).map((s) => (
            <li key={s.deityId} className="relative px-4 py-2.5 flex items-center gap-3" data-testid={`row-standing-${s.deityId}`}>
              <div className="absolute inset-y-0 left-0 bg-primary/10 transition-transform duration-700 origin-left w-full" style={{ transform: `scaleX(${Math.abs(s.totalScore) / max})` }} />
              <span className={`relative font-display text-3xl w-8 ${s.rank === 1 ? "text-accent" : "text-muted-foreground"}`}>{s.rank}</span>
              <span className="relative flex-1 min-w-0">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="label-mono">{s.kind}</span>
              </span>
              <span className="relative font-mono tabular-nums text-lg">{fmt(s.totalScore, 2)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function Repertoire({ catalog }: { catalog: UtilityFamily[] }) {
  return (
    <Panel title="Possible gods" meta={`${catalog.length} families`}>
      <p className="px-4 pt-3 text-sm text-muted-foreground">Each god privately draws one utility function at random from these families, with secret parameters. Who drew what is for you to work out.</p>
      <ul className="px-4 py-3 space-y-2 max-h-[360px] overflow-auto">
        {catalog.map((f) => (
          <li key={f.id} data-testid={`row-family-${f.id}`} className="text-sm"><span className="font-medium">{f.name}</span> <span className="text-muted-foreground">· {f.theme}</span></li>
        ))}
      </ul>
    </Panel>
  );
}

export function Objects({ objects, emptyBody = "No objects in this world. Nothing is invented here." }: { objects: PublicObject[]; emptyBody?: string }) {
  const objs = useMemo(() => [...objects].sort((a, b) => b.totalUtility - a.totalUtility), [objects]);
  const max = Math.max(1, ...objs.map((o) => Math.abs(o.totalUtility)));
  return (
    <Panel title="Objects / ranked by total utility" meta={`${objs.length} live`}>
      {objs.length === 0 ? <Empty title="The universe is empty" body={emptyBody} /> : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card"><tr className="label-mono text-left">
              <th className="px-4 py-2 font-normal">#</th><th className="py-2 font-normal">object</th><th className="py-2 font-normal">value</th><th className="py-2 font-normal text-right">ver</th><th className="px-4 py-2 font-normal text-right">Σ utility</th>
            </tr></thead>
            <tbody>
              {objs.map((o, i) => (
                <tr key={o.id} className="border-t hover:bg-muted/50" data-testid={`row-object-${o.id}`}>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 font-mono text-xs truncate max-w-[120px]">{o.id}</td>
                  <td className="py-1.5 font-mono truncate max-w-[220px]">{typeof o.value === "string" ? JSON.stringify(o.value) : o.value}</td>
                  <td className="py-1.5 font-mono text-right text-muted-foreground">v{o.version}</td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left transition-transform duration-700" style={{ transform: `scaleX(${Math.abs(o.totalUtility) / max})` }} /></div>
                      <span className="font-mono tabular-nums w-20">{fmt(o.totalUtility, 2)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function Chat({ messages, canPost, placeholder, pending, onSend, title = "Public channel" }: {
  messages: ChatMessage[]; canPost: boolean; placeholder: string; pending: boolean;
  onSend: (text: string, done: () => void) => void; title?: string;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const n = messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [n]);
  return (
    <Panel title={title} meta={`${n} msgs`}>
      <div className="h-[340px] overflow-auto px-4 py-2 space-y-2">
        {n === 0 && <Empty title="Silence in the pantheon" body="No one has spoken. Treaties start with a first message." />}
        {messages.map((c) => (
          <div key={c.id} className={c.kind === "system" ? "label-mono py-1" : "text-sm"} data-testid={`row-chat-${c.id}`}>
            {c.kind === "system" ? <span>{c.text}</span> : (<>
              <span className="font-medium">{c.authorName}</span>
              <span className="label-mono ml-2">{new Date(toMs(c.timestamp)).toLocaleTimeString()}</span>
              <p className="whitespace-pre-wrap break-words text-foreground/90">{c.text}</p>
            </>)}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="border-t flex" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) onSend(t.slice(0, 4000), () => setText("")); }}>
        <input disabled={!canPost} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={placeholder} className="flex-1 bg-transparent px-4 py-3 text-sm outline-none disabled:opacity-50" data-testid="input-chat" />
        <button disabled={!canPost || !text.trim() || pending} className="px-4 border-l text-primary disabled:opacity-40" data-testid="button-send-chat"><Send className="h-4 w-4" /></button>
      </form>
    </Panel>
  );
}

export const relevantToType = (key: string, type: string) =>
  type === "Int" ? key !== "stringMaxLength" : key !== "intMin" && key !== "intMax";

export function ReadOnlySettings({ settings, title = "World settings", meta = "owner controls", note }: { settings: Settings; title?: string; meta?: string; note?: string }) {
  return (
    <Panel title={title} meta={meta}>
      {note && <p className="px-4 pt-3 text-xs text-muted-foreground">{note}</p>}
      <dl className="p-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs" data-testid="list-settings">
        {Object.entries(settings).filter(([k]) => relevantToType(k, settings.objectType)).map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground font-mono truncate">{k}</dt><dd className="font-mono text-right truncate">{String(v)}</dd></div>))}
      </dl>
    </Panel>
  );
}

export function Roster({ roster, meId, ownerId }: { roster: RosterEntry[]; meId?: string; ownerId?: string | null }) {
  return (
    <Panel title="Roster" meta={`${roster.length} seated`}>
      {roster.length === 0 ? <Empty title="No roster" body="This game recorded no seated gods." /> : (
        <ul className="divide-y">
          {roster.map((m) => (
            <li key={m.id} className="px-4 py-2 flex items-center gap-3 text-sm" data-testid={`row-roster-${m.id}`}>
              {m.kind === "ai" ? <Bot className="h-4 w-4 text-accent" /> : <User className="h-4 w-4 text-primary" />}
              <span className="flex-1 min-w-0 truncate">{m.name}{m.id === meId && <span className="label-mono ml-2">you</span>}{m.id === ownerId && <span className="label-mono ml-2">owner</span>}</span>
              <span className="label-mono">{m.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
