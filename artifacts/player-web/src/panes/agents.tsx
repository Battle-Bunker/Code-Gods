/**
 * My agents (integration plan §1.5; ux-lessons 3.7–3.9): the player's own energy and power first, with the sentence
 * that explains power; then one row per agent, each its own component subscribed to that agent's energy document
 * (dropped when the row unmounts): name, language, share of power, energy ("about 0 energy" with the exact figure in the
 * tooltip), what it did, and Destroy, whose confirmation says what comes back. Operations only through affordances.
 */
import { summonFirst } from "./first-summon";
import { useState } from "react";
import { objectWord, useAgentPrograms, useAgentCount, useGame, useGameScope, useMe, useMyAgents, useAgentEnergy, type Agent } from "@/sdk";
import { useOpenPane } from "@/dock/open-pane";
import { AffordanceButton, Tip } from "@/site/components/action";
import { energyAmount } from "@/core/words";
import { DEBT_TEXT, ENERGY_HOW, WORKING_TEXT, debtText, destroyConfirm, energyExact, percent, powerSentence, shareText, versionRows, workText } from "./agents-words";
import { requestForge } from "./forge-request";

function Energy({ value, testId }: { value: number; testId: string }) {
  const exact = energyExact(value);
  const shown = <span className="tabular-nums text-foreground" data-testid={testId} tabIndex={exact ? 0 : undefined}>{energyAmount(value)}</span>;
  return exact ? <Tip text={exact}>{shown}</Tip> : shown;
}

function AgentRow({ agent, power }: { agent: Agent; power: number | undefined }) {
  const e = useAgentEnergy(agent.agentId);
  return (
    <li className="space-y-1 px-4 py-3" data-testid={`row-agent-${agent.agentId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{agent.name} <span className="text-xs font-normal text-muted-foreground">{agent.language}</span></span>
        <AffordanceButton id="agent.destroy" args={{ agentId: agent.agentId }} label="Destroy" busyLabel="Destroying…" tone="quiet"
          className="px-2 py-1 text-xs" testId={`button-destroy-${agent.agentId}`} confirmText={destroyConfirm(agent.name, e?.energy)} />
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`text-agent-share-${agent.agentId}`}>{power === undefined ? `Share of your power ${percent(agent.share)}` : shareText(agent.share, power)}</p>
      {e && (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span>Energy <Energy value={e.energy} testId={`text-agent-energy-${agent.agentId}`} /></span>
            {energyExact(e.energy) && <span data-testid={`text-agent-working-${agent.agentId}`}>{WORKING_TEXT}</span>}
            {debtText(e.energy) && <Tip text={DEBT_TEXT}><span tabIndex={0} className="underline decoration-dotted underline-offset-4" data-testid={`text-agent-debt-${agent.agentId}`}>{debtText(e.energy)}</span></Tip>}
          </p>
          <p className="text-xs text-muted-foreground" data-testid={`text-agent-work-${agent.agentId}`}>{workText(e)}</p>
        </>
      )}
      <AgentCode agentId={agent.agentId} name={agent.name} />
    </li>
  );
}

/** The agent's code as it runs now and its versions side by side, on request (subscribed only while shown); readable after the end too. */
function AgentCode({ agentId, name }: { agentId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="text-xs" onToggle={e => setOpen((e.target as HTMLDetailsElement).open)} data-testid={`details-agent-code-${agentId}`}>
      <summary className="cursor-pointer text-muted-foreground underline underline-offset-4">Its code and versions</summary>
      {open && <Program agentId={agentId} name={name} />}
    </details>
  );
}

function Program({ agentId, name }: { agentId: string; name: string }) {
  const header = useGame();
  const openPane = useOpenPane(header?.phase ?? "live");
  const programs = useAgentPrograms(agentId);
  const [shown, setShown] = useState<number | null>(null);
  if (!programs?.length) return <p className="mt-1 text-muted-foreground">Loading…</p>;
  const live = header?.phase !== "ended";
  const rows = versionRows(programs);
  const program = programs.find(p => p.version === shown) ?? programs[0]!;
  return (
    <div className="mt-1 space-y-2">
      {live && <button type="button" className="underline underline-offset-4" onClick={() => void requestForge({ kind: "agent", agentId }, openPane)} data-testid={`button-agent-edit-${agentId}`}>Edit {name} in Agent code</button>}
      {rows.length > 1 && (
        <table className="w-full tabular-nums" data-testid={`table-agent-versions-${agentId}`}>
          <thead><tr className="text-left text-muted-foreground"><th className="font-normal">Version</th><th className="font-normal text-right">Moves</th><th className="font-normal text-right">Points gained</th><th className="font-normal text-right">A move</th><th /></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.version} data-testid="row-agent-version" className={program.version === r.version ? "font-medium" : ""}>
              <td><button type="button" className="underline underline-offset-4" aria-pressed={program.version === r.version} onClick={() => setShown(r.version)}>{r.label}</button></td>
              <td className="text-right">{r.moves}</td><td className="text-right">{r.gained}</td><td className="text-right">{r.perMove}</td>
              <td className="text-right">{live && i > 0 && <AffordanceButton id="agent.putBack" args={{ agentId, version: r.version }} label="Put back" busyLabel="Putting back…" tone="quiet" className="px-1 text-xs" testId={`button-put-back-${r.version}`} />}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <pre className="max-h-64 overflow-auto border bg-muted/40 p-2 font-mono text-[11px] leading-snug" data-testid={`text-agent-code-${agentId}`}>{program.source}</pre>
    </div>
  );
}

export function AgentsPane() {
  const header = useGame();
  const { seated } = useGameScope();
  const me = useMe();
  const agents = useMyAgents();
  const openPane = useOpenPane(header?.phase ?? "planning");
  // A summon already accepted counts even while the list lags it (ux 1.8): never offer the first summon again.
  const count = useAgentCount();
  if (!header) return null;
  if (!seated) return <p className="p-4 text-sm text-muted-foreground" data-testid="agents-spectator">Each player's agents are private to them. You're watching, so there are none to show.</p>;
  const none = agents !== undefined && agents.length === 0 && count === 0;
  const power = me && (
    <div className={`space-y-1 px-4 py-3 ${none ? "border-b" : "border-t"}`} data-testid="text-own-power">
      <p>Your energy <Energy value={me.energy} testId="text-own-energy" /> <span className="text-muted-foreground">(for summoning and replacing agents)</span></p>
      <p className="text-muted-foreground" data-testid="text-power-explained">{powerSentence(me.power, (agents ?? []).map(a => a.share))}</p>
      <details className="text-xs" data-testid="details-energy-how">
        <summary className="cursor-pointer text-muted-foreground underline underline-offset-4">How energy works</summary>
        <p className="mt-1 text-muted-foreground">{ENERGY_HOW}</p>
      </details>
    </div>
  );
  // With agents, they come first: "is my agent working?" is answered at the top of the pane, before how power works.
  return (
    <div className="text-sm" data-testid="agents">
      {none && power}
      {none ? (
        <div className="space-y-2 p-4" data-testid="agents-empty">
          <p className="text-muted-foreground">You have no agents yet. An agent moves {objectWord(header.variant).many} towards your goal, and every move that helps raises your points.</p>
          {header.phase !== "ended" && (
            <button type="button" className="bg-primary text-primary-foreground px-3 py-1.5 font-medium" onClick={() => { if (header?.gameId) void summonFirst(header.gameId, openPane); }} data-testid="button-agents-summon">Summon my first agent</button>
          )}
        </div>
      ) : (
        <ul className="divide-y">{(agents ?? []).map(a => <AgentRow key={a.agentId} agent={a} power={me?.power} />)}</ul>
      )}
      {!none && power}
    </div>
  );
}
