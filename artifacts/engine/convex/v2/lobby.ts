/** Rooms, seats and the start: creating and joining a room, seats and settings, the deal (integration plan §4.3). */
import { OpFailure } from "@workspace/v2-affordances";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_MEMBERS, normaliseCode, userById } from "./access";
import { bidDealer, dealablePool, dealKeyOf, dealRng, freshDeal, offers, rotatedDeal, ruleView, type DealtRule, type PastDeal } from "./deal.ts";
import { dealWithBids, type Bid, type BidPricing, type BidWin } from "@workspace/v2-economy";
import { isPreset, presetOf } from "./presets.ts";
import { summonPracticePartners } from "./agents.ts";
import { makeFunctionReference } from "convex/server";

const PLANNING_ENDS = makeFunctionReference<"mutation", { gameId: Id<"v2Games"> }>("v2/loop:planningEnds");
const AI_TURN = makeFunctionReference<"action", { gameId: Id<"v2Games">; memberId: Id<"v2Members">; n: number }>("v2/aiTurn:turn");
const CLOSE_BIDDING = makeFunctionReference<"mutation", { roomId: Id<"v2Rooms">; deadline: number }>("v2/bids:closeAtDeadline");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A short join code nobody else holds (6 characters of an unambiguous alphabet: 2^30). */
async function freshCode(ctx: MutationCtx): Promise<string> {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if (!await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", code)).first()) return code;
  }
}

async function nameOf(ctx: MutationCtx, userId: string) {
  return (await userById(ctx, userId))?.name ?? "Player";
}

export async function createRoom(ctx: MutationCtx, userId: string, o: { name?: string; preset: string }) {
  const name = await nameOf(ctx, userId), now = Date.now(), code = await freshCode(ctx);
  const roomId = await ctx.db.insert("v2Rooms", {
    code, name: o.name ?? `${name}'s room`, ownerId: userId, revision: 0, createdAt: now, preset: o.preset, overrides: {}, games: 0,
  });
  await ctx.db.insert("v2Members", { roomId, kind: "human", name, spectator: false, joinedAt: now, userId });
  return { roomId, code };
}

export async function joinRoom(ctx: MutationCtx, userId: string, rawCode: string): Promise<Id<"v2Rooms">> {
  const code = normaliseCode(rawCode);
  const room = await ctx.db.query("v2Rooms").withIndex("by_code", q => q.eq("code", code)).first();
  if (!room) throw new OpFailure(`No room has the code ${code}.`);
  const existing = await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", room._id).eq("userId", userId)).first();
  if (existing) return room._id;
  const members = await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
  if (members.length >= MAX_MEMBERS) throw new OpFailure(`This room is full (${MAX_MEMBERS} members).`);
  // Joining a game in progress makes a spectator; the next game seats them.
  await ctx.db.insert("v2Members", { roomId: room._id, kind: "human", name: await nameOf(ctx, userId), spectator: !!room.gameId, joinedAt: Date.now(), userId, ...(room.gameId ? { seatNext: true } : {}) });
  // A room whose owner left with no human to hand it to belongs to the next human who joins.
  const ownerless = !members.some(m => m.userId === room.ownerId);
  await ctx.db.patch(room._id, { revision: room.revision + 1, ...(ownerless ? { ownerId: userId } : {}) });
  return room._id;
}

// ---------------------------------------------------------------- seats and settings (W3-3)

export async function membersOf(ctx: QueryCtx, roomId: Id<"v2Rooms">) {
  return await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", roomId)).take(MAX_MEMBERS);
}

/**
 * Leaves the room. An owner who leaves hands the room to the human who joined next; with none left, to the next human
 * who joins (joinRoom).
 */
export async function leaveRoom(ctx: MutationCtx, room: Doc<"v2Rooms">, member: Doc<"v2Members">) {
  await ctx.db.delete(member._id);
  const patch: Partial<Doc<"v2Rooms">> = { revision: room.revision + 1 };
  if (member.userId === room.ownerId) {
    const heir = (await membersOf(ctx, room._id)).find(m => m.kind === "human" && m.userId);
    if (heir) patch.ownerId = heir.userId!;
  }
  await ctx.db.patch(room._id, patch);
  await closeIfAllDone(ctx, room._id);
}

export async function setSpectator(ctx: MutationCtx, room: Doc<"v2Rooms">, member: Doc<"v2Members">, spectator: boolean) {
  await ctx.db.patch(member._id, { spectator });
  await ctx.db.patch(room._id, { revision: room.revision + 1 });
  await closeIfAllDone(ctx, room._id);
}

/**
 * Sets the preset and the overrides. Overrides, when given, replace the old ones (`{}` restores the preset's values);
 * a new preset starts without the old preset's overrides unless the call gives some.
 */
export async function changeSettings(ctx: MutationCtx, room: Doc<"v2Rooms">, a: { preset?: string; overrides?: Doc<"v2Rooms">["overrides"] }) {
  if (a.preset !== undefined && !isPreset(a.preset)) throw new OpFailure(`No preset ${a.preset}.`, "Pick one of the deployed presets.");
  if (room.bidding) throw new OpFailure("The bid phase is open: the settings change once it closes.");
  const presetChanged = a.preset !== undefined && a.preset !== room.preset;
  await ctx.db.patch(room._id, {
    ...(a.preset !== undefined ? { preset: a.preset } : {}),
    overrides: a.overrides ?? (presetChanged ? {} : room.overrides),
    revision: room.revision + 1,
  });
}

/** Seats practice partners until the preset's minimum is met (each summons its rule's starter once the game starts). */
export async function fillPracticePartners(ctx: MutationCtx, room: Doc<"v2Rooms">): Promise<number> {
  const members = await membersOf(ctx, room._id);
  const need = presetOf(room.preset).minPlayers - members.filter(m => !m.spectator).length;
  const room16 = MAX_MEMBERS - members.length;
  // Numbered after the highest number in use, so a removal and a refill never repeat a name.
  let next = Math.max(0, ...members.map(m => Number(/^Practice partner (\d+)$/.exec(m.name)?.[1] ?? 0))) + 1;
  let added = 0;
  for (; added < Math.min(need, room16); added++)
    await ctx.db.insert("v2Members", { roomId: room._id, kind: "practice", name: `Practice partner ${next++}`, spectator: false, joinedAt: Date.now() + added });
  if (added) await ctx.db.patch(room._id, { revision: room.revision + 1 });
  return added;
}

/** Seats a model-backed AI player (named "AI player N"; `template` names its style, unused until templates move to v2). */
export async function addAiSeat(ctx: MutationCtx, room: Doc<"v2Rooms">, template?: string): Promise<Id<"v2Members">> {
  const members = await membersOf(ctx, room._id);
  if (members.length >= MAX_MEMBERS) throw new OpFailure(`This room is full (${MAX_MEMBERS} members).`);
  const next = Math.max(0, ...members.map(m => Number(/^AI player (\d+)$/.exec(m.name)?.[1] ?? 0))) + 1;
  const memberId = await ctx.db.insert("v2Members", { roomId: room._id, kind: "ai", name: `AI player ${next}`, spectator: false, joinedAt: Date.now(), ...(template ? { aiTemplate: template } : {}) });
  await ctx.db.patch(room._id, { revision: room.revision + 1 });
  return memberId;
}

export async function removeSeat(ctx: MutationCtx, room: Doc<"v2Rooms">, memberId: string) {
  const id = ctx.db.normalizeId("v2Members", memberId);
  const m = id ? await ctx.db.get(id) : null;
  if (!m || m.roomId !== room._id || m.kind === "human") throw new OpFailure("That seat is not an AI player or practice partner in this room.");
  await ctx.db.delete(m._id);
  await ctx.db.patch(room._id, { revision: room.revision + 1 });
}

// ---------------------------------------------------------------- the start and the deal (W3-3)

/**
 * The room's last games (newest first) as rotation history: roster order and each seat's rule key, from the headers
 * alone. As many games as a room has seats at most, which is the longest a rotation can run.
 */
async function dealHistory(ctx: QueryCtx, roomId: Id<"v2Rooms">): Promise<PastDeal[]> {
  const games = await ctx.db.query("v2Games").withIndex("by_room", q => q.eq("roomId", roomId)).order("desc").take(MAX_MEMBERS);
  return games.map(g => {
    const keys = new Map(g.artefacts.map(a => [a.memberId, a.ruleKey]));
    return { members: g.roster.map(s => s.memberId), rules: g.roster.map(s => keys.get(s.memberId) ?? ""), dealKey: g.dealKey, bid: !g.rotates };
  });
}

/** The rotated deal the next game would get, or null when it would be dealt fresh. */
export async function rotationFor(ctx: QueryCtx, room: Doc<"v2Rooms">, seats: readonly Doc<"v2Members">[]) {
  const preset = presetOf(room.preset), pool = dealablePool(preset), dealKey = dealKeyOf(preset, pool);
  const rotated = rotatedDeal(seats.map(s => s._id), dealKey, await dealHistory(ctx, room._id));
  const byKey = new Map(pool.map(r => [r.ruleKey, r]));
  const rules = rotated?.rules.map(k => byKey.get(k));
  return { pool, dealKey, rotated: rules && rules.every(r => r) ? { rules: rules as DealtRule[], round: rotated!.round, of: rotated!.of } : null };
}

/** The deal the next game gets: rotated when the room is mid-rotation, else fresh from `seed`. */
export async function nextDeal(ctx: QueryCtx, room: Doc<"v2Rooms">, seats: readonly Doc<"v2Members">[], seed: string): Promise<{ rules: DealtRule[]; dealKey: string; rotation: { round: number; of: number } | null }> {
  const { pool, dealKey, rotated } = await rotationFor(ctx, room, seats);
  if (pool.length === 0) throw new OpFailure("This preset has no rule with a converged valuation yet, so nothing can be dealt.");
  if (rotated) return { rules: rotated.rules, dealKey, rotation: { round: rotated.round, of: rotated.of } };
  return { rules: freshDeal(pool, seats.length, seed), dealKey, rotation: null };
}

// ---------------------------------------------------------------- the bid phase (integration plan §5.9)

/**
 * The owner's start on a preset with a bid phase: it opens the phase (the families on offer, the deadline) instead of
 * dealing. The deal happens when every human player is done or at the deadline (`closeBidding`).
 */
export async function openBidding(ctx: MutationCtx, room: Doc<"v2Rooms">) {
  const preset = presetOf(room.preset), bid = preset.bid!;
  if (room.bidding) throw new OpFailure("The bid phase is already open.");
  const seats = (await membersOf(ctx, room._id)).filter(m => !m.spectator);
  if (seats.length < preset.minPlayers) throw new OpFailure(`Needs ${preset.minPlayers} players; ${seats.length} seated.`, "seats.fillPracticePartners");
  const pool = dealablePool(preset);
  if (pool.length === 0) throw new OpFailure("This preset has no rule with a converged valuation yet, so nothing can be dealt.");
  for (const row of await ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", room._id)).take(MAX_MEMBERS)) await ctx.db.delete(row._id);
  const deadline = Date.now() + bid.seconds * 1000;
  await ctx.db.patch(room._id, { bidding: { deadline, pricing: bid.pricing, families: offers(pool) }, revision: room.revision + 1 });
  await ctx.scheduler.runAt(deadline, CLOSE_BIDDING, { roomId: room._id, deadline });
}

/** The humans who bid: seated (not spectating) and human (practice partners and AI players do not bid). */
export const bidders = (members: readonly Doc<"v2Members">[]) => members.filter(m => m.kind === "human" && !m.spectator);

/**
 * Closes the phase and deals with its bids (only the bids of members still seated count). Idempotent: a phase already
 * closed or reopened is left alone. A room that can no longer be dealt (too few seats) closes the phase without a game.
 */
export async function closeBidding(ctx: MutationCtx, room: Doc<"v2Rooms">, deadline?: number) {
  if (!room.bidding || room.gameId || (deadline !== undefined && room.bidding.deadline !== deadline)) return null;
  const pricing = room.bidding.pricing;
  const rows = await ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", room._id)).take(MAX_MEMBERS);
  for (const row of rows) await ctx.db.delete(row._id);
  await ctx.db.patch(room._id, { bidding: undefined });
  const fresh = (await ctx.db.get(room._id))!, seats = (await membersOf(ctx, room._id)).filter(m => !m.spectator);
  if (seats.length < presetOf(room.preset).minPlayers) return null;
  const seated = new Set(bidders(seats).map(m => m._id as string));
  const bids: Bid[] = rows.filter(r => seated.has(r.memberId)).flatMap(r => r.bids.map(b => ({ playerId: r.memberId, familyId: b.family, percent: b.percent })));
  return await startGame(ctx, fresh, { bids, pricing });
}

/** Closes the phase early once every human still bidding is done (after a bid.done, a leave or a switch to watching). */
export async function closeIfAllDone(ctx: MutationCtx, roomId: Id<"v2Rooms">) {
  const room = await ctx.db.get(roomId);
  if (!room?.bidding) return;
  const humans = bidders(await membersOf(ctx, roomId));
  const rows = await ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", roomId)).take(MAX_MEMBERS);
  if (humans.every(h => rows.some(r => r.memberId === h._id && r.done))) await closeBidding(ctx, room);
}

/**
 * Starts a game in the room: deals every seated member a rule (rotated, fresh, or with the bid phase's wins), opens
 * their accounts at the preset's starting energy, writes the header and the record's first event, and enters
 * planning. The world (births, acts) is the loop's (W3-4). A preset with a bid phase opens it instead (`openBidding`).
 */
export async function startGame(ctx: MutationCtx, room: Doc<"v2Rooms">, auction?: { bids: Bid[]; pricing: BidPricing }): Promise<Id<"v2Games">> {
  const preset = presetOf(room.preset);
  const seats = (await membersOf(ctx, room._id)).filter(m => !m.spectator);
  if (seats.length < preset.minPlayers) throw new OpFailure(`Needs ${preset.minPlayers} players; ${seats.length} seated.`, "seats.fillPracticePartners");
  const seed = crypto.randomUUID(), now = Date.now();
  let { rules, dealKey, rotation } = await nextDeal(ctx, room, seats, seed);
  let wins: BidWin[] = [];
  if (auction && auction.bids.length) {
    // A won bid voids the rotation (the auction is the fairness instrument); with no counted bid this is the plain deal.
    const pool = dealablePool(preset);
    const dealt = dealWithBids(seats.map(s => s._id), [...new Set(pool.map(r => r.family))], auction.bids, dealRng(seed), bidDealer(pool), auction.pricing);
    wins = dealt.wins;
    if (wins.length) { rules = dealt.deal; rotation = null; }
  }
  const won = new Map(wins.map(w => [w.playerId, w]));
  const settings = {
    planningSeconds: room.overrides.planningSeconds ?? preset.planningSeconds,
    worldSeconds: room.overrides.worldSeconds ?? preset.worldSeconds,
    startingEnergy: room.overrides.startingEnergy ?? preset.startingEnergy,
    startingObjects: preset.startingObjects, minPlayers: preset.minPlayers, economy: preset.economy,
  };
  const number = room.games + 1;
  const gameId = await ctx.db.insert("v2Games", {
    roomId: room._id, number, code: `${room.code}-${number}`, phase: "planning", preset: preset.id, variant: preset.variant, seed,
    settings, roster: seats.map(m => ({ memberId: m._id, name: m.name, kind: m.kind })), createdAt: now, startedAt: now,
    planningEndsAt: now + settings.planningSeconds * 1000, dealKey, rotates: wins.length === 0,
    ...(rotation ? { rotation } : {}),
    artefacts: seats.map((m, i) => ({ memberId: m._id, ruleKey: rules[i]!.ruleKey, contentHash: rules[i]!.contentHash })),
  });
  for (const [i, m] of seats.entries()) {
    const rule = rules[i]!, view = ruleView(rule);
    await ctx.db.insert("v2Rules", {
      gameId, memberId: m._id, family: rule.family, params: rule.params, layers: view.layers, tieBreaker: rule.tieBreaker,
      ruleKey: rule.ruleKey, contentHash: rule.contentHash, title: view.title, card: view.card, depends: view.depends,
      primary: view.primary, ladder: view.ladder,
      ...(won.has(m._id) ? { bid: won.get(m._id)!.percent, handicap: won.get(m._id)!.handicap } : {}),
    });
    await ctx.db.insert("v2Players", {
      gameId, memberId: m._id, ...(m.userId ? { userId: m.userId } : {}), kind: m.kind,
      energy: settings.startingEnergy, power: preset.economy.powerPerSecond, ready: m.kind !== "human", pauseUsed: false, agents: 0,
      settledAt: 0, allocated: 0,
    });
  }
  if (auction) {
    await ctx.db.insert("v2Auctions", {
      gameId, pricing: auction.pricing, disclosure: preset.bid?.disclosure ?? "none",
      bids: auction.bids.map(b => ({ memberId: b.playerId as Id<"v2Members">, family: b.familyId, percent: b.percent })),
      wins: wins.map(w => ({ memberId: w.playerId as Id<"v2Members">, family: w.familyId, percent: w.percent, handicap: w.handicap })),
    });
  }
  await ctx.db.insert("v2Clocks", { gameId, tick: 0, worldSeconds: 0, lastTickAt: now, objects: 0, agents: 0, commits: 0, events: 1 });
  await ctx.db.insert("v2Engine", { gameId, leaseId: "", tick: 0, objects: 0, acts: 0, moves: 0, events: 1, scoreboards: 0, scoreboardAt: 0, failures: 0, totals: {} });
  await ctx.db.insert("v2Events", {
    gameId, seq: 0, kind: "gameStarted",
    data: {
      objectType: "line", variant: preset.variant, preset: preset.id, seed, settings, rotation,
      ...(auction ? { auction: { pricing: auction.pricing, bids: auction.bids, wins } } : {}),
      players: seats.map((m, i) => ({ memberId: m._id, kind: m.kind, family: rules[i]!.family, params: rules[i]!.params, tieBreaker: rules[i]!.tieBreaker, ruleKey: rules[i]!.ruleKey, contentHash: rules[i]!.contentHash })),
    },
  });
  await ctx.db.patch(room._id, { gameId, lastGameId: gameId, games: number, revision: room.revision + 1 });
  const game = (await ctx.db.get(gameId))!;
  await summonPracticePartners(ctx, game);
  // AI players take their first turn in planning, then every AI_TURN_MS (aiTurn.ts).
  for (const m of seats) if (m.kind === "ai") await ctx.scheduler.runAfter(1000, AI_TURN, { gameId, memberId: m._id, n: 0 });
  await ctx.scheduler.runAt(game.planningEndsAt!, PLANNING_ENDS, { gameId });
  return gameId;
}
