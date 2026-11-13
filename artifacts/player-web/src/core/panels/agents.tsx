/**
 * My agents: every number is written as a sentence a newcomer can read (core/panels/agent-labels.ts), with the key words
 * as hover glossary terms. "Your points now" and the player's own line (their power, how it is split, their energy for
 * summoning; energy is always written ⚡, never "bits") come first; each agent also says what its latest act did to your
 * rule score and points (score-lines.tsx);
 * then, per agent: its status, power share and income, energy (with a meter against its capacity and the time until it
 * is full, or the warning that a full store wastes its income; in a game without capacity, a meter of how many seconds
 * of its income it holds), what it spent (reading and changing), the actual average per act against the summon-time estimate, how often it
 * skipped, how its acts ended when some failed (the engine's diagnosis, with a fix when most fail), the power-share
 * control (slider, percentage box and Set: allocatePower; before Set it says what the new share does to the agent's
 * capacity and to the player's own, what would be lost, and what debt moves with the power) and "Edit a copy" / Destroy
 * (inline confirm, which says what destroying an overdrawn agent does to the player's own energy). An agent below zero
 * in a game with capacity says by how much it is overdrawn (how far it may be, in the tooltip); a player below zero is told the same and when
 * they can summon again (docs/energy-model.md §7.2). Last, a timeline
 * with a legend and one named row per agent. Each action appears only where it works (core/affordances.ts): none does in
 * a read-only replay, and Destroy goes after the end. In a replay seen as another god, the panel says whose agents these are.
 */
import { changeCostKid, costModelOf, isLanguage, type CostModel } from "@workspace/game-core";
import { SCORE_LINES, Term } from "@workspace/ui-kit";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Sparkline, Timeline, TimelineLegend, useAgentSeries, useDockState, useEvents, useGame, useMyAgents, type MyAgent } from "@/sdk";
import { useDockActions } from "@/dock/actions";
import { runner, useGameCommands, useRunner, type Lang } from "@/core/game/runner";
import { BUSY_NOTHING_CHANGED, PUTTING_BACK, COMPARISON_CAVEAT, MOVE_MEANS, firstSummonLabel, putBackLabel, versionComparison } from "./first-agent";
import { usePreviousVersion } from "./use-previous-version";
import { notifyError } from "@/core/notices";
import { useAffordances } from "@/core/use-affordances";
import type { Affordances } from "@/core/affordances";
import { AgentName, agentLabel } from "./agent-name";
import { destroyedText } from "@/core/game/command-deadline";
import { AgentSource } from "./agent-source";
import { pruneSourceOpen } from "./agent-source-state";
import {
  STATE_LEGEND, actualLine, afterShareLine, agentState, energyLine, estimateLine, laneKind, num, perSecond, plain, runwayFraction, runwaySeconds, runwayText,
  allocationSettled, shareLine, skipLine, spentLine, statusText, summonLine, yourPowerLine, type Seg,
} from "./agent-labels";
import { OWN_FULL_DETAIL, destroyReturnsLine, fullStoreAdvice, WORKING_TEXT, fullStoreOneAgent, spendsAsItEarns, overdraft, overdraftTone, agentDebtDetail, agentDebtLine, destroyDebtLine, fillText, owes, ownEnergyLine, ownStoreFull, shareCapacityLines, storeFraction, storeState, storedLine } from "./energy-capacity";
import { PanelEmpty, TextButton, type PanelProps } from "./kit";
import { maxShareFor, parseSharePercent, shareProblem } from "./power-share";
import { PointsNow, useOpenObject, useOwnActLines } from "./score-lines";
import { useDock } from "@/dock/store";

export type Sample = { at: number; energy: number; eligible: boolean };

/** A sentence whose glossary words are hover terms. */
function Say({ segs }: { segs: readonly Seg[] }) {
  return <>{segs.map((s, i) => (typeof s === "string" ? <span key={i}>{s}</span> : <Term key={i} id={s.term}>{s.text}</Term>))}</>;
}

/** The energy as a bar: how many seconds of the agent's income it holds (full at 10 s), explained by its tooltip. */
function EnergyMeter({ energy, income }: { energy: number; income: number }) {
  const secs = runwaySeconds(energy, income);
  const text = runwayText(energy, income);
  return (
    <span className="inline-flex items-center gap-1.5" title={text} data-testid="meter-agent-energy">
      <span role="meter" aria-label={text} aria-valuemin={0} aria-valuemax={10} aria-valuenow={Math.min(10, secs ?? 0)} className="inline-block h-1.5 w-20 bg-muted">
        <span className={`block h-full ${overdraftTone(overdraft(energy, income)) === "alarm" ? "bg-destructive" : "bg-[hsl(var(--accent))]"}`} style={{ width: `${Math.round(runwayFraction(secs ?? 0) * 100)}%` }} />
      </span>
      <span className="text-muted-foreground">{secs === null ? "no income" : `${num(secs)} s of its income`}</span>
    </span>
  );
}

/** The energy as a bar against what the store can hold, with the time until it is full or the warning that it is. */
function CapacityMeter({ energy, income, capacity, testId, bare, spending }: { energy: number; income: number; capacity: number; testId: string; /** The bar alone: the sentence beside it already says it. */ bare?: boolean; /** It spends its energy as it earns it, so it will not fill: no "full in N s". */ spending?: boolean }) {
  const full = storeState(energy, income, capacity) === "full";
  const text = spending && !full ? "it spends energy as it earns it" : fillText(energy, income, capacity);
  const label = `${num(energy)} of ${num(capacity)} ⚡: ${text}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5" title={`Holds at most ${num(capacity)} ⚡. Income past that is not stored.`} data-testid={testId}>
      <span role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={Math.min(capacity, Math.max(0, energy))} className="inline-block h-1.5 w-20 bg-muted">
        {/* A full store is good news: never red. */}
        <span className="block h-full bg-[hsl(var(--accent))]" style={{ width: `${Math.round(storeFraction(energy, capacity) * 100)}%` }} />
      </span>
      {!bare && <span className={full ? "font-semibold text-foreground" : "text-muted-foreground"}>{text}</span>}
    </span>
  );
}

/**
 * One agent's power share: a slider and a percentage box (each moves the other), what that means in bits per second and
 * for you, and Set, which sends allocatePower as Destroy sends destroy. The slider stops at what your other agents leave.
 * In a game with capacity (`fullChargeSeconds`), the caption also says what each store will hold and what would be lost.
 */
function PowerShareControl({ id, share, allocated, total, fullChargeSeconds, agentEnergy, ownEnergy, onSet, disabled, reason }: {
  id: string; share: number; allocated: number; total: number; fullChargeSeconds?: number; agentEnergy: number; ownEnergy: number;
  onSet: (share: number) => void; disabled: boolean; reason?: string;
}) {
  const shown = String(Math.round(share * 1000) / 10);
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? shown;
  const problem = draft === null ? null : shareProblem(draft, share, allocated);
  const parsed = parseSharePercent(text);
  const max = maxShareFor(share, allocated);
  // Only an edit counts: the box shows the share rounded to 0.1%, so an untouched box never re-sends it.
  const changed = draft !== null && parsed !== null && parsed !== share;
  return (
    <div className="space-y-1 text-xs" data-testid={`power-share-${id}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <label className="text-muted-foreground" htmlFor={`input-power-share-${id}`}><Term id="power-share">Change power share</Term></label>
        <input type="range" data-testid={`input-power-slider-${id}`} aria-label="Power share slider" min={0} max={Math.floor(max * 100)} step={1} className="w-28 accent-[hsl(var(--accent))]"
          value={Math.min(Math.floor(max * 100), Math.round((parsed ?? share) * 100))} disabled={disabled} title={disabled ? reason : `Drag to give this agent 0 to ${num(max * 100)}% of your power`}
          onChange={e => setDraft(e.target.value)} />
        <input id={`input-power-share-${id}`} data-testid={`input-power-share-${id}`} inputMode="decimal" className="w-14 border border-border bg-background px-1.5 py-0.5 font-mono"
          value={text} disabled={disabled} title={disabled ? reason : `0 to ${num(max * 100)}%`} onChange={e => setDraft(e.target.value)} />
        <span className="text-muted-foreground">%{parsed !== null && <> = {perSecond(parsed * total)}</>}</span>
        <TextButton testId={`button-set-power-${id}`} disabled={disabled || !changed || !!problem} onClick={() => { if (parsed !== null) { onSet(parsed); setDraft(null); } }}>Set</TextButton>
      </div>
      {problem
        ? <p data-testid={`text-power-problem-${id}`} className="text-destructive">{problem}</p>
        : changed && parsed !== null && (<>
          <p data-testid={`text-power-preview-${id}`} className="text-muted-foreground">{afterShareLine(parsed, share, allocated, total)}</p>
          {shareCapacityLines({ newShare: parsed, agentShare: share, allocated, total, fullChargeSeconds, agentEnergy, ownEnergy }).map((line, i) => (
            <p key={i} data-testid={`text-power-capacity-${id}-${i}`} className={line.includes("lost") || line.includes("cannot summon") || line.includes("will be overdrawn") ? "font-semibold text-destructive" : "text-muted-foreground"}>{line}</p>
          ))}
        </>)}
    </div>
  );
}

export type AgentsViewProps = {
  agents: readonly MyAgent[];
  /** Your own power line: the whole budget (bits per world second), the share given to agents, your income, energy and its capacity. */
  self?: { allocated?: number; income?: number; energy?: number; capacity?: number };
  powerPerSecond?: number;
  /** economy.fullChargeSeconds: every store holds at most this many seconds of its power (absent: the game has no capacity). */
  fullChargeSeconds?: number;
  /** κ, economy.changeReadRatio: bits read for the price of one bit changed (1 on a replay of a game before the read price). */
  changeReadRatio?: number;
  /** economy.costModel: how the room prices a changed cell (absent: set-v1). */
  costModel?: CostModel;
  world: number;
  samples: ReadonlyMap<string, readonly Sample[]>;
  window: number;
  ended: boolean;
  showCosts: boolean;
  showSource: boolean;
  can: Affordances["can"];
  /** The agents are shown as another player sees them (a replay): no advice about what to do with them. */
  seenAs?: boolean;
  wait: (a: MyAgent) => number;
  onEdit: (a: MyAgent) => void;
  onSetShare: (a: MyAgent, share: number) => void;
  onDestroy: (a: MyAgent) => void;
  footer?: ReactNode;
  /** The player's allocated total disagrees with the agents listed (a destroy or a new share still arriving): the split is not shown. */
  settling?: boolean;
  /** "Your points now", above your power line (the panel passes <PointsNow />). */
  header?: ReactNode;
  /** Agent id → one plain sentence for its latest act: the change, your rule score, the points (score-line.ts). */
  actLines?: ReadonlyMap<string, string>;
  /** Agent id → the object its latest act changed, and how to open that object's detail in Objects. */
  /** "Other starting points": opens the editor with its shelf of ready-made agents open. */
  onOtherStarts?: () => void;
  actObjects?: ReadonlyMap<string, string>;
  onShowObject?: (objectId: string, from?: string) => void;
  /** Agent id → what its moves among the recent events earned (score-line.ts earningsLine). */
  earnLines?: ReadonlyMap<string, string>;
  /** Agent id → for an agent that replaced an earlier version: the comparison (null until there is enough to compare) and the way back. */
  versions?: ReadonlyMap<string, { text: string | null; /** The comparison is shown: its caveat goes under it. */ caveat?: boolean; /** The put-back button's words (it is a paid summon). */ label?: string; onRevert?: () => void; /** A command is in flight: the button waits. */ busy?: boolean; /** The put-back is in flight: said in the button's place. */ status?: string }>;
  /** The agent whose row is ringed for a moment ("See it in My agents"). */
  rung?: string | null;
};

/** The panel without its data hooks, so the gallery (src/gallery/agents.tsx) can draw it from fixtures. */
export function AgentsView({ agents, self, powerPerSecond, fullChargeSeconds, changeReadRatio, costModel, world, samples, window: windowS, ended, showCosts, showSource, can, wait, onEdit, onSetShare, onDestroy, footer, header, actLines, actObjects, onShowObject, onOtherStarts, earnLines, versions, rung, settling, seenAs }: AgentsViewProps) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const { editCode, destroy, allocatePower } = can;
  const showDestroy = destroy.ok || !destroy.hidden;
  const total = powerPerSecond ?? ((self?.income ?? 0) + agents.reduce((n, a) => n + (a.income ?? 0), 0));
  const lanes = agents.map((a, i) => {
    const list = (samples.get(a.id) ?? []).filter(s => s.at >= world - windowS);
    return { label: agentLabel(a.name, i), spans: list.slice(1).map((s, j) => ({ start: list[j].at, end: s.at, kind: laneKind(list[j], a.income) })) };   // the samples (dock.agentSeries) carry energy only, so each is judged by the agent's income now
  });
  return (
    <div className="space-y-4">
      {header}
      {self?.allocated !== undefined && self.income !== undefined && (
        <div className="space-y-1 text-xs" data-testid="text-unallocated-power">
          <p className="font-medium text-foreground" title={SCORE_LINES.energy}><Say segs={yourPowerLine({ total, allocated: self.allocated, income: self.income, energy: self.energy ?? 0, settling })} /></p>
          {self.capacity !== undefined && (
            <p data-testid="text-own-capacity" title={ownStoreFull(self.energy ?? 0, self.capacity) ? OWN_FULL_DETAIL : undefined} className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${self.capacity > 0 && owes(self.energy ?? 0) === 0 ? "text-foreground" : "font-semibold text-destructive"}`}>
              {fullStoreAdvice({ ended, agents: agents.length, energy: self.energy ?? 0, capacity: self.capacity, canAllocate: allocatePower.ok, hasShare: agents[0]?.powerShare !== undefined, seenAs: !!seenAs }) ? (<>
                <span data-testid="text-full-one-agent">{fullStoreOneAgent(agentLabel(agents[0].name, 0))}</span>
                {/* The controls are one press away; nothing is changed by the press itself. */}
                <TextButton boxed testId="button-give-more-power" onClick={() => { const input = document.getElementById(`input-power-share-${agents[0].id}`); input?.scrollIntoView({ block: "center" }); input?.focus(); }}>Give {agentLabel(agents[0].name, 0)} more power</TextButton>
                {onOtherStarts && <TextButton boxed testId="button-other-starts" onClick={onOtherStarts}>Other starting points</TextButton>}
              </>) : <span><Say segs={ownEnergyLine({ energy: self.energy ?? 0, income: self.income, capacity: self.capacity })} /></span>}
              {self.capacity > 0 && owes(self.energy ?? 0) === 0 && <CapacityMeter bare testId="meter-own-energy" energy={self.energy ?? 0} income={self.income} capacity={self.capacity} />}
            </p>
          )}
          {/* The explanation is one closed disclosure, so the agents come first ("That's a LOT of text."). */}
          <details data-testid="details-how-energy-works" className="space-y-1">
          <summary className="cursor-pointer font-semibold text-muted-foreground">How energy works</summary>
          <p className="mt-1 text-muted-foreground" data-testid="text-energy-income">⚡ is <Term id="energy">energy</Term>: {SCORE_LINES.energy}</p>
          <p className="text-muted-foreground">
            The world hands out <Term id="turn">turns</Term> at random: the more energy an agent has, the more turns it gets. An act pays what it
            looks at (<Term id="read-bits">reading cost</Term>{changeReadRatio !== undefined && changeReadRatio > 1 ? `: looking is ${changeReadRatio}× cheaper than changing` : ""}) plus, if it changes the object, the <Term id="change-cost">change cost</Term>. Every turn also pays a little for being given its object, so a turn is never free. <span data-testid="text-change-cost-rule">{changeCostKid(costModelOf(costModel))}</span>
          </p>
          </details>
        </div>
      )}
      <ul className="space-y-4">
        {agents.map((a, i) => {
          const state = agentState(a);
          const label = agentLabel(a.name, i);
          const history = (samples.get(a.id) ?? []).filter(s => s.at >= world - windowS).map(s => s.energy);
          // Against its capacity when the game has one and the agent is not in debt (debt shows as it always did).
          const capped = a.capacity !== undefined && a.energy > 0;
          const debt = agentDebtLine(a.energy, a.capacity, a.income);
          const destroyDebt = confirm === a.id ? destroyDebtLine({ agentEnergy: a.energy, agentShare: a.powerShare ?? 0, ownEnergy: self?.energy ?? 0, allocated: self?.allocated ?? a.powerShare ?? 0, total, fullChargeSeconds }) : null;
          // A routine overdraft is work, not trouble: red only when the agent cannot act for a long time (energy-capacity.ts overdraft).
          const over = overdraft(a.energy, a.income ?? 0), alarm = overdraftTone(over) === "alarm";
          const working = over === "working" && !ended;
          const statusColour = working || state === "can" ? "text-[hsl(var(--accent))]" : state === "waiting" && alarm ? "text-destructive" : "text-muted-foreground";
          return (
            <li key={a.id} data-testid={`row-agent-${a.id}`} className={`min-w-0 scroll-mt-2 space-y-1.5 ${rung === a.id ? "attention-ring" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="flex flex-wrap items-baseline gap-x-2"><AgentName id={a.id} name={label} description={a.description} /> <span className="text-xs font-normal text-muted-foreground">{a.language} · <span data-testid={`text-agent-summon-${a.id}`}><Say segs={summonLine(a.summonCost)} /></span></span></span>
                <span data-testid={`text-agent-status-${a.id}`} className={`text-xs font-semibold ${statusColour}`}>{working ? "working" : statusText(state, ended, ended ? 0 : wait(a))}</span>
              </div>
              {/* Did the change help: first in the row, above the energy details (it was below the fold). The comparison
                  is over the new version's FIRST moves and frozen, with its caveat; then the way back, a paid summon. */}
              {versions?.get(a.id) && (
                <div data-testid={`text-agent-version-${a.id}`} className="space-y-0.5 border-l-2 border-primary pl-2 text-xs text-foreground">
                  {versions.get(a.id)!.text && <p title={MOVE_MEANS}>{versions.get(a.id)!.text}</p>}
                  {versions.get(a.id)!.caveat && <p className="text-muted-foreground" data-testid={`text-agent-version-caveat-${a.id}`}>{COMPARISON_CAVEAT} {MOVE_MEANS}</p>}
                  {versions.get(a.id)!.status
                    ? <p role="status" className="font-semibold" data-testid={`text-agent-putting-back-${a.id}`}>{versions.get(a.id)!.status}</p>
                    : versions.get(a.id)!.onRevert && <TextButton boxed testId={`button-revert-version-${a.id}`} disabled={!!versions.get(a.id)!.busy} onClick={versions.get(a.id)!.onRevert!}>{versions.get(a.id)!.label}</TextButton>}
                </div>
              )}
              <div data-testid={`text-agent-energy-${a.id}`} className="space-y-0.5 text-xs text-muted-foreground">
                {a.powerShare !== undefined && a.income !== undefined && <p data-testid={`text-agent-share-${a.id}`}><Say segs={shareLine(a.powerShare, a.income)} /></p>}
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={alarm ? "font-semibold text-destructive" : "text-foreground"}><Say segs={capped ? storedLine(a.energy, a.capacity!) : debt || working ? [{ term: "agent-energy", text: "Energy" }, ` ${num(a.energy)} ⚡`] : energyLine(a.energy)} /></span>
                  {/* A game without capacities has no line beside it: the routine overdraft is still said as work. */}
                  {working && !debt && <span data-testid={`text-agent-working-${a.id}`} className="text-muted-foreground">{WORKING_TEXT}</span>}
                  {debt && <span data-testid={`text-agent-debt-${a.id}`} title={agentDebtDetail(a.capacity) ?? undefined} className={alarm ? "font-semibold text-destructive" : "text-muted-foreground"}>{debt}</span>}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {capped ? <CapacityMeter testId={`meter-agent-capacity-${a.id}`} energy={a.energy} income={a.income ?? 0} capacity={a.capacity!}
                    spending={!ended && spendsAsItEarns({ energy: a.energy, income: a.income ?? 0, acts: a.acts })} /> : <EnergyMeter energy={a.energy} income={a.income ?? 0} />}
                  <span title="Energy over the last minutes of this game: the dashed line is 0" className="inline-flex items-center"><Sparkline values={history} zero width={90} height={18} label={`${label}: energy over time`} /></span>
                </p>
                <p data-testid={`text-agent-spent-${a.id}`}><Say segs={spentLine(a.spent, a.spentRead, a.acts)} /></p>
                <p data-testid={`text-actual-act-cost-${a.id}`}><Say segs={actualLine(a.spent, a.acts, a.expectedActCost)} /></p>
                <p data-testid={`text-agent-skips-${a.id}`}><Say segs={skipLine(a.skips ?? 0)} /></p>
                {showCosts && <p data-testid={`text-expected-act-cost-${a.id}`}><Say segs={estimateLine(a.expectedActCost, a.breakdown)} /></p>}
              </div>
              {actLines?.get(a.id) && <p data-testid={`text-agent-act-${a.id}`} className="text-xs text-foreground">Latest: {actLines.get(a.id)}
                {actObjects?.get(a.id) && onShowObject && <>{" "}<TextButton testId={`button-agent-act-object-${a.id}`} onClick={() => onShowObject(actObjects.get(a.id)!, actLines.get(a.id))}>show this grid</TextButton></>}</p>}
              {/* What its moves earned, so two agents can be compared; the window is said in the line itself. */}
              {earnLines?.get(a.id) && <p data-testid={`text-agent-earned-${a.id}`} className="text-xs text-foreground">{earnLines.get(a.id)}</p>}
              {a.diagnosis && (
                // How its acts ended (engine-counted) and, when most fail, why and what to change.
                <div data-testid={`text-agent-diagnosis-${a.id}`} className="space-y-0.5 text-xs">
                  <p className={a.diagnosis.hint ? "font-semibold text-destructive" : "text-muted-foreground"}>{a.diagnosis.summary}</p>
                  {a.diagnosis.hint && <p className="text-muted-foreground">{a.diagnosis.hint}</p>}
                </div>
              )}
              {a.powerShare !== undefined && (allocatePower.ok || !allocatePower.hidden) && (
                <PowerShareControl key={`${a.id}:${a.powerShare}`} id={a.id} share={a.powerShare} allocated={self?.allocated ?? a.powerShare} total={total}
                  fullChargeSeconds={fullChargeSeconds} agentEnergy={a.energy} ownEnergy={self?.energy ?? 0}
                  disabled={!allocatePower.ok} reason={allocatePower.ok ? undefined : allocatePower.reason}
                  onSet={share => onSetShare(a, share)} />
              )}
              <AgentSource id={a.id} source={a.source} language={a.language} defaultOpen={showSource} />
              {(editCode.ok || showDestroy) && (
                <div className="flex flex-wrap gap-4">
                  {editCode.ok && <TextButton testId={`button-load-agent-${a.id}`} onClick={() => onEdit(a)}>Edit a copy</TextButton>}
                  {showDestroy && (confirm === a.id ? (<>
                    <TextButton tone="danger" testId={`button-confirm-destroy-${a.id}`} disabled={!destroy.ok} title={destroy.ok ? undefined : destroy.reason} onClick={() => { setConfirm(null); onDestroy(a); }}>{destroyDebt ? "Destroy it (cannot be undone)" : "Destroy it (free, cannot be undone)"}</TextButton>
                    <TextButton onClick={() => setConfirm(null)}>Keep</TextButton>
                  </>) : (
                    <TextButton testId={`button-destroy-agent-${a.id}`} disabled={!destroy.ok} onClick={() => setConfirm(a.id)} title={destroy.ok ? "Free. It can't be undone." : destroy.reason}>Destroy</TextButton>
                  ))}
                  {confirm === a.id && !destroyDebt && destroyReturnsLine(a.energy) && <p data-testid={`text-destroy-returns-${a.id}`} className="basis-full text-xs text-muted-foreground">{destroyReturnsLine(a.energy)}</p>}
                  {destroyDebt && <p data-testid={`text-destroy-debt-${a.id}`} role="alert" className="basis-full text-xs font-semibold text-destructive">{destroyDebt}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {footer}
      {lanes.some(l => l.spans.length) && (
        <div className="space-y-1" data-testid="agents-timeline">
          <p className="text-xs font-medium">What each agent could do, over the last {Math.min(windowS, Math.round(world))} world seconds</p>
          <Timeline lanes={lanes} from={Math.max(0, world - windowS)} to={world} now={world} width={380} />
          <TimelineLegend items={STATE_LEGEND} now="now" />
        </div>
      )}
    </div>
  );
}

export default function Agents({ params, phase, paneId }: PanelProps<"agents">) {
  const { agents: all, economy, secondsUntilEligible, loading: agentsLoading } = useMyAgents({ hz: 1 });
  const game = useGame({ hz: 1 });
  const self = useDockState({ hz: 1 })?.self;
  // Each agent's energy at every scoreboard publication, kept by the server (dock.agentSeries), and its energy now.
  const series = useAgentSeries(game?.gameId);
  const dock = useDockActions();
  const runnerState = useRunner();
  const summoning = runnerState.busy === "summon";
  const commands = useGameCommands();
  const can = useAffordances();
  const world = game?.worldSeconds ?? 0;
  const acts = useOwnActLines(all, { third: !!can.seenAs });
  useEffect(() => { pruneSourceOpen(all.map(a => a.id)); }, [all]);
  // The published samples change only with the series; the point now is added per render.
  const published = useMemo(() => {
    const out = new Map<string, Sample[]>();
    for (const row of series) for (const a of row.agents) {
      const list = out.get(a.id) ?? [];
      list.push({ at: row.world, energy: a.energy, eligible: a.energy > 0 });
      out.set(a.id, list);
    }
    return out;
  }, [series]);
  const history = useMemo(() => new Map(all.map(a => [a.id, [...(published.get(a.id) ?? []).filter(s => s.at < world), { at: world, energy: a.energy, eligible: a.eligible }]])),
    [published, all, world]);

  const agents = params.agentIds.length ? all.filter(a => params.agentIds.includes(a.id)) : all;
  // A destroy just accepted: the allocated total it left behind, until a new one arrives (or 6 s pass).
  const [awaiting, setAwaiting] = useState<{ allocated: number | undefined; at: number } | null>(null);
  useEffect(() => {
    if (!awaiting) return;
    if (self?.allocated !== awaiting.allocated) { setAwaiting(null); return; }
    const timer = setTimeout(() => setAwaiting(null), Math.max(0, 6000 - (Date.now() - awaiting.at)));
    return () => clearTimeout(timer);
  }, [awaiting, self?.allocated]);
  const ended = phase === "ended";
  const { editCode } = can.can;
  // The version the last replace replaced (the runner remembers it for this page): shown on the agent that replaced
  // it, with what each earned a move, and one press to put it back (a replace with the previous code and name).
  // "Your points now" is the goal pane's: here only when no goal pane is on screen, so the two never sit side by side.
  // (Maximised over the goal pane, this pane is the only one in sight: then it shows the figure itself.)
  const dockNow = useDock();
  const goalPaneShown = dockNow.maximised !== paneId && Object.values(dockNow.layout.panes).some(p => p.kind === "panel" && p.panelId === "my-card");
  const openObject = useOpenObject();
  const paidLooks = !ended && economy?.observation !== undefined && economy.observation !== "free";
  const recent = useEvents({ hz: 1, limit: 50 });
  const remembered = usePreviousVersion(game?.gameId, all, agentsLoading, paidLooks ? undefined : recent, world);
  const versions = useMemo(() => {
    const out = new Map<string, { text: string | null; caveat?: boolean; label?: string; onRevert?: () => void; busy?: boolean; status?: string }>();
    // Only the agent the replace made, in this game (never a twin with the same code): usePreviousVersion.
    const target = remembered && !ended && !can.seenAs ? all.find(a => a.id === remembered.agentId) : undefined;
    if (!remembered || !target) return out;
    const previous = remembered.previous;
    // Where looking costs energy the earnings are not counted (score-lines.tsx), so nothing is compared there: the button alone.
    const compared = paidLooks ? null : versionComparison(previous.before, previous.since, { estimate: acts.estimate, restored: previous.restored });
    out.set(target.id, {
      busy: !!runnerState.busy,
      // Only while that put-back is in flight; a busy or unanswered one leaves the button (and its notice) again.
      ...(runnerState.busy === "replace" && runnerState.replace?.putBack && runnerState.replace.agentId === target.id ? { status: PUTTING_BACK } : {}),
      text: paidLooks ? null : compared ?? (previous.restored ? "The previous version is back. Once it has made a few moves, this line says how it is doing."
        : "This is your new version. Once it has made a few moves, this line compares it with the one before."),
      caveat: compared !== null,
      // A put-back is offered for a new version, not for a version that was itself put back.
      ...(!previous.restored && can.can.destroy.ok && isLanguage(previous.language) ? { label: putBackLabel(previous.cost), onRevert: () => {
        // The engine's one "replace" command with the previous code (it pays that code's price again), through the
        // runner's one replace path; its own words afterwards.
        void commands.replace({ type: "replace", agentId: target.id, language: previous.language as Lang, source: previous.source },
          { name: previous.name, source: previous.source, putBack: true, outgoingSource: target.source, language: previous.language, cost: previous.cost,
            // What is remembered next: the restored version, to say how undoing went (no further put-back from it).
            previous: { gameId: previous.gameId, agentId: target.id, restored: true, source: target.source, language: target.language, name: previous.name, newSource: previous.source, sentWorld: world } })
          .then(result => {
            if (result === undefined) notifyError(new Error(BUSY_NOTHING_CHANGED));
            else if (!result.accepted) notifyError(new Error(`${previous.name} was not put back: ${result.message || "the game refused"}`));
          });
      } } : {}),
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remembered, runnerState.busy, runnerState.replace, all, acts.estimate, ended, paidLooks, can.seenAs, can.can.destroy.ok, commands]);
  // "See it in My agents" (the forge): that agent's row comes into view inside the pane, with a short ring.
  const reveal = runnerState.reveal;
  const [rung, setRung] = useState<string | null>(null);
  useEffect(() => {
    if (!reveal) return;
    const row = document.querySelector<HTMLElement>(`[data-testid="row-agent-${reveal.agentId}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "start", behavior: "smooth" });
    setRung(reveal.agentId);
    const timer = setTimeout(() => setRung(null), 2400);
    return () => clearTimeout(timer);
  }, [reveal?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const owner = can.seenAs ? <p data-testid="text-agents-owner" className="text-xs text-muted-foreground">Seen as {can.seenAs}: these are {can.whose} agents.</p> : null;
  if (!all.length) {
    return <PanelEmpty action={(phase === "planning" || phase === "running") && editCode.ok ? <TextButton disabled={summoning} onClick={() => dock.summonFirst()}>{firstSummonLabel({ summoning, pending: runnerState.firstSummon > 0 })}</TextButton> : undefined}>
      {can.seenAs ? `${can.seenAs} has no agents ${ended ? "at the end of this game" : "at this moment"}.`
        : can.readOnly && !ended ? "No agents at this moment." : ended ? "You summoned no agents in this game." : "No agents summoned yet. An agent is a small program that changes objects your way when the world picks it."}
    </PanelEmpty>;
  }
  return (
    <div className="space-y-4">
      {owner}
      <AgentsView agents={agents} self={self} powerPerSecond={economy?.powerPerSecond} fullChargeSeconds={economy?.fullChargeSeconds} changeReadRatio={economy?.changeReadRatio} costModel={costModelOf(economy)} world={world} samples={history} window={params.window} ended={ended}
        showCosts={params.showCosts} showSource={params.showSource} can={can.can} wait={secondsUntilEligible}
        onEdit={a => dock.forgeEdit(a.source, isLanguage(a.language) ? a.language : undefined, a.id)}
        seenAs={!!can.seenAs}
        onSetShare={(a, share) => void commands.run({ type: "allocatePower", agentId: a.id, share })}
        onDestroy={a => void commands.run({ type: "destroy", agentId: a.id }, destroyedText(agentLabel(a.name, agents.indexOf(a)))).then(result => {
          // Accepted: the split shown is the one from before the destroy until the next state arrives (both
          // subscriptions can lag together, which the shares' own disagreement does not catch).
          if (result?.accepted && (a.powerShare ?? 0) > 0) setAwaiting({ allocated: self?.allocated, at: Date.now() });
        })}
        settling={!ended && self?.allocated !== undefined && (!allocationSettled(self.allocated, all.map(a => a.powerShare)) || (!!awaiting && awaiting.allocated === self.allocated))}
        header={can.seenAs || goalPaneShown ? undefined : <PointsNow />} actLines={acts.byAgent} actObjects={acts.objects} onShowObject={openObject} onOtherStarts={editCode.ok ? () => { dock.forgeEdit(); runner.openShelf(); } : undefined} earnLines={acts.earned} versions={versions} rung={rung}
        footer={ended && <p data-testid="text-agents-ended" className="text-xs text-muted-foreground">
          {can.readOnly ? `These are ${can.whose} agents as they ended the game.` : "The game is over: these are your agents as they ended it. Edit a copy keeps the code for the next game."}
        </p>} />
    </div>
  );
}
