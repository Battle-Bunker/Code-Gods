/**
 * Saving the next game's setup (owner.settings) from the dock. The write is guarded by the room's revision: it carries
 * the revision of the room the owner saw (the live rooms.get subscription, useRoomInfo), so a change made elsewhere
 * since is refused with CONFLICT instead of being overwritten. Never re-read the room just to learn its revision.
 */
export type SaveSettings = (args: { roomId: string; revision: number; setupId: string }) => Promise<unknown>;

export async function saveSetup(settings: SaveSettings, roomId: string, seen: { revision: number } | undefined, setupId: string): Promise<void> {
  if (!seen) throw new Error("The room is still loading; try again in a moment.");
  await settings({ roomId, revision: seen.revision, setupId });
}
