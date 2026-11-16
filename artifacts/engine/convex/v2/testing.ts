/**
 * v2 test fixtures (integration plan §4.3, W3-1): seed a room and a running line game directly into the v2 tables, so
 * the app (W5) and the contract tests run against real queries before the lobby and the tick exist. Local deployments
 * only (TEST_FIXTURES=1, set by scripts/dev.mjs); every function here refuses elsewhere.
 *
 * The game is real where it is cheap: states are lines of `line-z` (v2-linear), each seat holds a real dealable rule of
 * the beginner pool, and every value is that rule's utility and its bits from the value function (world.ts), as the
 * commit computes them; points follow spec §8.
 */
import { rng } from "@workspace/v2-core";
import { fromMC, lineType, lineZ, type LineState } from "@workspace/v2-linear";
import { dealablePool, offers as offersOf, ruleView } from "./deal";
import { valueObjects, valueOf as valueAt } from "./world";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { mintPlayerJwt } from "../auth/jwt";
import { makeFunctionReference } from "convex/server";
import { fixturesOn } from "../auth/identity";
import { presetOf } from "./presets";
import { RUNTIME_VERSION } from "./readiness";
import { valueRecord as valueRecordOf } from "./values";
import { seatRules as seatRulesOf } from "./loop";
import { decode as decodeState, scopeOf as scopeOfGame, valuesOf as valuesOfState } from "./world";
import { fullReadBits as fullReadBitsOf } from "./knowledge";
import { newNoiseKey, objectReading, quadrantOf, readingNoise, shownAt } from "./disclose";

const fixtures = () => {
  if (!fixturesOn(process.env)) throw new ConvexError({ code: "FORBIDDEN", message: "v2 fixtures need TEST_FIXTURES=1" });
};


async function userName(ctx: MutationCtx, userId: string) {
  return (await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", userId)).unique())?.name ?? userId;
}

const roomArgs = {
  owner: v.string(),
  /** Other humans (user ids), seated in this order after the owner. */
  humans: v.optional(v.array(v.string())),
  practice: v.optional(v.number()),
  spectators: v.optional(v.array(v.string())),
  preset: v.optional(v.string()),
  code: v.optional(v.string()),
};

async function seedRoomIn(ctx: MutationCtx, a: { owner: string; humans?: string[]; practice?: number; spectators?: string[]; preset?: string; code?: string }) {
  const now = Date.now();
  const roomId = await ctx.db.insert("v2Rooms", {
    code: a.code ?? `F${Math.floor(Math.random() * 1e8).toString(36).toUpperCase()}`, name: "Fixture room", ownerId: a.owner, revision: 0,
    createdAt: now, preset: a.preset ?? "lines-beginner", overrides: {}, games: 0,
  });
  const members: Id<"v2Members">[] = [];
  let t = now;
  for (const userId of [a.owner, ...(a.humans ?? [])])
    members.push(await ctx.db.insert("v2Members", { roomId, kind: "human", userId, name: await userName(ctx, userId), spectator: false, joinedAt: t++ }));
  for (let i = 0; i < (a.practice ?? 0); i++)
    members.push(await ctx.db.insert("v2Members", { roomId, kind: "practice", name: `Practice partner ${i + 1}`, spectator: false, joinedAt: t++ }));
  for (const userId of a.spectators ?? [])
    await ctx.db.insert("v2Members", { roomId, kind: "human", userId, name: await userName(ctx, userId), spectator: true, joinedAt: t++ });
  return { roomId, members };
}

/** A room in the lobby: the owner, other humans, practice partners and spectators. */
export const seedRoom = internalMutation({
  args: roomArgs,
  handler: async (ctx, a) => {
    fixtures();
    return await seedRoomIn(ctx, a);
  },
});

/**
 * A room with a game in `phase` (default live): every seated member dealt a rule (the four line families in turn),
 * `objects` lines with every player's value, one TypeScript agent per player with a program, a scoreboard, its history,
 * a few moves per player, digests and the `gameStarted` event.
 */
export const seedGame = internalMutation({
  args: {
    ...roomArgs, objects: v.optional(v.number()), phase: v.optional(v.union(v.literal("planning"), v.literal("live"), v.literal("paused"), v.literal("ended"))), seed: v.optional(v.string()),
    /** A line the owner's agent and the next seat's pulled back and forth, each move undoing the last, by number. */
    contested: v.optional(v.number()),
    /** Moves in each member's act log (default 3). */
    moves: v.optional(v.number()),
    /** A disclosure-noise key (default none: exact, as games stored before the noise was restored). */
    noise: v.optional(v.boolean()),
    /** Varied object versions (default every object at version 1): object i at 1 + (5i mod 7), for the "most mutated" sort. */
    versions: v.optional(v.boolean()),
    /** Tugs-of-war in each member's v2Tugs (default none), on the first objects. */
    tugs: v.optional(v.number()),
    /** A line the owner's agent and the next seat's climbed together (every move raised both sides), by number. */
    climbed: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    fixtures();
    const { roomId, members } = await seedRoomIn(ctx, a);
    const phase = a.phase ?? "live", seed = a.seed ?? "fixture", r = rng(seed), now = Date.now();
    const preset = presetOf(a.preset ?? "lines-beginner");
    const roster: { memberId: Id<"v2Members">; name: string; kind: "human" | "practice" | "ai" }[] = [];
    for (const memberId of members) {
      const m = (await ctx.db.get(memberId))!;
      roster.push({ memberId, name: m.name, kind: m.kind });
    }
    const gameId = await ctx.db.insert("v2Games", {
      roomId, number: 1, code: `G${roomId.slice(-6).toUpperCase()}`, phase, preset: preset.id, variant: lineZ.id, seed,
      settings: { planningSeconds: preset.planningSeconds, worldSeconds: preset.worldSeconds, startingEnergy: preset.startingEnergy, startingObjects: preset.startingObjects, minPlayers: preset.minPlayers, economy: preset.economy, ...(a.noise ? { peerNoiseVariance: 64 } : {}) },
      roster, createdAt: now, startedAt: now, rotates: true, dealKey: "fixture", artefacts: [], ...(a.noise ? { noiseKey: newNoiseKey() } : {}),
      ...(phase === "planning" ? { planningEndsAt: now + preset.planningSeconds * 1000 } : { endsAt: now + preset.worldSeconds * 1000 }),
      ...(phase === "ended" ? { endedAt: now, summary: { winner: members[0]!, objects: a.objects ?? 12, acts: 0 } } : {}),
    });
    await ctx.db.patch(roomId, { games: 1, lastGameId: gameId, ...(phase === "ended" ? {} : { gameId }), revision: 1 });

    // Rules and accounts.
    // Real dealable rules (each with a value function), a different family per seat where the pool allows.
    const pool = dealablePool(preset), families = [...new Set(pool.map(r => r.family))];
    const rules = members.map((memberId, i) => ({ memberId, dealt: pool.find(r => r.family === families[i % families.length])! }));
    for (const { memberId, dealt } of rules) {
      const view = ruleView(dealt);
      await ctx.db.insert("v2Rules", {
        gameId, memberId, family: dealt.family, params: dealt.params, layers: view.layers, tieBreaker: dealt.tieBreaker, ruleKey: dealt.ruleKey,
        contentHash: dealt.contentHash, title: view.title, card: view.card, depends: view.depends, primary: view.primary,
      });
      const m = (await ctx.db.get(memberId))!;
      await ctx.db.insert("v2Players", {
        gameId, memberId, ...(m.userId ? { userId: m.userId } : {}), kind: m.kind,
        energy: preset.startingEnergy, power: preset.economy.powerPerSecond, ready: false, pauseUsed: false, agents: 1,
        settledAt: 0, allocated: 0.5,
      });
    }

    // Objects and values.
    const n = a.objects ?? 12, pts = new Map<string, number>(), objects: Id<"v2Objects">[] = [];
    const packed = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const state: LineState = { lines: [fromMC({ n: BigInt(r.below(11) - 5), d: 1n }, { n: BigInt(r.below(21) - 10), d: 1n })] };
      const objectId = await ctx.db.insert("v2Objects", { gameId, number: i + 1, bornAt: i });
      objects.push(objectId);
      const version = a.versions ? 1 + (5 * i) % 7 : 1;
      await ctx.db.insert("v2ObjectStates", { objectId, gameId, state: lineType.encode(state), version, changedAt: i });
      const evals = rules.map(({ dealt }) => valueAt(state, lineZ.id, dealt, valueObjects({ startingObjects: preset.startingObjects, worldSeconds: preset.worldSeconds, economy: preset.economy })));
      const total = evals.reduce((s, e) => s + e.rarityBits, 0);
      // The object's birth in the public log (v1's), every seat's bits in roster order.
      await ctx.db.insert("v2Log", { gameId, seq: i, worldSeconds: i, kind: "born", objectId, number: i + 1, version: 1, state: lineType.encode(state), bits: evals.map(e => e.rarityBits), noise: 0 });
      for (const [k, { memberId }] of rules.entries()) {
        const e = evals[k]!, want = total - e.rarityBits, points = e.rarityBits * want;
        pts.set(memberId, (pts.get(memberId) ?? 0) + points);
        packed.set(memberId, [...(packed.get(memberId) ?? []), i + 1, e.rarityBits, want]);
        const shownRaw = a.noise ? shownAt({ rarityBits: e.rarityBits, want }, readingNoise((await ctx.db.get(gameId))!, memberId, objectReading(objectId, version))) : null;
        const shown = shownRaw ? { ...shownRaw, quadrant: quadrantOf(e.rarityBits, shownRaw.shownWant) } : {};
        await ctx.db.insert("v2ObjectValues", { objectId, gameId, memberId, number: i + 1, ...e, want, points, ...shown, version, changedAt: i });
      }
    }

    // Agents, programs, moves.
    const source = "function agent(offer) {\n  // Try this: tilt towards your target.\n  return [call(\"si.tilt\", { k: 1 })];\n}\n";
    for (const [k, { memberId }] of rules.entries()) {
      const agentId = await ctx.db.insert("v2Agents", { gameId, memberId, name: "Simple", language: "typescript", sourceHash: "fixture", version: 0, share: 0.5, createdAt: now });
      await ctx.db.insert("v2AgentEnergy", { agentId, gameId, energy: 10, acts: 3, skips: 1, failures: 0, spend: 4.5, pointsGained: 2, settledAt: 0 });
      await ctx.db.insert("v2AgentPrograms", { agentId, version: 0, language: "typescript", source, sourceHash: "fixture", price: 12, summonedAt: now, acts: 3, pointsGained: 2 });
      for (let s = 0; s < (a.moves ?? Math.min(3, n)); s++) {
        const objectId = objects[(k + s) % n]!, value = (await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", memberId)).unique())!;
        const state = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objectId)).unique())!.state;
        const snap = { score: value.score, rarityBits: value.rarityBits, want: value.want, points: value.points };
        await ctx.db.insert("v2Moves", {
          gameId, memberId, seq: s, worldSeconds: s * 2, objectId, number: value.number, agentId, mine: true,
          calls: [{ mutator: "si.tilt", site: 0, args: { k: "1" } }], rep: "si", stateBefore: state, stateAfter: state, before: snap, after: snap, charge: 1.5,
        });
      }
    }

    for (const { memberId } of rules) for (let i = 0; i < Math.min(a.tugs ?? 0, n); i++) {
      const others = members.filter(m => m !== memberId).slice(0, 2);
      // The best state the pull passed through: the object's own (a real state, which the summary decodes).
      const state = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objects[i]!)).unique())!.state;
      await ctx.db.insert("v2Tugs", { gameId, memberId, objectId: objects[i]!, number: i + 1, moves: 12, flips: 2 + (i % 9), lastMine: true, mySpend: 40, others, from: i, to: i + 30, best: { state, points: 3 } });
    }

    // Moves on a line by the owner's agent and the next seat's, alternating, as the owner's act log has them: on
    // `contested` each move undoes the last (the mover's bits up, the other side's down, then back); on `climbed` every
    // move raises both the owner's bits and the others' total (a climb together).
    const alternate = async (number: number, together: boolean, seq0: number) => {
      const owner = rules[0]!.memberId, other = rules[1]!.memberId, objectId = objects[number - 1]!;
      const value = (await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", owner)).unique())!;
      const state = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objectId)).unique())!.state;
      const ownerAgent = (await ctx.db.query("v2Agents").withIndex("by_game_member_live", q => q.eq("gameId", gameId).eq("memberId", owner)).first())?._id;
      const at = (bits: number, want: number) => ({ score: value.score, rarityBits: bits, want, points: bits * want });
      let bits = value.rarityBits, want = value.want;
      for (let i = 0; i < 4; i++) {
        const mine = i % 2 === 0;
        const before = at(bits, want);
        if (together) { bits += 0.5; want += 0.5; } else if (mine) { bits += 1; want -= 1; } else { bits -= 1; want += 1; }
        await ctx.db.insert("v2Moves", {
          gameId, memberId: owner, seq: seq0 + i, worldSeconds: 12 + i, objectId, number, mine, by: mine ? owner : other,
          ...(mine && ownerAgent ? { agentId: ownerAgent } : {}),
          calls: [{ mutator: "si.shift", site: 0, args: { k: mine ? "1" : "-1" } }], rep: "si", stateBefore: state, stateAfter: state, before, after: at(bits, want), charge: 2,
        });
      }
    };
    if (a.contested !== undefined && members.length > 1) await alternate(a.contested, false, 100);
    if (a.climbed !== undefined && members.length > 1) await alternate(a.climbed, true, 200);

    // Scoreboard, history, digests, the record's first event, the clock.
    const ranked = [...rules].map(({ memberId }) => ({ memberId, total: pts.get(memberId) ?? 0 })).sort((x, y) => y.total - x.total);
    const rows = ranked.map((row, i) => ({ memberId: row.memberId, name: roster.find(m => m.memberId === row.memberId)!.name, total: row.total, handicap: 0, net: row.total, rank: i + 1 }));
    await ctx.db.insert("v2Standings", { gameId, seq: 2, worldSeconds: 20, rows });
    for (let s = 0; s < 3; s++)
      await ctx.db.insert("v2StandingsHistory", { gameId, seq: s, worldSeconds: s * 10, totals: rows.map(x => ({ memberId: x.memberId, net: x.net * (s + 1) / 3 })) });
    for (const { memberId } of rules) await ctx.db.insert("v2Digests", { gameId, memberId, packed: packed.get(memberId) ?? [], version: 1 });
    await ctx.db.insert("v2Events", { gameId, seq: 0, kind: "gameStarted", data: { fixture: true, variant: lineZ.id, seed } });
    await ctx.db.insert("v2Clocks", { gameId, tick: 0, worldSeconds: 20, lastTickAt: now, objects: n, agents: members.length, commits: 0, events: 1 });
    // Each member's dealt family, so a test can check a player is shown their own rule.
    return { roomId, gameId, members, objects, families: rules.map(r => r.dealt.family) };
  },
});

/**
 * A user and a live Better Auth session for impersonated browser calls (the JWT's `sessionId`, which access.ts checks).
 * Provider "fake" with admin@example.test makes an admin (auth/identity.ts isAdminUser under fixtures).
 */
export const seedUser = internalMutation({
  args: { subject: v.string(), name: v.string(), admin: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    fixtures();
    const now = Date.now();
    const doc = {
      subject: a.subject, name: a.name, email: a.admin ? "admin@example.test" : `${a.subject.replace(/\W/g, "").slice(-12)}@test.local`,
      emailVerified: true, provider: a.admin ? "fake" : "test", updatedAt: now,
    };
    const existing = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", a.subject)).unique();
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("users", doc);
    const session = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: { model: "session", data: { token: crypto.randomUUID(), userId: a.subject, expiresAt: now + 24 * 3600_000, createdAt: now, updatedAt: now } },
    }) as { _id: string };
    return session._id;
  },
});

/** A member's id in a room, by user id (tests address players by who they are). */
export const memberFor = internalQuery({
  args: { roomId: v.id("v2Rooms"), userId: v.string() },
  handler: async (ctx, { roomId, userId }) => {
    fixtures();
    return (await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", userId)).first())?._id ?? null;
  },
});

/** Opens or closes a room's bid phase (the bid screen's fixture until W3-8). */
export const setBidding = internalMutation({
  args: { roomId: v.id("v2Rooms"), open: v.boolean(), seconds: v.optional(v.number()) },
  handler: async (ctx, { roomId, open, seconds }) => {
    fixtures();
    const room = (await ctx.db.get(roomId))!;
    const offers = offersOf(dealablePool(presetOf(room.preset)));
    await ctx.db.patch(roomId, open ? { bidding: { deadline: Date.now() + (seconds ?? 45) * 1000, pricing: presetOf(room.preset).bid?.pricing ?? "first", families: offers } } : { bidding: undefined });
  },
});

/** A page of a game's record (spec §9.1), in order from `after` (exclusive). */
export const events = internalQuery({
  args: { gameId: v.id("v2Games"), after: v.number() },
  handler: async (ctx, { gameId, after }) => {
    fixtures();
    return await ctx.db.query("v2Events").withIndex("by_game_seq", q => q.eq("gameId", gameId).gt("seq", after)).take(200);
  },
});

/** One program version of an agent (re-execution reads the source an act ran). */
export const program = internalQuery({
  args: { agentId: v.id("v2Agents"), version: v.number() },
  handler: async (ctx, { agentId, version }) => {
    fixtures();
    return await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agentId).eq("version", version)).unique();
  },
});

/** A player's own value row of an object, as `v2/play:object` projects it (the disclosure test's reference). */
export const valueOf = internalQuery({
  args: { objectId: v.id("v2Objects"), userId: v.string() },
  handler: async (ctx, { objectId, userId }) => {
    fixtures();
    const object = (await ctx.db.get(objectId))!, game = (await ctx.db.get(object.gameId))!;
    const member = (await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", game.roomId).eq("userId", userId)).first())!;
    const v = (await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", member._id)).unique())!;
    return { score: v.score, rarityBits: v.rarityBits, want: v.want, points: v.points, version: v.version };
  },
});

/** Deals a seated human a given rule (drift's test: a family with a parameter grid), its card and layers as dealt. */
export const setRule = internalMutation({
  args: { gameId: v.id("v2Games"), userId: v.string(), ruleKey: v.string() },
  handler: async (ctx, { gameId, userId, ruleKey }) => {
    fixtures();
    const game = (await ctx.db.get(gameId))!;
    const member = (await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", game.roomId).eq("userId", userId)).first())!;
    const rec = valueRecordOf(ruleKey)!;
    const rule = { family: rec.family, params: rec.params, tieBreaker: rec.tieBreaker === "none" ? null : rec.tieBreaker, ruleKey, contentHash: rec.contentHash };
    const row = (await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", member._id)).unique())!;
    await ctx.db.patch(row._id, { ...rule, ...ruleView(rule) });
  },
});

/** A member's own bits on a state under their current rule (drift's knowledge check). */
export const ownBitsAt = internalQuery({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members"), state: v.string() },
  handler: async (ctx, { gameId, memberId, state }) => {
    fixtures();
    const game = (await ctx.db.get(gameId))!, seats = await seatRulesOf(ctx, game);
    return valuesOfState(decodeState(state, game.variant), game.variant, seats, scopeOfGame(game).objects).find(x => x.memberId === memberId)?.rarityBits ?? null;
  },
});

/** How many stored value rows disagree with the values the game's current rules give their objects (drift's check). */
export const staleValues = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const game = (await ctx.db.get(gameId))!, seats = await seatRulesOf(ctx, game);
    let rows = 0, stale = 0;
    for (const st of await ctx.db.query("v2ObjectStates").withIndex("by_game_state", q => q.eq("gameId", gameId)).collect()) {
      for (const val of valuesOfState(decodeState(st.state, game.variant), game.variant, seats, scopeOfGame(game).objects)) {
        const row = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", st.objectId).eq("memberId", val.memberId as Id<"v2Members">)).unique();
        if (!row) continue;
        rows++;
        if (Math.abs(row.rarityBits - val.rarityBits) > 1e-9 || Math.abs(row.want - val.want) > 1e-9) stale++;
      }
    }
    return { rows, stale };
  },
});

/** A game's exact running totals (the engine's, never shown while live) and the totals as disclosed. */
export const totalsOf = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const e = (await ctx.db.query("v2Engine").withIndex("by_game", q => q.eq("gameId", gameId)).unique())!;
    return { exact: e.totals, shown: e.shownTotals ?? null };
  },
});

/**
 * `count` live agents for a seated user, inserted without paying (the 200-agent cap's test: a summon each would take
 * minutes), each at a 0.1% share with a small TypeScript program, as a summon leaves them. No cap is checked here.
 */
export const seedAgents = internalMutation({
  args: { gameId: v.id("v2Games"), userId: v.string(), count: v.number() },
  handler: async (ctx, { gameId, userId, count }) => {
    fixtures();
    const game = (await ctx.db.get(gameId))!;
    const memberId = (await ctx.db.query("v2Members").withIndex("by_room_user", q => q.eq("roomId", game.roomId).eq("userId", userId)).first())!._id;
    const player = (await ctx.db.query("v2Players").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique())!;
    const source = "function agent(offer) {\n  return null;\n}\n", now = Date.now(), share = 0.001, ids = [];
    for (let i = 0; i < count; i++) {
      const agentId = await ctx.db.insert("v2Agents", { gameId, memberId, name: `Seeded ${player.agents + i + 1}`, language: "typescript", sourceHash: "fixture", version: 0, share, createdAt: now });
      await ctx.db.insert("v2AgentEnergy", { agentId, gameId, energy: 0, acts: 0, skips: 0, failures: 0, spend: 0, pointsGained: 0, settledAt: player.settledAt });
      await ctx.db.insert("v2AgentPrograms", { agentId, version: 0, language: "typescript", source, sourceHash: "fixture", price: 0, summonedAt: now, acts: 0, pointsGained: 0 });
      ids.push(agentId);
    }
    await ctx.db.patch(player._id, { agents: player.agents + count, allocated: Math.round((player.allocated + count * share) * 1000) / 1000 });
    return ids;
  },
});

/** Every agent of a game with its share and energy (the credit rule's test: no agent owes more than its capacity). */
export const agentsOf = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const game = (await ctx.db.get(gameId))!;
    const out = [];
    for (const a of await ctx.db.query("v2Agents").withIndex("by_game_live", q => q.eq("gameId", gameId)).take(320)) {
      const e = (await ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", a._id)).unique())!;
      out.push({ agentId: a._id, share: a.share, energy: e.energy, capacity: a.share * game.settings.economy.powerPerSecond * game.settings.economy.fullChargeSeconds });
    }
    return out;
  },
});

/** A game's header as stored (tests read fields no query returns, such as `rotates`). */
export const header = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => { fixtures(); return await ctx.db.get(gameId); },
});

/** An account-scope credential: the human everywhere, as an OAuth account grant is. */
export const seedAccountCredential = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    fixtures();
    const now = Date.now();
    return await ctx.db.insert("credentials", { tokenHash: crypto.randomUUID(), subject: userId, permission: "account", label: "v2 test", kind: "oauth", createdAt: now, expiresAt: now + 3600_000 });
  },
});

/** A real Convex JWT for an account grant: how a test calls an HTTP route that checks `Authorization: Bearer`. */
export const accountJwt = internalAction({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<string> => {
    fixtures();
    const credentialId: string = await ctx.runMutation(SEED_ACCOUNT, { userId });
    return (await mintPlayerJwt({ subject: userId, credentialId, permission: "account" })).token;
  },
});
const SEED_ACCOUNT = makeFunctionReference<"mutation", { userId: string }, string>("v2/testing:seedAccountCredential");

/** A game's clock (the cold check waits for tick commits). */
export const clock = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    return await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique();
  },
});

/** A finished assistant conversation of `turns` turns, each a message, an answer and 3 tool calls (the R8 gate's). */
export const seedAssistant = internalMutation({
  args: { roomId: v.id("v2Rooms"), userId: v.string(), turns: v.number() },
  handler: async (ctx, { roomId, userId, turns }) => {
    fixtures();
    const room = (await ctx.db.get(roomId))!, now = Date.now();
    const threadId = await ctx.db.insert("v2AssistantThreads", { roomId, userId, ...(room.gameId ? { gameId: room.gameId } : {}), title: "Gate", createdAt: now, updatedAt: now });
    let turnId: Id<"v2AssistantTurns"> | null = null, seq = 0;
    for (let i = 0; i < turns; i++) {
      turnId = await ctx.db.insert("v2AssistantTurns", { threadId, roomId, userId, ...(room.gameId ? { gameId: room.gameId } : {}), status: "done", grant: "act", mode: "onRequest", steps: 2, tokens: 900, usd: 0.01, createdAt: now + i, finishedAt: now + i });
      await ctx.db.insert("v2AssistantMessages", { threadId, turnId, seq: ++seq, role: "user", text: `Question ${i}`, createdAt: now });
      await ctx.db.insert("v2AssistantMessages", { threadId, turnId, seq: ++seq, role: "assistant", text: "Answer ".repeat(40), contentJson: JSON.stringify([{ type: "text", text: "Answer ".repeat(40) }]), createdAt: now });
      for (let k = 0; k < 3; k++) await ctx.db.insert("v2AssistantCalls", { turnId, threadId, index: k, tool: "rule_explain", argsJson: "{}", ok: true, summary: "done", createdAt: now });
    }
    return { threadId, turnId: turnId! };
  },
});

/** A pending device request for a v2 room (the device flow's request half), and how a test reads it back. */
export const seedDevice = internalMutation({
  args: { roomId: v.string(), userCodeHash: v.string(), permission: v.union(v.literal("read"), v.literal("act"), v.literal("owner")) },
  handler: async (ctx, a) => {
    fixtures();
    return await ctx.db.insert("devices", {
      deviceSecretHash: crypto.randomUUID(), userCodeHash: a.userCodeHash, challenge: "c".repeat(43), roomId: a.roomId, permission: a.permission,
      label: "v2 test device", status: "pending", expiresAt: Date.now() + 300_000,
    });
  },
});
export const device = internalQuery({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, { deviceId }) => { fixtures(); return await ctx.db.get(deviceId); },
});

/** A member's AI usage in a game (the AI seat test reads that its turns ran and were counted). */
export const aiUsage = internalQuery({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members") },
  handler: async (ctx, { gameId, memberId }) => {
    fixtures();
    return await ctx.db.query("v2AiUsage").withIndex("by_member_game", q => q.eq("memberId", memberId).eq("gameId", gameId)).unique();
  },
});

async function movesOfGame(ctx: QueryCtx, gameId: Id<"v2Games">) {
  const game = (await ctx.db.get(gameId))!;
  const out = [];
  for (const r of game.roster) out.push(...await ctx.db.query("v2Moves").withIndex("by_game_member_seq", q => q.eq("gameId", gameId).eq("memberId", r.memberId)).collect());
  return out;
}

/** A game's act log rows (seq order per member) and the tugs the tick folded from them. */
export const movesAndTugs = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const moves = (await movesOfGame(ctx, gameId)).map(m => ({ memberId: m.memberId, seq: m.seq, objectId: m.objectId, mine: m.mine, by: m.by, charge: m.charge ?? 0, worldSeconds: m.worldSeconds, stateAfter: m.stateAfter, points: m.after.shownPoints ?? m.after.points }));   // as disclosed (tugs show what the player was shown)
    const game = (await ctx.db.get(gameId))!, tugs = [];
    for (const r of game.roster) tugs.push(...await ctx.db.query("v2Tugs").withIndex("by_game_member_flips", q => q.eq("gameId", gameId).eq("memberId", r.memberId)).collect());
    return { moves, tugs };
  },
});

/** A game's disclosure-noise state: whether it has a key, and its value rows with and without disclosed fields. */
export const noiseState = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const game = (await ctx.db.get(gameId))!;
    const rows = await ctx.db.query("v2ObjectValues").withIndex("by_game_member_points", q => q.eq("gameId", gameId)).collect();
    let consistent = 0;
    for (const r of rows) {
      const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", r.objectId)).unique())!;
      const want = shownAt(r, readingNoise(game, r.memberId, objectReading(r.objectId, st.version)));
      if (r.shownWant !== undefined && Math.abs(r.shownWant - want.shownWant) < 1e-9 && Math.abs(r.shownPoints! - want.shownPoints) < 1e-9) consistent++;
    }
    return { key: !!game.noiseKey, rows: rows.length, shown: rows.filter(r => r.shownWant !== undefined).length, consistent, points: rows.map(r => r.points) };
  },
});

/** An ended game's noise key and σ (re-execution passes the noise the tick passed; private while live). */
export const noiseOf = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const g = (await ctx.db.get(gameId))!;
    if (g.phase !== "ended") throw new Error("the noise key is private while the game runs");
    return { noiseKey: g.noiseKey ?? null, settings: g.settings };
  },
});

/** Sets a game's drawn end before its world starts (a halfLife game's end is random; a test needs a known one). */
export const setEnd = internalMutation({
  args: { gameId: v.id("v2Games"), endAtWorld: v.number() },
  handler: async (ctx, { gameId, endAtWorld }) => { fixtures(); await ctx.db.patch(gameId, { endAtWorld }); },
});

/** Sets when a human last acted (idle parking: activity.ts), to make the engine idle without waiting 30 minutes. */
export const setActivity = internalMutation({
  args: { at: v.number() },
  handler: async (ctx, { at }) => {
    fixtures();
    const doc = await ctx.db.query("v2Activity").withIndex("by_key", q => q.eq("key", "global")).unique();
    if (doc) await ctx.db.patch(doc._id, { lastHumanActivityAt: at });
    else await ctx.db.insert("v2Activity", { key: "global", lastHumanActivityAt: at });
  },
});

/** Sets a language's readiness (readiness.ts) for the current runtime: "warming" stays so for two minutes. */
export const setReadiness = internalMutation({
  args: { language: v.union(v.literal("typescript"), v.literal("python")), state: v.union(v.literal("warming"), v.literal("ready"), v.literal("failed")) },
  handler: async (ctx, { language, state }) => {
    fixtures();
    const version = RUNTIME_VERSION[language];
    const row = await ctx.db.query("v2RuntimeReadiness").withIndex("by_language_version", q => q.eq("language", language).eq("version", version)).unique();
    if (row) await ctx.db.patch(row._id, { state, at: Date.now() });
    else await ctx.db.insert("v2RuntimeReadiness", { language, version, state, at: Date.now() });
  },
});

/** An object's live state and version (what a paid game's players are not shown). */
/** A game's settings as stored at its start (decision 37's check: already dilated). */
export const settingsOf = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    return (await ctx.db.get(gameId))!.settings;
  },
});

/** A member's knowledge of a game's objects (decision 36's check): each object's told version and when. */
export const knowledgeOf = internalQuery({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members") },
  handler: async (ctx, { gameId, memberId }) => {
    fixtures();
    const rows = await ctx.db.query("v2Knowledge").withIndex("by_game_member_born", q => q.eq("gameId", gameId).eq("memberId", memberId)).collect();
    return rows.map(r => ({ objectId: r.objectId, version: r.version, learnedAt: r.learnedAt, state: r.state, rarityBits: r.rarityBits, want: r.want, points: r.points }));
  },
});

/** An object's full read, in bits, at its live state (what a look reads: knowledge.ts fullReadBits). */
export const fullReadBits = internalQuery({
  args: { objectId: v.id("v2Objects") },
  handler: async (ctx, { objectId }) => {
    fixtures();
    const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objectId)).unique())!;
    return fullReadBitsOf((await ctx.db.get(st.gameId))!.variant, st.state);
  },
});

export const stateOf = internalQuery({
  args: { objectId: v.id("v2Objects") },
  handler: async (ctx, { objectId }) => {
    fixtures();
    const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objectId)).unique())!;
    return { state: st.state, version: st.version };
  },
});

/** The disclosure noise's offset over a game's value rows (shown − exact want), split by rows never moved and moved. */
export const noiseOffsets = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const rows = await ctx.db.query("v2ObjectValues").withIndex("by_game_member_points", q => q.eq("gameId", gameId)).collect();
    const pick = (rs: typeof rows) => rs.filter(r => r.shownWant !== undefined).map(r => ({ dw: r.shownWant! - r.want, dp: r.shownPoints! - r.points, p: r.points, sp: r.shownPoints! }));
    return { unmoved: pick(rows.filter(r => r.version === 1)), moved: pick(rows.filter(r => r.version > 1)) };
  },
});

/** shown − exact others' sum on the states agents moved to (each move's after-snapshot on its mover's row). */
export const moveNoiseOffsets = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const rows = (await movesOfGame(ctx, gameId)).filter(m => m.mine && m.after.shownWant !== undefined);
    return rows.map(m => m.after.shownWant! - m.after.want);
  },
});

/** Ends a seeded game as the loop would leave it (phase only). */
export const markEnded = internalMutation({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => { fixtures(); await ctx.db.patch(gameId, { phase: "ended", endedAt: Date.now() }); },
});

/** Rows of a game as they were stored before decision 23 (#488): a level on values and moves, a ladder on rules. */
export const legacyLevels = internalMutation({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    const ladder = [{ level: 0, label: "start", rarityBits: 0 }, { level: 1, label: "next", rarityBits: 1.5, layer: "main" }];
    for (const r of await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId)).collect()) await ctx.db.patch(r._id, { ladder });
    for (const r of await ctx.db.query("v2ObjectValues").withIndex("by_game_member_points", q => q.eq("gameId", gameId)).collect()) await ctx.db.patch(r._id, { level: 2 });
    for (const m of await movesOfGame(ctx, gameId)) await ctx.db.patch(m._id, { before: { ...m.before, level: 1 }, after: { ...m.after, level: 3 } });
  },
});

/** How many of a game's rows still carry a level or a ladder, by table, and how many rows each table has. */
export const legacyCounts = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    const rules = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", gameId)).collect();
    const values = await ctx.db.query("v2ObjectValues").withIndex("by_game_member_points", q => q.eq("gameId", gameId)).collect();
    const moves = await movesOfGame(ctx, gameId);
    return {
      rules: [rules.filter(r => r.ladder !== undefined).length, rules.length],
      values: [values.filter(r => r.level !== undefined).length, values.length],
      moves: [moves.filter(m => m.before.level !== undefined || m.after.level !== undefined).length, moves.length],
      points: values.map(r => r.points).concat(moves.map(m => m.after.points)),
    };
  },
});

/** A human's assistant preferences in a room (the autopilot chain, a Stop's hold). */
export const assistantPrefs = internalQuery({
  args: { roomId: v.id("v2Rooms"), userId: v.string() },
  handler: async (ctx, { roomId, userId }) => await ctx.db.query("v2AssistantPrefs").withIndex("by_room_user", q => q.eq("roomId", roomId).eq("userId", userId)).unique(),
});

/** Appends `count` events of about `bytes` of data each to a game's record (a long game's size, without playing it). */
export const bulkEvents = internalMutation({
  args: { gameId: v.id("v2Games"), count: v.number(), bytes: v.number() },
  handler: async (ctx, { gameId, count, bytes }) => {
    fixtures();
    const last = await ctx.db.query("v2Events").withIndex("by_game_seq", q => q.eq("gameId", gameId)).order("desc").first();
    const from = (last?.seq ?? -1) + 1, pad = "x".repeat(bytes);
    for (let i = 0; i < count; i++) await ctx.db.insert("v2Events", { gameId, seq: from + i, kind: "act", data: { n: from + i, pad } });
    return from + count;
  },
});

/** Starts the replay build of an ended game, as its end does (loop.ts endGame). */
export const buildReplay = internalMutation({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    await ctx.scheduler.runAfter(0, makeFunctionReference<"action", { gameId: Id<"v2Games"> }>("v2/replayBuild:build"), { gameId });
  },
});

/** Puts an object in a state (a test of a move onto a state another object holds). */
export const setObjectState = internalMutation({
  args: { gameId: v.id("v2Games"), number: v.number(), state: v.string() },
  handler: async (ctx, { gameId, number, state }) => {
    fixtures();
    const object = (await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", gameId).eq("number", number)).unique())!;
    const row = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", object._id)).unique())!;
    await ctx.db.patch(row._id, { state, version: row.version + 1 });
  },
});

/** Line turnover's check (retirement-design.md): every line's points by member, the retired ones, the live list, totals. */
export const turnoverOf = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const engine = (await ctx.db.query("v2Engine").withIndex("by_game", q => q.eq("gameId", gameId)).unique())!;
    const lines = [];
    for (const o of await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", gameId)).collect()) {
      const points: Record<string, number> = {};
      for (const r of await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", o._id)).collect()) points[r.memberId] = r.points;
      const st = await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", o._id)).unique();
      lines.push({ number: o.number, retiredAt: o.retiredAt, released: !!st?.released, points });
    }
    return { lines, retired: lines.filter(l => l.retiredAt !== undefined), live: engine.live ?? null, totals: engine.totals };
  },
});
