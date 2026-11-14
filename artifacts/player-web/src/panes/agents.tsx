/**
 * My agents (integration plan §1.5; ux-lessons 3.7–3.9): the player's own energy and power first, with the sentence
 * that explains power; then one row per agent, each its own component subscribed to that agent's energy document
 * (dropped when the row unmounts): name, language, share of power, energy ("about 0 ⚡" with the exact figure in the
 * tooltip), what it did, and Destroy, whose confirmation says what comes back. Operations only through affordances.
 */
import { requestFirstSummon } from "./first-summon";
import { useAgentCount, useGame, useGameScope, useMe, useMyAgents, useAgentEnergy, type Agent } from "@/sdk";
import { useOpenPane } from "@/dock/open-pane";
import { AffordanceButton, Tip } from "@/site/components/action";
import { WORKING_TEXT, destroyConfirm, energyExact, energyWords, percent, powerSentence, shareText, workText } from "./agents-words";

function Energy({ value, testId }: { value: number; testId: string }) {
  const exact = energyExact(value);
  const shown = <span className="tabular-nums text-foreground" data-testid={testId} tabIndex={exact ? 0 : undefined}>{energyWords(value)}</span>;
  return exact ? <Tip text={exact}>{shown}</Tip> : shown;
}

function AgentRow({ agent, power }: { agent: Agent; power: number | undefined }) {
  const e = useAgentEnergy(agent.agentId);
  return (
    <li className="space-y-1 px-4 py-3" data-testid={`row-agent-${agent.agentId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-medium">{agent.name} <span className="text-xs font-normal text-muted-foreground">{agent.language}</span></span>
        <AffordanceButton id="agent.destroy" args={{ agentId: agent.agentId }} label="Destroy" busyLabel="Destroying…" tone="danger"
          className="px-2 py-1 text-xs" testId={`button-destroy-${agent.agentId}`} confirmText={destroyConfirm(agent.name, e?.energy)} />
      </div>
      <p className="text-xs text-muted-foreground" data-testid={`text-agent-share-${agent.agentId}`}>{power === undefined ? `Share of your power ${percent(agent.share)}` : shareText(agent.share, power)}</p>
      {e && (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span>Energy <Energy value={e.energy} testId={`text-agent-energy-${agent.agentId}`} /></span>
            {energyExact(e.energy) && <span data-testid={`text-agent-working-${agent.agentId}`}>{WORKING_TEXT}</span>}
          </p>
          <p className="text-xs text-muted-foreground" data-testid={`text-agent-work-${agent.agentId}`}>{workText(e)}</p>
        </>
      )}
    </li>
  );
}

export function AgentsPane() {
  const header = useGame();
  const { seated } = useGameScope();
  const me = useMe();
  const agents = useMyAgents();
  const openPane = useOpenPane(header?.phase ?? "planning");
  if (!header) return null;
  if (!seated) return <p className="p-4 text-sm text-muted-foreground" data-testid="agents-spectator">Each player's agents are private to them. You're watching, so there are none to show.</p>;
  // A summon already accepted counts even while the list lags it (ux 1.8): never offer the first summon again.
  const count = useAgentCount();
  const none = agents !== undefined && agents.length === 0 && count === 0;
  return (
    <div className="text-sm" data-testid="agents">
      {me && (
        <div className="space-y-1 border-b px-4 py-3" data-testid="text-own-power">
          <p>Your energy <Energy value={me.energy} testId="text-own-energy" /> <span className="text-muted-foreground">(for summoning and replacing agents)</span></p>
          <p className="text-muted-foreground" data-testid="text-power-explained">{powerSentence(me.power, (agents ?? []).map(a => a.share))}</p>
        </div>
      )}
      {none ? (
        <div className="space-y-2 p-4" data-testid="agents-empty">
          <p className="text-muted-foreground">You have no agents yet. An agent moves lines towards your goal, and every move that helps raises your points.</p>
          {header.phase !== "ended" && (
            <button type="button" className="bg-primary text-primary-foreground px-3 py-1.5 font-medium" onClick={() => { if (header?.gameId) requestFirstSummon(header.gameId); void openPane("forge"); }} data-testid="button-agents-summon">Summon my first agent</button>
          )}
        </div>
      ) : (
        <ul className="divide-y">{(agents ?? []).map(a => <AgentRow key={a.agentId} agent={a} power={me?.power} />)}</ul>
      )}
    </div>
  );
}
