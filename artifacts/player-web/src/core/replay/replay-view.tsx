/**
 * The replay of an ended game (docs/replay-design.md §4–§10): a timeline of every event that plays at a chosen speed or
 * steps event by event, over the whole game fully revealed (information hiding applies only while a game is live).
 *
 * It pages `player.replay` (the public API any client can use), folds the pages with the reference reducer
 * (`@workspace/player-client/replay`), and draws the state at the playhead: the board through any god's eyes, every
 * god's exact score over time, the event timeline with attribution and each agent's code a click away, every god's
 * goal card, and the chat up to the playhead. Deep links: `?e=<event>` or `?t=<world seconds>`, `&speed=`, `&play=1`,
 * `&as=<god id>`.
 *
 * Read-only: nothing here acts on the game.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import { ObjectView, TransformationView, UtilityCardView, objectContext, type ObjectContext } from "@workspace/object-views";
import {
  buildReplay, cursorAtWorld, godEnergyAt, keyMoments, scoreSeries, stateAt, viewOf,
  type KeyMoment, type Replay, type ReplayAgent, type ReplayEvent, type ReplayPage, type ReplayState,
} from "@workspace/player-client/replay";
import { SERIES } from "@/sdk/charts";
import { DEFAULT_SPEED, SPEEDS, describeEvent, parseReplayParams, replaySearch, shortId } from "./model";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const num = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${num(Math.abs(n))}`;
const colour = (god: number) => SERIES[god % SERIES.length];

// ------------------------------------------------------------------------------------------------
// loading: pages stream in; the view opens with the first
// ------------------------------------------------------------------------------------------------

type Load = { pages: ReplayPage[]; done: boolean; error?: string };

export function useReplayPages(roomId: string, gameId: string): Load {
  const convex = useConvex();
  const [load, setLoad] = useState<Load>({ pages: [], done: false });
  useEffect(() => {
    let live = true;
    setLoad({ pages: [], done: false });
    void (async () => {
      const pages: ReplayPage[] = [];
      let cursor: { afterSeq: number; chatAfter: number; eventOffset?: number } | undefined;
      try {
        for (;;) {
          const page = await convex.query(api.player.replay, { roomId, gameId, ...cursor }) as unknown as ReplayPage;
          if (!live) return;
          pages.push(page);
          setLoad({ pages: [...pages], done: page.done });
          if (page.done) return;
          cursor = { afterSeq: page.nextCursor, chatAfter: page.chatCursor, ...(page.eventOffset !== undefined ? { eventOffset: page.eventOffset } : {}) };
        }
      } catch (error) {
        if (live) setLoad({ pages, done: true, error: (error as { data?: { message?: string } }).data?.message ?? (error as Error).message });
      }
    })();
    return () => { live = false; };
  }, [convex, roomId, gameId]);
  return load;
}

// ------------------------------------------------------------------------------------------------
// the view
// ------------------------------------------------------------------------------------------------

export function ReplayView({ roomId, gameId, meId }: { roomId: string; gameId: string; meId: string | undefined }) {
  const load = useReplayPages(roomId, gameId);
  // Folded once, when every page is in: the playhead, the deep link and the curves all need the whole log.
  const replay = useMemo(() => (load.done && load.pages.length ? buildReplay(load.pages) : null), [load.done, load.pages]);
  if (load.error && !replay) return <p className="text-sm text-destructive" data-testid="text-replay-error">The replay could not be loaded: {load.error}</p>;
  if (!replay) {
    const events = load.pages.reduce((n, p) => n + p.batches.reduce((m, b) => m + b.events.length, 0), 0);
    return <p className="text-sm text-muted-foreground" data-testid="status-replay-loading">Loading the replay… {events ? `${events} events so far` : ""}</p>;
  }
  return (
    <>
      {load.error && <p className="text-sm text-destructive" data-testid="text-replay-partial">Only part of the replay could be loaded ({load.error}); it stops early.</p>}
      <ReplayPlayer replay={replay} meId={meId} />
    </>
  );
}

function ReplayPlayer({ replay, meId }: { replay: Replay; meId: string | undefined }) {
  const end = replay.log.length;
  const initial = useMemo(() => parseReplayParams(location.search), []);
  const [cursor, setCursor] = useState(() => initial.e !== undefined ? Math.min(initial.e, end) : initial.t !== undefined ? cursorAtWorld(replay, initial.t) : end);
  const [playing, setPlaying] = useState(initial.play);
  const [speed, setSpeed] = useState(initial.speed);
  const roster = replay.game.roster;
  const [pov, setPov] = useState(() => {
    const wanted = roster.findIndex(g => g.id === (initial.as ?? meId));
    return wanted >= 0 ? wanted : Math.max(0, replay.viewer.index);
  });
  const [agent, setAgent] = useState<string | null>(null);
  const names = useMemo(() => new Map(roster.map(g => [g.id, g.name])), [roster]);
  const state = useMemo(() => stateAt(replay, cursor), [replay, cursor]);
  const series = useMemo(() => scoreSeries(replay), [replay]);
  const moments = useMemo(() => keyMoments(replay), [replay]);

  // Playback in world time: the playhead advances `speed` world seconds per second; quiet stretches longer than two
  // seconds of playback are skipped.
  // The loop reads the cursor through a ref, so it runs once per play, not once per event; it measures time itself
  // (a frame's timestamp can precede a performance.now() taken just before it was requested: never a negative step).
  const world = useRef(state.world);
  const at = useRef(cursor);
  at.current = cursor;
  useEffect(() => { if (!playing) world.current = state.world; }, [state.world, playing]);
  useEffect(() => {
    if (!playing) return;
    if (at.current >= end) { setPlaying(false); return; }
    let last = performance.now(), frame = 0;
    const tick = () => {
      const now = performance.now();
      world.current += Math.max(0, now - last) / 1000 * speed;
      last = now;
      let next = Math.max(at.current, cursorAtWorld(replay, world.current));
      const upcoming = replay.log[next];
      if (next === at.current && upcoming && upcoming.world - world.current > 2 * speed) {
        world.current = replay.worldMax[next];
        next = Math.max(at.current, cursorAtWorld(replay, world.current));
      }
      if (next !== at.current) { at.current = Math.min(next, end); setCursor(at.current); }
      if (next >= end) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, replay, end]);

  // The URL follows the playhead when it stops (never while playing).
  useEffect(() => {
    if (playing) return;
    const search = replaySearch(location.search, { e: cursor, speed, as: roster[pov]?.id });
    if (search !== location.search) history.replaceState(history.state, "", `${location.pathname}${search}`);
  }, [cursor, speed, pov, playing, roster]);

  const seek = useCallback((c: number) => { setPlaying(false); setCursor(Math.max(0, Math.min(end, c))); }, [end]);
  // Play from the end starts over (the loop's world clock too, or it would stop at once).
  const toggle = useCallback(() => {
    if (playing) { setPlaying(false); return; }
    if (at.current >= end) { at.current = 0; world.current = 0; setCursor(0); }
    setPlaying(true);
  }, [playing, end]);
  const jump = useCallback((dir: 1 | -1) => {
    const target = dir > 0 ? moments.find(m => m.cursor > cursor) : [...moments].reverse().find(m => m.cursor < cursor);
    seek(target ? target.cursor : dir > 0 ? end : 0);
  }, [moments, cursor, seek, end]);

  // Keyboard: Space play/pause, ←/→ one event, Shift+←/→ a key moment, Home/End, [ ] speed. Not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === " " && t && (t.tagName === "BUTTON" || t.tagName === "A")) return;   // a focused control's own Space
      if (e.key === " ") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.shiftKey ? jump(1) : seek(cursor + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.shiftKey ? jump(-1) : seek(cursor - 1); }
      else if (e.key === "Home") { e.preventDefault(); seek(0); }
      else if (e.key === "End") { e.preventDefault(); seek(end); }
      else if (e.key === "[" || e.key === "]") {
        const i = SPEEDS.indexOf(speed as typeof SPEEDS[number]);
        setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.indexOf(DEFAULT_SPEED) : i) + (e.key === "]" ? 1 : -1)))]);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [cursor, seek, jump, end, speed, toggle]);

  const ctx = objectContext(replay.game.objectInstance as Parameters<typeof objectContext>[0]);
  const last = cursor > 0 ? replay.log[cursor - 1] : undefined;
  const schema = replay.game.logSchema ?? 1;

  return (
    <section className="space-y-3" data-testid="replay" data-cursor={cursor} data-events={end}>
      <Transport replay={replay} cursor={cursor} state={state} playing={playing} speed={speed} moments={moments}
        onPlay={toggle} onSeek={seek} onJump={jump} onSpeed={setSpeed} />
      {schema < (replay.game.currentLogSchema ?? schema) && (
        <p className="border border-[hsl(var(--chart-4))] bg-[hsl(var(--chart-4)/0.12)] px-3 py-2 text-xs" data-testid="text-replay-legacy">
          This game was recorded before the event log was complete{schema < 2 ? ": agents' code and exact chat times are missing for its earlier part" : ": its acts carry no seeds"}.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <Card title="Board" aside={
          <label className="text-xs text-muted-foreground">seen as{" "}
            <select className="border border-[hsl(var(--input))] bg-card px-1 py-0.5 text-xs" value={pov} onChange={e => setPov(Number(e.target.value))} data-testid="select-replay-pov">
              {roster.map((g, i) => <option key={g.id} value={i}>{g.name}{g.id === meId ? " (you)" : ""}</option>)}
            </select>
          </label>}>
          <Board replay={replay} state={state} pov={pov} ctx={ctx} lastObject={last && "objectId" in last.event ? last.event.objectId : undefined} />
        </Card>
        <Card title="Events" aside={<span className="text-xs text-muted-foreground">click one to go there</span>}>
          <Events replay={replay} cursor={cursor} names={names} ctx={ctx} onSeek={seek} onAgent={setAgent} />
        </Card>
        <div className="space-y-3">
          <Card title="Scores" aside={<span className="text-xs text-muted-foreground">exact after every event</span>}>
            <Scores replay={replay} series={series} state={state} cursor={cursor} moments={moments} pov={pov} meId={meId} onSeek={seek} />
          </Card>
          <Card title="Agents">
            <Agents replay={replay} state={state} names={names} onAgent={setAgent} />
          </Card>
          <Card title="Chat"><Chat replay={replay} world={state.world} cursor={cursor} end={end} onSeek={seek} /></Card>
        </div>
      </div>
      <Card title="Every player's goal">
        <Goals replay={replay} state={state} ctx={ctx} meId={meId} />
      </Card>
      {agent && <AgentCode replay={replay} state={state} agentId={agent} names={names} onClose={() => setAgent(null)} />}
    </section>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 border border-[hsl(var(--card-border))] bg-card">
      <div className="flex items-center gap-2 border-b border-[hsl(var(--card-border))] px-3 py-1.5"><h2 className="label">{title}</h2><span className="ml-auto">{aside}</span></div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// transport strip
// ------------------------------------------------------------------------------------------------

function Transport({ replay, cursor, state, playing, speed, moments, onPlay, onSeek, onJump, onSpeed }: {
  replay: Replay; cursor: number; state: ReplayState; playing: boolean; speed: number; moments: KeyMoment[];
  onPlay: () => void; onSeek: (c: number) => void; onJump: (d: 1 | -1) => void; onSpeed: (s: number) => void;
}) {
  const end = replay.log.length;
  const [copied, setCopied] = useState(false);
  const button = "inline-flex h-7 min-w-7 items-center justify-center border border-[hsl(var(--card-border))] bg-card px-2 text-xs hover:bg-[hsl(var(--muted))]";
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border border-[hsl(var(--card-border))] bg-card px-3 py-2" data-testid="replay-transport">
      <button type="button" className={button} title="Previous key moment (Shift+←)" onClick={() => onJump(-1)} data-testid="button-replay-prev-moment">⏮</button>
      <button type="button" className={button} title="Previous event (←)" onClick={() => onSeek(cursor - 1)} data-testid="button-replay-prev">◂</button>
      <button type="button" className={`${button} bg-primary text-primary-foreground`} title="Play or pause (Space)" onClick={onPlay} data-testid="button-replay-play">{playing ? "❚❚" : "▶"}</button>
      <button type="button" className={button} title="Next event (→)" onClick={() => onSeek(cursor + 1)} data-testid="button-replay-next">▸</button>
      <button type="button" className={button} title="Next key moment (Shift+→)" onClick={() => onJump(1)} data-testid="button-replay-next-moment">⏭</button>
      <select className={button} value={speed} onChange={e => onSpeed(Number(e.target.value))} title="Speed: world seconds per second ([ and ])" data-testid="select-replay-speed">
        {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
      </select>
      <span className="font-mono text-xs tabular-nums" data-testid="text-replay-clock">{clock(state.world)} <span className="text-muted-foreground">/ {clock(replay.endWorld)} world</span></span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums" data-testid="text-replay-event">event {cursor} of {end}</span>
      <div className="relative min-w-[12rem] flex-1">
        <input type="range" min={0} max={end} step={1} value={cursor} onChange={e => onSeek(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]"
          aria-label="Playhead (event)" data-testid="input-replay-scrub" />
        <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-1.5">
          {moments.map((m, i) => (
            <span key={i} className="absolute top-0 h-1.5 w-0.5" style={{ left: `${(m.cursor / Math.max(1, end)) * 100}%`, background: m.kind === "swing" ? "hsl(var(--chart-4))" : m.kind === "lead" ? "hsl(var(--foreground))" : m.kind === "summon" ? colour(m.god ?? 0) : "hsl(var(--muted-foreground))" }} />
          ))}
        </div>
      </div>
      <button type="button" className={button} title="Copy a link to this moment" data-testid="button-replay-link"
        onClick={() => { void navigator.clipboard?.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
        {copied ? "Copied" : "Link"}
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// board, events, scores, agents, chat, goals
// ------------------------------------------------------------------------------------------------

function Board({ replay, state, pov, ctx, lastObject }: { replay: Replay; state: ReplayState; pov: number; ctx: ObjectContext; lastObject?: string }) {
  const rows = useMemo(() => [...state.objects.values()].map(o => ({ o, v: viewOf(o.net, pov) })).sort((a, b) => b.v.payoff - a.v.payoff || (a.o.id < b.o.id ? -1 : 1)), [state, pov]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No objects yet at this moment.</p>;
  const name = replay.game.roster[pov]?.name ?? "";
  return (
    <div className="max-h-[32rem] space-y-1 overflow-auto" data-testid="replay-board">
      <p className="text-xs text-muted-foreground">{rows.length} objects by {name}'s payoff: their bits × what the others care.</p>
      {rows.slice(0, 40).map(({ o, v }) => (
        <div key={o.id} className={`flex items-center gap-3 border-b border-dashed border-[hsl(var(--muted))] py-1 ${o.id === lastObject ? "bg-[hsl(var(--chart-4)/0.2)]" : ""}`}
          data-testid={`replay-object-${o.id}`}>
          <span className="min-w-0 flex-1 truncate"><ObjectView value={o.value} {...ctx} showTitle /></span>
          <span className="text-right font-mono text-xs tabular-nums">
            <span style={{ color: "var(--yours, #0b6aa0)" }}>{num(v.netBits)}</span> × <span style={{ color: "var(--others, #b52d6e)" }}>{num(v.peerCare)}</span>
            <br /><b>{num(v.payoff)}</b>
          </span>
        </div>
      ))}
      {rows.length > 40 && <p className="text-xs text-muted-foreground">…and {rows.length - 40} more.</p>}
    </div>
  );
}

function Events({ replay, cursor, names, ctx, onSeek, onAgent }: {
  replay: Replay; cursor: number; names: ReadonlyMap<string, string>; ctx: ObjectContext; onSeek: (c: number) => void; onAgent: (id: string) => void;
}) {
  const from = Math.max(0, cursor - 30), to = Math.min(replay.log.length, cursor + 20);
  const here = useRef<HTMLLIElement | null>(null), list = useRef<HTMLOListElement | null>(null);
  // Keep the current event in view inside the list only (scrollIntoView would scroll the page too).
  useEffect(() => {
    const el = here.current, box = list.current;
    if (!el || !box) return;
    const top = el.offsetTop;   // the list is the rows' offset parent (relative)
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 2);
  }, [cursor]);
  const roster = replay.roster;
  return (
    <ol ref={list} className="relative max-h-[32rem] space-y-0.5 overflow-auto text-xs" data-testid="replay-events">
      {replay.log.slice(from, to).map((entry, k) => {
        const i = from + k, ev = entry.event, applied = i < cursor, current = i === cursor - 1;
        const owner = "ownerId" in ev && ev.ownerId ? roster.get(ev.ownerId) : undefined;
        return (
          <li key={i} ref={current ? here : undefined} data-testid={`replay-event-${i}`}
            className={`cursor-pointer border-l-2 px-2 py-1 ${current ? "bg-[hsl(var(--primary)/0.1)]" : ""} ${applied ? "" : "opacity-40"}`}
            style={{ borderColor: owner !== undefined ? colour(owner) : "transparent" }} onClick={() => onSeek(i + 1)}>
            <span className="mr-2 font-mono text-muted-foreground tabular-nums">{clock(entry.world)}</span>
            <EventLine ev={ev} names={names} ctx={ctx} onAgent={onAgent} />
          </li>
        );
      })}
      {replay.log.length === 0 && <li className="text-muted-foreground">No events.</li>}
    </ol>
  );
}

function EventLine({ ev, names, ctx, onAgent }: { ev: ReplayEvent; names: ReadonlyMap<string, string>; ctx: ObjectContext; onAgent: (id: string) => void }) {
  const agentLink = (id: string | undefined) => id && (
    <button type="button" className="ml-1 font-mono underline" onClick={e => { e.stopPropagation(); onAgent(id); }} data-testid={`button-replay-agent-${id}`}>code</button>
  );
  if (ev.type === "object.transformed") {
    return (
      <span>
        {describeEvent(ev, names)}{agentLink(ev.agentId)}
        <span className="mt-0.5 block"><TransformationView before={ev.before} after={ev.value} {...ctx} /></span>
      </span>
    );
  }
  return <span>{describeEvent(ev, names)}{ev.type === "agent.summoned" || ev.type === "agent.failed" ? agentLink(ev.agentId) : null}</span>;
}

function Scores({ replay, series, state, cursor, moments, pov, meId, onSeek }: {
  replay: Replay; series: ReturnType<typeof scoreSeries>; state: ReplayState; cursor: number; moments: KeyMoment[]; pov: number; meId: string | undefined; onSeek: (c: number) => void;
}) {
  const W = 360, H = 170, m = { l: 36, r: 6, t: 6, b: 18 };
  const all = series.totals.flat();
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
  const maxWorld = Math.max(replay.endWorld, 1e-9);
  const X = (w: number) => m.l + (w / maxWorld) * (W - m.l - m.r), Y = (v: number) => m.t + (1 - (v - lo) / span) * (H - m.t - m.b);
  const path = (god: number) => series.world.map((w, i) => `${i ? "L" : "M"}${X(w).toFixed(1)},${Y(series.totals[god][i]).toFixed(1)}`).join("");
  const svg = useRef<SVGSVGElement | null>(null);
  const ranked = replay.game.roster.map((g, i) => ({ g, i, total: state.totals[i] })).sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-2" data-testid="replay-scores">
      <svg ref={svg} width="100%" viewBox={`0 0 ${W} ${H}`} className="cursor-crosshair" role="img" aria-label="Every player's score over world time"
        onClick={e => {
          const box = svg.current!.getBoundingClientRect();
          const world = ((e.clientX - box.left) / box.width * W - m.l) / (W - m.l - m.r) * maxWorld;
          onSeek(cursorAtWorld(replay, world));
        }}>
        <line x1={m.l} x2={W - m.r} y1={Y(0)} y2={Y(0)} stroke="hsl(var(--border))" />
        <text x={m.l - 4} y={Y(hi) + 4} fontSize="9" textAnchor="end" fill="hsl(var(--muted-foreground))">{num(hi)}</text>
        <text x={m.l - 4} y={Y(lo)} fontSize="9" textAnchor="end" fill="hsl(var(--muted-foreground))">{num(lo)}</text>
        {moments.filter(k => k.kind === "lead").map((k, i) => <line key={i} x1={X(k.world)} x2={X(k.world)} y1={m.t} y2={H - m.b} stroke="hsl(var(--foreground))" strokeDasharray="2 3" opacity="0.3" />)}
        {replay.game.roster.map((_, god) => <path key={god} d={path(god)} fill="none" stroke={colour(god)} strokeWidth={god === pov ? 2.2 : 1.2} opacity={god === pov ? 1 : 0.75} />)}
        <line x1={X(state.world)} x2={X(state.world)} y1={0} y2={H - m.b} stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <text x={W - m.r} y={H - 4} fontSize="9" textAnchor="end" fill="hsl(var(--muted-foreground))">world {clock(maxWorld)} · click to go there</text>
      </svg>
      <table className="w-full text-xs" data-testid="replay-standings">
        <tbody>
          {ranked.map(({ g, i, total }, rank) => (
            <tr key={g.id} className={i === pov ? "font-semibold" : ""} data-testid={`replay-standing-${g.id}`}>
              <td className="w-5 tabular-nums">{rank + 1}</td>
              <td><span className="mr-1 inline-block h-2 w-2" style={{ background: colour(i) }} />{g.name}{g.id === meId ? " (you)" : ""}{g.kind === "ai" ? " · AI" : ""}</td>
              <td className="text-right font-mono tabular-nums" title="God energy at this moment">{num(godEnergyAt(replay, state, i))} energy</td>
              <td className="text-right font-mono tabular-nums">{num(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">Event {cursor}: totals are exact here; the curves are drawn from {series.cursor.length} points.</p>
    </div>
  );
}

function Agents({ replay, state, names, onAgent }: { replay: Replay; state: ReplayState; names: ReadonlyMap<string, string>; onAgent: (id: string) => void }) {
  const agents = [...state.agents.values()].sort((a, b) => Number(b.alive) - Number(a.alive) || a.summonedAt - b.summonedAt);
  if (!agents.length) return <p className="text-sm text-muted-foreground">No agents yet at this moment.</p>;
  return (
    <ul className="max-h-60 space-y-1 overflow-auto text-xs" data-testid="replay-agents">
      {agents.map(a => (
        <li key={a.id} className={a.alive ? "" : "opacity-50"} data-testid={`replay-agent-${a.id}`}>
          <span className="mr-1 inline-block h-2 w-2" style={{ background: colour(replay.roster.get(a.ownerId) ?? 0) }} />
          <b className="font-mono">{shortId(a.id)}</b> {names.get(a.ownerId) ?? "?"} · {a.language ?? "?"} · {a.acts} acts ({a.transforms} changed)
          {a.account && a.expectedActCost !== undefined ? ` · energy ${num(a.account.balance)}` : ""}{a.alive ? "" : ` · destroyed ${clock(a.destroyedAt ?? 0)}`}
          <button type="button" className="ml-1 underline" onClick={() => onAgent(a.id)}>code</button>
        </li>
      ))}
    </ul>
  );
}

function Chat({ replay, world, cursor, end, onSeek }: { replay: Replay; world: number; cursor: number; end: number; onSeek: (c: number) => void }) {
  if (!replay.chat.length) return <p className="text-sm text-muted-foreground">No messages.</p>;
  const atEnd = cursor >= end;
  return (
    <ul className="max-h-48 space-y-1 overflow-auto text-xs" data-testid="replay-chat">
      {replay.chat.map(msg => (
        <li key={msg.id} className={`cursor-pointer ${atEnd || msg.world <= world ? "" : "opacity-35"}`} onClick={() => onSeek(cursorAtWorld(replay, msg.world))}>
          <span className="mr-1 font-mono text-muted-foreground">{clock(msg.world)}</span><b>{msg.authorName}</b>{msg.kind === "ai" ? " (AI)" : ""}: {msg.text}
        </li>
      ))}
    </ul>
  );
}

function Goals({ replay, state, ctx, meId }: { replay: Replay; state: ReplayState; ctx: ObjectContext; meId: string | undefined }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="replay-goals">
      {replay.gods.map(g => {
        const entry = replay.game.roster[g.index];
        return (
          <div key={g.godId} className="space-y-2" data-testid={`replay-goal-${g.godId}`}>
            <h3 className="text-sm font-semibold"><span className="mr-1 inline-block h-2 w-2" style={{ background: colour(g.index) }} />
              {entry?.name ?? g.godId}{g.godId === meId ? " (you)" : ""} · score {num(state.totals[g.index] ?? 0)}</h3>
            {g.card ? <UtilityCardView card={g.card as Parameters<typeof UtilityCardView>[0]["card"]} grid={ctx.grid} /> : null}
            {g.aiAgent && <p className="text-xs text-muted-foreground">AI seat: {g.aiAgent.name} ({g.aiAgent.provider} {g.aiAgent.model}). Its instructions: “{g.aiAgent.prompt.slice(0, 400)}{g.aiAgent.prompt.length > 400 ? "…" : ""}”</p>}
          </div>
        );
      })}
    </div>
  );
}

function AgentCode({ replay, state, agentId, names, onClose }: { replay: Replay; state: ReplayState; agentId: string; names: ReadonlyMap<string, string>; onClose: () => void }) {
  const now = state.agents.get(agentId);
  // An agent not summoned yet at the playhead (a click on a later event) is shown as it ended the game, and says so.
  const a: ReplayAgent | undefined = now ?? stateAt(replay, replay.log.length).agents.get(agentId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose} data-testid="replay-agent-code">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto border border-[hsl(var(--card-border))] bg-card p-4" onClick={e => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-semibold">Agent <span className="font-mono">{shortId(agentId)}</span> · {names.get(a?.ownerId ?? "") ?? "?"}</h2>
          <button type="button" className="ml-auto text-sm underline" onClick={onClose} data-testid="button-replay-agent-close">Close</button>
        </div>
        {a ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {a.language ?? "language unknown"} · summoned {clock(a.summonedAt)}{a.summonCost !== undefined ? ` for ${num(a.summonCost)} bits` : ""}
              {a.expectedActCost !== undefined ? ` · about ${num(a.expectedActCost)} bits an act` : ""} · {a.acts} acts {now ? "so far" : "by the end of the game (it is not summoned yet at this moment)"} ({a.transforms} changed, {a.failures} failed)
              {a.alive ? "" : ` · destroyed at ${clock(a.destroyedAt ?? 0)}`}
            </p>
            {a.source !== undefined
              ? <pre className="overflow-auto bg-secondary p-3 font-mono text-[12px] text-secondary-foreground" data-testid="text-replay-agent-source">{a.source}</pre>
              : <p className="text-sm text-muted-foreground">This agent was summoned before summons were recorded; its code is not in the log.</p>}
          </>
        ) : <p className="text-sm text-muted-foreground">No such agent in this game.</p>}
      </div>
    </div>
  );
}
