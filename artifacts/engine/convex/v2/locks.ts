/**
 * Locks on a game's objects (docs/engine-v2/locks.md), behind the room setting `locks`. One small `v2Locks` document per
 * live lock: its predicate (canonical text), information content, upkeep rate and energy as of `settledAt` (upkeep is
 * settled lazily, so nothing is written per tick); `endsAt` is when that energy reaches zero, and the commit's sweep
 * ends locks whose time has come. An ended lock's document is deleted; the event log keeps its history. Every change
 * is an event of kind "lock" (`by` is the actor: disclosed only after the end).
 */
import {
  canonicalPredicate, isInvalid, LOCKS_PER_OBJECT, lockedAct, lockEndsAt, parsePredicate, plainWords, type ActLock, type Call, type InformationContent, type LockOpDone, type LockOpWire, type ObjectType,
} from "@workspace/v2-core";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireGameMember } from "./access";
import { typeOf, variantOf, decode } from "./world";
import { actLock } from "./lockWire";
export { actLock, lockWire, type LockWire } from "./lockWire";

/** The sweep ends at most this many decayed locks a commit (the rest at the next). */
const SWEEP = 32;

export const locksOn = (game: { settings: object }): boolean => (game.settings as { locks?: boolean }).locks === true;

/**
 * An object's lock documents, by number: at most LOCKS_PER_OBJECT live ones, plus any that decayed since the last sweep
 * (`liveLockDocs` ends those first in a mutation). Read with a bound all the same.
 */
export const LOCK_PAGE = 32;
export async function lockDocs(ctx: QueryCtx, objectId: Id<"v2Objects">): Promise<Doc<"v2Locks">[]> {
  return await ctx.db.query("v2Locks").withIndex("by_object", q => q.eq("objectId", objectId)).take(LOCK_PAGE);
}
/** An object's live lock documents at `world`, ending (deleting, with an event) any that decayed by then. */
export async function liveLockDocs(ctx: MutationCtx, objectId: Id<"v2Objects">, world: number, appendEvent: (kind: "lock", data: unknown) => Promise<number>) {
  const out: Doc<"v2Locks">[] = [];
  for (const d of await lockDocs(ctx, objectId)) {
    if (d.endsAt > world) { out.push(d); continue; }
    await ctx.db.delete(d._id);
    await appendEvent("lock", { op: "ended", why: "decayed", lock: d.n, objectId: d.objectId, number: d.number, worldSeconds: d.endsAt });
  }
  return out;
}

/** The number an object's next lock takes. */
export const nextLockOf = (object: Doc<"v2Objects">): number => (object.locksMade ?? 0) + 1;

/** An act's lock changes back on the wire, for the commit's re-run (drains ask for what was drained: clipped again). */
export function opsOf(done: readonly LockOpDone[]): LockOpWire[] {
  return done.map(d => (d.op === "create" ? { op: "create", predicate: d.predicate, amount: d.amount } : { op: d.op, lock: d.lock, amount: d.amount }));
}

/**
 * An act re-run at commit (lib/v2-core lockedAct) against the object's current state and live locks at `world`: what
 * the tick ran may have been overtaken by another act of the same commit. New locks take the information content the
 * tick computed (server code, deterministic per predicate and state), so a mutation never draws from the law.
 */
export function recheck(game: Doc<"v2Games">, object: Doc<"v2Objects">, docs: readonly Doc<"v2Locks">[], state: string,
  calls: readonly Call[], done: readonly LockOpDone[], world: number) {
  const type = typeOf(game.variant), variant = variantOf(game.variant);
  const infos = new Map(done.flatMap(d => (d.op === "create" ? [[d.predicate, d] as const] : [])));
  return lockedAct({
    type, variant, state: decode(state, game.variant), calls, ops: opsOf(done), locks: docs.map(d => actLock(type, d)), world,
    nextLock: nextLockOf(object), fullChargeSeconds: game.settings.economy.fullChargeSeconds,
    // Only an act's own new locks reach this, and each carries the I the tick computed for it (should one not, the
    // bound φ(s), never a throw inside the commit).
    info: (p, s): InformationContent => {
      const d = infos.get(canonicalPredicate(p));
      return d ? { bits: d.info, hits: 0, draws: 0, bounded: d.bounded } : { bits: type.readLength(s, variant), hits: 0, draws: 0, bounded: true };
    },
  });
}

/**
 * Writes an act's lock changes: the locks after it (settled at `world`), an event per change. `by` is the actor (an
 * agent's member, or a player by hand), stored and disclosed only after the end.
 */
export async function writeLocks(ctx: MutationCtx, game: Doc<"v2Games">, object: Doc<"v2Objects">, docs: readonly Doc<"v2Locks">[],
  after: readonly ActLock[], done: readonly LockOpDone[], world: number, by: { memberId: string; agentId?: string },
  appendEvent: (kind: "lock", data: unknown) => Promise<number>) {
  if (!done.length) return;
  const byN = new Map(docs.map(d => [d.n, d]));
  const touched = new Set(done.map(d => d.lock));
  for (const n of touched) {
    const l = after.find(x => x.n === n), d = byN.get(n);
    if (!l) { if (d) await ctx.db.delete(d._id); continue; }
    const fields = { energy: l.energy, settledAt: world, endsAt: lockEndsAt({ ...l, settledAt: world }) };
    if (d) await ctx.db.patch(d._id, fields);
    else await ctx.db.insert("v2Locks", { gameId: game._id, objectId: object._id, number: object.number, n, predicate: l.text, info: l.info, rate: l.rate, createdAt: world, ...fields });
  }
  const made = done.filter(d => d.op === "create").length;
  if (made) await ctx.db.patch(object._id, { locksMade: (object.locksMade ?? 0) + made });
  for (const d of done) {
    await appendEvent("lock", { ...d, objectId: object._id, number: object.number, worldSeconds: world, ...by });
    if (d.op === "drain" && !after.some(x => x.n === d.lock)) {
      await appendEvent("lock", { op: "ended", why: "drained", lock: d.lock, objectId: object._id, number: object.number, worldSeconds: world });
    }
  }
}

/** Ends the locks whose energy has run out by `world` (the commit's sweep). */
export async function sweepLocks(ctx: MutationCtx, gameId: Id<"v2Games">, world: number, appendEvent: (kind: "lock", data: unknown) => Promise<number>) {
  const due = await ctx.db.query("v2Locks").withIndex("by_game_ends", q => q.eq("gameId", gameId).lte("endsAt", world)).take(SWEEP);
  for (const d of due) {
    await ctx.db.delete(d._id);
    await appendEvent("lock", { op: "ended", why: "decayed", lock: d.n, objectId: d.objectId, number: d.number, worldSeconds: d.endsAt });
  }
}

/** A retiring object's locks end with it. */
export async function retireLocks(ctx: MutationCtx, objectId: Id<"v2Objects">, world: number, appendEvent: (kind: "lock", data: unknown) => Promise<number>) {
  for (const d of await lockDocs(ctx, objectId)) {
    await ctx.db.delete(d._id);
    await appendEvent("lock", { op: "ended", why: "retired", lock: d.n, objectId, number: d.number, worldSeconds: world });
  }
}

/**
 * An object's live locks, for anyone in the game's room (locks are public on the object, like moves; docs/engine-v2
 * locks.md §6): number, predicate, plain words, information content, upkeep a second, energy as of `settledAt` and when
 * it runs out (a client settles the energy at the world clock it already shows). Never who made or funded them.
 * One index page of at most LOCK_PAGE small documents (8 live, and any decayed since the sweep).
 */
export const ofObject = query({
  args: { gameId: v.string(), objectId: v.id("v2Objects") },
  handler: async (ctx, { gameId, objectId }) => {
    const { game } = await requireGameMember(ctx, gameId);
    if (!locksOn(game)) return [];
    const type = typeOf(game.variant);
    return (await lockDocs(ctx, objectId)).filter(d => d.gameId === game._id).slice(0, LOCKS_PER_OBJECT * 2).map(d => ({
      n: d.n, predicate: d.predicate, words: plainWords(type, actLock(type, d).predicate), info: d.info, rate: d.rate,
      energy: d.energy, settledAt: d.settledAt, endsAt: d.endsAt, createdAt: d.createdAt,
    }));
  },
});
