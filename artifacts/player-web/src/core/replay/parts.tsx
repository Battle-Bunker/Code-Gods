/**
 * The replay's own pieces (docs/replay-design.md §5–§6), driven by a ReplayController: the transport strip (shell
 * chrome in replay mode), the score chart and the event list of the Timeline panel, and the agent-code dialog.
 */
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TransformationView, type ObjectContext } from "@workspace/object-views";
import { godEnergyAt, stateAt, type ReplayAgent, type ReplayEvent } from "@workspace/player-client/replay";
import { SERIES } from "@/sdk/charts";
import { SPEEDS, describeEvent, shortId } from "./model";
import { useReplay, type Changed, type ReplayController } from "./controller";

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const num = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
export const godColour = (god: number) => SERIES[god % SERIES.length];

/** The replay in force (the dock's replay mode), or null in live play. */
export const ReplayControllerContext = createContext<ReplayController | null>(null);
export const useReplayController = () => useContext(ReplayControllerContext);

const EMPTY: ReadonlyMap<string, Changed> = new Map();
const noop = () => () => {};
/** Objects the last move of the playhead changed (id → version reached, value before), for the board animation; empty in live play. */
export function useReplayChanged(): ReadonlyMap<string, Changed> {
  const c = useReplayController();
  return useSyncExternalStore(c ? c.subscribe : noop, () => (c ? c.changed : EMPTY));
}

/** The agent whose code is open (one dialog for every place that opens one). */
export const AgentCodeContext = createContext<(agentId: string) => void>(() => {});

// ------------------------------------------------------------------------------------------------
// the transport strip
// ------------------------------------------------------------------------------------------------

export function Transport({ controller: c, exitHref }: { controller: ReplayController; exitHref: string }) {
  const v = useReplay(c);
  const [copied, setCopied] = useState(false);
  const button = "inline-flex h-7 min-w-7 items-center justify-center border border-[hsl(var(--card-border))] bg-card px-2 text-xs hover:bg-[hsl(var(--muted))]";
  const roster = c.replay.game.roster;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[hsl(var(--card-border))] bg-card px-3 py-1.5" data-testid="replay-transport" data-cursor={v.cursor} data-events={c.end} data-pov={v.pov}>
      <button type="button" className={button} title="Previous key moment (Shift+←)" onClick={() => c.jump(-1)} data-testid="button-replay-prev-moment">⏮</button>
      <button type="button" className={button} title="Previous event (←)" onClick={() => c.step(-1)} data-testid="button-replay-prev">◂</button>
      <button type="button" className={`${button} bg-primary text-primary-foreground`} title="Play or pause (Space)" onClick={() => c.toggle()} data-testid="button-replay-play">{v.playing ? "❚❚" : "▶"}</button>
      <button type="button" className={button} title="Next event (→)" onClick={() => c.step(1)} data-testid="button-replay-next">▸</button>
      <button type="button" className={button} title="Next key moment (Shift+→)" onClick={() => c.jump(1)} data-testid="button-replay-next-moment">⏭</button>
      <select className={button} value={v.speed} onChange={e => c.setSpeed(Number(e.target.value))} title="Speed: world seconds per second ([ and ])" data-testid="select-replay-speed">
        {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
      </select>
      <span className="font-mono text-xs tabular-nums" data-testid="text-replay-clock">{clock(v.state.world)} <span className="text-muted-foreground">/ {clock(c.replay.endWorld)}</span></span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums" data-testid="text-replay-event">event {v.cursor} of {c.end}</span>
      <span className="label hidden md:inline" data-testid="text-replay-phase">{v.state.phase}</span>
      <div className="relative min-w-[10rem] flex-1">
        <input type="range" min={0} max={c.end} step={1} value={v.cursor} onChange={e => c.seek(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]"
          aria-label="Playhead (event)" data-testid="input-replay-scrub" />
        <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-1.5">
          {c.moments.map((m, i) => (
            <span key={i} className="absolute top-0 h-1.5 w-0.5" style={{ left: `${(m.cursor / Math.max(1, c.end)) * 100}%`,
              background: m.kind === "swing" ? "hsl(var(--chart-4))" : m.kind === "lead" ? "hsl(var(--foreground))" : m.kind === "summon" ? godColour(m.god ?? 0) : "hsl(var(--muted-foreground))" }} />
          ))}
        </div>
      </div>
      <label className="text-xs text-muted-foreground">seen as{" "}
        <select className="border border-[hsl(var(--input))] bg-card px-1 py-0.5 text-xs" value={v.pov} onChange={e => c.setPov(Number(e.target.value))} data-testid="select-replay-pov">
          {roster.map((g, i) => <option key={g.id} value={i}>{g.name}{i === c.replay.viewer.index ? " (you)" : ""}</option>)}
        </select>
      </label>
      <button type="button" className={button} title="Copy a link to this moment" data-testid="button-replay-link"
        onClick={() => { void navigator.clipboard?.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
        {copied ? "Copied" : "Link"}
      </button>
      <a className={button} href={exitHref} data-testid="link-replay-exit">Exit replay</a>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// the Timeline panel's parts
// ------------------------------------------------------------------------------------------------

export function ScoreChart({ controller: c, swings }: { controller: ReplayController; swings: number }) {
  const v = useReplay(c);
  const { replay, series } = c;
  const W = 420, H = 170, m = { l: 36, r: 6, t: 6, b: 18 };
  const all = series.totals.flat();
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = hi - lo || 1;
  const maxWorld = Math.max(replay.endWorld, 1e-9);
  const X = (w: number) => m.l + (w / maxWorld) * (W - m.l - m.r), Y = (val: number) => m.t + (1 - (val - lo) / span) * (H - m.t - m.b);
  const path = (god: number) => series.world.map((w, i) => `${i ? "L" : "M"}${X(w).toFixed(1)},${Y(series.totals[god][i]).toFixed(1)}`).join("");
  const svg = useRef<SVGSVGElement | null>(null);
  const marked = [...c.moments.filter(k => k.kind === "swing")].sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!)).slice(0, swings);
  const ranked = replay.game.roster.map((g, i) => ({ g, i, total: v.state.totals[i] })).sort((a, b) => b.total - a.total);
  return (
    <div className="space-y-2" data-testid="replay-scores">
      <svg ref={svg} width="100%" viewBox={`0 0 ${W} ${H}`} className="cursor-crosshair" role="img" aria-label="Every player's score over world time"
        onClick={e => {
          const box = svg.current!.getBoundingClientRect();
          c.seekWorld(((e.clientX - box.left) / box.width * W - m.l) / (W - m.l - m.r) * maxWorld);
        }}>
        <line x1={m.l} x2={W - m.r} y1={Y(0)} y2={Y(0)} stroke="hsl(var(--border))" />
        <text x={m.l - 4} y={Y(hi) + 4} fontSize="9" textAnchor="end" fill="hsl(var(--muted-foreground))">{num(hi)}</text>
        <text x={m.l - 4} y={Y(lo)} fontSize="9" textAnchor="end" fill="hsl(var(--muted-foreground))">{num(lo)}</text>
        {c.moments.filter(k => k.kind === "lead").map((k, i) => <line key={`l${i}`} x1={X(k.world)} x2={X(k.world)} y1={m.t} y2={H - m.b} stroke="hsl(var(--foreground))" strokeDasharray="2 3" opacity="0.3" />)}
        {c.moments.filter(k => k.kind === "phase" && (k.phase === "paused" || k.phase === "recovery")).map((k, i) => <line key={`p${i}`} x1={X(k.world)} x2={X(k.world)} y1={m.t} y2={H - m.b} stroke="hsl(var(--foreground))" strokeWidth="3" opacity="0.15" />)}
        {replay.game.roster.map((_, god) => <path key={god} d={path(god)} fill="none" stroke={godColour(god)} strokeWidth={god === v.pov ? 2.2 : 1.2} opacity={god === v.pov ? 1 : 0.75} />)}
        {marked.map((k, i) => <path key={`s${i}`} d={`M${X(k.world)},${Y(series.totals[k.god!][Math.min(series.world.length - 1, Math.max(0, series.cursor.findIndex(x => x >= k.cursor)))]) - 6}l3,-5h-6z`} fill="hsl(var(--chart-4))" />)}
        <line x1={X(v.state.world)} x2={X(v.state.world)} y1={0} y2={H - m.b} stroke="hsl(var(--primary))" strokeWidth="1.5" />
        <text x={W - m.r} y={H - 4} fontSize="9" textAnchor="end" fill="hsl(var(--muted-foreground))">world {clock(maxWorld)} · click to go there</text>
      </svg>
      <table className="w-full text-xs" data-testid="replay-standings">
        <tbody>
          {ranked.map(({ g, i, total }, rank) => (
            <tr key={g.id} className={i === v.pov ? "font-semibold" : ""} data-testid={`replay-standing-${g.id}`}>
              <td className="w-5 tabular-nums">{rank + 1}</td>
              <td><span className="mr-1 inline-block h-2 w-2" style={{ background: godColour(i) }} />{g.name}{i === replay.viewer.index ? " (you)" : ""}{g.kind === "ai" ? " · AI" : ""}</td>
              <td className="text-right font-mono tabular-nums" title="God energy at this moment">{num(godEnergyAt(replay, v.state, i))} energy</td>
              <td className="text-right font-mono tabular-nums">{num(total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EventList({ controller: c, ctx }: { controller: ReplayController; ctx: ObjectContext }) {
  const v = useReplay(c);
  const openCode = useContext(AgentCodeContext);
  const { replay } = c, cursor = v.cursor;
  const names = new Map(replay.game.roster.map(g => [g.id, g.name]));
  const from = Math.max(0, cursor - 30), to = Math.min(replay.log.length, cursor + 20);
  const here = useRef<HTMLLIElement | null>(null), list = useRef<HTMLOListElement | null>(null);
  // Keep the current event in view inside the list only (scrollIntoView would scroll the page too).
  useEffect(() => {
    const el = here.current, box = list.current;
    if (!el || !box) return;
    const top = el.offsetTop;   // the list is the rows' offset parent (relative)
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 2);
  }, [cursor]);
  return (
    <ol ref={list} className="relative max-h-[28rem] space-y-0.5 overflow-auto text-xs" data-testid="replay-events">
      {replay.log.slice(from, to).map((entry, k) => {
        const i = from + k, ev = entry.event, applied = i < cursor, current = i === cursor - 1;
        const owner = "ownerId" in ev && ev.ownerId ? replay.roster.get(ev.ownerId) : undefined;
        return (
          <li key={i} ref={current ? here : undefined} data-testid={`replay-event-${i}`}
            className={`cursor-pointer border-l-2 px-2 py-1 ${current ? "bg-[hsl(var(--primary)/0.1)]" : ""} ${applied ? "" : "opacity-40"}`}
            style={{ borderColor: owner !== undefined ? godColour(owner) : "transparent" }} onClick={() => c.seek(i + 1)}>
            <span className="mr-2 font-mono text-muted-foreground tabular-nums">{clock(entry.world)}</span>
            <EventLine ev={ev} names={names} ctx={ctx} onAgent={openCode} />
          </li>
        );
      })}
      {replay.log.length === 0 && <li className="text-muted-foreground">No events.</li>}
    </ol>
  );
}

function EventLine({ ev, names, ctx, onAgent }: { ev: ReplayEvent; names: ReadonlyMap<string, string>; ctx: ObjectContext; onAgent: (id: string) => void }) {
  const code = (id: string | undefined) => id && (
    <button type="button" className="ml-1 font-mono underline" onClick={e => { e.stopPropagation(); onAgent(id); }} data-testid={`button-replay-agent-${id}`}>code</button>
  );
  if (ev.type === "object.transformed") {
    return <span>{describeEvent(ev, names)}{code(ev.agentId)}<span className="mt-0.5 block"><TransformationView before={ev.before} after={ev.value} {...ctx} /></span></span>;
  }
  return <span>{describeEvent(ev, names)}{ev.type === "agent.summoned" || ev.type === "agent.failed" ? code(ev.agentId) : null}</span>;
}

export function AgentCode({ controller: c, agentId, onClose }: { controller: ReplayController; agentId: string; onClose: () => void }) {
  const v = useReplay(c);
  const names = new Map(c.replay.game.roster.map(g => [g.id, g.name]));
  const now = v.state.agents.get(agentId);
  // An agent not summoned yet at the playhead (a click on a later event) is shown as it ended the game, and says so.
  const a: ReplayAgent | undefined = now ?? stateAt(c.replay, c.end).agents.get(agentId);
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

/** Keyboard: Space play/pause, ←/→ one event, Shift+←/→ a key moment, Home/End, [ ] speed. Not while typing. */
export function useReplayKeys(c: ReplayController) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t?.closest?.("iframe, [data-testid=assistant-pane], [role=dialog]")) return;
      if (e.key === " " && t && (t.tagName === "BUTTON" || t.tagName === "A")) return;
      const v = c.get();
      if (e.key === " ") { e.preventDefault(); c.toggle(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.shiftKey ? c.jump(1) : c.step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); e.shiftKey ? c.jump(-1) : c.step(-1); }
      else if (e.key === "Home") { e.preventDefault(); c.seek(0); }
      else if (e.key === "End") { e.preventDefault(); c.seek(c.end); }
      else if (e.key === "[" || e.key === "]") {
        const i = SPEEDS.indexOf(v.speed as typeof SPEEDS[number]);
        c.setSpeed(SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + (e.key === "]" ? 1 : -1)))]);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [c]);
}
