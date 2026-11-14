/**
 * Running a server affordance, independent of where it runs (Convex in `convex.ts`, memory in `fake.ts`): validate the
 * args with the affordance's own schema, apply `refusal` (caller, grant, context, consent, its dynamic check), answer
 * a repeated `requestId` from its receipt, run the handler, and check the result against the declared result schema.
 * Parity check 2 lives here too: `handlerProblems` says whether a handler map covers every server affordance exactly.
 */
import { z } from "zod/v4";
import { DIRECTORY, refusal, type AffordanceId, type AffordanceOf, type Directory, type ServerAffordanceId, type Via } from "./directory.ts";
import type { AffordanceContext, AnyAffordance } from "./types.ts";

export type OpErrorCode = "unknown" | "invalid_args" | "refused" | "failed";
export interface OpError { code: OpErrorCode; message: string; fix?: string }
export type OpOutcome<T = unknown> = { ok: true; result: T; replayed?: true } | { ok: false; error: OpError };

/** A domain failure a handler reports to the caller ("That agent is not yours."), as opposed to a bug. */
export class OpFailure extends Error {
  readonly fix?: string;
  constructor(message: string, fix?: string) { super(message); if (fix) this.fix = fix; }
}

/** Completed writes, keyed by caller, affordance and requestId, so a retry is answered and never applied twice. */
export interface ReceiptStore {
  get(key: string): Promise<OpOutcome | null>;
  put(key: string, outcome: OpOutcome): Promise<void>;
}

export type OpArgs<Id extends AffordanceId> = z.output<AffordanceOf<Id>["params"]>;
export type OpResult<Id extends AffordanceId> = z.input<AffordanceOf<Id>["result"]>;
/** A server affordance's implementation; `E` is what the host gives it (a Convex ctx, the fake's state). */
export type Handler<Id extends AffordanceId, E> = (env: E, args: OpArgs<Id>) => Promise<OpResult<Id>> | OpResult<Id>;
/** One handler per server affordance: a map of this type that misses one does not typecheck. */
export type ServerHandlers<E> = { [Id in ServerAffordanceId]: Handler<Id, E> };

export interface RunOptions<E> {
  /** The caller's context as the server sees it (from the room and the game header), not as the client claims it. */
  ctx: AffordanceContext;
  /** Who is calling: the app, or a generated surface (a consent affordance refuses all but the app). */
  via: Via;
  /** Stable for one caller (a user id, or a credential id), so receipts never answer another caller. */
  callerKey: string;
  env: E;
  receipts?: ReceiptStore;
}

/** Runs one affordance by id with raw (unvalidated) args. Never throws for the caller's mistakes; a bug still throws. */
export async function runOp<E>(a: AnyAffordance, handler: (env: E, args: never) => unknown, raw: unknown, o: RunOptions<E>): Promise<OpOutcome> {
  const parsed = a.params.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: { code: "invalid_args", message: z.prettifyError(parsed.error) } };
  const args = parsed.data as Record<string, unknown>;
  // A retry is answered from its receipt before any check: the write it repeats may have changed what the checks see
  // (a pause moved the game to paused; a summon spent the last energy).
  const requestId = typeof args.requestId === "string" ? args.requestId : null;
  const key = requestId && o.receipts ? `${o.callerKey}|${a.id}|${requestId}` : null;
  if (key) {
    const seen = await o.receipts!.get(key);
    if (seen) return seen.ok ? { ...seen, replayed: true } : seen;
  }
  const no = refusal(a, o.ctx, args, o.via);
  if (no) return { ok: false, error: { code: "refused", message: no.reason, ...(no.fix ? { fix: no.fix } : {}) } };
  let outcome: OpOutcome;
  try {
    const result = await handler(o.env, args as never);
    const checked = a.result.safeParse(result);
    if (!checked.success) throw new Error(`${a.id} returned a result its declaration does not allow: ${z.prettifyError(checked.error)}`);
    outcome = { ok: true, result: checked.data };
  } catch (e) {
    if (!(e instanceof OpFailure)) throw e;
    outcome = { ok: false, error: { code: "failed", message: e.message, ...(e.fix ? { fix: e.fix } : {}) } };
  }
  // Only a completed write is a receipt. A domain failure is rolled back by the host (the fake restores its state; a
  // Convex mutation throws), so a retry runs again on whatever the world is then.
  if (key && outcome.ok) await o.receipts!.put(key, outcome);
  return outcome;
}

/** A receipt store over a plain record (the fake keeps it in its state, so the CLI's receipts persist with the world). */
export function memoryReceipts(record: Record<string, OpOutcome> = {}): ReceiptStore & { size(): number } {
  return { get: async k => record[k] ?? null, put: async (k, v) => { record[k] = v; }, size: () => Object.keys(record).length };
}

/**
 * Parity check 2 for a set of implemented ids (a handler map's keys, or the ids bound with `defineOp` in
 * `convex/v2/ops`): every server affordance exactly once, no client affordance, nothing unknown.
 */
export function handlerProblems(ids: readonly string[], dir: Directory = DIRECTORY): string[] {
  const problems: string[] = [];
  const count = new Map<string, number>();
  for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
  for (const a of dir) {
    const n = count.get(a.id) ?? 0;
    if (a.runs === "server" && n === 0) problems.push(`check 2: ${a.id} has no server handler`);
    if (a.runs === "server" && n > 1) problems.push(`check 2: ${a.id} has ${n} server handlers`);
    if (a.runs === "client" && n > 0) problems.push(`check 2: ${a.id} is a view operation but has a server handler`);
  }
  for (const id of count.keys()) if (!dir.some(a => a.id === id)) problems.push(`check 2: ${id} is not in the directory`);
  return problems;
}
