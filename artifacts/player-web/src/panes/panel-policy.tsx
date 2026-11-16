/**
 * The host's action-confirmation state and dialog for sandboxed panels (rules: src/frame/action-policy.ts; v1's
 * shell/policy-store.ts and shell/confirmations.tsx). Grants are kept per browser in localStorage: neither a panel
 * (its frame has an opaque origin) nor an assistant (it writes only to the server) can set one; only the player,
 * through this host-rendered confirmation, which the panel cannot draw over (it lives in the app's document, outside
 * every frame). Its buttons arm after a moment, so a click aimed at the panel (which may have raised the request on
 * pointerdown) cannot land on "Send".
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { useMyPanels } from "@/sdk";
import { decide, initialPolicy, PENDING_MAX, policyReducer, type ConfirmRequest, type Grant, type PanelCommand, type PanelInfo, type PolicyEvent, type PolicyState } from "@/frame/action-policy";

const KEY = "cg.panelGrants.v2";
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

export const panelKey = (slug: string) => `stored:${slug}`;

export const policyStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  get: () => state,
  dispatch,
  /** "allow": may run now (by policy, or the player confirmed); "declined"; "busy": too many already waiting. */
  ask(panel: PanelInfo, command: PanelCommand): Promise<"allow" | "declined" | "busy"> {
    if (decide(state, panel, command.op) === "allow") return Promise.resolve("allow");
    if (state.pending.filter(p => p.panel.key === panel.key).length >= PENDING_MAX) return Promise.resolve("busy");
    const id = crypto.randomUUID();
    return new Promise(resolve => { resolvers.set(id, approved => resolve(approved ? "allow" : "declined")); dispatch({ type: "request", id, panel, command }); });
  },
  /** Decline everything a panel still has waiting (its frame went away). */
  dropPanel(key: string) {
    for (const request of state.pending) if (request.panel.key === key) dispatch({ type: "decline", id: request.id });
  },
};

export const usePolicy = (): PolicyState => useSyncExternalStore(policyStore.subscribe, policyStore.get, policyStore.get);

const ARM_MS = 700;
const LABEL: Record<PanelCommand["op"], string> = {
  "chat.send": "post in the public chat", "agent.summon": "summon an agent (pays from your energy)", "agent.replace": "replace an agent's code (pays from your energy)",
  "agent.destroy": "destroy one of your agents", "game.pause": "use your one pause of the game", "agent.check": "check agent code", "game.ready": "say you are ready",
};

/** The confirmation dialog, once per game page; also drops grants a later foreign version voided. */
export function PanelConfirmations() {
  const { pending } = usePolicy();
  const panels = useMyPanels();
  useEffect(() => {
    if (panels) dispatch({ type: "panels", panels: panels.map(p => ({ key: panelKey(p.slug), currentVersion: p.currentVersion, lastForeignVersion: p.lastForeignVersion })) });
  }, [panels]);
  const request: ConfirmRequest | undefined = pending[0];
  const [armed, setArmed] = useState<string>();
  useEffect(() => {
    if (!request) return;
    const timer = setTimeout(() => setArmed(request.id), ARM_MS);
    return () => clearTimeout(timer);
  }, [request?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!request) return null;
  const ready = armed === request.id;
  const slug = request.panel.key.slice("stored:".length);
  const name = panels?.find(p => p.slug === slug)?.title ?? slug;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="panel-confirm-title" data-testid="dialog-panel-action" data-armed={ready}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg space-y-3 border bg-card p-4 text-sm">
        <h2 id="panel-confirm-title" className="font-semibold">Your panel “{name}” wants to {LABEL[request.command.op]}</h2>
        <p className="text-muted-foreground">This is exactly what it would do, as you. Panels are code you or your assistant wrote; check it before you allow it.</p>
        <pre data-testid="text-panel-action-payload" className="max-h-60 overflow-auto whitespace-pre-wrap break-words border p-2 font-mono text-xs">
          {JSON.stringify({ operation: request.command.op, ...request.command.args }, null, 2)}
        </pre>
        {pending.length > 1 && <p className="text-muted-foreground">{pending.length - 1} more waiting.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="button-panel-action-confirm" disabled={!ready} className="bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
            onClick={() => dispatch({ type: "confirm", id: request.id })}>Do it</button>
          <button type="button" data-testid="button-panel-action-always" disabled={!ready} className="border px-3 py-1.5 disabled:opacity-50"
            onClick={() => dispatch({ type: "confirm", id: request.id, alwaysAllow: true })}>Do it, and let this panel act without asking</button>
          <button type="button" data-testid="button-panel-action-cancel" className="ml-auto px-3 py-1.5 underline"
            onClick={() => dispatch({ type: "decline", id: request.id })}>Cancel</button>
        </div>
        <p className="text-xs text-muted-foreground">“Without asking” lasts until your assistant or another app saves a new version of this panel.</p>
      </div>
    </div>
  );
}
