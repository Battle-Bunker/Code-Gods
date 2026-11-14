/** The game screen's panes by id (lib/v2-client PANE_IDS). */
import type { PaneComponents } from "@/dock/dock";
import { RoomChat } from "@/site/components/chat";
import { useGameScope } from "@/sdk";
import "@workspace/v2-views/styles.css";
import { MyCardPane } from "./my-card";
import { LinePane } from "./object";
import { LinesPane } from "./objects";
import { OverviewPane } from "./overview";
import { RacePane } from "./race";
import { ForgePane } from "./forge";

function ChatPane() {
  return <RoomChat roomId={useGameScope().roomId} height="h-full min-h-[200px]" />;
}

export const PANE_COMPONENTS: PaneComponents = {
  overview: OverviewPane,
  "my-card": MyCardPane,
  objects: LinesPane,
  object: LinePane,
  race: RacePane,
  "public-chat": ChatPane,
  forge: ForgePane,
};
