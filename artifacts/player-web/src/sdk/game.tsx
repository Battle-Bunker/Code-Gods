/**
 * The room and game a screen shows, provided once by the page (site/pages/game.tsx) from the data it already routed
 * on (ux-lessons 4.2): every hook reads this, never a room or game of its own choosing.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface GameScope {
  roomId: string;
  /** The game in view (null in the room before a game). */
  gameId: string | null;
  /** The viewer holds a seat in that game (a rule, an account). */
  seated: boolean;
}

const Scope = createContext<GameScope | null>(null);

export function GameScopeProvider({ scope, children }: { scope: GameScope; children: ReactNode }) {
  return <Scope.Provider value={scope}>{children}</Scope.Provider>;
}

export function useGameScope(): GameScope {
  const s = useContext(Scope);
  if (!s) throw new Error("useGameScope outside a game screen");
  return s;
}
