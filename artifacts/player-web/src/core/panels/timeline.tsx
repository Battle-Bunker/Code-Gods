/**
 * The replay timeline (docs/replay-design.md §5): in the dock's replay mode, every player's exact score over world
 * time (lead changes, pauses and the largest swings marked; a click seeks) with the standings at the playhead, and the
 * event list around the playhead (each event attributed; a click seeks; `code` opens the agent). Outside a replay it
 * says where replays are.
 */
import { useObjectContext } from "@/sdk";
import { Link } from "@/core/navigation";
import { useReplayController, EventList, ScoreChart } from "@/core/replay/parts";
import { useRoomInfo } from "@/sdk";
import { PanelEmpty, Section, type PanelProps } from "./kit";

export default function Timeline({ params }: PanelProps<"timeline">) {
  const controller = useReplayController();
  const { ctx } = useObjectContext();
  const room = useRoomInfo();
  if (!controller) {
    return (
      <PanelEmpty testId="panel-timeline-live" action={room ? <Link to={{ kind: "games", room: room.shortCode }} className="text-xs underline">Past games</Link> : undefined}>
        The timeline plays an ended game: open one from the room's past games to replay it, event by event.
      </PanelEmpty>
    );
  }
  return (
    <div className="space-y-4" data-testid="panel-timeline">
      {params.show !== "events" && <Section title="Scores over time"><ScoreChart controller={controller} swings={params.swings} /></Section>}
      {params.show !== "scores" && <Section title="Events"><EventList controller={controller} ctx={ctx} /></Section>}
    </div>
  );
}
