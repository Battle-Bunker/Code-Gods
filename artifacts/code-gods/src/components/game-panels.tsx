import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, InstanceInfo, ObjectTypeInfo, PublicObject, RosterEntry, Settings, Standing, UtilityFamily } from "@/lib/types";
import { EmptyState, Section } from "@/components/page-parts";
import { fmt } from "@/lib/errors";
import { toMs } from "@/lib/time";
import { formatValue, LABELS, lengthLine, paceWord, type SettingsKey } from "@/lib/settings-form";
import { Bot, Crown, Send, User } from "lucide-react";
import { BadgeChips, ObjectView, RuleShelf, objectContext } from "@workspace/object-views";
import { Term } from "@workspace/ui-kit";

/** Standings and roster in one list: rank, name, AI or human, score, the owner's crown. Public totals only. */
export function Leaderboard({ rows, roster, meId, ownerId, agentCount, emptyBody = "Scores appear once the world begins to run." }: {
  rows: readonly Standing[]; roster: readonly RosterEntry[]; meId?: string; ownerId?: string | null; agentCount?: number; emptyBody?: string;
}) {
  const merged = useMemo(() => {
    const byId = new Map(rows.map(r => [r.deityId, r]));
    const seated = roster.map(r => ({ id: r.id, name: r.name, kind: r.kind, standing: byId.get(r.id) }));
    for (const s of rows) if (!roster.some(r => r.id === s.deityId)) seated.push({ id: s.deityId, name: s.name, kind: s.kind, standing: s });
    return seated.sort((a, b) => (a.standing?.rank ?? 99) - (b.standing?.rank ?? 99) || a.name.localeCompare(b.name));
  }, [rows, roster]);
  const max = Math.max(1, ...rows.map(r => Math.abs(r.totalPayoff)));
  return (
    <Section title="Leaderboard" count={merged.length} action={agentCount !== undefined ? <span className="text-xs text-muted-foreground" data-testid="text-agent-count">{agentCount} agent{agentCount === 1 ? "" : "s"}</span> : undefined}>
      <p className="px-4 pt-2 text-xs text-muted-foreground">Points: each player's <Term id="bits">bits</Term> times how much the others care, summed over every object now.</p>
      {merged.length === 0 ? <EmptyState title="No players yet" body={emptyBody} /> : (
        <ol className="divide-y">
          {merged.map(p => (
            <li key={p.id} className="relative px-4 py-2.5 flex items-center gap-3" data-testid={`row-standing-${p.id}`}>
              {p.standing && <div className="absolute inset-y-0 left-0 bg-primary/10 origin-left w-full" style={{ transform: `scaleX(${Math.max(0, p.standing.totalPayoff) / max})` }} />}
              <span className={`relative font-display text-2xl w-7 ${p.standing?.rank === 1 ? "text-accent" : "text-muted-foreground"}`}>{p.standing?.rank ?? "–"}</span>
              {p.kind === "ai" ? <Bot className="relative h-4 w-4 text-accent" aria-label="AI player" /> : <User className="relative h-4 w-4 text-primary" aria-label="Human player" />}
              <span className="relative flex-1 min-w-0 truncate">
                {p.name}{p.id === meId && <span className="text-muted-foreground"> (you)</span>}
                {p.id === ownerId && <Crown className="inline h-3.5 w-3.5 ml-1.5 text-accent" aria-label="room owner" />}
              </span>
              <span className="relative font-mono tabular-nums">{p.standing ? fmt(p.standing.totalPayoff, 1) : "—"}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/** The world's objects, hottest first. Public: only salience (Σ of every player's net bits), never anyone's own score. */
export function Objects({ objects, instance, emptyBody = "Objects appear once the world begins to run." }: { objects: readonly PublicObject[]; instance?: InstanceInfo; emptyBody?: string }) {
  const objs = useMemo(() => [...objects].sort((a, b) => b.salience - a.salience), [objects]);
  const max = Math.max(1, ...objs.map(o => Math.abs(o.salience)));
  const ctx = objectContext(instance);
  return (
    <Section title="Objects" count={objs.length}>
      <p className="px-4 pt-2 pb-1 text-xs text-muted-foreground">Hottest first. 🔥 <Term id="salience" /> is how many bits all players together see in an object; who likes what stays secret.</p>
      {objs.length === 0 ? <EmptyState title="No objects yet" body={emptyBody} /> : (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card z-10"><tr className="text-xs text-muted-foreground text-left">
              <th className="px-4 py-2 font-normal">#</th><th className="py-2 font-normal">Object</th><th className="px-4 py-2 font-normal text-right">🔥</th>
            </tr></thead>
            <tbody>
              {objs.map((o, i) => (
                <tr key={o.id} className="border-t" data-testid={`row-object-${o.id}`}>
                  <td className="px-4 py-1.5 font-mono text-muted-foreground align-middle">{i + 1}</td>
                  <td className="py-1.5 font-mono max-w-[220px] truncate align-middle"><ObjectView value={o.value} {...ctx} showTitle /></td>
                  <td className="px-4 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 sm:w-16 h-1.5 bg-muted overflow-hidden"><div className="h-full bg-accent origin-left" style={{ transform: `scaleX(${Math.max(0, o.salience) / max})` }} /></div>
                      <span className="font-mono tabular-nums w-14 text-right">{fmt(o.salience, 1)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/** Public chat: the only free-text input on the engine UI's pages. */
export function Chat({ messages, canPost, placeholder, pending, onSend, title = "Public chat" }: {
  messages: readonly ChatMessage[]; canPost: boolean; placeholder: string; pending: boolean;
  onSend: (text: string, done: () => void) => void; title?: string;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const n = messages.length;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [n]);
  return (
    <Section title={title}>
      <div className="h-[300px] overflow-auto px-4 py-2 space-y-2">
        {n === 0 && <EmptyState title="No messages yet" body="Deals start here. Say hello." />}
        {messages.map(c => (
          <div key={c.id} className={(c.kind as string) === "system" ? "text-xs text-muted-foreground py-1" : "text-sm"} data-testid={`row-chat-${c.id}`}>
            {(c.kind as string) === "system" ? <span>{c.text}</span> : (<>
              <span className="font-medium">{c.authorName}</span>
              <span className="text-xs text-muted-foreground ml-2">{new Date(toMs(c.timestamp)).toLocaleTimeString()}</span>
              <p className="whitespace-pre-wrap break-words text-foreground/90">{c.text}</p>
            </>)}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="border-t flex" onSubmit={e => { e.preventDefault(); const t = text.trim(); if (t) onSend(t.slice(0, 4000), () => setText("")); }}>
        <input disabled={!canPost} value={text} onChange={e => setText(e.target.value)} maxLength={4000} placeholder={placeholder} aria-label="Message to everyone"
          className="flex-1 min-w-0 bg-transparent px-4 py-3 text-sm outline-none disabled:opacity-50" data-testid="input-chat" />
        <button type="submit" disabled={!canPost || !text.trim() || pending} className="px-4 border-l text-primary disabled:opacity-40" data-testid="button-send-chat" aria-label="Send to everyone"><Send className="h-4 w-4" /></button>
      </form>
    </Section>
  );
}

/** The settings a newcomer asks about, as key/values (the full list is the configuration page). */
const SHOWN: readonly SettingsKey[] = [
  "language", "planningSeconds", "halfLifeSeconds", "interactionRateHz", "startingObjectCount", "spawnRateHz",
  "startingEnergy", "energyPerSecond", "agentEnergyPerSecond", "maxAgentsPerGod", "defenceRate", "utilitySelectorId",
];

/** "Python · Grid 5×5 base10 rgby · ~6 min (often 3–13) · normal pace". */
export function settingsSummary(s: Settings, instance?: InstanceInfo): string {
  return [s.language === "python" ? "Python" : "TypeScript", instance?.label ?? s.objectType, lengthLine(s), `${paceWord(s.interactionRateHz)} pace`].join(" · ");
}

export function SettingsList({ settings, instance }: { settings: Settings; instance?: InstanceInfo }) {
  return (
    <div className="space-y-2 text-sm" data-testid="list-settings">
      <div>
        <p className="font-medium">{instance ? instance.label : settings.objectType} · {formatValue("language", settings.language)}</p>
        {instance && <div className="mt-1"><BadgeChips badges={instance.badges} /></div>}
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
        {SHOWN.map(k => settings[k] === undefined ? null : (
          <div key={k} className="contents"><dt className="text-muted-foreground truncate">{LABELS[k]}</dt><dd className="font-mono text-right">{formatValue(k, settings[k])}</dd></div>
        ))}
      </dl>
    </div>
  );
}

/** The families of utility functions this world can deal (was "Possible gods"). */
export function UtilityFamilies({ catalog, classes }: { catalog: readonly UtilityFamily[]; classes?: ObjectTypeInfo["classes"] }) {
  const badges = useMemo(() => (classes ?? []).map(c => c.badge), [classes]);
  return <RuleShelf title="Utility functions in this game" entries={catalog} badges={badges} />;
}
