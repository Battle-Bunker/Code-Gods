/**
 * The panel SDK's `useActions()` shape, shared by a stored panel's frame (over the bridge, with the player's
 * confirmation) and a file panel in the page (through the app's runtime). Each method is one affordance of
 * src/frame/action-policy.ts PANEL_ACTIONS.
 */
import type { ActOutcome } from "../frame/protocol.ts";

export type Language = "python" | "typescript";
export interface PanelActions {
  /** False for a spectator or after the game: every action would be refused. */
  canAct: boolean;
  /** Measure an agent's code without paying: its price, cost per act and diagnostics (agent.check). */
  check(language: Language, source: string, agentId?: string): Promise<ActOutcome>;
  /** Pay the summon price from your energy and start a new agent (agent.summon). */
  summon(language: Language, source: string, name?: string, share?: number): Promise<ActOutcome>;
  /** Swap new code into one of your agents, paying its price (agent.replace). */
  replace(agentId: string, language: Language, source: string): Promise<ActOutcome>;
  /** Destroy one of your agents (agent.destroy). */
  destroy(agentId: string): Promise<ActOutcome>;
  /** Say something in the room's public chat (chat.send; everyone sees it). */
  chat(text: string): Promise<ActOutcome>;
  /** Use your one pause of the game (game.pause). */
  pause(): Promise<ActOutcome>;
  /** Say you are ready while planning (game.ready). */
  ready(ready?: boolean): Promise<ActOutcome>;
}

type Act = (op: string, args: Record<string, unknown>) => Promise<ActOutcome>;
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function actionsOver(act: Act, canAct: boolean): PanelActions {
  return {
    canAct,
    check: (language, source, agentId) => act("agent.check", defined({ language, source, agentId })),
    summon: (language, source, name, share) => act("agent.summon", defined({ language, source, name, share })),
    replace: (agentId, language, source) => act("agent.replace", { agentId, language, source }),
    destroy: agentId => act("agent.destroy", { agentId }),
    chat: text => act("chat.send", { text }),
    pause: () => act("game.pause", {}),
    ready: (ready = true) => act("game.ready", { ready }),
  };
}
