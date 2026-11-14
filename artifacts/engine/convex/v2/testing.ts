/**
 * v2 test fixtures (integration plan §4.3, W3-1): seed a room and a running line game directly into the v2 tables, so
 * the app (W5) and the contract tests run against real queries before the lobby and the tick exist. Local deployments
 * only (TEST_FIXTURES=1, set by scripts/dev.mjs); every function here refuses elsewhere.
 *
 * The game is real where it is cheap: states are lines of `line-z` (v2-linear), each player's score and level are their
 * rule evaluated on the state (v2-core). Rarities are placeholders (1.5 bits per level) until values come from the
 * committed artefacts (W3-4); points follow spec §8 from them.
 */
import { evaluateObject, levelOf, objectLadder, rng, ruleLayers, scoreToWire, type RuleFamily } from "@workspace/v2-core";
import { families, fromMC, lineType, lineZ, type LineState } from "@workspace/v2-linear";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { fixturesOn } from "../auth/identity";
import { presetOf } from "./presets";

const fixtures = () => {
  if (!fixturesOn(process.env)) throw new ConvexError({ code: "FORBIDDEN", message: "v2 fixtures need TEST_FIXTURES=1" });
};

const RARITY_PER_LEVEL = 1.5;
const family = (i: number) => families[i % families.length]! as unknown as RuleFamily<LineState, unknown>;

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
  args: { ...roomArgs, objects: v.optional(v.number()), phase: v.optional(v.union(v.literal("planning"), v.literal("live"), v.literal("paused"), v.literal("ended"))), seed: v.optional(v.string()) },
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
      settings: { planningSeconds: preset.planningSeconds, worldSeconds: preset.worldSeconds, startingEnergy: preset.startingEnergy, startingObjects: preset.startingObjects, minPlayers: preset.minPlayers, economy: preset.economy },
      roster, createdAt: now, startedAt: now, rotates: true, dealKey: "fixture", artefacts: [],
      ...(phase === "planning" ? { planningEndsAt: now + preset.planningSeconds * 1000 } : { endsAt: now + preset.worldSeconds * 1000 }),
      ...(phase === "ended" ? { endedAt: now, summary: { winner: members[0]!, objects: a.objects ?? 12, acts: 0 } } : {}),
    });
    await ctx.db.patch(roomId, { games: 1, lastGameId: gameId, ...(phase === "ended" ? {} : { gameId }), revision: 1 });

    // Rules and accounts.
    const rules = members.map((memberId, i) => {
      const f = family(i), params = f.dealable(lineZ)[0]!;
      // The family's first tie-breaker, as the dealer's default.
      const layers = ruleLayers(f), tb = layers[1]?.id ?? null;
      return { memberId, f, params, tb, layers, ladder: objectLadder(lineType, f, params, lineZ, tb) };
    });
    for (const { memberId, f, params, tb, layers, ladder } of rules) {
      const ruleKey = `line@1/${lineZ.id}/${f.id}/${tb ?? "none"}/${JSON.stringify(params)}`;
      await ctx.db.insert("v2Rules", {
        gameId, memberId, family: f.id, params, layers: layers.map(l => l.id), tieBreaker: tb, ruleKey, contentHash: "fixture",
        title: f.title, card: f.card(params, tb), depends: [...f.depends], primary: f.main.rep,
        ladder: ladder.map((rung, level) => ({ level, label: rung.label, rarityBits: level * RARITY_PER_LEVEL, ...(rung.layer >= 0 ? { layer: layers[rung.layer]!.id } : {}) })),
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
      await ctx.db.insert("v2ObjectStates", { objectId, gameId, state: lineType.encode(state), version: 1, changedAt: i });
      const evals = rules.map(({ f, params, tb, ladder }) => {
        const score = evaluateObject(lineType, f, params, state, lineZ, tb).score;
        const level = levelOf(score, ladder);
        return { score: scoreToWire(score), level, rarityBits: level * RARITY_PER_LEVEL };
      });
      const total = evals.reduce((s, e) => s + e.rarityBits, 0);
      for (const [k, { memberId }] of rules.entries()) {
        const e = evals[k]!, want = total - e.rarityBits, points = e.rarityBits * want;
        pts.set(memberId, (pts.get(memberId) ?? 0) + points);
        packed.set(memberId, [...(packed.get(memberId) ?? []), i + 1, e.rarityBits, want]);
        await ctx.db.insert("v2ObjectValues", { objectId, gameId, memberId, number: i + 1, ...e, want, points, version: 1, changedAt: i });
      }
    }

    // Agents, programs, moves.
    const source = "function agent(offer) {\n  // Try this: tilt towards your target.\n  return [call(\"si.tilt\", { k: 1 })];\n}\n";
    for (const [k, { memberId }] of rules.entries()) {
      const agentId = await ctx.db.insert("v2Agents", { gameId, memberId, name: "Simple", language: "typescript", sourceHash: "fixture", version: 0, share: 0.5, createdAt: now, source });
      await ctx.db.insert("v2AgentEnergy", { agentId, gameId, energy: 10, acts: 3, skips: 1, failures: 0, spend: 4.5, pointsGained: 2, settledAt: 0 });
      await ctx.db.insert("v2AgentPrograms", { agentId, version: 0, language: "typescript", source, sourceHash: "fixture", price: 12, summonedAt: now, acts: 3, pointsGained: 2 });
      for (let s = 0; s < Math.min(3, n); s++) {
        const objectId = objects[(k + s) % n]!, value = (await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", memberId)).unique())!;
        const state = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objectId)).unique())!.state;
        const snap = { score: value.score, level: value.level, rarityBits: value.rarityBits, want: value.want, points: value.points };
        await ctx.db.insert("v2Moves", {
          gameId, memberId, seq: s, worldSeconds: s * 2, objectId, number: value.number, agentId, mine: true,
          calls: [{ mutator: "si.tilt", site: 0, args: { k: "1" } }], rep: "si", stateBefore: state, stateAfter: state, before: snap, after: snap, charge: 1.5,
        });
      }
    }

    // Scoreboard, history, digests, the record's first event, the clock.
    const ranked = [...rules].map(({ memberId }) => ({ memberId, total: pts.get(memberId) ?? 0 })).sort((x, y) => y.total - x.total);
    const rows = ranked.map((row, i) => ({ memberId: row.memberId, name: roster.find(m => m.memberId === row.memberId)!.name, total: row.total, handicap: 0, net: row.total, rank: i + 1 }));
    await ctx.db.insert("v2Standings", { gameId, seq: 2, worldSeconds: 20, rows });
    for (let s = 0; s < 3; s++)
      await ctx.db.insert("v2StandingsHistory", { gameId, seq: s, worldSeconds: s * 10, totals: rows.map(x => ({ memberId: x.memberId, net: x.net * (s + 1) / 3 })) });
    for (const { memberId } of rules) await ctx.db.insert("v2Digests", { gameId, memberId, packed: packed.get(memberId) ?? [], version: 1 });
    await ctx.db.insert("v2Events", { gameId, seq: 0, kind: "gameStarted", data: { fixture: true, variant: lineZ.id, seed } });
    await ctx.db.insert("v2Clocks", { gameId, tick: 0, worldSeconds: 20, lastTickAt: now, objects: n, agents: members.length, commits: 0, events: 1 });
    return { roomId, gameId, members, objects };
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
    const offers = presetOf(room.preset).families.flatMap(id => {
      const f = lineType.families.find(x => x.id === id) as RuleFamily<LineState, unknown> | undefined;
      if (!f) return [];
      const params = f.dealable(lineZ)[0]!;
      return [{ family: f.id, title: f.title, card: f.card(params, null), top: (objectLadder(lineType, f, params, lineZ).length - 1) * RARITY_PER_LEVEL }];
    });
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
    return { score: v.score, level: v.level, rarityBits: v.rarityBits, want: v.want, points: v.points, version: v.version };
  },
});

/** Every agent of a game with its share and energy (the credit rule's test: no agent owes more than its capacity). */
export const agentsOf = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    fixtures();
    const game = (await ctx.db.get(gameId))!;
    const out = [];
    for (const a of await ctx.db.query("v2Agents").withIndex("by_game", q => q.eq("gameId", gameId)).take(320)) {
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
