/**
 * Locks on a game's objects (docs/engine-v2/locks.md), behind the room setting `locks`. One small `v2Locks` document per
 * live lock: its predicate program, complexity, upkeep rate and energy as of `settledAt` (upkeep is settled lazily, so
 * nothing is written per tick); `endsAt` is when that energy reaches zero, and the commit's sweep ends locks whose time
 * has come. An ended lock's document is deleted; the event log keeps its history. Every change is an event of kind
 * "lock" (`by` is the actor: disclosed only after the end).
 *
 * No program runs here (a mutation cannot run the sandbox): the tick, or a player's `lock.create` action, runs the
 * checks, and the commit applies what they measured again with lib/v2-core `commitLocks`.
 */
import { commitLocks, isInvalid, LOCKS_PER_OBJECT, lockEndsAt, type ActLock, type LockOpDone, type LockRates } from "@workspace/v2-core";
import { OpFailure } from "@workspace/v2-affordances";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireGameMember, resolveContext, userById, type Scope } from "./access";
import { pay } from "./agents.ts";
import { outcome } from "./failure";
import { appendEvent, clockOf } from "./loop";
import { assertTurnRuns } from "./turnFence";
import { actLock, defaultLockRates, lockWire } from "./lockWire";
export { actLock, lockWire, lockSeen, type LockWire, type LockSeen } from "./lockWire";

/** The sweep ends at most this many decayed locks a commit (the rest at the next). */
const SWEEP = 32;
/** A lock keeps its last this many additions and withdrawals (its totals, and each member's, are kept whole). */
export const LOCK_HISTORY = 48;

export const locksOn = (game: { settings: object }): boolean => (game.settings as { locks?: boolean }).locks === true;
/** The game's lock prices (resolved at start; a game started before they were resolved takes the §3 defaults). */
export function ratesOf(game: Doc<"v2Games">): LockRates {
  const s = game.settings as { lockRates?: LockRates; economy: { powerPerSecond: number; fullChargeSeconds: number } };
  return s.lockRates ?? defaultLockRates(s.economy);
}

/**
 * An object's lock documents, by number: at most LOCKS_PER_OBJECT live ones, plus any that decayed since the last sweep
 * (`liveLockDocs` ends those first in a mutation). Read with a bound all the same.
 */
export const LOCK_PAGE = 32;
export async function lockDocs(ctx: QueryCtx, objectId: Id<"v2Objects">): Promise<Doc<"v2Locks">[]> {
  return await ctx.db.query("v2Locks").withIndex("by_object", q => q.eq("objectId", objectId)).take(LOCK_PAGE);
}
type Append = (kind: "lock", data: unknown) => Promise<number>;
/** An object's live lock documents at `world`, ending (deleting, with an event) any that decayed by then. */
export async function liveLockDocs(ctx: MutationCtx, objectId: Id<"v2Objects">, world: number, appendEvent: Append) {
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

/**
 * An act's lock changes applied again at commit (lib/v2-core commitLocks) to the object's live locks at `world`: no
 * program runs. `checked` is the locks a move's calls were checked against (null: the act did not move the object).
 */
export function recommit(object: Doc<"v2Objects">, docs: readonly Doc<"v2Locks">[], done: readonly LockOpDone[], checked: readonly number[] | null, world: number) {
  return commitLocks({ locks: docs.map(actLock), done, checked, world, nextLock: nextLockOf(object) });
}

/**
 * Writes an act's lock changes: the locks after it (settled at `world`), their history, an event per change. `by` is
 * the actor (an agent's member, or a player by hand), stored and disclosed only after the end.
 */
export async function writeLocks(ctx: MutationCtx, game: Doc<"v2Games">, object: Doc<"v2Objects">, docs: readonly Doc<"v2Locks">[],
  after: readonly ActLock[], done: readonly LockOpDone[], world: number, by: { memberId: string; agentId?: string }, appendEvent: Append) {
  if (!done.length) return;
  const byN = new Map(docs.map(d => [d.n, d]));
  for (const n of new Set(done.map(d => d.lock))) {
    const l = after.find(x => x.n === n), d = byN.get(n);
    if (!l) { if (d) await ctx.db.delete(d._id); continue; }
    const mine = done.filter(x => x.lock === n);
    const added = mine.reduce((t, x) => t + (x.op === "drain" ? 0 : x.amount), 0), taken = mine.reduce((t, x) => t + (x.op === "drain" ? x.amount : 0), 0);
    const entries = mine.map(x => ({ at: world, op: x.op, amount: x.amount, by: by.memberId }));
    const members = [...(d?.byMember ?? [])];
    const i = members.findIndex(m => m.memberId === by.memberId);
    if (i < 0) members.push({ memberId: by.memberId, added, taken });
    else members[i] = { memberId: by.memberId, added: members[i]!.added + added, taken: members[i]!.taken + taken };
    const fields = { energy: l.energy, settledAt: world, endsAt: lockEndsAt({ ...l, settledAt: world }),
      added: (d?.added ?? 0) + added, taken: (d?.taken ?? 0) + taken, history: [...(d?.history ?? []), ...entries].slice(-LOCK_HISTORY), byMember: members };
    if (d) await ctx.db.patch(d._id, fields);
    else await ctx.db.insert("v2Locks", {
      gameId: game._id, objectId: object._id, number: object.number, n, language: l.program.language, source: l.program.source, words: l.program.words,
      programBits: l.programBits, readBits: l.readBits, bits: l.bits, rate: l.rate, createdAt: world, ...fields,
    });
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
export async function sweepLocks(ctx: MutationCtx, gameId: Id<"v2Games">, world: number, appendEvent: Append) {
  const due = await ctx.db.query("v2Locks").withIndex("by_game_ends", q => q.eq("gameId", gameId).lte("endsAt", world)).take(SWEEP);
  for (const d of due) {
    await ctx.db.delete(d._id);
    await appendEvent("lock", { op: "ended", why: "decayed", lock: d.n, objectId: d.objectId, number: d.number, worldSeconds: d.endsAt });
  }
}

/** A retiring object's locks end with it. */
export async function retireLocks(ctx: MutationCtx, objectId: Id<"v2Objects">, world: number, appendEvent: Append) {
  for (const d of await lockDocs(ctx, objectId)) {
    await ctx.db.delete(d._id);
    await appendEvent("lock", { op: "ended", why: "retired", lock: d.n, objectId, number: d.number, worldSeconds: world });
  }
}

/**
 * An object's live locks, for anyone in the game's room (locks are public on the object, like moves; locks.md §5): the
 * program and its description, complexity, upkeep a second, energy as of `settledAt` and when it runs out (a client
 * settles the energy at the world clock it already shows), the totals added and taken, the caller's own totals, and
 * the history as amounts and times, each marked `mine` for the caller's own. Who did the others' is not shown while the
 * game is live; after the end every entry names its member. One index page of at most LOCK_PAGE small documents.
 */
export async function locksFor(ctx: QueryCtx, game: Doc<"v2Games">, me: string, objectId: Id<"v2Objects">) {
  if (!locksOn(game)) return [];
  const ended = game.phase === "ended";
  return (await lockDocs(ctx, objectId)).filter(d => d.gameId === game._id).slice(0, LOCKS_PER_OBJECT * 2).map(d => {
    const own = d.byMember.find(m => m.memberId === me);
    return {
      n: d.n, words: d.words, language: d.language, source: d.source, programBits: d.programBits, readBits: d.readBits, bits: d.bits, rate: d.rate,
      energy: d.energy, settledAt: d.settledAt, endsAt: d.endsAt, createdAt: d.createdAt, added: d.added, taken: d.taken,
      mine: { added: own?.added ?? 0, taken: own?.taken ?? 0 },
      history: d.history.map(h => ({ at: h.at, op: h.op, amount: h.amount, mine: h.by === me, ...(ended ? { by: h.by } : {}) })),
    };
  });
}
export const ofObject = query({
  args: { gameId: v.string(), objectId: v.id("v2Objects") },
  handler: async (ctx, { gameId, objectId }) => {
    const { game, member } = await requireGameMember(ctx, gameId);
    return await locksFor(ctx, game, member._id, objectId);
  },
});

// ---------------------------------------------------------------- by hand (ops/lock.ts)

async function seat(ctx: QueryCtx, userId: string, scope: Scope) {
  const r = await resolveContext(ctx, await userById(ctx, userId), scope);
  if (!r.game || !r.player) throw new OpFailure("Only players with a seat in this game can do this.");
  if (!locksOn(r.game)) throw new OpFailure("This game has no locks (the room setting is off).");
  if (r.game.phase === "ended") throw new OpFailure("The game is over.");
  return { game: r.game, player: r.player };
}
async function objectOf(ctx: QueryCtx, game: Doc<"v2Games">, objectId: string) {
  const id = ctx.db.normalizeId("v2Objects", objectId);
  const o = id ? await ctx.db.get(id) : null;
  if (!o || o.gameId !== game._id) throw new OpFailure("There is no such object in this game.");
  if (o.retiredAt !== undefined) throw new OpFailure(`Object #${o.number} has retired; its locks ended with it.`);
  return o;
}

/** What a player's `lock.create` and `lock.test` actions need: the object's state, version, variant and live locks. */
export const handContext = internalQuery({
  args: { userId: v.string(), scope: v.any(), objectId: v.string() },
  handler: async (ctx, a) => {
    try {
      const { game } = await seat(ctx, a.userId, a.scope);
      const o = await objectOf(ctx, game, a.objectId);
      const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", o._id)).unique())!;
      const world = (await clockOf(ctx, game._id)).worldSeconds;
      return { number: o.number, variant: game.variant, state: st.state, version: st.version, world, rates: ratesOf(game), nextLock: nextLockOf(o),
        locks: (await lockDocs(ctx, o._id)).filter(d => d.endsAt > world).map(lockWire) };
    } catch (e) {
      if (e instanceof OpFailure) return { refused: e.message };
      throw e;
    }
  },
});

const createDoneV = v.object({
  op: v.literal("create"), lock: v.number(), program: v.object({ language: v.union(v.literal("typescript"), v.literal("python")), source: v.string(), words: v.string() }),
  programBits: v.number(), readBits: v.number(), bits: v.number(), fee: v.number(), amount: v.number(), rate: v.number(), spend: v.number(),
});

/**
 * A player's lock change by hand, paid from their own store: a fund or drain (any lock on the object), or a new lock
 * the `lock.create` action measured on the object's state at `version` (refused if the object has moved since).
 */
export const byHand = internalMutation({
  args: {
    userId: v.string(), scope: v.any(), turnId: v.optional(v.string()), objectId: v.string(),
    change: v.union(
      v.object({ op: v.union(v.literal("fund"), v.literal("drain")), lock: v.number(), amount: v.number() }),
      v.object({ op: v.literal("create"), version: v.number(), done: createDoneV }),
    ),
  },
  handler: (ctx, a) => outcome(async () => {
    await assertTurnRuns(ctx, a.turnId);
    const { game, player } = await seat(ctx, a.userId, a.scope);
    const object = await objectOf(ctx, game, a.objectId);
    const world = (await clockOf(ctx, game._id)).worldSeconds;
    const append: Append = (k, d) => appendEvent(ctx, game._id, k, d);
    if (a.change.op === "create") {
      const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", object._id)).unique())!;
      if (st.version !== a.change.version) throw new OpFailure(`Object #${object.number} moved while the lock was being checked; try again.`);
    }
    const c = a.change;
    if (c.op !== "create" && !(Number.isFinite(c.amount) && c.amount > 0)) throw new OpFailure("An amount of energy is a positive number.");
    const docs = await liveLockDocs(ctx, object._id, world, append);
    const done: LockOpDone[] = c.op === "create" ? [c.done] : [{ op: c.op, lock: c.lock, amount: c.amount, spend: c.amount }];
    const r = recommit(object, docs, done, null, world);
    if (isInvalid(r)) throw new OpFailure(r.invalid);
    const own = await pay(ctx, game, player, world, r.spend, c.op === "create" ? "That lock" : c.op === "fund" ? "That funding" : "That drain");
    await ctx.db.patch(player._id, { energy: own.balance, settledAt: own.settledWorldSeconds });
    await writeLocks(ctx, game, object, docs, r.locks, r.done, world, { memberId: player.memberId }, append);
    const l = r.locks.find(x => x.n === r.done[0]!.lock);
    return { lock: r.done[0]!.lock, energy: l?.energy ?? 0, spend: r.spend };
  }),
});
