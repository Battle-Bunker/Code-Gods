/**
 * Advice that names a deal ("hold grid 12 here", "leave line 3 alone") opens the forge with its control filled in:
 * the player reads it, sees the price, and presses Save (persona walk: "hold grid 12? don't know how"). The summary,
 * One line and anything else call `requestForge`; the forge's controls take the request once.
 */
import type { HoldTarget } from "@workspace/v2-agents/pure";

/** A hold or leave request with no numbers (and a hold with no target) only brings the control into view, focused (the palette). */
export type ForgeRequest = { kind: "hold"; numbers: number[]; target?: Exclude<HoldTarget, null> } | { kind: "leave"; numbers: number[] };

let pending: ForgeRequest | null = null;
const listeners = new Set<() => void>();

/** Opens the forge (Agent code) and fills the control in; nothing is saved until the player presses Save. */
export async function requestForge(r: ForgeRequest, openPane: (pane: string) => Promise<unknown>): Promise<void> {
  pending = r;
  for (const l of listeners) l();
  await openPane("forge");
}
/** The request for this control, taken once (null when there is none). */
export function takeForgeRequest(kind: ForgeRequest["kind"]): ForgeRequest | null {
  if (pending?.kind !== kind) return null;
  const r = pending; pending = null; return r;
}
export function onForgeRequest(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
