/**
 * The bid phase of a game start (docs/bid-phase.md; the owner's rule, 2026-11-11). On a setup with `bidSeconds` > 0 the
 * start (owner.ts startGame) does not deal at once: it opens bidding on the room (`rooms.bidding`) for that many
 * seconds. Each player dealt into the game may bid a handicap, a whole percentage taken off their own score, on rule
 * families of the game's pool, one bid per family, changeable until the phase ends; or pass. The phase ends at its
 * deadline, or at once when every human player is done. Then owner.ts completeBidding makes the deal with the bids
 * (game-utilities dealWithBids) and the start continues exactly as without bidding (the room's `preparing`, then the
 * game). With no bids the deal is the dealer's own.
 *
 * Bids are sealed (unless the setup says `bidVisibility: "open"`, where the phase's players see each other's bids
 * live): a player's row (roomBids) is read by that player's own query and by the deal, by nothing else. The
 * commands are idempotent by construction (each sets a state: this bid on this family, no bid on it, done), so a
 * repeated command changes nothing and needs no receipt. AI seats do not bid.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireViewer, type Viewer } from "./auth/access";
import { touchActivity } from "./activity";
import { fail } from "./lib/errors";
import { getCatalog, membersOf, principalV, requireMemberAs, requireOwnerAs, requireRoom, viewerOf } from "./lib/rooms";

/** The smallest and largest bid in whole percent (game-utilities bidding.ts; a bid of 0 is "no bid"). */
export const BID_MIN_PERCENT = 1, BID_MAX_PERCENT = 100;
/** A bid command arriving this long after the deadline is still taken (the deal waits as long: clocks and networks differ). */
export const BID_GRACE_MS = 1000;
/** The deal's watchdog period (owner.ts completeBidding runs again until the bid phase is over or failed). */
export const BIDDING_WATCHDOG_MS = 30_000;

export type RoomBidding = NonNullable<Doc<"rooms">["bidding"]>;
export type BidRow = { familyId: string; percent: number };
/** A player's outcome of a bid phase in which somebody won (on their card, private): what they won and pay, and their bids. */
export type BidOutcome = { won: boolean; familyId?: string; percent?: number; handicap: number; pricing: "first" | "second"; bids: BidRow[] };
/** The whole auction, for the ended game's replay. */
export type AuctionRecord = {
  pricing: "first" | "second";
  bids: { godId: string; familyId: string; percent: number }[];
  wins: { godId: string; familyId: string; percent: number; handicap: number }[];
  dropped: { godId: string; familyId: string; percent: number }[];
};

/** The room's bid phase while it is open (not failed). */
export const openBidding = (room: Doc<"rooms">): RoomBidding | null => (room.bidding && !room.bidding.error ? room.bidding : null);

/** The room's bid phase as everyone in the room sees it: its clock and how many play, never a bid. */
export function biddingView(b: RoomBidding) {
  return { startedAt: b.startedAt, endsAt: b.endsAt, seconds: Math.round((b.endsAt - b.startedAt) / 1000), pricing: b.pricing, players: b.memberIds.length,
    ...(b.open ? { visibility: "open" as const } : {}),
    ...(b.error ? { error: b.error } : {}) };
}
export function biddingLine(b: ReturnType<typeof biddingView>): string {
  if (b.error) return `Bidding failed: ${b.error}`;
  return `The players are bidding for rules (${b.seconds} s, or until every player is done). The game is dealt and starts by itself when bidding ends.`;
}

/** The families a player may bid on: the reward families the room's next game deals (its catalog). */
async function poolOf(ctx: QueryCtx, roomId: Id<"rooms">): Promise<{ id: string; name: string; emoji: string; theme: string }[]> {
  const catalog = (await getCatalog(ctx, `room:${roomId}`)) as { id: string; name: string; emoji: string; theme: string; role: string; available: boolean; excluded?: boolean }[] | null;
  return (catalog ?? []).filter(f => f.role === "reward" && f.available && !f.excluded).map(({ id, name, emoji, theme }) => ({ id, name, emoji, theme }));
}

const rowOf = (ctx: QueryCtx, roomId: Id<"rooms">, godId: string) =>
  ctx.db.query("roomBids").withIndex("by_room_god", q => q.eq("roomId", roomId).eq("godId", godId)).first();

/** The human players of the bid phase who are still seated, with whether each is done. Bounded: at most eight rows. */
async function humansOf(ctx: QueryCtx, room: Doc<"rooms">, b: RoomBidding) {
  const members = await membersOf(ctx, room._id);
  const seated = members.filter(m => m.kind === "human" && !m.spectator && b.memberIds.includes(m.godId));
  const rows = await Promise.all(seated.map(m => rowOf(ctx, room._id, m.godId)));
  return seated.map((m, i) => {
    const row = rows[i]?.requestId === b.requestId ? rows[i]! : null;
    return { godId: m.godId, name: m.name, done: !!row?.done, bids: row ? row.bids.map(({ familyId, percent }) => ({ familyId, percent })) : [] };
  });
}

/**
 * The caller's own view of the room's bid phase: its clock, the families to bid on, the caller's bids and whether they
 * are done, and how many human players are still bidding (a count: never who, never a bid). Null when no bid phase is
 * open. `seated`: the caller is one of its players (a spectator, or a member who joined after it began, only watches).
 */
export const mine = query({ args: { roomId: v.string() }, handler: async (ctx, args) => mineFor(ctx, await requireViewer(ctx), args) });
export const mineAs = internalQuery({
  args: { principal: principalV, roomId: v.string() },
  handler: async (ctx, { principal, ...args }) => mineFor(ctx, await viewerOf(ctx, principal), args),
});
async function mineFor(ctx: QueryCtx, viewer: Viewer, { roomId }: { roomId: string }) {
  const room = await requireRoom(ctx, roomId);
  const { member } = await requireMemberAs(ctx, viewer, room, "read");
  const b = openBidding(room);
  if (!b) return null;
  const seated = !member.spectator && b.memberIds.includes(member.godId);
  const row = seated ? await rowOf(ctx, room._id, member.godId) : null;
  const mineRow = row && row.requestId === b.requestId ? row : null;
  const humans = await humansOf(ctx, room, b);
  return {
    ...biddingView(b), seated,
    minPercent: BID_MIN_PERCENT, maxPercent: BID_MAX_PERCENT,
    families: await poolOf(ctx, room._id),
    bids: mineRow ? mineRow.bids.map(({ familyId, percent }) => ({ familyId, percent })) : [],
    done: !!mineRow?.done,
    waitingFor: humans.filter(h => !h.done).length,
    // Open bidding (settings.bidVisibility "open"): the players of the phase see every player's bids, live. Sealed: absent.
    ...(b.open && seated ? { table: humans } : {}),
    meaning: b.pricing === "second"
      ? "If you win a rule, a handicap is taken off your final score: the highest bid you beat on that rule (1% if nobody else bid on it)."
      : "If you win a rule, your bid is taken off your final score as a handicap.",
  };
}

type Change = { kind: "place"; familyId: string; percent: number } | { kind: "withdraw"; familyId: string } | { kind: "done"; done: boolean };

/** Apply one change to the caller's bids. Refused outside an open bid phase, for anyone not one of its players, and for a family outside the pool. */
async function change(ctx: MutationCtx, viewer: Viewer, roomId: string, c: Change) {
  const room = await requireRoom(ctx, roomId);
  const { member } = await requireMemberAs(ctx, viewer, room, "act");
  const b = openBidding(room);
  if (!b) return fail("CONFLICT", "No bidding is open in this room");
  const now = Date.now();
  // Closed: the deal is being made from the bids as they were (takeForDeal), so a later change would be ignored.
  if (b.closed || now > b.endsAt + BID_GRACE_MS) fail("CONFLICT", "Bidding has ended; the game is being dealt");
  if (member.spectator || !b.memberIds.includes(member.godId)) fail("FORBIDDEN", "Only the players of the game being started may bid");
  const old = await rowOf(ctx, room._id, member.godId);
  const current = old && old.requestId === b.requestId ? old : null;
  let bids: BidRow[] = current ? current.bids.map(({ familyId, percent }) => ({ familyId, percent })) : [];
  let done = current?.done ?? false;
  if (c.kind === "done") done = c.done;
  else {
    if (c.kind === "place") {
      if (!Number.isInteger(c.percent) || c.percent < BID_MIN_PERCENT || c.percent > BID_MAX_PERCENT) {
        fail("BAD_REQUEST", `A bid is a whole percentage from ${BID_MIN_PERCENT} to ${BID_MAX_PERCENT} (to bid nothing on a rule, withdraw the bid)`);
      }
      const pool = await poolOf(ctx, room._id);
      if (!pool.some(f => f.id === c.familyId)) fail("BAD_REQUEST", `${c.familyId} is not one of this game's rules: bid on one of ${pool.map(f => f.id).join(", ")}`);
    }
    const before = JSON.stringify(bids);
    const at = bids.findIndex(x => x.familyId === c.familyId);
    if (c.kind === "withdraw") bids = bids.filter(x => x.familyId !== c.familyId);
    else if (at >= 0) bids[at] = { familyId: c.familyId, percent: c.percent };
    else bids.push({ familyId: c.familyId, percent: c.percent });
    // Changing a bid means the player is bidding again (re-sending the same bid changes nothing).
    if (JSON.stringify(bids) !== before) done = false;
  }
  const same = current && current.done === done && JSON.stringify(current.bids) === JSON.stringify(bids);
  if (!same) {
    const row = { roomId: room._id, requestId: b.requestId, godId: member.godId, bids, done, updatedAt: now };
    if (old) await ctx.db.replace(old._id, row);
    else await ctx.db.insert("roomBids", row);
  }
  let ended = false;
  if (done) {
    // Every human player is done: the phase ends at once (the deadline's own run then finds nothing to do).
    const humans = await humansOf(ctx, room, b);
    if (humans.every(h => h.done || h.godId === member.godId)) {
      ended = true;
      await ctx.scheduler.runAfter(0, internal.owner.completeBidding, { roomId: room._id, requestId: b.requestId });
    }
  }
  await touchActivity(ctx);
  return { bids, done, ended };
}

/** Bid `percent` (1 to 100, whole) of your score on a rule family of the game being started; replaces your earlier bid on it. */
export const place = mutation({
  args: { roomId: v.string(), familyId: v.string(), percent: v.number() },
  handler: async (ctx, { roomId, familyId, percent }) => change(ctx, await requireViewer(ctx), roomId, { kind: "place", familyId, percent }),
});
export const placeAs = internalMutation({
  args: { principal: principalV, roomId: v.string(), familyId: v.string(), percent: v.number() },
  handler: async (ctx, { principal, roomId, familyId, percent }) => change(ctx, await viewerOf(ctx, principal), roomId, { kind: "place", familyId, percent }),
});
/** Withdraw your bid on a rule family (nothing happens if you had none). */
export const withdraw = mutation({
  args: { roomId: v.string(), familyId: v.string() },
  handler: async (ctx, { roomId, familyId }) => change(ctx, await requireViewer(ctx), roomId, { kind: "withdraw", familyId }),
});
export const withdrawAs = internalMutation({
  args: { principal: principalV, roomId: v.string(), familyId: v.string() },
  handler: async (ctx, { principal, roomId, familyId }) => change(ctx, await viewerOf(ctx, principal), roomId, { kind: "withdraw", familyId }),
});
/**
 * Say you are done bidding (with no bids: you pass). When every human player is done the bid phase ends at once.
 * `done: false` takes it back while the phase is still open.
 */
export const done = mutation({
  args: { roomId: v.string(), done: v.optional(v.boolean()) },
  handler: async (ctx, { roomId, done }) => change(ctx, await requireViewer(ctx), roomId, { kind: "done", done: done ?? true }),
});
export const doneAs = internalMutation({
  args: { principal: principalV, roomId: v.string(), done: v.optional(v.boolean()) },
  handler: async (ctx, { principal, roomId, done }) => change(ctx, await viewerOf(ctx, principal), roomId, { kind: "done", done: done ?? true }),
});

// ------------------------------------------------------------------------------------------------
// the start's halves (owner.ts)
// ------------------------------------------------------------------------------------------------

/**
 * Drop the room's bid rows (a new bid phase begins, or one ended), those of players who have left the room included.
 * Bounded: a phase has at most eight players, each at most one row.
 */
async function forgetBids(ctx: MutationCtx, roomId: Id<"rooms">) {
  for (const row of await ctx.db.query("roomBids").withIndex("by_room_god", q => q.eq("roomId", roomId)).take(64)) await ctx.db.delete(row._id);
}

/**
 * Open the bid phase of a start (owner.ts startGame, which validated the start): record it on the room and schedule the
 * deal at its deadline. A bid phase already open is returned as it is (a concurrent or repeated start).
 */
export const begin = internalMutation({
  args: {
    roomId: v.id("rooms"), principal: v.optional(principalV), revision: v.number(), memberIds: v.array(v.string()), requestId: v.string(),
    seconds: v.number(), pricing: v.union(v.literal("first"), v.literal("second")), open: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<RoomBidding> => {
    const room = await requireRoom(ctx, args.roomId);
    const { viewer } = await requireOwnerAs(ctx, await viewerOf(ctx, args.principal), room);
    if (room.revision !== args.revision) fail("CONFLICT", "Settings changed while starting; try again");
    const active = room.activeGameId ? await ctx.db.get(room.activeGameId) : null;
    if (active && active.phase !== "ended") fail("CONFLICT", "There is already a live game");
    if (room.preparing && !room.preparing.error) fail("CONFLICT", "The game is preparing its rule tables");
    const open = openBidding(room);
    if (open) return open;
    const members = (await membersOf(ctx, room._id)).filter(m => !m.spectator);
    if (members.map(m => m.godId).sort().join("\n") !== [...args.memberIds].sort().join("\n")) fail("CONFLICT", "Players changed while starting; try again");
    await forgetBids(ctx, room._id);
    const now = Date.now();
    const bidding: RoomBidding = {
      requestId: args.requestId, ownerId: viewer.subject, startedAt: now, endsAt: now + args.seconds * 1000, revision: args.revision,
      memberIds: args.memberIds, pricing: args.pricing, ...(args.open ? { open: true } : {}),
    };
    await ctx.db.patch(room._id, { bidding, preparing: undefined, seq: room.seq + 1 });
    // A table with no human player has nobody to wait for.
    const wait = members.some(m => m.kind === "human") ? args.seconds * 1000 + BID_GRACE_MS : 0;
    await ctx.scheduler.runAfter(wait, internal.owner.completeBidding, { roomId: room._id, requestId: args.requestId });
    await touchActivity(ctx);
    return bidding;
  },
});

/**
 * Close the bidding and return what the deal needs: the room, the players still seated (in the phase's order) and their
 * bids (`deal`). `gone`: this bid phase is no longer the room's (dealt, cancelled, failed, replaced); `wait`: it is
 * neither past its deadline nor finished by every human player (ms until the deadline).
 */
export const takeForDeal = internalMutation({
  args: { roomId: v.id("rooms"), requestId: v.string() },
  handler: async (ctx, { roomId, requestId }) => {
    const room = await ctx.db.get(roomId);
    const b = room ? openBidding(room) : null;
    if (!room || !b || b.requestId !== requestId) return { state: "gone" as const };
    const humans = await humansOf(ctx, room, b);
    const now = Date.now();
    if (!b.closed && now < b.endsAt + BID_GRACE_MS && !humans.every(h => h.done)) return { state: "wait" as const, wait: b.endsAt + BID_GRACE_MS - now };
    // From here no bid is taken (change refuses): the deal is made from exactly these bids, also by a retried run.
    if (!b.closed) await ctx.db.patch(room._id, { bidding: { ...b, closed: true } });
    const current = new Map((await membersOf(ctx, room._id)).filter(m => !m.spectator).map(m => [m.godId, m]));
    const playerIds = b.memberIds.filter(id => current.has(id));
    const bids: { playerId: string; familyId: string; percent: number }[] = [];
    for (const id of playerIds) {
      if (current.get(id)!.kind !== "human") continue;
      const row = await rowOf(ctx, room._id, id);
      if (row && row.requestId === requestId) for (const x of row.bids) bids.push({ playerId: id, familyId: x.familyId, percent: x.percent });
    }
    return { state: "deal" as const, room, bidding: b, playerIds, bids };
  },
});

/** The deal of a bid phase could not be made: record why on the room (the owner starts again). */
export const failed = internalMutation({
  args: { roomId: v.id("rooms"), requestId: v.string(), message: v.string() },
  handler: async (ctx, { roomId, requestId, message }) => {
    const room = await ctx.db.get(roomId);
    const b = room ? openBidding(room) : null;
    if (!room || !b || b.requestId !== requestId) return;
    await ctx.db.patch(room._id, { bidding: { ...b, error: message.slice(0, 2000) }, seq: room.seq + 1 });
    await forgetBids(ctx, room._id);
  },
});

/** The owner ends a bid phase (rooms.endActiveGame with no game running): nothing is dealt. */
export async function cancelBidding(ctx: MutationCtx, room: Doc<"rooms">) {
  await forgetBids(ctx, room._id);
  await ctx.db.patch(room._id, { bidding: undefined, seq: room.seq + 1 });
}

/** The bid phase became a deal (game/lobby.ts beginPreparing): its rows are no longer needed. */
export const endBidding = forgetBids;
