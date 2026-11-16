"use node";
/**
 * The sandbox halves of a player's `lock.create` and `lock.test` (docs/engine-v2/locks.md §7): a predicate program runs
 * here, on the object's state as the context query read it; the writes are `locks:byHand`, which refuses if the object
 * moved meanwhile.
 */
import { predicateBits, predicateRunner } from "@workspace/v2-agents";
import { applyCall, isInvalid, lockedAct, lockEnergyAt, type Call, type LockOpDone, type LockProgram, type LockRates } from "@workspace/v2-core";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { actLock, type LockWire } from "./lockWire";
import { predicateBoxesFor } from "./runtime";
import { decode, typeOf, variantOf } from "./world";

type Context = { number: number; variant: string; state: string; version: number; world: number; rates: LockRates; nextLock: number; locks: LockWire[] } | { refused: string };
const CONTEXT = makeFunctionReference<"query", { userId: string; scope: unknown; objectId: string }, Context>("v2/locks:handContext");
const languageV = v.union(v.literal("typescript"), v.literal("python"));

/** Measures a new lock on the object as it is: its complexity, fee and upkeep; or why it cannot be made. */
export const measure = internalAction({
  args: { userId: v.string(), scope: v.any(), objectId: v.string(), program: v.object({ language: languageV, source: v.string(), words: v.string() }), amount: v.number() },
  handler: async (ctx, a): Promise<{ refused: string } | { version: number; done: Extract<LockOpDone, { op: "create" }> }> => {
    const c = await ctx.runQuery(CONTEXT, { userId: a.userId, scope: a.scope, objectId: a.objectId });
    if ("refused" in c) return c;
    const type = typeOf(c.variant), variant = variantOf(c.variant);
    const run = predicateRunner(type, variant, await predicateBoxesFor(ctx, [a.program.language]));
    const r = lockedAct({ type, variant, state: decode(c.state, c.variant), calls: [], ops: [{ op: "create", program: a.program as LockProgram, amount: a.amount }],
      locks: c.locks.map(actLock), world: c.world, nextLock: c.nextLock, rates: c.rates, run, programBits: predicateBits });
    if (isInvalid(r)) return { refused: r.invalid };
    return { version: c.version, done: r.done.find(d => d.op === "create") as Extract<LockOpDone, { op: "create" }> };
  },
});

/** Which locks a list of calls would break on the object as it is (each call checked on the state it reaches). */
export const test = internalAction({
  args: { userId: v.string(), scope: v.any(), objectId: v.string(), calls: v.array(v.object({ mutator: v.string(), site: v.number(), args: v.record(v.string(), v.string()) })) },
  handler: async (ctx, a): Promise<{ refused: string } | { allowed: boolean; reason?: string; breaks: { lock: number; words: string; energy: number }[] }> => {
    const c = await ctx.runQuery(CONTEXT, { userId: a.userId, scope: a.scope, objectId: a.objectId });
    if ("refused" in c) return c;
    const type = typeOf(c.variant), variant = variantOf(c.variant);
    const locks = c.locks.map(actLock);
    const run = locks.length ? predicateRunner(type, variant, await predicateBoxesFor(ctx, [...new Set(locks.map(l => l.program.language))])) : null;
    let s = decode(c.state, c.variant);
    const breaks = new Map<number, { lock: number; words: string; energy: number }>();
    for (const call of a.calls as Call[]) {
      const next = applyCall(type, variant, s, call);
      if (isInvalid(next)) return { allowed: false, reason: next.invalid, breaks: [...breaks.values()] };
      s = next.result;
      for (const l of locks) {
        const r = run!(l.program, s);
        // What draining it would cost now: its energy settled to the world clock.
        if (!(r.ok && r.holds) && !breaks.has(l.n)) breaks.set(l.n, { lock: l.n, words: l.program.words, energy: lockEnergyAt(l, c.world) });
      }
    }
    return { allowed: breaks.size === 0, breaks: [...breaks.values()].sort((x, y) => x.lock - y.lock) };
  },
});
