/**
 * `useAffordance(id)`: how every button in the app runs an operation. No component calls a Convex mutation or action
 * itself (parity check 3): it asks the directory whether the operation is available here and now, shows the reason
 * and the fix when it is not, uses the same confirmation the palette uses, and runs it through the app's one
 * `perform` (server affordances: their `defineOp` function, `opPath`/`opKind`; view operations: `defineViewOps`).
 */
import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { AFFORDANCES, refusal, type AffordanceId, type AffordanceOf } from "./directory.ts";
import type { OpError, OpOutcome } from "./server.ts";
import type { AffordanceContext, Confirm, Effect } from "./types.ts";
import type { z } from "zod/v4";

/** What the app provides once, at its root: the viewer's context now, and how to perform any affordance. */
export interface AffordanceRuntime {
  context: AffordanceContext;
  perform(id: AffordanceId, args: unknown): Promise<OpOutcome>;
}

/** A refused or failed operation, thrown by `run` so a button's error handling sees the server's words. */
export class AffordanceError extends Error {
  readonly code: OpError["code"];
  readonly fix?: string;
  constructor(e: OpError) { super(e.message); this.code = e.code; if (e.fix) this.fix = e.fix; }
}

export interface AffordanceHandle<Id extends AffordanceId> {
  id: Id; title: string; tooltip: string;
  available: boolean;
  /** Why not, when not available; `fix` is another affordance's id or a sentence. */
  reason?: string; fix?: string;
  /** Never show it (the viewer can never do this here: a spectator's Summon). */
  hidden: boolean;
  confirm: Confirm; effect: Effect; spends?: "energy" | "aiBudget";
  run(args: z.input<AffordanceOf<Id>["params"]>): Promise<z.output<AffordanceOf<Id>["result"]>>;
}

/** The handle without React, for tests and non-React callers. */
export function affordanceHandle<Id extends AffordanceId>(id: Id, rt: AffordanceRuntime): AffordanceHandle<Id> {
  const a = AFFORDANCES[id] as AffordanceOf<Id>;
  const no = refusal(a, rt.context);
  return {
    id, title: a.title, tooltip: a.tooltip, available: !no, hidden: !!no?.hidden,
    ...(no ? { reason: no.reason, ...(no.fix ? { fix: no.fix } : {}) } : {}),
    confirm: a.confirm, effect: a.effect, ...(a.spends ? { spends: a.spends } : {}),
    async run(args) {
      const out = await rt.perform(id, args);
      if (!out.ok) throw new AffordanceError(out.error);
      return out.result as never;
    },
  };
}

const Runtime = createContext<AffordanceRuntime | null>(null);

export function AffordanceProvider(props: { runtime: AffordanceRuntime; children?: ReactNode }) {
  return createElement(Runtime.Provider, { value: props.runtime }, props.children);
}

export function useAffordance<Id extends AffordanceId>(id: Id): AffordanceHandle<Id> {
  const rt = useContext(Runtime);
  if (!rt) throw new Error("useAffordance needs an <AffordanceProvider> above it");
  return useMemo(() => affordanceHandle(id, rt), [id, rt]);
}
