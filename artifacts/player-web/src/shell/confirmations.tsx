/**
 * The host-rendered confirmation for an action a sandboxed panel asked for (policy: action-policy.ts). It shows
 * the exact command payload; nothing is sent until the player confirms. The panel cannot draw over it: it lives in
 * the host document, outside every frame. Its buttons arm after a short delay, so a click aimed at the panel
 * (which may have raised the request on pointerdown) cannot land on "Send".
 */
import { useEffect, useState } from "react";
import type { PanelEntry } from "./panel-store";
import { policyStore, usePolicy } from "./policy-store";
import { policyKey } from "./registry-merge";

const ARM_MS = 700;
const LABEL: Record<string, string> = { chat: "post in the public chat", summon: "summon an agent (pays from your energy)", destroy: "destroy one of your agents", pause: "use your one pause of the game" };

export function Confirmations({ entries }: { entries: readonly PanelEntry[] }) {
  const { pending } = usePolicy();
  const request = pending[0];
  const [armed, setArmed] = useState<string>();
  useEffect(() => {
    if (!request) return;
    const timer = setTimeout(() => setArmed(request.id), ARM_MS);
    return () => clearTimeout(timer);
  }, [request?.id]);
  if (!request) return null;
  const ready = armed === request.id;
  const entry = entries.find(e => policyKey(e) === request.panel.key);
  const name = entry?.stored?.title ?? entry?.id ?? request.panel.key;
  const { type, ...payload } = request.command;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="panel-confirm-title" data-testid="dialog-panel-action" data-armed={ready}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="panel w-full max-w-lg space-y-3 p-4 text-[13px]">
        <h2 id="panel-confirm-title" className="font-semibold">Panel “{name}” wants to {LABEL[type] ?? type}</h2>
        <p className="opacity-70">This is exactly what it would send. Panels are code your agents wrote; check it before you allow it.</p>
        <pre data-testid="text-panel-action-payload" className="max-h-60 overflow-auto whitespace-pre-wrap break-words border border-[hsl(var(--card-border))] p-2 font-mono text-[11px]">
          {JSON.stringify({ type, ...payload }, null, 2)}
        </pre>
        {pending.length > 1 && <p className="opacity-60">{pending.length - 1} more waiting.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="button-panel-action-confirm" disabled={!ready} className="bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
            onClick={() => policyStore.dispatch({ type: "confirm", id: request.id })}>Send</button>
          <button type="button" data-testid="button-panel-action-always" disabled={!ready} className="border border-[hsl(var(--card-border))] px-3 py-1.5 disabled:opacity-50"
            onClick={() => policyStore.dispatch({ type: "confirm", id: request.id, alwaysAllow: true })}>Send, and let this panel act without asking</button>
          <button type="button" data-testid="button-panel-action-cancel" className="ml-auto px-3 py-1.5 underline"
            onClick={() => policyStore.dispatch({ type: "decline", id: request.id })}>Cancel</button>
        </div>
        <p className="text-[11px] opacity-60">“Without asking” lasts until an agent or another device saves a new version of this panel.</p>
      </div>
    </div>
  );
}
