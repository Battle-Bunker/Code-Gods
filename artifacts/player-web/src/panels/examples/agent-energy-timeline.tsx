/**
 * Agent energy timeline. Samples your agents once a second (energy is settled by the engine) and draws one named row per
 * agent: green while it can act now (energy above 0), dashed while it waits for income (energy 0 or below), grey while it
 * is at its turn limit. Each agent's energy is a sparkline with a sentence (against its capacity when the game has one); a legend explains the colours and the "now" line.
 */
import { useEffect, useRef, useState } from "react";
import { definePanel, Sparkline, Timeline, TimelineLegend, useMyAgents, useGame } from "@sdk";

type Sample = { at: number; energy: number; eligible: boolean };
const WINDOW_S = 120;
const bits = (x: number) => `${(Math.round(x * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 }).replace("-", "−")} bits`;
/** An agent's name, or "Agent 1", "Agent 2"… when it has none. */
const nameOf = (name: string | undefined, i: number) => name?.trim() || `Agent ${i + 1}`;
const LEGEND = [
  { kind: "ok", label: "can act now (energy above 0)" },
  { kind: "cool", label: "waiting for income (energy 0 or below)" },
] as const;

export default definePanel({
  title: "Agent energy",
  placement: "left",
  size: "md",
  Component() {
    const { agents, secondsUntilEligible } = useMyAgents({ hz: 1 });
    const game = useGame({ hz: 1 });
    const history = useRef(new Map<string, Sample[]>());
    const [, redraw] = useState(0);
    const world = game?.worldSeconds ?? 0;
    useEffect(() => {
      for (const a of agents) {
        const list = history.current.get(a.id) ?? [];
        if (list.at(-1)?.at !== world) list.push({ at: world, energy: a.energy, eligible: a.eligible });
        history.current.set(a.id, list.filter(s => s.at >= world - WINDOW_S));
      }
      redraw(n => n + 1);
    }, [agents, world]);
    if (!agents.length) return <p className="text-[12px] italic opacity-60">No agents yet.</p>;
    const lanes = agents.map((a, i) => {
      const samples = history.current.get(a.id) ?? [];
      return {
        label: nameOf(a.name, i),
        spans: samples.slice(1).map((s, j) => ({ start: samples[j].at, end: s.at, kind: samples[j].energy <= 0 ? "cool" as const : samples[j].eligible ? "ok" as const : "idle" as const })),
      };
    });
    return (
      <div className="space-y-2" data-testid="example-energy">
        <p className="text-[11px] font-medium">Each agent over the last {Math.min(WINDOW_S, Math.round(world))} world seconds</p>
        <Timeline lanes={lanes} from={Math.max(0, world - WINDOW_S)} to={world} now={world} width={330} />
        <TimelineLegend items={LEGEND} />
        <ul className="m-0 list-none space-y-1.5 p-0 text-[11px]">
          {agents.map((a, i) => (
            <li key={a.id} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{nameOf(a.name, i)}</span>
                <Sparkline values={(history.current.get(a.id) ?? []).map(s => s.energy)} zero width={100} label={`${nameOf(a.name, i)}: energy over time`} />
              </div>
              <div className="flex flex-wrap gap-x-3">
                <span className="tabular-nums">Energy {bits(a.energy)}{a.capacity !== undefined && ` of ${bits(a.capacity)}${a.energy > 0 && a.energy >= a.capacity ? " (full: income is wasted)" : ""}`}</span>
                <span className="tabular-nums opacity-70">Estimate per act {bits(a.expectedActCost)}</span>
                <span className={a.energy <= 0 ? "text-destructive" : a.eligible ? "font-semibold" : "opacity-70"}>
                  {a.energy <= 0 ? `waiting for income (about ${secondsUntilEligible(a).toFixed(1)} s)` : a.eligible ? "can act now" : "at its turn limit"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  },
});
