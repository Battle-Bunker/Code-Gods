/**
 * My agents: each agent's status (ready / charging / cooldown), its energy against the cost of one act, an energy
 * sparkline and a timeline lane. Its actions: "Edit a copy" (into the forge) and destroy, with an inline confirm,
 * through the same command path as everything else.
 */
import { useEffect, useState } from "react";
import { AgentCost, formatBits, type ActCostBreakdown } from "@workspace/object-views";
import { Sparkline, Timeline, useGame, useMyAgents } from "@/sdk";
import { useDockActions } from "@/dock/actions";
import { useGameCommands, useRunner } from "@/core/game/runner";
import { LensEmpty, TextButton, type LensProps } from "./kit";

type Sample = { at: number; energy: number; eligible: boolean };
const history = new Map<string, Sample[]>();

export default function Agents({ params, phase }: LensProps<"agents">) {
  const { agents: all, economy, secondsUntilEligible } = useMyAgents({ hz: 1 });
  const game = useGame({ hz: 1 });
  const dock = useDockActions();
  const commands = useGameCommands();
  const { busy, unknown } = useRunner();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const world = game?.worldSeconds ?? 0;
  useEffect(() => {
    for (const a of all) {
      const list = history.get(a.id) ?? [];
      if (list.at(-1)?.at !== world) list.push({ at: world, energy: a.energy, eligible: a.eligible });
      history.set(a.id, list.filter(s => s.at >= world - 600));
    }
    redraw(n => n + 1);
  }, [all, world]);

  const agents = params.agentIds.length ? all.filter(a => params.agentIds.includes(a.id)) : all;
  const canAct = commands.canAct && !unknown && (phase === "running" || phase === "paused" || phase === "planning");
  if (!all.length) {
    return <LensEmpty action={phase === "planning" || phase === "running" ? <TextButton onClick={() => dock.forgeEdit()}>Write an agent</TextButton> : undefined}>
      No agents summoned yet. An agent is a small program that changes objects your way when the world picks it.
    </LensEmpty>;
  }
  const lanes = agents.map((a, i) => {
    const samples = (history.get(a.id) ?? []).filter(s => s.at >= world - params.window);
    return { label: `agent ${i + 1}`, spans: samples.slice(1).map((s, j) => ({ start: samples[j].at, end: s.at, kind: samples[j].energy < 0 ? "cool" as const : samples[j].eligible ? "ok" as const : "idle" as const })) };
  });
  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {agents.map((a, i) => {
          const cap = Math.max(a.expectedActCost * (economy?.agentBatteryActs ?? 2), 1e-9);
          const status = a.energy < 0 ? "cooldown" : a.eligible ? "ready to act" : "charging";
          const wait = a.eligible ? 0 : secondsUntilEligible(a);
          return (
            <li key={a.id} data-testid={`row-agent-${a.id}`} className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-semibold">Agent {i + 1} <span className="font-mono text-xs font-normal text-muted-foreground">{a.language} · summoned for {formatBits(a.summonCost)} bits</span></span>
                <span data-testid={`text-agent-status-${a.id}`} className={`text-xs font-semibold ${a.energy < 0 ? "text-destructive" : a.eligible ? "text-[hsl(var(--accent))]" : "text-muted-foreground"}`}>
                  {status}{!a.eligible && Number.isFinite(wait) && wait > 0 ? ` · ~${formatBits(wait)} s` : ""}
                </span>
              </div>
              <div data-testid={`text-agent-energy-${a.id}`} className="space-y-1">
                <div className="relative h-1.5 overflow-hidden bg-muted" aria-hidden>
                  <div className={`h-full ${a.energy < 0 ? "bg-destructive" : "bg-[hsl(var(--accent))]"}`} style={{ width: `${Math.min(100, (100 * Math.abs(a.energy)) / cap)}%` }} />
                  <div className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${Math.min(100, (100 * a.expectedActCost) / cap)}%` }} title="cost of one act" />
                </div>
                <p className="flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-muted-foreground">
                  <span>⚡ {formatBits(a.energy)} bits · {formatBits(a.expectedActCost)} per act</span>
                  <span>{a.acts} acts · {formatBits(a.spent)} bits spent</span>
                  <Sparkline values={(history.get(a.id) ?? []).filter(s => s.at >= world - params.window).map(s => s.energy)} zero width={90} height={18} label={`agent ${i + 1} energy`} />
                </p>
              </div>
              {params.showCosts && <AgentCost summonCost={a.summonCost} expectedActCost={a.expectedActCost} breakdown={a.breakdown as ActCostBreakdown | undefined} agentEnergyPerSecond={economy?.agentEnergyPerSecond} />}
              {params.showSource && <pre className="max-h-28 overflow-auto bg-secondary p-2 font-mono text-[11px] text-secondary-foreground">{a.source}</pre>}
              <div className="flex flex-wrap gap-4">
                <TextButton testId={`button-load-agent-${a.id}`} onClick={() => dock.forgeEdit(a.source, a.language)}>Edit a copy</TextButton>
                {confirm === a.id ? (<>
                  <TextButton tone="danger" testId={`button-confirm-destroy-${a.id}`} disabled={!!busy} onClick={() => { setConfirm(null); void commands.run({ type: "destroy", agentId: a.id }); }}>Destroy it (free, cannot be undone)</TextButton>
                  <TextButton onClick={() => setConfirm(null)}>Keep</TextButton>
                </>) : (
                  <TextButton testId={`button-destroy-agent-${a.id}`} disabled={!!busy || !canAct} onClick={() => setConfirm(a.id)} title="Free. It can't be undone.">Destroy</TextButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {lanes.some(l => l.spans.length) && <Timeline lanes={lanes} from={Math.max(0, world - params.window)} to={world} now={world} width={380} />}
    </div>
  );
}
