/**
 * The host's check of an action a sandboxed panel asks for (protocol `act`): an affordance in PANEL_ACTIONS
 * (src/frame/action-policy.ts), with arguments that affordance's own parameters accept (strict: no extra keys, so no
 * scope of its own), and without the panel's requestId (the host makes one per confirmed action). What passes is
 * exactly what the player's confirmation shows and what is performed, as the player, through the runtime.
 */
import { AFFORDANCES, type AffordanceId, type OpOutcome } from "@workspace/v2-affordances";
import type { ActOutcome } from "../frame/protocol.ts";
import { isPanelAction, type PanelCommand } from "../frame/action-policy.ts";

export function checkAct(op: unknown, args: unknown): PanelCommand | { error: string } {
  if (!isPanelAction(op)) return { error: `${String(op).slice(0, 80)} is not something a panel may do.` };
  if (!args || typeof args !== "object" || Array.isArray(args)) return { error: `${op} takes an object of arguments.` };
  const { requestId: _theirs, ...rest } = args as Record<string, unknown>;
  const parsed = AFFORDANCES[op].params.safeParse(rest);
  if (!parsed.success) return { error: `${op}: ${parsed.error.issues.map(i => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ").slice(0, 400)}` };
  const { requestId: _none, ...clean } = parsed.data as Record<string, unknown>;
  return { op, args: clean };
}

/** Whether the affordance takes a requestId (a write's idempotency key; a read such as agent.check takes none). */
const takesRequestId = (op: PanelCommand["op"]) => Object.hasOwn((AFFORDANCES[op].params as unknown as { shape: object }).shape, "requestId");

/** Performs a checked panel action as the player (a fresh requestId where the affordance takes one), as the panel gets it. */
export async function performPanelAction(perform: (id: AffordanceId, args: unknown) => Promise<OpOutcome>, command: PanelCommand): Promise<ActOutcome> {
  const out = await perform(command.op, takesRequestId(command.op) ? { ...command.args, requestId: crypto.randomUUID() } : command.args);
  return out.ok ? { ok: true, result: out.result } : { ok: false, error: { code: out.error.code, message: out.error.message } };
}
