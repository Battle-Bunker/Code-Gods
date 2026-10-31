/**
 * The room owner's direct functions (owner.*, rooms.*), for the palette and the overview's "Start the game". The
 * engine checks ownership; a refusal becomes a notice. Settings need the room's current revision.
 */
import { useMemo } from "react";
import { useAction, useConvex, useMutation } from "convex/react";
import { api } from "@workspace/engine/convex/_generated/api";
import type { Id } from "@workspace/engine/convex/_generated/dataModel";
import { useRoom } from "@/sdk";
import { notify, notifyError } from "@/core/notices";

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
      start: () => done("Game started: planning begins.")(start({ roomId, requestId: crypto.randomUUID() })),
      endGame: () => done("Game ended.")(end({ roomId: room })),
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
