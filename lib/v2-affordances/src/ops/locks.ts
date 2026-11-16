/**
 * Locks (docs/engine-v2/locks.md): a predicate program on an object, defended with energy. Behind the room setting
 * `locks`: with it off, these are hidden. Anyone in the game reads an object's locks (program, energy, upkeep, time
 * left, the history as amounts and times, the caller's own share); a seated player makes, funds and drains them by hand,
 * paid from their own store, as their agents do in an act (`offer.lock`, `offer.fund`, `offer.drain`).
 */
import { z } from "zod/v4";
import { affordance, call, id, language, obj, requestId } from "../define.ts";
import { IN_GAME, type AffordanceContext, type Availability } from "../types.ts";

const GAME = [...IN_GAME, "ended", "replay"] as const;
const locksCheck = (ctx: AffordanceContext): Availability =>
  ctx.game?.locks ? { ok: true } : { ok: false, reason: "This game has no locks.", hidden: true };
const spendCheck = (ctx: AffordanceContext): Availability => {
  const l = locksCheck(ctx);
  if (!l.ok) return l;
  return ctx.game?.energy !== undefined && ctx.game.energy <= 0 ? { ok: false, reason: "You have no energy left; it accrues over time." } : { ok: true };
};
const amount = z.number().positive().max(1e9).describe("Energy, from your own store.");
const lockNo = z.number().int().min(1).describe("The lock's number on the object (#1, #2, …).");

const predicate = {
  ready: z.string().max(40).optional().describe("A ready-made predicate's id."), args: z.record(z.string(), z.string().max(200)).optional(),
  language: language.optional(), source: z.string().max(1024).optional(), words: z.string().max(120).optional(),
};

const lockRow = z.object({
  n: z.number().int(), words: z.string(), language, source: z.string(),
  programBits: z.number(), readBits: z.number(), bits: z.number().describe("Complexity: description bits + read bits."),
  rate: z.number().describe("Upkeep, energy a world second."), energy: z.number().describe("Energy as of settledAt."), settledAt: z.number(),
  endsAt: z.number().describe("World second the energy runs out at this rate."), createdAt: z.number(),
  added: z.number().describe("Everything put in (opening amount and funds)."), taken: z.number(),
  mine: z.object({ added: z.number(), taken: z.number() }).describe("What you put in and took out."),
  history: z.array(z.object({ at: z.number(), op: z.enum(["create", "fund", "drain"]), amount: z.number(), mine: z.boolean(), by: id.optional() })),
});

export const lockOps = [
  affordance({
    id: "lock.list", title: "Show an object's locks", group: "objects", scope: "game",
    description: "An object's live locks: each one's predicate program and its author's description, complexity in bits, upkeep a second, energy and when it runs out, and its history of additions and withdrawals as amounts and world times (who did each is not shown while the game is live; your own are marked mine), so you can tell whether more went in than you put in.",
    tooltip: "The locks on this object and who is paying into them.", keywords: ["locks", "defence", "predicate", "funding"],
    params: obj({ objectId: id }), result: z.object({ locks: z.array(lockRow) }),
    contexts: GAME, caller: "member", effect: "read", confirm: "none", runs: "server", available: locksCheck,
  }),
  affordance({
    id: "lock.create", title: "Lock an object", group: "objects", scope: "game",
    description: "Makes a lock on an object with a predicate program the object meets now: a ready-made one (ready: floor, floors, keeps-pace, sign, prime-intercept, gradient-equals, with its args) or your own (language, source defining predicate(offer) returning true or false, words: one line saying what it checks). Costs a fee proportional to its complexity (description length plus what it reads) plus the opening amount; drains by upkeep at a rate proportional to its complexity. While it holds energy, no move may make the predicate false.",
    tooltip: "Defend what this object is now, with energy.", keywords: ["lock", "defend", "protect", "predicate", "floor"],
    params: obj({
      objectId: id, amount, ...predicate, requestId: requestId.optional(),
    }),
    result: z.object({ lock: z.number().int(), energy: z.number(), spend: z.number(), bits: z.number(), fee: z.number(), rate: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true, available: spendCheck,
  }),
  affordance({
    id: "lock.check", title: "Check a lock before making it", group: "objects", scope: "game",
    description: "Runs a predicate program (a ready-made one or your own, as lock.create takes it) on an object as it is, without making a lock or spending: whether the object meets it, its complexity in bits, the fee to make it and its upkeep a second; or why it cannot be a lock (the program fails, the object holds the most locks).",
    tooltip: "Would this lock hold, and what would it cost?", keywords: ["lock check", "dry run", "lock price"],
    params: obj({ objectId: id, ...predicate }),
    result: z.object({ meets: z.boolean(), words: z.string(), bits: z.number().optional(), fee: z.number().optional(), rate: z.number().optional(), why: z.string().optional() }),
    contexts: IN_GAME, caller: "seated", effect: "read", confirm: "none", runs: "server", action: true, available: locksCheck,
  }),
  affordance({
    id: "lock.fund", title: "Add energy to a lock", group: "objects", scope: "game",
    description: "Puts energy from your store into a lock on an object (never refunded): it lives longer at its upkeep, and anyone who wants to break it must drain more first. Others see the amount and time, not who.",
    tooltip: "Pay into a lock.", keywords: ["fund", "add energy", "defend", "lock"],
    params: obj({ objectId: id, lock: lockNo, amount, requestId: requestId.optional() }), result: z.object({ lock: z.number().int(), energy: z.number(), spend: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true, available: spendCheck,
  }),
  affordance({
    id: "lock.drain", title: "Take energy out of a lock", group: "objects", scope: "game",
    description: "Takes energy out of a lock (at most what it holds), paying the same amount from your store; at zero the lock ends and moves it forbade pass. Others see the amount and time, not who.",
    tooltip: "Pay to weaken or end a lock.", keywords: ["drain", "break lock", "remove lock", "attack"],
    params: obj({ objectId: id, lock: lockNo, amount, requestId: requestId.optional() }), result: z.object({ lock: z.number().int(), energy: z.number(), spend: z.number() }),
    contexts: IN_GAME, caller: "seated", effect: "write", spends: "energy", confirm: "summary", runs: "server", action: true, available: spendCheck,
  }),
  affordance({
    id: "lock.test", title: "Check a change against the locks", group: "objects", scope: "game",
    description: "Which of an object's locks a list of mutator calls would break (each call is checked on the state it reaches), with each lock's description and energy: what an agent's move would be refused for. Changes nothing, costs nothing.",
    tooltip: "Would a lock refuse this change?", keywords: ["lock check", "would this break", "allowed"],
    params: obj({ objectId: id, calls: z.array(call).min(1).max(8) }),
    result: z.object({ allowed: z.boolean(), reason: z.string().optional(), breaks: z.array(z.object({ lock: z.number().int(), words: z.string(), energy: z.number() })) }),
    contexts: IN_GAME, caller: "seated", effect: "read", confirm: "none", runs: "server", action: true, available: locksCheck,
  }),
] as const;
