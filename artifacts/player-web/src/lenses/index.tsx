/**
 * The 13 built-in lens renderers (docs/ui-redesign.md §3), one per id of lib/player-client/src/lenses.ts: a lens id
 * without a renderer fails the typecheck here. `LensHost` parses the pane's parameters with the lens's schema
 * (invalid → defaults), shows a phase-aware empty state outside the lens's phases, and contains a crash to its pane.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { LENSES, defaultLensParams, parseLensParams, type LensId, type Phase } from "@workspace/player-client/lenses";
import { LensEmpty, outOfPhase, type LensProps, type LensView } from "./kit";
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

export const LENS_VIEWS = {
  overview: Overview, "my-card": MyCard, objects: Objects, "others-care": OthersCare, "bits-over-time": BitsOverTime, race: Race,
  agents: Agents, feed: Feed, "what-if": WhatIf, "public-chat": PublicChat, forge: Forge, results: Results, rules: Rules,
} satisfies { [K in LensId]: LensView<K> };

/** Lenses that are useful outside their data phases too (the editor in the lobby, results of the last game). */
const ALWAYS_RENDER: ReadonlySet<LensId> = new Set(["overview", "public-chat", "rules", "results", "forge", "what-if"]);

class LensBoundary extends Component<{ children: ReactNode; lensId: LensId }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn(`[lens ${this.props.lensId}]`, error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <LensEmpty action={<button type="button" className="text-xs underline" onClick={() => this.setState({ error: null })}>Try again</button>}>
      {LENSES[this.props.lensId].title} hit an error: {this.state.error.message.split("\n")[0]}
    </LensEmpty>;
  }
}

export function LensHost({ paneId, lensId, params, phase }: { paneId: string; lensId: LensId; params: unknown; phase: Phase }) {
  if (!LENSES[lensId].phases.includes(phase) && !ALWAYS_RENDER.has(lensId)) return <LensEmpty testId={`lens-empty-${lensId}`}>{outOfPhase(lensId, phase)}</LensEmpty>;
  const parsed = parseLensParams(lensId, params);
  const values = parsed.ok ? parsed.params : defaultLensParams(lensId);
  const View = LENS_VIEWS[lensId] as unknown as (props: LensProps<LensId>) => ReactNode;
  return (
    <LensBoundary key={lensId} lensId={lensId}>
      <View paneId={paneId} params={values as never} phase={phase} />
    </LensBoundary>
  );
}
