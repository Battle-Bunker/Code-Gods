/** The game screen's panes by id (lib/v2-client PANE_IDS). */
import type { PaneComponents } from "@/dock/dock";
import { RoomChat } from "@/site/components/chat";
import { useMemo } from "react";
import { useGame, useGameScope } from "@/sdk";
import "@workspace/v2-views/styles.css";
import { MyCardPane } from "./my-card";
import { LinePane } from "./object";
import { LinesPane } from "./objects";
import { OverviewPane } from "./overview";
import { RacePane } from "./race";
import { ForgePane } from "./forge";
import { FeedPane } from "./feed";
import { AgentsPane } from "./agents";
import { ResultsPane } from "./results";
import { OthersCarePane } from "./others-care";
import { PointsOverTimePane } from "./points-over-time";
import { RulesPane } from "./rules";
import { AssistantPane } from "./assistant";
import { WhatIfPane } from "./what-if";
import { MyPanelsPane } from "./my-panels";
export { StoredPanelPane } from "./stored-panel";

function ChatPane() {
  const header = useGame();
  // The game's roster says who is a person and who an AI player, and your name for "Mentions of you".
  const who = useMemo(() => header ? {
    kinds: new Map(header.roster.map(r => [r.memberId as string, r.kind as string])),
    me: header.me as string | null,
    myName: header.roster.find(r => r.memberId === header.me)?.name ?? null,
  } : undefined, [header?.roster, header?.me]); // eslint-disable-line react-hooks/exhaustive-deps
  return <RoomChat roomId={useGameScope().roomId} height="h-full min-h-[200px]" who={who} />;
}

export const PANE_COMPONENTS: PaneComponents = {
  overview: OverviewPane,
  "my-card": MyCardPane,
  objects: LinesPane,
  object: LinePane,
  "what-if": WhatIfPane,
  race: RacePane,
  feed: FeedPane,
  agents: AgentsPane,
  results: ResultsPane,
  "public-chat": ChatPane,
  forge: ForgePane,
  "others-care": OthersCarePane,
  "points-over-time": PointsOverTimePane,
  rules: RulesPane,
  assistant: AssistantPane,
  "my-panels": MyPanelsPane,
};
