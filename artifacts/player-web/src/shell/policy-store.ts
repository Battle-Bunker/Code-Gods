/**
 * The host's action-confirmation state (rules: action-policy.ts). Grants are kept per browser in localStorage:
 * neither a panel (its frame has an opaque origin) nor an agent (it writes only to Convex) can set one; only the
 * player, through the host-rendered confirmation.
 */
import { useSyncExternalStore } from "react";
import { initialPolicy, policyReducer, decide, type ConfirmRequest, type Grant, type PanelInfo, type PolicyEvent, type PolicyState } from "./action-policy";

const KEY = "cg.panelGrants.v1";
function readGrants(): Record<string, Grant> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Grant>;
    return Object.fromEntries(Object.entries(parsed).filter(([, g]) => typeof g?.version === "number"));
  } catch { return {}; }
}

let state: PolicyState = initialPolicy(typeof localStorage === "undefined" ? {} : readGrants());
const listeners = new Set<() => void>();
const resolvers = new Map<string, (approved: boolean) => void>();

function dispatch(event: PolicyEvent) {
  const next = policyReducer(state, event);
  if (next === state) return;
  if (next.grants !== state.grants) { try { localStorage.setItem(KEY, JSON.stringify(next.grants)); } catch { /* private mode */ } }
  state = next;
  for (const outcome of next.settled) {
    const resolve = resolvers.get(outcome.id);
    if (resolve) { resolvers.delete(outcome.id); resolve(outcome.approved); }
  }
  for (const listener of listeners) listener();
}

export const policyStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  dispatch,
  /** Resolves true when the command may run now: allowed by policy, or confirmed by the player. */
  ask(panel: PanelInfo, command: ConfirmRequest["command"]): Promise<boolean> {
    if (decide(state, panel, command.type) === "allow") return Promise.resolve(true);
    const id = crypto.randomUUID();
    return new Promise<boolean>(resolve => { resolvers.set(id, resolve); dispatch({ type: "request", id, panel, command }); });
  },
  /** Decline everything a panel still has pending (its frame went away). */
  dropPanel(key: string) {
    for (const request of state.pending) if (request.panel.key === key) dispatch({ type: "decline", id: request.id });
  },
};

export function usePolicy(): PolicyState {
  return useSyncExternalStore(policyStore.subscribe, policyStore.get, policyStore.get);
}
