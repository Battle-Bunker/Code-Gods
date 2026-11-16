/**
 * `lock.*` (docs/engine-v2/locks.md §7): an object's locks, read by anyone in the game; made, funded and drained by a
 * seated player, paid from their own store (`locks:byHand`); a new lock's program and a change's check run in the
 * sandbox first (`lockNode`).
 */
import { OpFailure } from "@workspace/v2-affordances";
import { READY_PREDICATES } from "@workspace/v2-agents/pure";
import { makeFunctionReference } from "convex/server";
import { failureOf } from "../failure";
import { locksFor } from "../locks.ts";
import { callerOf, defineOp, inGame } from "./define";

const MEASURE = makeFunctionReference<"action", Record<string, unknown>, { refused: string } | { version: number; done: { bits: number; fee: number; rate: number } }>("v2/lockNode:measure");
const TEST = makeFunctionReference<"action", Record<string, unknown>, { refused: string } | { allowed: boolean; breaks: { lock: number; words: string; energy: number }[] }>("v2/lockNode:test");
const BY_HAND = makeFunctionReference<"mutation", Record<string, unknown>, { lock: number; energy: number; spend: number }>("v2/locks:byHand");

async function guarded<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) { throw failureOf(e); }
}

export const { op: list, as: listAs } = defineOp("lock.list", "query", async (env, a) => {
  const { game, member } = inGame(env);
  if (!member) throw new OpFailure("Join the room first.");
  const id = env.ctx.db.normalizeId("v2Objects", a.objectId);
  if (!id) throw new OpFailure("There is no such object in this game.");
  return { locks: await locksFor(env.ctx, game, member._id, id) };
});

type Predicate = { ready?: string; args?: Record<string, string>; language?: "typescript" | "python"; source?: string; words?: string };
function programOf(a: Predicate) {
  if (a.ready) {
    const r = READY_PREDICATES.find(p => p.id === a.ready);
    if (!r) throw new OpFailure(`There is no ready-made predicate ${a.ready}.`, `One of: ${READY_PREDICATES.map(p => p.id).join(", ")}.`);
    return r.make(a.language ?? "python", a.args ?? {});
  }
  if (!a.language || !a.source || !a.words) throw new OpFailure("A lock needs a ready-made predicate, or a language, a source defining predicate(offer) and a one-line description (words).");
  return { language: a.language, source: a.source, words: a.words };
}

export const { op: check, as: checkAs } = defineOp("lock.check", "action", async (env, a) => {
  const c = callerOf(env), program = programOf(a);
  // A tiny opening amount: the check measures the lock, it makes nothing.
  const m = await env.ctx.runAction(MEASURE, { userId: c.userId!, scope: c.scope, objectId: a.objectId, program, amount: 1e-9 });
  if ("refused" in m) {
    // Only "it does not hold here" or "its program fails here" is an answer about the predicate; anything else (no seat,
    // the game over, the object full of locks) is a refusal of the check itself.
    if (/does not meet the lock's program|cannot be locked with it/.test(m.refused)) return { meets: false, words: program.words, why: m.refused };
    throw new OpFailure(m.refused);
  }
  return { meets: true, words: program.words, bits: m.done.bits, fee: m.done.fee, rate: m.done.rate };
});

export const { op: create, as: createAs } = defineOp("lock.create", "action", async (env, a) => {
  const c = callerOf(env), program = programOf(a);
  const m = await env.ctx.runAction(MEASURE, { userId: c.userId!, scope: c.scope, objectId: a.objectId, program, amount: a.amount });
  if ("refused" in m) throw new OpFailure(m.refused);
  const out = await guarded(() => env.ctx.runMutation(BY_HAND, { userId: c.userId!, scope: c.scope, ...(c.turnId ? { turnId: c.turnId } : {}), objectId: a.objectId, change: { op: "create", version: m.version, done: m.done } }));
  return { ...out, bits: m.done.bits, fee: m.done.fee, rate: m.done.rate };
});

export const { op: fund, as: fundAs } = defineOp("lock.fund", "action", async (env, a) => {
  const c = callerOf(env);
  return await guarded(() => env.ctx.runMutation(BY_HAND, { userId: c.userId!, scope: c.scope, ...(c.turnId ? { turnId: c.turnId } : {}), objectId: a.objectId, change: { op: "fund", lock: a.lock, amount: a.amount } }));
});
export const { op: drain, as: drainAs } = defineOp("lock.drain", "action", async (env, a) => {
  const c = callerOf(env);
  return await guarded(() => env.ctx.runMutation(BY_HAND, { userId: c.userId!, scope: c.scope, ...(c.turnId ? { turnId: c.turnId } : {}), objectId: a.objectId, change: { op: "drain", lock: a.lock, amount: a.amount } }));
});

export const { op: test, as: testAs } = defineOp("lock.test", "action", async (env, a) => {
  const c = callerOf(env);
  const out = await env.ctx.runAction(TEST, { userId: c.userId!, scope: c.scope, objectId: a.objectId, calls: a.calls.map(x => ({ mutator: x.mutator, site: x.site ?? 0, args: x.args })) });
  if ("refused" in out) throw new OpFailure(out.refused);
  return out;
});
