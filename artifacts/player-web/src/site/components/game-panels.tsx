import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import type { ChatMessage, InstanceInfo, ObjectTypeInfo, RosterEntry, Settings, Standing, UtilityFamily } from "@/site/lib/types";
import { api, useLive, useLivePages } from "@/site/lib/convex";
import { ErrorBoundary, type ErrorFallbackProps } from "@/components/error-boundary";
import { errMsg } from "@/site/lib/errors";
import { VirtualRows } from "@/components/virtual-rows";
import { EmptyState, ErrorLine, Section } from "@/site/components/page-parts";
import { fmt } from "@/site/lib/errors";
import { toMs } from "@/site/lib/time";
import { allowedLanguages } from "@workspace/game-core";
import { formatValue, LABELS, lengthLine, paceWord, type SettingsKey } from "@/site/lib/settings-form";
import { Bot, Crown, Send, User } from "lucide-react";
import { BadgeChips, ObjectView, RuleShelf, objectContext, objectRowHeight } from "@workspace/object-views";
import { Term } from "@workspace/ui-kit";

/** Standings and roster in one list: rank, name, AI or human, score, the owner's crown. Public totals only. */
export function Leaderboard({ rows, roster, meId, ownerId, agentCount, planning, emptyBody = "Scores appear once the world begins to run." }: {
  rows: readonly Standing[]; roster: readonly RosterEntry[]; meId?: string; ownerId?: string | null; agentCount?: number; planning?: boolean; emptyBody?: string;
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
      <p className="px-4 pt-2 text-xs text-muted-foreground">Points: for each object, a player's ✨ rarity times how much the others want it, added up over every object now.</p>
      {planning && rows.length > 0 && <p className="px-4 pt-1 text-xs text-muted-foreground" data-testid="text-standings-planning">Starting position: the world is not running yet, so no agent has moved anything.</p>}
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

/** One page of the game's standings (games.standings): the leaderboard re-renders when the scoreboard is published. */
export function GameStandings({ gameId, roster, meId, ownerId, planning, emptyBody }: {
  gameId: string; roster: readonly RosterEntry[]; meId?: string; ownerId?: string | null; planning?: boolean; emptyBody?: string;
}) {
  const standings = useLive(api.games.standings, { gameId: gameId as Id<"games"> }).data;
  return <Leaderboard rows={standings?.rows ?? []} roster={roster} meId={meId} ownerId={ownerId} agentCount={standings?.agentCount ?? undefined} planning={planning} emptyBody={emptyBody} />;
}

const OBJECT_PAGE = 50;

/**
 * The world's objects, hottest first. Public: only salience (Σ of every player's net bits, with its disclosure noise
 * while live), never anyone's own score. A skeleton (games.objectIds: ids and salience, paged by the index) and one
 * subscription per visible row (games.object); rows scrolled out of view unmount and drop theirs.
 */
export function Objects(props: { gameId: string; instance?: InstanceInfo; emptyBody?: string }) {
  return <ErrorBoundary FallbackComponent={ObjectsError} resetKey={props.gameId}><ObjectList {...props} /></ErrorBoundary>;
}

/** A panel whose query failed: the error, and a retry that subscribes afresh. */
const PanelError = (title: string) => function PanelErrorLine({ error, resetError }: ErrorFallbackProps) {
  return <Section title={title}><div className="p-4"><ErrorLine message={errMsg(error)} onRetry={resetError} /></div></Section>;
};
const ObjectsError = PanelError("Objects");
const ChatError = PanelError("Public chat");

function ObjectList({ gameId, instance, emptyBody = "Objects appear once the world begins to run." }: { gameId: string; instance?: InstanceInfo; emptyBody?: string }) {
  const skeleton = useLivePages(api.games.objectIds, { gameId: gameId as Id<"games"> }, { initialNumItems: OBJECT_PAGE });
  const { status, loadMore } = skeleton;
  // Pages hold disjoint index ranges, so an id is never listed twice; the guard keeps React keys unique regardless.
  const rows = useMemo(() => { const seen = new Set<string>(); return skeleton.results.filter(r => !seen.has(r.id) && !!seen.add(r.id)); }, [skeleton.results]);
  const max = Math.max(1, ...rows.slice(0, 1).map(r => Math.abs(r.salience ?? 0)));
  const ctx = objectContext(instance);
  const rowHeight = objectRowHeight(ctx);
  const more = useCallback(() => { if (status === "CanLoadMore") loadMore(OBJECT_PAGE); }, [status, loadMore]);
  return (
    <Section title="Objects" count={status === "Exhausted" ? rows.length : undefined}>
      <p className="px-4 pt-2 pb-1 text-xs text-muted-foreground">Hottest first. 🔥 <Term id="salience" /> is how much ✨ rarity all players together see in an object; who likes what stays secret.</p>
      {status === "LoadingFirstPage" ? <p className="px-4 py-3 text-sm text-muted-foreground" data-testid="status-objects-loading">Loading objects…</p>
      : rows.length === 0 ? <EmptyState title="No objects yet" body={emptyBody} /> : (<>
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] text-xs text-muted-foreground border-b">
          <span className="px-4 py-2">#</span><span className="py-2">Object</span><span className="px-4 py-2 text-right">🔥</span>
        </div>
        <VirtualRows rows={rows} rowHeight={rowHeight} maxHeight={560} keyOf={r => r.id} onNearEnd={more} testId="list-objects"
          render={(r, i) => <ObjectRow objectId={r.id} rank={i + 1} max={max} ctx={ctx} />} />
      </>)}
    </Section>
  );
}

/** One object row: its own subscription (games.object), held while the row is mounted (visible). */
function ObjectRow({ objectId, rank, max, ctx }: { objectId: string; rank: number; max: number; ctx: ReturnType<typeof objectContext> }) {
  const o = useLive(api.games.object, { objectId }).data;
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center h-full border-t text-sm" data-testid={`row-object-${objectId}`}>
      <span className="px-4 font-mono text-muted-foreground">{rank}</span>
      <span className="font-mono min-w-0">{o ? <ObjectView value={o.value} {...ctx} showTitle /> : <span className="text-muted-foreground">…</span>}</span>
      <span className="px-4 flex items-center justify-end gap-2">
        <span className="w-12 sm:w-16 h-1.5 bg-muted overflow-hidden"><span className="block h-full bg-accent origin-left" style={{ transform: `scaleX(${o ? Math.min(1, Math.max(0, o.salience) / max) : 0})` }} /></span>
        <span className="font-mono tabular-nums w-14 text-right">{o ? fmt(o.salience, 1) : ""}</span>
      </span>
    </div>
  );
}

const CHAT_PAGE = 50;

/** One game's public chat (rooms.chat with its gameId): newest page first, older pages on request. */
type GameChatProps = { roomId: string; gameId: string } & Omit<Parameters<typeof Chat>[0], "messages" | "onOlder">;
export function GameChat(props: GameChatProps) {
  return <ErrorBoundary FallbackComponent={ChatError} resetKey={props.gameId}><GameChatPages {...props} /></ErrorBoundary>;
}

function GameChatPages({ roomId, gameId, ...chat }: GameChatProps) {
  const page = useLivePages(api.rooms.chat, { roomId: roomId as Id<"rooms">, gameId: gameId as Id<"games"> }, { initialNumItems: CHAT_PAGE });
  const messages = useMemo(() => [...page.results].reverse(), [page.results]);
  return <Chat {...chat} messages={messages} onOlder={page.status === "CanLoadMore" ? () => page.loadMore(CHAT_PAGE) : undefined} />;
}

/** Public chat: the only free-text input on the site pages. */
/** `closed`: why nobody can post here (e.g. the game is over); the composer is replaced by that line. */
/** `onOlder`: loads earlier messages (a paged chat); shown above the oldest one. */
export function Chat({ messages, canPost, placeholder, pending, onSend, title = "Public chat", closed, onOlder }: {
  messages: readonly ChatMessage[]; canPost: boolean; placeholder: string; pending: boolean;
  onSend: (text: string, done: () => void) => void; title?: string; closed?: string; onOlder?: () => void;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const n = messages.length;
  const newest = messages.at(-1)?.id, oldest = messages[0]?.id;
  // Follow the newest message.
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [newest]);
  // An older page loading above keeps what the reader was looking at in place.
  const before = useRef<{ oldest?: string; height: number }>({ height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (before.current.oldest && oldest !== before.current.oldest) el.scrollTop += el.scrollHeight - before.current.height;
    before.current = { oldest, height: el.scrollHeight };
  }, [oldest, n]);
  return (
    <Section title={title}>
      <div ref={box} className="h-[300px] overflow-auto px-4 py-2 space-y-2">
        {onOlder && <button type="button" onClick={onOlder} className="text-xs underline underline-offset-4 text-muted-foreground" data-testid="button-chat-older">Earlier messages</button>}
        {n === 0 && <EmptyState title="No messages yet" body="Deals start here. Say hello." />}
        {messages.map(c => (
          <div key={c.id} className={(c.kind as string) === "system" ? "text-xs text-muted-foreground py-1" : "text-sm"} data-testid={`row-chat-${c.id}`}>
            {(c.kind as string) === "system" ? <span>{c.text}</span> : (<>
              <span className="font-medium">{c.authorName}</span>
              <span className="text-xs text-muted-foreground ml-2">{new Date(toMs(c.timestamp)).toLocaleTimeString()}</span>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-foreground/90">{c.text}</p>
            </>)}
          </div>
        ))}
        <div ref={end} />
      </div>
      {closed ? <p className="border-t px-4 py-3 text-sm text-muted-foreground" data-testid="text-chat-closed">{closed}</p> : (
      <form className="border-t flex" onSubmit={e => { e.preventDefault(); const t = text.trim(); if (t) onSend(t.slice(0, 4000), () => setText("")); }}>
        <input disabled={!canPost} value={text} onChange={e => setText(e.target.value)} maxLength={4000} placeholder={placeholder} aria-label="Message to everyone"
          className="flex-1 min-w-0 bg-transparent px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50" data-testid="input-chat" />
        <button type="submit" disabled={!canPost || !text.trim() || pending} className="px-4 border-l text-primary disabled:opacity-40" data-testid="button-send-chat" aria-label="Send to everyone"><Send className="h-4 w-4" /></button>
      </form>)}
    </Section>
  );
}

/** The settings a newcomer asks about, as key/values (the full list is the configuration page). */
const SHOWN: readonly SettingsKey[] = [
  "languages", "planningSeconds", "halfLifeSeconds", "interactionRateHz", "startingObjectCount", "spawnRateHz",
  "startingEnergy", "powerPerSecond", "fullChargeSeconds", "maxAgentsPerGod", "defenceGoals", "utilitySelectorId",
];

/** "Python · Grid 4×4 base10 · 75 s planning, then a 5 min game · slow pace". */
export function settingsSummary(s: Settings, instance?: InstanceInfo): string {
  return [formatValue("languages", allowedLanguages(s)), instance?.label ?? s.objectType, lengthLine(s), `${paceWord(s.interactionRateHz)} pace`].join(" · ");
}

export function SettingsList({ settings, instance }: { settings: Settings; instance?: InstanceInfo }) {
  return (
    <div className="space-y-2 text-sm" data-testid="list-settings">
      <div>
        <p className="font-medium">{instance ? instance.label : settings.objectType} · {formatValue("languages", allowedLanguages(settings))}</p>
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
