/**
 * The room owner's direct functions (owner.*, rooms.*), for the palette and the overview's "Start the game". The
 * engine checks ownership; a refusal becomes a notice. Settings need the room's current revision.
 */
import { useMemo } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { START_TIMEOUT_MS, startTracker, trackStart } from "@workspace/player-client/start";
import { useRoom } from "@/sdk";
import { noticeStore, notify, notifyError } from "@/core/notices";

export function useOwnerActions() {
  const { roomId } = useRoom();
  const convex = useConvex();
  const start = useAction(api.owner.start);
  const settings = useAction(api.owner.settings);
  const addAi = useMutation(api.rooms.addAi);
  const removeAi = useMutation(api.rooms.removeAi);
  const end = useMutation(api.rooms.endActiveGame);
  const resume = useMutation(api.rooms.resume);
  return useMemo(() => {
    const room = roomId as Id<"rooms">;
    const done = (text: string) => <T,>(p: Promise<T>) => p.then(r => { notify(text); return r; }, e => { notifyError(e); return undefined; });
    return {
      // The pending start shows at once wherever a start control is (core/game/start.ts); a second click is refused.
      start: () => {
        let shown: number | undefined;
        const settle = () => { if (shown !== undefined) noticeStore.dismiss(shown); };
        // Shown until the start settles (a cold start can outlast a notice's usual few seconds).
        const run = (requestId: string) => { shown = noticeStore.push("Starting the game…", "info", START_TIMEOUT_MS); return start({ roomId, requestId }); };
        return trackStart(startTracker, roomId, run).then(r => {
          settle();
          if (!r) return undefined;
          // A shape new to this server first prepares its rule tables; the game then starts by itself.
          notify("status" in r && r.status === "preparing" ? `Preparing the game's rule tables (${r.ready} of ${r.total} ready); it starts by itself.` : "Game started: planning begins.");
          return r;
        }, e => { settle(); notifyError(e); return undefined; });
      },
      endGame: () => end({ roomId: room }).then(r => {
        notify(r && "cancelled" in r ? "The game's preparation was ended." : "Game ended.");
        return r;
      }, e => { notifyError(e); return undefined; }),
      resume: () => done("Game resumed.")(resume({ roomId: room })),
      addAi: (templateId: string) => done("AI player seated.")(addAi({ roomId: room, templateId })),
      removeAi: (godId: string) => done("AI player removed.")(removeAi({ roomId: room, godId })),
      setup: async (setupId: string) => {
        try {
          const { revision } = await convex.query(api.rooms.get, { room: roomId });
          await settings({ roomId, revision, setupId });
          notify("The next game's setup is saved.");
        } catch (error) { notifyError(error); }
      },
      aiCatalog: async () => {
        const { agents } = await convex.query(api.aiTemplates.catalog, {});
        return agents.map(r => ({ id: r.id, label: r.name, detail: [r.provider, r.model].filter(Boolean).join(" · ") }));
      },
    };
  }, [roomId, convex, start, settings, addAi, removeAi, end, resume]);
}
