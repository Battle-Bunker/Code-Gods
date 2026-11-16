/**
 * What a sandboxed panel may do as its player, and when the player must confirm it first (v1's shell/action-policy.ts,
 * on affordance ids). A panel acts only through these affordances, with its player's own authority (the engine checks
 * permission, phase and energy as for a button); `chat.send`, `agent.summon`, `agent.replace`, `agent.destroy` and
 * `game.pause` open a host-rendered confirmation showing the exact operation, unless the player gave that panel a
 * "let it act without asking" grant. A grant names the panel version it was given at; it stops counting as soon as a
 * non-browser author (an assistant, the CLI) writes a later version (`lastForeignVersion` from panel.list), and is then
 * dropped. Pure reducer: the host keeps the state (src/panes/panel-policy.ts).
 */
export const PANEL_ACTIONS = {
  "agent.check": "allow",
  "game.ready": "allow",
  "chat.send": "confirm",
  "agent.summon": "confirm",
  "agent.replace": "confirm",
  "agent.destroy": "confirm",
  "game.pause": "confirm",
} as const;
export type PanelAction = keyof typeof PANEL_ACTIONS;
export const isPanelAction = (op: unknown): op is PanelAction => typeof op === "string" && Object.hasOwn(PANEL_ACTIONS, op);

/** `key`: "stored:<slug>". */
export type PanelInfo = { key: string; currentVersion: number; lastForeignVersion: number };
export type Grant = { version: number };
export type PanelCommand = { op: PanelAction; args: Record<string, unknown> };
export type ConfirmRequest = { id: string; panel: PanelInfo; command: PanelCommand };
export type PolicyState = {
  grants: Readonly<Record<string, Grant>>;
  pending: readonly ConfirmRequest[];
  /** The most recent outcomes (bounded), so a caller can resolve its promise. */
  settled: readonly { id: string; approved: boolean }[];
};
export type PolicyEvent =
  | { type: "request"; id: string; panel: PanelInfo; command: PanelCommand }
  | { type: "confirm"; id: string; alwaysAllow?: boolean }
  | { type: "decline"; id: string }
  | { type: "grant"; panel: PanelInfo }
  | { type: "revoke"; key: string }
  | { type: "panels"; panels: readonly PanelInfo[] };

/** Requests one panel may have waiting for the player at once; past it an action is refused. */
export const PENDING_MAX = 3;

export const initialPolicy = (grants: Record<string, Grant> = {}): PolicyState => ({ grants, pending: [], settled: [] });

const valid = (grant: Grant | undefined, panel: PanelInfo) => !!grant && grant.version >= panel.lastForeignVersion;

/** "allow" runs at once; "confirm" waits for the player. */
export function decide(state: PolicyState, panel: PanelInfo, op: PanelAction): "allow" | "confirm" {
  if (PANEL_ACTIONS[op] === "allow") return "allow";
  return valid(state.grants[panel.key], panel) ? "allow" : "confirm";
}

const settle = (state: PolicyState, id: string, approved: boolean, grants = state.grants): PolicyState => ({
  grants, pending: state.pending.filter(p => p.id !== id), settled: [...state.settled, { id, approved }].slice(-20),
});

export function policyReducer(state: PolicyState, event: PolicyEvent): PolicyState {
  switch (event.type) {
    case "request":
      return { ...state, pending: [...state.pending, { id: event.id, panel: event.panel, command: event.command }] };
    case "confirm": {
      const request = state.pending.find(p => p.id === event.id);
      if (!request) return state;
      const grants = event.alwaysAllow ? { ...state.grants, [request.panel.key]: { version: request.panel.currentVersion } } : state.grants;
      return settle(state, event.id, true, grants);
    }
    case "decline":
      return state.pending.some(p => p.id === event.id) ? settle(state, event.id, false) : state;
    case "grant":
      return { ...state, grants: { ...state.grants, [event.panel.key]: { version: event.panel.currentVersion } } };
    case "revoke": {
      if (!(event.key in state.grants)) return state;
      const { [event.key]: _revoked, ...grants } = state.grants;
      return { ...state, grants };
    }
    case "panels": {
      const byKey = new Map(event.panels.map(p => [p.key, p]));
      const grants = Object.fromEntries(Object.entries(state.grants).filter(([key, grant]) => {
        const panel = byKey.get(key);
        return panel && valid(grant, panel);
      }));
      return Object.keys(grants).length === Object.keys(state.grants).length ? state : { ...state, grants };
    }
  }
}
