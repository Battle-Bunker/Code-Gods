/** Rooms, seats and the start: creating and joining a room, seats and settings, the deal (integration plan §4.3). */
import { defaultLockRates } from "./lockWire";
import { v } from "convex/values";
import { restartAutopilots } from "./assistantCore";
import { OpFailure } from "@workspace/v2-affordances";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { MAX_MEMBERS, MAX_PLAYERS, normaliseCode, userById } from "./access";
import { bidDealer, playable, dealDefence, defencePool, isGridVariant, dealablePool, dealKeyOf, dealRng, freshDeal, isPracticeGame, offers, practiceDeal, type SeatKind, rotatedDeal, ruleView, hasSeatingRule, seatingClashes, type DealtRule, type PastDeal } from "./deal.ts";
import { dealWithBids, type Bid, type BidPricing, type BidWin } from "@workspace/v2-economy";
import { isPreset, presetOf, TURNOVER_DEFAULTS, type Preset, type PresetBid, type Turnover } from "./presets.ts";
import { DEFAULT_PENALTY_WEIGHT, typeOf } from "./world.ts";
import { bidders } from "./bids.ts";
import { summonPracticePartners } from "./agents.ts";
import { makeFunctionReference } from "convex/server";
import { newNoiseKey } from "./disclose.ts";
import { DEFAULT_SCORE_INTERVAL_SECONDS, drawEnd, timeScaleOf } from "./duration.ts";
import { ensureWarm } from "./readiness.ts";
import { dealHistory, membersOf, roomPool, rotationFor } from "./roomDeal.ts";
export { membersOf, roomPool, rotationFor };
import { bornAtStart, DEFAULT_PAUSE_SECONDS, endGame } from "./loop.ts";

const PLANNING_ENDS = makeFunctionReference<"mutation", { gameId: Id<"v2Games"> }>("v2/loop:planningEnds");
const AI_TURN = makeFunctionReference<"action", { gameId: Id<"v2Games">; memberId: Id<"v2Members">; n: number }>("v2/aiTurn:turn");
const CLOSE_BIDDING = makeFunctionReference<"mutation", { roomId: Id<"v2Rooms">; deadline: number }>("v2/lobby:closeAtDeadline");

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
 * Refuses a fresh deal that the room's exclusions would leave with a family on two seats when the setup itself has one
 * for every seat (two seats on one family climb the same hill unopposed: owner decision 30).
 */
function enoughFamilies(room: Doc<"v2Rooms">, seats: number) {
  if (!room.overrides.excludedFamilies?.length) return;
  const families = (pool: readonly DealtRule[]) => new Set(pool.map(r => r.family)).size;
  const left = families(roomPool(room)), all = families(dealablePool(presetOf(room.preset)));
  if (left < seats && all >= seats) throw new OpFailure(`${seats} players, but this room deals only ${left} rule families: two players would hold the same family.`, "Allow more rules in the room's settings (Rules never dealt).");
}

/** A deployed preset (v2/setups:presets lists them) that can deal: room.create, room.settings and setups.save. */
export function checkPreset(preset: string | undefined) {
  if (preset !== undefined && !isPreset(preset)) throw new OpFailure(`No preset ${preset}.`, "Pick one of the deployed presets (v2/setups:presets).");
  if (preset !== undefined && !playable(presetOf(preset))) throw new OpFailure(`${presetOf(preset).title} is not playable yet: its rules have no value functions on this deployment.`, "Pick one of the deployed presets (v2/setups:presets).");
}

/**
 * Sets the preset and the overrides. Overrides, when given, replace the old ones (`{}` restores the preset's values);
 * a new preset starts without the old preset's overrides unless the call gives some. `setup`: they come from that
 * saved setup (room.settings `setupId`), whose name the room then shows; without it the change is by hand and the
 * room shows no setup. A playtest room's time scale (decision 37: an admin's, never a room setting) is kept across
 * every change.
 */
export async function changeSettings(ctx: MutationCtx, room: Doc<"v2Rooms">, a: { preset?: string; overrides?: Doc<"v2Rooms">["overrides"]; setup?: Doc<"v2Rooms">["setup"] }) {
  if (a.preset !== undefined && !isPreset(a.preset)) throw new OpFailure(`No preset ${a.preset}.`, "Pick one of the deployed presets.");
  if (room.bidding) throw new OpFailure("The bid phase is open: the settings change once it closes.");
  // Defence goals value badness through value tables, and every dealt rule is now scored by energy (owner decision 50):
  // until a defence goal is restated in energy, the setting is refused (code kept; docs/engine-v2/v1-audit.md §1.5).
  if (a.overrides?.defenceGoals)
    throw new OpFailure("Defence goals are off for now: they were measured in bits, and every rule is now scored by energy.", "Leave defence goals off.");
  if (a.overrides?.defenceGoals) {
    const variant = presetOf(a.preset ?? room.preset).variant, ex = a.overrides.excludedDefenceFamilies ?? [];
    const known = new Set(defencePool(variant).map(g => g[0]!.family)), unknown = ex.filter(f => !known.has(f));
    if (unknown.length) throw new OpFailure(`No defence goal ${unknown.join(", ")}.`, `The defence goals here: ${[...known].join(", ")}.`);
    if (defencePool(variant, ex).length === 0) throw new OpFailure("Every defence goal is excluded.", "Leave at least one in, or turn defence goals off.");
  }
  const presetChanged = a.preset !== undefined && a.preset !== room.preset;
  // The families never dealt must be the preset's and leave something to deal.
  const out = a.overrides?.excludedFamilies;
  if (out?.length) {
    const preset = presetOf(a.preset ?? room.preset), families = new Set(preset.families);
    const unknown = out.filter(f => !families.has(f));
    if (unknown.length) throw new OpFailure(`${preset.title} deals no rule ${unknown.join(", ")}.`, "Exclude only families the setup deals.");
    // Every seat a family of its own (the deal never deals one twice while it can): two seats on the same family climb
    // the same hill with no adversary (CLAUDE.md, owner decision 30). So at least the setup's minimum players' worth stay.
    const left = new Set(roomPool({ preset: preset.id, overrides: { excludedFamilies: out } }).map(r => r.family)).size;
    if (left < preset.minPlayers) throw new OpFailure(`That leaves ${left} rule famil${left === 1 ? "y" : "ies"} to deal; a game needs at least ${preset.minPlayers}, one for each player.`, "Exclude fewer families.");
  }
  await ctx.db.patch(room._id, {
    ...(a.preset !== undefined ? { preset: a.preset } : {}),
    overrides: { ...(a.overrides ?? (presetChanged ? {} : room.overrides)), ...(room.overrides.timeScale !== undefined ? { timeScale: room.overrides.timeScale } : {}) },
    setup: a.setup,
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



/** The deal the next game gets: rotated when the room is mid-rotation, else fresh from `seed`. */
export async function nextDeal(ctx: QueryCtx, room: Doc<"v2Rooms">, seats: readonly Doc<"v2Members">[], seed: string): Promise<{ rules: DealtRule[]; dealKey: string; rotation: { round: number; of: number } | null }> {
  const { pool, dealKey, rotated } = await rotationFor(ctx, room, seats);
  if (pool.length === 0) throw new OpFailure("This preset has no rule with a converged valuation yet, so nothing can be dealt.");
  if (rotated) return { rules: rotated.rules, dealKey, rotation: { round: rotated.round, of: rotated.of } };
  enoughFamilies(room, seats.length);
  const kinds = seats.map(s => s.kind);
  if (isPracticeGame(kinds)) return { rules: practiceDeal(pool, kinds, seed, presetOf(room.preset).variant), dealKey, rotation: null };
  return { rules: freshDeal(pool, seats.length, seed, presetOf(room.preset).variant), dealKey, rotation: null };
}

// ---------------------------------------------------------------- the bid phase (integration plan §5.9)

/**
 * The room's bid phase (v1's bidSeconds, bidPricing, bidDisclosure): the preset's, with the room's settings over it, or
 * null when it has none. As in v1 any setup may bid (bidSeconds above 0) and a bidding setup may not (0).
 */
export function bidOf(room: Pick<Doc<"v2Rooms">, "preset" | "overrides">): PresetBid | null {
  const preset = presetOf(room.preset), o = room.overrides;
  const seconds = o.bidSeconds ?? preset.bid?.seconds ?? 0;
  if (!(seconds > 0)) return null;
  return { seconds, pricing: o.bidPricing ?? preset.bid?.pricing ?? "first", disclosure: o.bidDisclosure ?? preset.bid?.disclosure ?? "none" };
}

/**
 * The owner's start in a room with a bid phase: it opens the phase (the families on offer, the deadline) instead of
 * dealing. The deal happens when every human player is done or at the deadline (`closeBidding`).
 */
export async function openBidding(ctx: MutationCtx, room: Doc<"v2Rooms">) {
  const preset = presetOf(room.preset), bid = bidOf(room)!;
  if (room.bidding) throw new OpFailure("The bid phase is already open.");
  const seats = (await membersOf(ctx, room._id)).filter(m => !m.spectator);
  if (seats.length < preset.minPlayers) throw new OpFailure(`Needs ${preset.minPlayers} players; ${seats.length} seated.`, "seats.fillPracticePartners");
  const pool = roomPool(room);
  if (pool.length === 0) throw new OpFailure("This preset has no rule with a converged valuation yet, so nothing can be dealt.");
  enoughFamilies(room, seats.length);
  for (const row of await ctx.db.query("v2RoomBids").withIndex("by_room_member", q => q.eq("roomId", room._id)).take(MAX_MEMBERS)) await ctx.db.delete(row._id);
  const deadline = Date.now() + bid.seconds * 1000 / timeScaleOf(room.overrides);
  // v1's bid price and visibility, as the room sets them (else the preset's pricing, sealed).
  const pricing = bid.pricing, visibility = room.overrides.bidVisibility ?? "sealed";
  await ctx.db.patch(room._id, { bidding: { deadline, pricing, families: offers(pool), ...(visibility === "open" ? { visibility } : {}) }, revision: room.revision + 1 });
  await ctx.scheduler.runAt(deadline, CLOSE_BIDDING, { roomId: room._id, deadline });
}

/**
 * Sets a room's time dilation for its next games (owner decision 37): simulations and local playtests only, so an
 * internal function (`npx convex run v2/lobby:setTimeScale '{"roomId": "…", "factor": 10}'`), not a room setting.
 */
export const setTimeScale = internalMutation({
  args: { roomId: v.id("v2Rooms"), factor: v.number() },
  handler: async (ctx, { roomId, factor }) => {
    if (!Number.isFinite(factor) || factor <= 0) throw new Error("The time-dilation factor must be a positive number");
    const room = (await ctx.db.get(roomId))!;
    await ctx.db.patch(roomId, { overrides: { ...room.overrides, timeScale: factor === 1 ? undefined : factor }, revision: room.revision + 1 });
  },
});

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

/** The room's last game's deal, to deal again (`game.rematch`): each member's rule and the seed. */
export interface Rematch { seed: string; dealKey: string; rules: Map<string, DealtRule> }
export async function rematchDeal(ctx: QueryCtx, room: Doc<"v2Rooms">): Promise<Rematch> {
  const last = room.lastGameId ? await ctx.db.get(room.lastGameId) : null;
  if (!last) throw new OpFailure("There is no last game to deal again yet.", "game.start");
  if (last.phase !== "ended") throw new OpFailure("The last game is still on; a rematch deals it again once it has ended.");
  const pool = dealablePool(presetOf(room.preset)), byKey = new Map(pool.map(r => [r.ruleKey, r]));
  if (last.preset !== room.preset) throw new OpFailure("The room's setup changed since the last game; a rematch deals the same setup.", "game.start");
  const rules = new Map<string, DealtRule>();
  for (const r of await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", last._id)).take(MAX_MEMBERS)) {
    const rule = byKey.get(r.ruleKey);
    if (!rule) throw new OpFailure("The last game's rules are no longer dealt by this setup.", "game.start");
    if (room.overrides.excludedFamilies?.includes(rule.family)) throw new OpFailure("The room no longer deals one of the last game's rules (Rules never dealt).", "game.start");
    rules.set(r.memberId, rule);
  }
  return { seed: last.seed, dealKey: last.dealKey, rules };
}

/**
 * A practice game is one person's (one human seat): starting another ends the unfinished one they left (playtest round
 * 24: each re-deal left a world running its full length with its AI turns, about 28 at once, and the backend timed out).
 * A game with another human in it is never ended for them; nor is a game in this room (the start refuses a running one).
 * The ending is scheduled, not done here: a failure to end an old game (round 24 follow-up: a seeded game without an
 * engine made endGame throw, and the new game never started) can never block the new start.
 */
async function endAbandonedPractice(ctx: MutationCtx, human: Doc<"v2Members">, roomId: Id<"v2Rooms">) {
  if (!human.userId) return;
  const userId = human.userId;
  for (const m of await ctx.db.query("v2Members").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(50)) {
    if (m.roomId === roomId) continue;
    const room = await ctx.db.get(m.roomId);
    const game = room?.gameId ? await ctx.db.get(room.gameId) : null;
    // Ended in its own mutation, after this start commits: whatever the old game's state, ending it never blocks this start.
    if (game && game.phase !== "ended" && isPracticeGame(game.roster.map(s => s.kind)) && game.roster.some(s => s.memberId === m._id))
      await ctx.scheduler.runAfter(0, END_ABANDONED, { gameId: game._id });
  }
}
const END_ABANDONED = makeFunctionReference<"mutation", { gameId: Id<"v2Games"> }>("v2/lobby:endAbandoned");
/** Ends a practice game its human left for a new one (`endAbandonedPractice`), unless it has ended meanwhile. */
export const endAbandoned = internalMutation({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (game && game.phase !== "ended") await endGame(ctx, game, "abandoned");
  },
});

/**
 * Starts a game in the room: deals every seated member a rule (rotated, fresh, or with the bid phase's wins), opens
 * their accounts at the preset's starting energy, writes the header and the record's first event, and enters
 * planning. The world (births, acts) is the loop's (W3-4). A preset with a bid phase opens it instead (`openBidding`).
 */
export async function startGame(ctx: MutationCtx, room: Doc<"v2Rooms">, auction?: { bids: Bid[]; pricing: BidPricing }, again?: Rematch): Promise<Id<"v2Games">> {
  const preset = presetOf(room.preset);
  const seats = (await membersOf(ctx, room._id)).filter(m => !m.spectator);
  if (seats.length < preset.minPlayers) throw new OpFailure(`Needs ${preset.minPlayers} players; ${seats.length} seated.`, "seats.fillPracticePartners");
  // v1's cap (archive owner.ts): at most eight players; more room members can watch.
  if (seats.length > MAX_PLAYERS) throw new OpFailure(`At most ${MAX_PLAYERS} players can play; ${seats.length} are seated.`, "room.setSpectator");
  if (isPracticeGame(seats.map(m => m.kind))) await endAbandonedPractice(ctx, seats.find(m => m.kind === "human")!, room._id);
  const seed = again?.seed ?? crypto.randomUUID(), now = Date.now();
  let { rules, dealKey, rotation } = again ? { rules: seats.map(m => again.rules.get(m._id)!), dealKey: again.dealKey, rotation: null } : await nextDeal(ctx, room, seats, seed);
  if (rules.some(r => !r) || (again && again.rules.size !== seats.length)) throw new OpFailure("A rematch needs the same seated players as the last game.", "game.start");
  let wins: BidWin[] = [];
  if (auction && auction.bids.length) {
    // A won bid voids the rotation (the auction is the fairness instrument); with no counted bid this is the plain deal.
    const pool = roomPool(room);
    const dealt = dealWithBids(seats.map(s => s._id), [...new Set(pool.map(r => r.family))], auction.bids, dealRng(seed), bidDealer(pool, preset.variant), auction.pricing);
    wins = dealt.wins;
    if (wins.length) { rules = dealt.deal; rotation = null; }
  }
  const won = new Map(wins.map(w => [w.playerId, w]));
  const timeScale = timeScaleOf(room.overrides), o = room.overrides;
  // Time dilation (decision 37) is a clock rate: the game's settings stay the preset's, its world runs faster.
  const settings = {
    planningSeconds: room.overrides.planningSeconds ?? preset.planningSeconds,
    worldSeconds: room.overrides.worldSeconds ?? preset.worldSeconds,
    startingEnergy: room.overrides.startingEnergy ?? preset.startingEnergy,
    startingObjects: o.startingObjects ?? preset.startingObjects, minPlayers: preset.minPlayers,
    // v1's world speed, births, power and fill time (room settings over the preset's economy).
    economy: {
      powerPerSecond: o.powerPerSecond ?? preset.economy.powerPerSecond, fullChargeSeconds: o.fullChargeSeconds ?? preset.economy.fullChargeSeconds,
      opportunitiesPerSecond: o.opportunitiesPerSecond ?? preset.economy.opportunitiesPerSecond, birthsPerSecond: o.birthSeconds ? 1 / o.birthSeconds : o.birthsPerSecond ?? preset.economy.birthsPerSecond,
    },
    // v1's per-act compute limits, when the room sets them (else the sandbox's 500,000 steps and 2,000 ms).
    ...(o.stepBudget !== undefined ? { stepBudget: o.stepBudget } : {}),
    ...(o.interactionComputeMs !== undefined ? { interactionComputeMs: o.interactionComputeMs } : {}),
    // The variance of each reading of the others' sums while live (disclose.ts, owner decision 32).
    peerNoiseVariance: room.overrides.peerNoiseVariance ?? preset.peerNoiseVariance,
    // How the game ends and how often standings are published (duration.ts; v1's settings).
    durationMode: room.overrides.durationMode ?? preset.durationMode,
    scoreIntervalSeconds: room.overrides.scoreIntervalSeconds ?? DEFAULT_SCORE_INTERVAL_SECONDS,
    // Paying to read (knowledge.ts, decision 35): the weight on a look's read price; 0 reads the live world free.
    readPriceWeight: room.overrides.readPriceWeight ?? preset.readPriceWeight,
    // Parameter drift (drift.ts; the coordinator's trial, call 18): every seat's parameters redrawn every this many seconds.
    driftSeconds: room.overrides.driftSeconds ?? preset.driftSeconds,
    // How long a player's pause lasts (v1's pauseSeconds, default 180 wall seconds; it then ends by itself).
    pauseSeconds: room.overrides.pauseSeconds ?? DEFAULT_PAUSE_SECONDS,
    // The commit clause (v1's option, off by default).
    ...(room.overrides.commitClause ? { commitClause: true } : {}),
    // Locks (docs/engine-v2/locks.md; off by default until played).
    // Prices (§3): create at power ÷ 64 a bit (the summon price's scale), upkeep re-paying that once per full charge.
    ...(room.overrides.locks ? { locks: true, lockRates: defaultLockRates({ powerPerSecond: o.powerPerSecond ?? preset.economy.powerPerSecond, fullChargeSeconds: o.fullChargeSeconds ?? preset.economy.fullChargeSeconds }, o) } : {}),
    // The bid phase's pricing and disclosure (v1's bidDisclosure): the standings hide others' handicaps at "none".
    ...(auction ? { bid: { pricing: auction.pricing, disclosure: bidOf(room)?.disclosure ?? "none" } } : {}),
    // Defence goals (v1, restored; owner-decisions call 1): grids only, off unless the room turns them on.
    ...(o.defenceGoals && isGridVariant(preset.variant) ? {
      defenceGoals: true, penaltyWeight: o.penaltyWeight ?? DEFAULT_PENALTY_WEIGHT,
      ...(o.excludedDefenceFamilies?.length ? { excludedDefenceFamilies: o.excludedDefenceFamilies } : {}),
    } : {}),
    // Births on a regular schedule on the beginner games (decision 31), else v1's stochastic births. A room's
    // `birthSeconds` sets a regular birth every that many seconds.
    ...(preset.regularBirths || room.overrides.birthSeconds ? { regularBirths: true } : {}),
    // Line turnover (retirement-design.md): the room's cap, else the preset's; absent on both, every line stays live.
    ...turnoverOf(preset, room.overrides),
    timeScale,
  };
  const number = room.games + 1;
  // Defence goals (v1, restored; call 1), one per seat, when the room turns them on (grids only).
  const defence = settings.defenceGoals ? dealDefence(preset.variant, seats.length, `${seed}:${number}`, settings.excludedDefenceFamilies ?? []) : null;
  const gameId = await ctx.db.insert("v2Games", {
    roomId: room._id, number, code: `${room.code}-${number}`, phase: "planning", preset: preset.id, variant: preset.variant, seed,
    settings, noiseKey: newNoiseKey(), roster: seats.map(m => ({ memberId: m._id, name: m.name, kind: m.kind })), createdAt: now, startedAt: now,
    planningEndsAt: now + settings.planningSeconds * 1000 / timeScale, dealKey, rotates: wins.length === 0 && !again,
    // Drawn once, at the start (v1); in halfLife mode it is never disclosed while live.
    endAtWorld: drawEnd(settings.durationMode, settings.worldSeconds),
    // The seating rule's pairs this deal left (grids; deal.ts): forbidden ones (none unless the pool is too small) and aligned ones.
    ...(hasSeatingRule(preset.variant) ? { seating: { clashes: seatingClashes(preset.variant, rules), aligned: [] } } : {}),
    ...(rotation ? { rotation } : {}),
    artefacts: seats.map((m, i) => ({
      memberId: m._id, ruleKey: rules[i]!.ruleKey, contentHash: rules[i]!.contentHash,
      ...(defence ? { defence: { ruleKey: defence[i]!.ruleKey, contentHash: "" } } : {}),
    })),
  });
  for (const [i, m] of seats.entries()) {
    const rule = rules[i]!, view = ruleView(rule);
    await ctx.db.insert("v2Rules", {
      gameId, memberId: m._id, family: rule.family, params: rule.params, layers: view.layers, tieBreaker: rule.tieBreaker,
      ruleKey: rule.ruleKey, contentHash: rule.contentHash, title: view.title, card: view.card, depends: view.depends,
      primary: view.primary,
      ...(defence ? { defence: defence[i]! } : {}),
      ...(won.has(m._id) ? { bid: won.get(m._id)!.percent, handicap: won.get(m._id)!.handicap } : {}),
    });
    await ctx.db.insert("v2Players", {
      gameId, memberId: m._id, ...(m.userId ? { userId: m.userId } : {}), kind: m.kind,
      energy: settings.startingEnergy, power: settings.economy.powerPerSecond, ready: m.kind !== "human", pauseUsed: false, agents: 0,
      settledAt: 0, allocated: 0,
    });
  }
  if (auction) {
    await ctx.db.insert("v2Auctions", {
      gameId, pricing: auction.pricing, disclosure: bidOf(room)?.disclosure ?? "none",
      bids: auction.bids.map(b => ({ memberId: b.playerId as Id<"v2Members">, family: b.familyId, percent: b.percent })),
      wins: wins.map(w => ({ memberId: w.playerId as Id<"v2Members">, family: w.familyId, percent: w.percent, handicap: w.handicap })),
    });
  }
  await ctx.db.insert("v2Clocks", { gameId, tick: 0, worldSeconds: 0, lastTickAt: now, objects: 0, agents: 0, commits: 0, events: 1 });
  await ctx.db.insert("v2Engine", { gameId, leaseId: "", tick: 0, objects: 0, acts: 0, moves: 0, events: 1, scoreboards: 0, scoreboardAt: 0, failures: 0, totals: {} });
  await ctx.db.insert("v2Events", {
    gameId, seq: 0, kind: "gameStarted",
    data: {
      objectType: typeOf(preset.variant).id, variant: preset.variant, preset: preset.id, seed, settings, rotation,
      ...(auction ? { auction: { pricing: auction.pricing, bids: auction.bids, wins } } : {}),
      players: seats.map((m, i) => ({ memberId: m._id, kind: m.kind, family: rules[i]!.family, params: rules[i]!.params, tieBreaker: rules[i]!.tieBreaker, ruleKey: rules[i]!.ruleKey, contentHash: rules[i]!.contentHash })),
    },
  });
  await ctx.db.patch(room._id, { gameId, lastGameId: gameId, games: number, revision: room.revision + 1 });
  const game = (await ctx.db.get(gameId))!;
  // The board exists from the start (v1): planning shows the starting objects and every player's points.
  await bornAtStart(ctx, game);
  // Agent sandboxes boot in the background during planning (readiness.ts): nobody waits for them.
  await ensureWarm(ctx);
  await summonPracticePartners(ctx, game);
  await restartAutopilots(ctx, room._id);
  // AI players take their first turn in planning, then every AI_TURN_MS (aiTurn.ts).
  for (const m of seats) if (m.kind === "ai") await ctx.scheduler.runAfter(1000, AI_TURN, { gameId, memberId: m._id, n: 0 });
  await ctx.scheduler.runAt(game.planningEndsAt!, PLANNING_ENDS, { gameId });
  return gameId;
}

/** The bid phase's deadline: the deal happens with whatever bids there are. */
export const closeAtDeadline = internalMutation({
  args: { roomId: v.id("v2Rooms"), deadline: v.number() },
  handler: async (ctx, { roomId, deadline }) => {
    const room = await ctx.db.get(roomId);
    if (room) await closeBidding(ctx, room, deadline);
  },
});

/** A game's turnover from its preset and the room's overrides (retirement-design.md): `{}` when neither sets a cap. */
export function turnoverOf(preset: Preset, o: Doc<"v2Rooms">["overrides"]): { turnover?: Turnover } {
  const liveCap = o.liveCap ?? preset.turnover?.liveCap;
  if (!liveCap) return {};
  return { turnover: {
    liveCap,
    retiredPoints: o.retiredPoints ?? preset.turnover?.retiredPoints ?? TURNOVER_DEFAULTS.retiredPoints,
    retiredHolds: o.retiredHolds ?? preset.turnover?.retiredHolds ?? TURNOVER_DEFAULTS.retiredHolds,
  } };
}

