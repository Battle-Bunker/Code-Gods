/**
 * The room this client plays in, provided by the core app. Panels never choose a room: every SDK hook
 * reads this one, with the player's own credential, so a panel sees exactly what its player may see.
 */
import { createContext, useContext, type ReactNode } from "react";

export type PlayerRoom = {
  /** Convex id of the room. */
  roomId: string;
  /** "read" credentials can observe but not act; "owner" can also run owner actions in the room. */
  permission: "read" | "act" | "owner";
  /** "devserver": a player's own app (its Vite dev server holds the credential); "hosted": the default client on the engine site. */
  mode: "devserver" | "hosted";
};

const RoomContext = createContext<PlayerRoom | null>(null);

export function RoomProvider({ room, children }: { room: PlayerRoom; children: ReactNode }) {
  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}

export function useRoom(): PlayerRoom {
  const room = useContext(RoomContext);
  if (!room) throw new Error("SDK hooks only work inside the player client (no room connected yet).");
  return room;
}
