/**
 * The 14 built-in panel renderers (docs/ui-redesign.md §3), one per id of lib/player-client/src/panels.ts: a panel id
 * without a renderer fails the typecheck here. `PanelHost` parses the pane's parameters with the panel's schema
 * (invalid → defaults), shows a phase-aware empty state outside the panel's phases, and contains a crash to its pane.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
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

export const PANEL_VIEWS = {
  overview: Overview, "my-card": MyCard, objects: Objects, "others-care": OthersCare, "bits-over-time": BitsOverTime, race: Race,
  agents: Agents, feed: Feed, "what-if": WhatIf, "public-chat": PublicChat, forge: Forge, results: Results, rules: Rules, "code-output": CodeOutput,
} satisfies { [K in PanelId]: PanelView<K> };

/**
 * Panels that are useful outside their data phases too (the editor in the lobby, results of the last game, the default
 * objects panel, whose empty state says what will appear and offers the next step).
 */
const ALWAYS_RENDER: ReadonlySet<PanelId> = new Set(["overview", "objects", "public-chat", "rules", "results", "forge", "what-if", "code-output"]);

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

export function PanelHost({ paneId, panelId, params, phase }: { paneId: string; panelId: PanelId; params: unknown; phase: Phase }) {
  if (!PANELS[panelId].phases.includes(phase) && !ALWAYS_RENDER.has(panelId)) return <PanelEmpty testId={`panel-empty-${panelId}`}>{outOfPhase(panelId, phase)}</PanelEmpty>;
  const parsed = parsePanelParams(panelId, params);
  const values = parsed.ok ? parsed.params : defaultPanelParams(panelId);
  const View = PANEL_VIEWS[panelId] as unknown as (props: PanelProps<PanelId>) => ReactNode;
  return (
    <PanelViewBoundary key={panelId} panelId={panelId}>
      <View paneId={paneId} params={values as never} phase={phase} />
    </PanelViewBoundary>
  );
}
