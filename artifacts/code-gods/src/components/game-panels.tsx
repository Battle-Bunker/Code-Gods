import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexConnectionState } from "convex/react";
import type { ChatMessage, InstanceInfo, ObjectTypeInfo, PublicObject, RosterEntry, Settings, Standing, UtilityFamily } from "@/lib/types";
import { Panel, Empty } from "@/components/shell";
import { fmt } from "@/lib/errors";
import { toMs } from "@/lib/time";
import { Bot, Send, User } from "lucide-react";
import { BadgeChips, HowScoringWorks, ObjectView, RuleShelf, objectContext, objectNoun } from "@workspace/object-views";

/** The Convex socket: live data arrives by subscription, so the only state worth showing is the link itself. */
export function Conn({ ok = true, label = "live" }: { ok?: boolean; label?: string }) {
  const state = useConvexConnectionState();
  const connected = state.isWebSocketConnected;
  return (
    <span className="flex items-center gap-2 label-mono" data-testid="status-connection">
      <span className={`h-2 w-2 rounded-full ${!ok ? "bg-destructive" : connected ? "bg-primary" : "bg-accent pulse-dot"}`} />
      {!ok ? "query failing" : connected ? label : "reconnecting"}
    </span>
  );
}

/** Public standings: total payoff (bits²) per god. */
export function Leaderboard({ rows, agentCount, title = "Leaderboard", emptyBody = "Scores appear once the world begins to run." }: { rows: readonly Standing[]; agentCount?: number; title?: string; emptyBody?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.totalPayoff)));
  return (
    <Panel title={title} meta={agentCount !== undefined ? <span data-testid="text-agent-count">{agentCount} agents</span> : undefined}>
      <p className="px-4 py-2 text-xs text-muted-foreground">Points = the sum, over every object in the world now, of a god's bits × the other gods' bits together. <a href="#how-scoring-works" className="underline" data-testid="link-scoring-explainer">How scoring works</a></p>
      {rows.length === 0 ? <Empty title="No standings yet" body={emptyBody} /> : (
        <ol className="divide-y">
          {[...rows].sort((a, b) => a.rank - b.rank).map((s) => (
            <li key={s.deityId} className="relative px-4 py-2.5 flex items-center gap-3" data-testid={`row-standing-${s.deityId}`}>
              <div className="absolute inset-y-0 left-0 bg-primary/10 transition-transform duration-700 origin-left w-full" style={{ transform: `scaleX(${Math.max(0, s.totalPayoff) / max})` }} />
              <span className={`relative font-display text-3xl w-8 ${s.rank === 1 ? "text-accent" : "text-muted-foreground"}`}>{s.rank}</span>
              <span className="relative flex-1 min-w-0">
                <span className="block truncate font-medium">{s.name}</span>
                <span className="label-mono">{s.kind}</span>
              </span>
              <span className="relative font-mono tabular-nums text-lg" title="total payoff, bits²">{fmt(s.totalPayoff, 1)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** The scoring explainer, as its own panel (the leaderboard links here). */
export function ScoringPanel({ objectType }: { objectType?: string }) {
  return <HowScoringWorks noun={objectNoun(objectType)} />;
}

/** "Possible gods": the public catalog, grouped by badge, with locked families on a toggle. */
export function Repertoire({ catalog, classes }: { catalog: readonly UtilityFamily[]; classes?: ObjectTypeInfo["classes"] }) {
  const badges = useMemo(() => (classes ?? []).map(c => c.badge), [classes]);
  return (
    <Panel title="Possible gods" meta={`${catalog.filter(f => f.available).length} families`}>
      <div className="p-4"><RuleShelf entries={catalog} badges={badges} /></div>
    </Panel>
  );
}

/** The world's objects, hottest first. Public: only salience (Σ of every god's net bits), never anyone's own score. */
export function Objects({ objects, instance, emptyBody = "No objects in this world. Nothing is invented here." }: { objects: readonly PublicObject[]; instance?: InstanceInfo; emptyBody?: string }) {
  const objs = useMemo(() => [...objects].sort((a, b) => b.salience - a.salience), [objects]);
  const max = Math.max(1, ...objs.map((o) => Math.abs(o.salience)));
  const ctx = objectContext(instance);
  return (
    <Panel title="Objects / hottest first" meta={`${objs.length} live`}>
      {instance && <p className="px-4 pt-2 text-xs text-muted-foreground" data-testid="text-instance">{instance.label} <span className="font-mono">{instance.key}</span></p>}
      <p className="px-4 pb-1 text-xs text-muted-foreground">🔥 salience = how many bits all gods together see in an object. Who likes what stays secret.</p>
      {objs.length === 0 ? <Empty title="The universe is empty" body={emptyBody} /> : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card z-10"><tr className="label-mono text-left">
              <th className="px-4 py-2 font-normal">#</th><th className="py-2 font-normal">object</th><th className="py-2 font-normal text-right hidden sm:table-cell">ver</th><th className="px-4 py-2 font-normal text-right">🔥 salience</th>
            </tr></thead>
            <tbody>
              {objs.map((o, i) => (
                <tr key={o.id} className="border-t hover:bg-muted/50" data-testid={`row-object-${o.id}`}>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground align-middle">{i + 1}</td>
                  <td className="py-1.5 font-mono max-w-[220px] truncate align-middle"><ObjectView value={o.value} {...ctx} showTitle /></td>
                  <td className="py-1.5 font-mono text-right text-muted-foreground hidden sm:table-cell">v{o.version}</td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 sm:w-16 h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left transition-transform duration-700" style={{ transform: `scaleX(${Math.max(0, o.salience) / max})` }} /></div>
                      <span className="font-mono tabular-nums w-14 text-right">{fmt(o.salience, 1)}</span>
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
  messages: readonly ChatMessage[]; canPost: boolean; placeholder: string; pending: boolean;
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
          <div key={c.id} className={(c.kind as string) === "system" ? "label-mono py-1" : "text-sm"} data-testid={`row-chat-${c.id}`}>
            {(c.kind as string) === "system" ? <span>{c.text}</span> : (<>
              <span className="font-medium">{c.authorName}</span>
              <span className="label-mono ml-2">{new Date(toMs(c.timestamp)).toLocaleTimeString()}</span>
              <p className="whitespace-pre-wrap break-words text-foreground/90">{c.text}</p>
            </>)}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="border-t flex" onSubmit={(e) => { e.preventDefault(); const t = text.trim(); if (t) onSend(t.slice(0, 4000), () => setText("")); }}>
        <input disabled={!canPost} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={placeholder} className="flex-1 min-w-0 bg-transparent px-4 py-3 text-sm outline-none disabled:opacity-50" data-testid="input-chat" />
        <button disabled={!canPost || !text.trim() || pending} className="px-4 border-l text-primary disabled:opacity-40" data-testid="button-send-chat" aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
    </Panel>
  );
}

/** Setting rows shown to everyone, in kid-readable groups. */
export const SETTING_GROUPS: { title: string; fields: [keyof Settings, string, string?][] }[] = [
  { title: "World", fields: [["planningSeconds", "Planning", "s"], ["halfLifeSeconds", "Half-life", "s"], ["startingObjectCount", "Starting objects"], ["spawnRateHz", "Spawn rate", "/s"], ["interactionRateHz", "Interaction cap", "Hz"], ["interactionComputeMs", "Compute / interaction", "ms"], ["pauseSeconds", "Pause", "s"]] },
  { title: "God energy", fields: [["startingEnergy", "Starting energy", "bits"], ["energyPerSecond", "Income", "bits/s"]] },
  { title: "Agent energy", fields: [["agentEnergyPerSecond", "Agent income", "bits/s"], ["agentBatteryActs", "Agent battery", "acts"], ["maxAgentsPerGod", "Agents per god"]] },
  { title: "Scoring", fields: [["defenceRate", "Defence goal rate"], ["penaltyWeight", "Penalty weight"]] },
];

export function ReadOnlySettings({ settings, instance, title = "World settings", meta = "owner controls", note }: { settings: Settings; instance?: InstanceInfo; title?: string; meta?: string; note?: string }) {
  return (
    <Panel title={title} meta={meta}>
      {note && <p className="px-4 pt-3 text-xs text-muted-foreground">{note}</p>}
      <div className="p-4 space-y-3 text-xs" data-testid="list-settings">
        <div>
          <p className="font-medium text-sm">{instance ? instance.label : settings.objectType}</p>
          <p className="font-mono text-muted-foreground">{instance?.key ?? settings.objectType} · {settings.language} · {settings.grammarId}</p>
          {instance && <div className="mt-1"><BadgeChips badges={instance.badges} /></div>}
        </div>
        {SETTING_GROUPS.map(g => (
          <dl key={g.title} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
            <dt className="col-span-2 label-mono !text-foreground">{g.title}</dt>
            {g.fields.map(([k, label, unit]) => settings[k] === undefined ? null : (
              <div key={k} className="contents"><dt className="text-muted-foreground truncate">{label}</dt><dd className="font-mono text-right">{String(settings[k])}{unit ? ` ${unit}` : ""}</dd></div>
            ))}
          </dl>
        ))}
        <p className="text-muted-foreground font-mono">{settings.utilitySelectorId} · {settings.complexityFunctionId} · spawn {settings.spawnFunctionId}</p>
      </div>
    </Panel>
  );
}

export function Roster({ roster, meId, ownerId }: { roster: readonly RosterEntry[]; meId?: string; ownerId?: string | null }) {
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
