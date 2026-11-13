/**
 * The 15 built-in panel renderers (docs/ui-redesign.md §3), one per id of lib/player-client/src/panels.ts: a panel id
 * without a renderer fails the typecheck here. `PanelHost` parses the pane's parameters with the panel's schema
 * (invalid → defaults), shows a phase-aware empty state outside the panel's phases, and contains a crash to its pane.
 */
import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { PaneErrorContext } from "@/sdk/pane-error-context";
import { PANE_ERROR_LINE } from "@/sdk/query-errors";
import { PANELS, defaultPanelParams, parsePanelParams, type PanelId, type Phase } from "@workspace/player-client/panels";
import { PanelEmpty, outOfPhase, type PanelProps, type PanelView } from "./kit";
import Overview from "./overview";
import MyCard from "./my-card";
import Objects from "./objects";
import OthersCare from "./others-care";
import BitsOverTime from "./bits-over-time";
import Race from "./race";
import Agents from "./agents";
import Feed from "./feed";
import WhatIf from "./what-if";
import PublicChat from "./public-chat";
import Forge from "./forge";
import Results from "./results";
import Rules from "./rules";
import CodeOutput from "./code-output";
import Timeline from "./timeline";
import { useMyAgents } from "@/sdk";
import { useDockActions } from "@/dock/actions";
import { useAffordances } from "@/core/use-affordances";
import { firstSummonLabel, readyText } from "./first-agent";
import { useRunner } from "@/core/game/runner";

export const PANEL_VIEWS = {
  overview: Overview, "my-card": MyCard, objects: Objects, "others-care": OthersCare, "bits-over-time": BitsOverTime, race: Race,
  agents: Agents, feed: Feed, "what-if": WhatIf, "public-chat": PublicChat, forge: Forge, results: Results, rules: Rules, "code-output": CodeOutput, timeline: Timeline,
} satisfies { [K in PanelId]: PanelView<K> };

/**
 * Panels that are useful outside their data phases too (the editor in the lobby, results of the last game, the default
 * objects panel, whose empty state says what will appear and offers the next step).
 */
const ALWAYS_RENDER: ReadonlySet<PanelId> = new Set(["overview", "objects", "public-chat", "rules", "results", "forge", "what-if", "code-output", "timeline"]);

/**
 * One pane's failed live queries, said above its content: the content stays mounted (so its subscriptions stay live
 * and the line goes by itself when a value arrives), "Try again" remounts it. The dock and the other panes are untouched.
 */
function PaneErrors({ children }: { children: ReactNode }) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const record = useMemo(() => ({
    report: (key: string) => setFailed(f => (f.has(key) ? f : new Set(f).add(key))),
    clear: (key: string) => setFailed(f => { if (!f.has(key)) return f; const next = new Set(f); next.delete(key); return next; }),
  }), []);
  return (
    <PaneErrorContext.Provider value={record}>
      {failed.size > 0 && (
        <p role="status" data-testid="text-pane-error" className="mb-2 flex flex-wrap items-center gap-2 border-l-2 border-destructive pl-2 text-xs text-muted-foreground">
          <span>{PANE_ERROR_LINE}</span>
          <button type="button" className="underline" data-testid="button-pane-retry" onClick={() => { setFailed(new Set()); setAttempt(a => a + 1); }}>Try again</button>
        </p>
      )}
      <div key={attempt} className="contents">{children}</div>
    </PaneErrorContext.Provider>
  );
}

class PanelViewBoundary extends Component<{ children: ReactNode; panelId: PanelId }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn(`[panel ${this.props.panelId}]`, error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <PanelEmpty action={<button type="button" className="text-xs underline" onClick={() => this.setState({ error: null })}>Try again</button>}>
      {PANELS[this.props.panelId].title} hit an error: {this.state.error.message.split("\n")[0]}
    </PanelEmpty>;
  }
}

/** Planning's one next step, where the empty state names it: open the agent editor, until the player has an agent. */
function FirstAgentButton() {
  const { agents, loading } = useMyAgents({ hz: 1 });
  const dock = useDockActions();
  const { editCode } = useAffordances().can;
  const { busy, firstSummon } = useRunner();
  const summoning = busy === "summon";
  if (loading || agents.length || !editCode.ok) return null;
  return <button type="button" onClick={() => dock.summonFirst()} disabled={summoning} aria-busy={summoning || undefined} data-testid="button-first-agent"
    className="bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-70">{firstSummonLabel({ summoning, pending: firstSummon > 0 })}</button>;
}

/** A panel opened outside its phases. In planning, once the player has an agent, there is nothing left to write: say it is ready. */
function OutOfPhase({ panelId, phase }: { panelId: PanelId; phase: Phase }) {
  const { agents } = useMyAgents({ hz: 1 });
  const ready = phase === "planning" ? readyText(agents.map(a => a.name)) : null;
  return <PanelEmpty testId={`panel-empty-${panelId}`} action={phase === "planning" ? <FirstAgentButton /> : undefined}>{outOfPhase(panelId, phase, ready)}</PanelEmpty>;
}

export function PanelHost({ paneId, panelId, params, phase }: { paneId: string; panelId: PanelId; params: unknown; phase: Phase }) {
  if (!PANELS[panelId].phases.includes(phase) && !ALWAYS_RENDER.has(panelId)) return <OutOfPhase panelId={panelId} phase={phase} />;
  const parsed = parsePanelParams(panelId, params);
  const values = parsed.ok ? parsed.params : defaultPanelParams(panelId);
  const View = PANEL_VIEWS[panelId] as unknown as (props: PanelProps<PanelId>) => ReactNode;
  return (
    <PanelViewBoundary key={panelId} panelId={panelId}>
      <PaneErrors><View paneId={paneId} params={values as never} phase={phase} /></PaneErrors>
    </PanelViewBoundary>
  );
}
