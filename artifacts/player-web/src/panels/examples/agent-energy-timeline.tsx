/**
 * Agent energy and cooldown timeline. Samples your agents once a second (energy is settled by the
 * engine) and draws each agent's energy as a sparkline plus a lane: green while eligible to act,
 * hatched while in cooldown (negative energy), grey while recharging.
 */
import { useEffect, useRef, useState } from "react";
import { definePanel, Sparkline, Timeline, useMyAgents, useGame, fmtBits } from "@sdk";

type Sample = { at: number; energy: number; eligible: boolean };
const WINDOW_S = 120;

export default definePanel({
  title: "Agent energy & cooldowns",
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
        label: `agent ${i + 1}`,
        spans: samples.slice(1).map((s, j) => ({ start: samples[j].at, end: s.at, kind: samples[j].energy < 0 ? "cool" as const : samples[j].eligible ? "ok" as const : "idle" as const })),
      };
    });
    return (
      <div className="space-y-2" data-testid="example-energy">
        <Timeline lanes={lanes} from={Math.max(0, world - WINDOW_S)} to={world} now={world} width={330} />
        <ul className="m-0 list-none space-y-1 p-0 text-[11px]">
          {agents.map((a, i) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="w-14">agent {i + 1}</span>
              <Sparkline values={(history.current.get(a.id) ?? []).map(s => s.energy)} zero width={100} />
              <span className="tabular-nums">{fmtBits(a.energy)} / {fmtBits(a.expectedActCost)} per act</span>
              <span className={a.energy < 0 ? "text-destructive" : a.eligible ? "font-semibold" : "opacity-70"}>
                {a.eligible ? "ready" : `in ${secondsUntilEligible(a).toFixed(1)} s`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  },
});
