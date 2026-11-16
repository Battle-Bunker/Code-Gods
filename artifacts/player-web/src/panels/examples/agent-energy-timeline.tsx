/**
 * Agent energy over time. One row per agent: its energy as it changes (each answer the engine settles is one sample,
 * kept in this panel for the last two minutes of world time), against its capacity, its income and what an act has
 * cost it on average, and whether it can act now, is working (spending as fast as it earns), is waiting for income, or
 * is stuck.
 */
import { useRef } from "react";
import { definePanel, fmtNum, useAgentEnergy, useMyAgents, type Agent } from "@sdk";

const WINDOW_S = 120;
const energy = (x: number) => `${fmtNum(x)} energy`;
/** An agent below zero (the built-in My agents pane's rule): overdrawn by at most 2 s of income it is working; stuck past 10 s or with none. */
const overdrawn = (energy: number, income: number): "none" | "working" | "waiting" | "stuck" =>
  energy > 0 ? "none" : !(income > 0) ? "stuck" : -energy <= 2 * income ? "working" : -energy > 10 * income ? "stuck" : "waiting";

function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 120, h = 24, lo = Math.min(0, ...values), hi = Math.max(0, ...values), span = hi - lo || 1;
  const y = (v: number) => h - ((v - lo) / span) * h;
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * w},${y(v)}`).join(" ");
  return (
    <svg width={w} height={h} role="img" aria-label={label} className="shrink-0">
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" />
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} />
    </svg>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const e = useAgentEnergy(agent.agentId);
  const history = useRef<{ at: number; energy: number }[]>([]);
  if (e && history.current.at(-1)?.at !== e.settledAt) {
    history.current = [...history.current, { at: e.settledAt, energy: e.energy }].filter(s => s.at >= e.settledAt - WINDOW_S);
  }
  if (!e) return <li className="text-xs opacity-60">{agent.name}: …</li>;
  const state = overdrawn(e.energy, e.perSecond);
  const full = e.energy > 0 && e.energy >= e.capacity;
  return (
    <li className="space-y-0.5 text-xs" data-testid={`example-energy-${agent.agentId}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold">{agent.name}</span>
        <Sparkline values={history.current.map(s => s.energy)} label={`${agent.name}: energy over time`} />
      </div>
      <div className="flex flex-wrap gap-x-3 tabular-nums">
        <span>Energy {energy(e.energy)} of {energy(e.capacity)}{full ? " (full: income is wasted)" : ""}</span>
        <span className="opacity-70">Income {energy(e.perSecond)}/s</span>
        <span className="opacity-70">Per act {e.acts ? energy(e.spend / e.acts) : "–"} ({e.acts} acts, {e.skips} skips, {e.failures} failed)</span>
        <span className={state === "stuck" ? "text-destructive" : state === "none" ? "font-semibold" : "opacity-70"}>
          {state === "none" ? "can act now" : state === "working" ? "working: it spends energy as fast as it earns it" : state === "waiting" ? "waiting for income" : "stuck: no income to act on"}
        </span>
      </div>
    </li>
  );
}

export default definePanel({
  title: "Agent energy",
  placement: "left",
  size: "md",
  Component() {
    const agents = useMyAgents();
    if (!agents) return <p className="text-xs italic opacity-60">Loading…</p>;
    if (!agents.length) return <p className="text-xs italic opacity-60">No agents yet.</p>;
    return (
      <div className="space-y-2" data-testid="example-energy">
        <p className="text-xs font-medium">Each agent over the last {WINDOW_S} world seconds</p>
        <ul className="m-0 list-none space-y-2 p-0">{agents.map(a => <AgentRow key={a.agentId} agent={a} />)}</ul>
      </div>
    );
  },
});
