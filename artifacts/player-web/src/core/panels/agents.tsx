/**
 * My agents: each agent's status (can act / waiting), its energy, what an act costs (the summon-time estimate and the
 * actual average), how often it skipped, an energy sparkline, how its acts ended when some failed (the engine's diagnosis, with a fix when most fail) and a timeline lane. Its actions: "Edit a copy" (into the forge) and destroy, with an inline confirm,
 * through the same command path as everything else. Each appears only where it works (core/affordances.ts): neither does in
 * a read-only replay, and Destroy goes after the end. In a replay seen as another god, the panel says whose agents these are.
 */
import { isLanguage } from "@workspace/game-core";
import { useEffect, useState } from "react";
import { AgentCost, formatBits, type ActCostBreakdown } from "@workspace/object-views";
import { Sparkline, Timeline, useGame, useMyAgents, useObservation } from "@/sdk";
import { useDockActions } from "@/dock/actions";
import { useGameCommands } from "@/core/game/runner";
import { useAffordances } from "@/core/use-affordances";
import { AgentName } from "./agent-name";
import { AgentSource } from "./agent-source";
import { pruneSourceOpen } from "./agent-source-state";
import { PanelEmpty, TextButton, type PanelProps } from "./kit";
import { maxShareFor, parseSharePercent, shareProblem, unallocatedLine } from "./power-share";

type Sample = { at: number; energy: number; eligible: boolean };
const history = new Map<string, Sample[]>();

/** One agent's power share as a percentage box (0 to 100): Set sends allocatePower, as Destroy sends destroy. */
function PowerShareControl({ id, share, allocated, onSet, disabled, reason }: {
  id: string; share: number; allocated: number; onSet: (share: number) => void; disabled: boolean; reason?: string;
}) {
  const shown = String(Math.round(share * 1000) / 10);
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? shown;
  const problem = draft === null ? null : shareProblem(draft, share, allocated);
  const parsed = parseSharePercent(text);
  // Only an edit counts: the box shows the share rounded to 0.1%, so an untouched box never re-sends it.
  const changed = draft !== null && parsed !== null && parsed !== share;
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-xs" data-testid={`power-share-${id}`}>
      <label className="text-muted-foreground" htmlFor={`input-power-share-${id}`}>power share</label>
      <input id={`input-power-share-${id}`} data-testid={`input-power-share-${id}`} inputMode="decimal" className="w-16 border border-border bg-background px-1.5 py-0.5 font-mono"
        value={text} disabled={disabled} title={disabled ? reason : `0 to ${Math.round(maxShareFor(share, allocated) * 1000) / 10}%`} onChange={e => setDraft(e.target.value)} />
      <span className="text-muted-foreground">%</span>
      <TextButton testId={`button-set-power-${id}`} disabled={disabled || !changed || !!problem} onClick={() => { if (parsed !== null) { onSet(parsed); setDraft(null); } }}>Set</TextButton>
      {problem && <span data-testid={`text-power-problem-${id}`} className="text-destructive">{problem}</span>}
    </div>
  );
}

export default function Agents({ params, phase }: PanelProps<"agents">) {
  const { agents: all, secondsUntilEligible } = useMyAgents({ hz: 1 });
  const game = useGame({ hz: 1 });
  const self = useObservation({ hz: 1 })?.self;
  const dock = useDockActions();
  const commands = useGameCommands();
  const can = useAffordances();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const world = game?.worldSeconds ?? 0;
  useEffect(() => {
    // Only live agents keep a history: a destroyed agent's (or a past game's) samples go.
    for (const id of [...history.keys()]) if (!all.some(a => a.id === id)) history.delete(id);
    pruneSourceOpen(all.map(a => a.id));
    for (const a of all) {
      const list = history.get(a.id) ?? [];
      if (list.at(-1)?.at !== world) list.push({ at: world, energy: a.energy, eligible: a.eligible });
      history.set(a.id, list.filter(s => s.at >= world - 600));
    }
    redraw(n => n + 1);
  }, [all, world]);

  const agents = params.agentIds.length ? all.filter(a => params.agentIds.includes(a.id)) : all;
  const ended = phase === "ended";
  // Edit a copy and Destroy appear only where they work (core/affordances.ts): never in a replay or read-only.
  const { editCode, destroy, allocatePower } = can.can;
  const showDestroy = destroy.ok || !destroy.hidden;
  const owner = can.seenAs ? <p data-testid="text-agents-owner" className="text-xs text-muted-foreground">Seen as {can.seenAs}: these are {can.whose} agents.</p> : null;
  if (!all.length) {
    return <PanelEmpty action={(phase === "planning" || phase === "running") && editCode.ok ? <TextButton onClick={() => dock.forgeEdit()}>Write an agent</TextButton> : undefined}>
      {can.seenAs ? `${can.seenAs} has no agents ${ended ? "at the end of this game" : "at this moment"}.`
        : can.readOnly && !ended ? "No agents at this moment." : ended ? "You summoned no agents in this game." : "No agents summoned yet. An agent is a small program that changes objects your way when the world picks it."}
    </PanelEmpty>;
  }
  const lanes = agents.map((a, i) => {
    const samples = (history.get(a.id) ?? []).filter(s => s.at >= world - params.window);
    return { label: a.name, spans: samples.slice(1).map((s, j) => ({ start: samples[j].at, end: s.at, kind: samples[j].energy < 0 ? "cool" as const : samples[j].eligible ? "ok" as const : "idle" as const })) };
  });
  return (
    <div className="space-y-4">
      {owner}
      {self?.allocated !== undefined && self.income !== undefined && (
        <p data-testid="text-unallocated-power" className="font-mono text-xs text-muted-foreground">{unallocatedLine(self.allocated, self.income)}</p>
      )}
      <ul className="space-y-4">
        {agents.map((a, i) => {
          // Frozen at the final tick: what the agent was doing when the game ended, and no countdown.
          const status = (ended ? "at the end: " : "") + (a.energy <= 0 ? "waiting for income" : a.eligible ? (ended ? "could act" : "can act") : "at its turn limit");
          const wait = ended ? 0 : secondsUntilEligible(a);
          return (
            <li key={a.id} data-testid={`row-agent-${a.id}`} className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="flex flex-wrap items-baseline gap-x-2"><AgentName id={a.id} name={a.name} description={a.description} /> <span className="font-mono text-xs font-normal text-muted-foreground">{a.language} · summoned for {formatBits(a.summonCost)} bits</span></span>
                <span data-testid={`text-agent-status-${a.id}`} className={`text-xs font-semibold ${a.energy < 0 ? "text-destructive" : a.eligible ? "text-[hsl(var(--accent))]" : "text-muted-foreground"}`}>
                  {status}{a.energy <= 0 && Number.isFinite(wait) && wait > 0 ? ` · ~${formatBits(wait)} s` : ""}
                </span>
              </div>
              <div data-testid={`text-agent-energy-${a.id}`} className="space-y-1">
                <p className="flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-muted-foreground">
                  <span>⚡ energy {formatBits(a.energy)} bits</span>
                  <span>est. {formatBits(a.expectedActCost)} bits per act</span>
                  <span>{a.acts > 0 ? `actual ${formatBits(a.spent / a.acts)} bits per act` : "no acts yet"}</span>
                  <span>{a.acts} acts ({a.skips ?? 0} skipped) · {formatBits(a.spent)} bits spent</span>
                  <Sparkline values={(history.get(a.id) ?? []).filter(s => s.at >= world - params.window).map(s => s.energy)} zero width={90} height={18} label={`agent ${i + 1} energy`} />
                </p>
              </div>
              {a.diagnosis && (
                // How its acts ended (engine-counted) and, when most fail, why and what to change.
                <div data-testid={`text-agent-diagnosis-${a.id}`} className="space-y-0.5 text-xs">
                  <p className={a.diagnosis.hint ? "font-semibold text-destructive" : "text-muted-foreground"}>{a.diagnosis.summary}</p>
                  {a.diagnosis.hint && <p className="text-muted-foreground">{a.diagnosis.hint}</p>}
                </div>
              )}
              {params.showCosts && <AgentCost summonCost={a.summonCost} expectedActCost={a.expectedActCost} breakdown={a.breakdown as ActCostBreakdown | undefined} powerShare={a.powerShare} income={a.income} acts={a.acts} spent={a.spent} />}
              {a.powerShare !== undefined && (allocatePower.ok || !allocatePower.hidden) && (
                <PowerShareControl key={`${a.id}:${a.powerShare}`} id={a.id} share={a.powerShare} allocated={self?.allocated ?? a.powerShare}
                  disabled={!allocatePower.ok} reason={allocatePower.ok ? undefined : allocatePower.reason}
                  onSet={share => void commands.run({ type: "allocatePower", agentId: a.id, share })} />
              )}
              <AgentSource id={a.id} source={a.source} language={a.language} defaultOpen={params.showSource} />
              {(editCode.ok || showDestroy) && (
                <div className="flex flex-wrap gap-4">
                  {editCode.ok && <TextButton testId={`button-load-agent-${a.id}`} onClick={() => dock.forgeEdit(a.source, isLanguage(a.language) ? a.language : undefined)}>Edit a copy</TextButton>}
                  {showDestroy && (confirm === a.id ? (<>
                    <TextButton tone="danger" testId={`button-confirm-destroy-${a.id}`} disabled={!destroy.ok} title={destroy.ok ? undefined : destroy.reason} onClick={() => { setConfirm(null); void commands.run({ type: "destroy", agentId: a.id }); }}>Destroy it (free, cannot be undone)</TextButton>
                    <TextButton onClick={() => setConfirm(null)}>Keep</TextButton>
                  </>) : (
                    <TextButton testId={`button-destroy-agent-${a.id}`} disabled={!destroy.ok} onClick={() => setConfirm(a.id)} title={destroy.ok ? "Free. It can't be undone." : destroy.reason}>Destroy</TextButton>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {ended && <p data-testid="text-agents-ended" className="text-xs text-muted-foreground">
        {can.readOnly ? `These are ${can.whose} agents as they ended the game.` : "The game is over: these are your agents as they ended it. Edit a copy keeps the code for the next game."}
      </p>}
      {lanes.some(l => l.spans.length) && <Timeline lanes={lanes} from={Math.max(0, world - params.window)} to={world} now={world} width={380} />}
    </div>
  );
}
