/**
 * The v2 game loop (integration plan §4.3, spec §6.1, §7.7, §8, §9): a chain of tick actions (tick.ts, Node) holding
 * the game's lease, each committing through `commit` here: births, the acts it ran, energy, values, moves, digests,
 * events, the clock, and the scoreboard on its cadence. Only the chain whose `leaseId` the engine row holds may commit;
 * a pause or the end clears the lease, so a stale tick's commit is refused and the chain stops.
 *
 * Copied and cleaned in spirit from v1's engine/loop.ts (lease, commit pattern); nothing is imported from it.
 */
import { agentIncome, chargeAct, energyCapacity, readCharge, settle, type Account } from "@workspace/v2-economy";
import { births } from "@workspace/v2-agents/pure";
import { lineType } from "@workspace/v2-linear";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { decode, encode, valuesOf, variantOf, type SeatRule, type Value } from "./world.ts";

/** Wall milliseconds between ticks; world time advances by the wall time that passed, at most MAX_DT a tick. */
export const TICK_MS = 1500;
export const MAX_DT = 3;
/** World seconds between scoreboards (standings, their history, a `tick` event). */
export const SCOREBOARD_SECONDS = 10;
/** Wall milliseconds between watchdog checks, and how long a chain may go without committing before it is replaced. */
const WATCHDOG_MS = 20_000;
const STALL_MS = 30_000;
const WATCHDOG = makeFunctionReference<"mutation", { gameId: Id<"v2Games">; leaseId: string }>("v2/loop:watchdog");
/** Ticks in a row may fail this many times before the game is ended. */
const MAX_FAILURES = 20;
/** A move concerns a player whose points on the object changed by more than this (plan §2.3). */
const CONCERN = 0.05;

const BUILD_REPLAY = makeFunctionReference<"action", { gameId: Id<"v2Games"> }>("v2/replays:build");
const TICK = makeFunctionReference<"action", { gameId: Id<"v2Games">; leaseId: string }>("v2/tick:tick");

// ---------------------------------------------------------------- reading the game

export async function engineOf(ctx: QueryCtx, gameId: Id<"v2Games">) {
  return (await ctx.db.query("v2Engine").withIndex("by_game", q => q.eq("gameId", gameId)).unique())!;
}
export async function clockOf(ctx: QueryCtx, gameId: Id<"v2Games">) {
  return (await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique())!;
}
export async function seatRules(ctx: QueryCtx, game: Doc<"v2Games">): Promise<SeatRule[]> {
  const out: SeatRule[] = [];
  for (const s of game.roster) {
    const r = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", s.memberId)).unique();
    if (r) out.push({ memberId: s.memberId, rule: { family: r.family, params: r.params, tieBreaker: r.tieBreaker, ruleKey: r.ruleKey, contentHash: r.contentHash } });
  }
  return out;
}
export const powerTerms = (game: Doc<"v2Games">, p: Doc<"v2Players">) =>
  ({ powerPerSecond: p.power, allocated: p.allocated, fullChargeSeconds: game.settings.economy.fullChargeSeconds });

/** The next event seq per game within one transaction, so a commit of many events reads the engine row once. */
const nextSeq = new WeakMap<MutationCtx, Map<string, { engineId: Id<"v2Engine">; seq: number }>>();
/** Appends an event to the record (dense seq from 0). */
export async function appendEvent(ctx: MutationCtx, gameId: Id<"v2Games">, kind: Doc<"v2Events">["kind"], data: unknown) {
  let games = nextSeq.get(ctx);
  if (!games) nextSeq.set(ctx, games = new Map());
  let at = games.get(gameId);
  if (!at) {
    const engine = await engineOf(ctx, gameId);
    games.set(gameId, at = { engineId: engine._id, seq: engine.events });
  }
  await ctx.db.insert("v2Events", { gameId, seq: at.seq, kind, data });
  at.seq += 1;
  await ctx.db.patch(at.engineId, { events: at.seq });
}

// ---------------------------------------------------------------- values in the read model

/** Writes a new object's state and every player's value; returns the values. */
async function addObject(ctx: MutationCtx, game: Doc<"v2Games">, seats: SeatRule[], number: number, wire: string, world: number) {
  const objectId = await ctx.db.insert("v2Objects", { gameId: game._id, number, bornAt: world });
  await ctx.db.insert("v2ObjectStates", { objectId, gameId: game._id, state: wire, version: 1, changedAt: world });
  const values = valuesOf(decode(wire), game.variant, seats);
  for (const val of values)
    await ctx.db.insert("v2ObjectValues", { objectId, gameId: game._id, memberId: val.memberId as Id<"v2Members">, number, score: val.score, level: val.level, rarityBits: val.rarityBits, want: val.want, points: val.points, version: 1, changedAt: world });
  return { objectId, values };
}

/** Rewrites an object's state and every player's value; returns the values before and after. */
async function changeObject(ctx: MutationCtx, game: Doc<"v2Games">, seats: SeatRule[], objectId: Id<"v2Objects">, wire: string, world: number) {
  const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objectId)).unique())!;
  await ctx.db.patch(st._id, { state: wire, version: st.version + 1, changedAt: world });
  const after = valuesOf(decode(wire), game.variant, seats);
  const before = new Map<string, Value>();
  for (const val of after) {
    const row = (await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", val.memberId as Id<"v2Members">)).unique())!;
    before.set(val.memberId, { memberId: val.memberId, score: row.score, level: row.level, rarityBits: row.rarityBits, want: row.want, points: row.points });
    await ctx.db.patch(row._id, { score: val.score, level: val.level, rarityBits: val.rarityBits, want: val.want, points: val.points, version: row.version + 1, changedAt: world });
  }
  return { before, after, stateBefore: st.state };
}

/** Patches each player's digest (packed [number, rarity, want] by object number) and running total (on the engine). */
async function applyToPlayers(ctx: MutationCtx, gameId: Id<"v2Games">, changes: { number: number; values: Value[]; before?: Map<string, Value> }[]) {
  if (changes.length === 0) return;
  const players = await ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", gameId)).take(16);
  const engine = await engineOf(ctx, gameId), totals = { ...engine.totals };
  for (const p of players) {
    let delta = 0, touched = false;
    const digest = await ctx.db.query("v2Digests").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", p.memberId)).unique();
    const packed = digest ? [...digest.packed] : [];
    for (const c of changes) {
      const now = c.values.find(x => x.memberId === p.memberId);
      if (!now) continue;
      touched = true;
      delta += now.points - (c.before?.get(p.memberId)?.points ?? 0);
      const at = 3 * (c.number - 1);
      while (packed.length < at) packed.push(0);
      packed.splice(at, 3, c.number, now.rarityBits, now.want);
    }
    if (!touched) continue;
    totals[p.memberId] = (totals[p.memberId] ?? 0) + delta;
    if (digest) await ctx.db.patch(digest._id, { packed, version: digest.version + 1 });
    else await ctx.db.insert("v2Digests", { gameId, memberId: p.memberId, packed, version: 1 });
  }
  await ctx.db.patch(engine._id, { totals });
}

/** Writes the scoreboard: standings ranked by net total, a history row and a `tick` event. */
async function scoreboard(ctx: MutationCtx, game: Doc<"v2Games">, world: number) {
  const engine = await engineOf(ctx, game._id);
  const players = await ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", game._id)).take(16);
  const handicap = new Map<string, number>();
  for (const p of players) {
    const r = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", p.memberId)).unique();
    handicap.set(p.memberId, r?.handicap ?? 0);
  }
  const rows = players.map(p => {
    const h = handicap.get(p.memberId) ?? 0, total = engine.totals[p.memberId] ?? 0;
    return { memberId: p.memberId, name: game.roster.find(r => r.memberId === p.memberId)?.name ?? "", total, handicap: h, net: total - (h / 100) * Math.abs(total), rank: 0 };
  }).sort((a, b) => b.net - a.net).map((r, i) => ({ ...r, rank: i + 1 }));
  const seq = engine.scoreboards;
  const existing = await ctx.db.query("v2Standings").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  if (existing) await ctx.db.patch(existing._id, { seq, worldSeconds: world, rows });
  else await ctx.db.insert("v2Standings", { gameId: game._id, seq, worldSeconds: world, rows });
  await ctx.db.insert("v2StandingsHistory", { gameId: game._id, seq, worldSeconds: world, totals: rows.map(r => ({ memberId: r.memberId, net: r.net })) });
  await ctx.db.patch(engine._id, { scoreboards: seq + 1, scoreboardAt: world });
  await appendEvent(ctx, game._id, "tick", { tick: engine.tick, worldSeconds: world, standings: rows.map(r => ({ memberId: r.memberId, total: r.total, net: r.net, rank: r.rank })) });
  return rows;
}

// ---------------------------------------------------------------- phases

/** Planning ends (its deadline, everyone ready, or the owner): births, values, the lease, the first tick. */
export async function startWorld(ctx: MutationCtx, game: Doc<"v2Games">) {
  if (game.phase !== "planning") return;
  const now = Date.now(), seats = await seatRules(ctx, game);
  const states = births(lineType, variantOf(game.variant), game.seed, game.settings.startingObjects);
  const changes = [];
  for (const [i, s] of states.entries()) {
    const wire = encode(s);
    const { objectId, values } = await addObject(ctx, game, seats, i + 1, wire, 0);
    changes.push({ number: i + 1, values });
    await appendEvent(ctx, game._id, "objectBorn", { objectId, number: i + 1, state: wire, worldSeconds: 0 });
    await appendEvent(ctx, game._id, "values", { objectId, number: i + 1, values: values.map(({ memberId, score, level, rarityBits }) => ({ memberId, score, level, rarityBits })) });
  }
  await applyToPlayers(ctx, game._id, changes);
  const leaseId = crypto.randomUUID();
  const engine = await engineOf(ctx, game._id), clock = await clockOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId, objects: states.length });
  await ctx.db.patch(clock._id, { lastTickAt: now, worldSeconds: 0, objects: states.length });
  await ctx.db.patch(game._id, { phase: "live", startedAt: now, endsAt: now + game.settings.worldSeconds * 1000 });
  await appendEvent(ctx, game._id, "phase", { phase: "live", worldSeconds: 0 });
  await scoreboard(ctx, { ...game, phase: "live" }, 0);
  await ctx.scheduler.runAfter(0, TICK, { gameId: game._id, leaseId });
  await ctx.scheduler.runAfter(WATCHDOG_MS, WATCHDOG, { gameId: game._id, leaseId });
}

/** The game ends: the lease goes, the final scoreboard and `gameEnded`, the room is free for the next game. */
export async function endGame(ctx: MutationCtx, game: Doc<"v2Games">) {
  if (game.phase === "ended") return;
  const engine = await engineOf(ctx, game._id), clock = await clockOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId: "" });
  const rows = await scoreboard(ctx, game, clock.worldSeconds);
  const acts = engine.acts;
  await ctx.db.patch(game._id, { phase: "ended", endedAt: Date.now(), summary: { winner: rows[0]?.memberId ?? null, objects: engine.objects, acts } });
  await appendEvent(ctx, game._id, "gameEnded", { worldSeconds: clock.worldSeconds, standings: rows.map(r => ({ memberId: r.memberId, total: r.total, net: r.net, rank: r.rank })) });
  await ctx.scheduler.runAfter(0, BUILD_REPLAY, { gameId: game._id });
  const room = (await ctx.db.get(game.roomId))!;
  if (room.gameId === game._id) await ctx.db.patch(room._id, { gameId: undefined, revision: room.revision + 1 });
  // Who joined while it ran watched it; the next game seats them.
  for (const m of await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(16))
    if (m.seatNext) await ctx.db.patch(m._id, { spectator: false, seatNext: undefined });
}

export async function pauseGame(ctx: MutationCtx, game: Doc<"v2Games">, by: Id<"v2Members">) {
  const engine = await engineOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId: "" });
  // No countdown while paused: the end is set again on resume from the world time left.
  await ctx.db.patch(game._id, { phase: "paused", pausedBy: by, endsAt: undefined });
  await appendEvent(ctx, game._id, "phase", { phase: "paused", by });
}

export async function resumeGame(ctx: MutationCtx, game: Doc<"v2Games">) {
  const leaseId = crypto.randomUUID(), now = Date.now();
  const engine = await engineOf(ctx, game._id), clock = await clockOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId });
  await ctx.db.patch(clock._id, { lastTickAt: now });
  await ctx.db.patch(game._id, { phase: "live", pausedBy: undefined, endsAt: now + Math.max(0, game.settings.worldSeconds - clock.worldSeconds) * 1000 });
  await appendEvent(ctx, game._id, "phase", { phase: "live", worldSeconds: clock.worldSeconds });
  await ctx.scheduler.runAfter(0, TICK, { gameId: game._id, leaseId });
  await ctx.scheduler.runAfter(WATCHDOG_MS, WATCHDOG, { gameId: game._id, leaseId });
}

/**
 * The watchdog of a live game's chain (one per lease): a chain the runtime killed (a timeout, memory, a stuck native
 * step) never reaches its own failure handler, so when the clock has not moved for STALL_MS the watchdog takes a new
 * lease and starts a new chain. It stops with its lease (a pause, the end, or a replacement).
 */
export const watchdog = internalMutation({
  args: { gameId: v.id("v2Games"), leaseId: v.string() },
  handler: async (ctx, { gameId, leaseId }) => {
    const game = await ctx.db.get(gameId);
    const engine = game && await engineOf(ctx, gameId);
    if (!game || !engine || game.phase !== "live" || engine.leaseId !== leaseId) return;
    const clock = await clockOf(ctx, gameId), now = Date.now();
    let lease = leaseId;
    if (now - clock.lastTickAt > STALL_MS) {
      lease = crypto.randomUUID();
      console.error(`v2 tick chain of ${gameId} stalled for ${Math.round((now - clock.lastTickAt) / 1000)} s: restarted`);
      await ctx.db.patch(engine._id, { leaseId: lease, failures: engine.failures + 1 });
      await ctx.db.patch(clock._id, { lastTickAt: now });
      await ctx.scheduler.runAfter(0, TICK, { gameId, leaseId: lease });
      if (engine.failures + 1 >= MAX_FAILURES) { await endGame(ctx, game); return; }
    }
    await ctx.scheduler.runAfter(WATCHDOG_MS, WATCHDOG, { gameId, leaseId: lease });
  },
});

/** Scheduled at planning's deadline by the start. */
export const planningEnds = internalMutation({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (game?.phase === "planning") await startWorld(ctx, game);
  },
});

// ---------------------------------------------------------------- the tick's reads and its commit

/** What a tick needs: the clock, the economy, every live agent with its program and energy, the rules. */
export const snapshot = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const engine = await engineOf(ctx, gameId), clock = await clockOf(ctx, gameId);
    const players = await ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", gameId)).take(16);
    const agents = await ctx.db.query("v2Agents").withIndex("by_game", q => q.eq("gameId", gameId)).filter(q => q.eq(q.field("destroyedAt"), undefined)).take(16 * 20);
    const withEnergy = [];
    for (const a of agents) {
      const e = (await ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", a._id)).unique())!;
      const p = players.find(x => x.memberId === a.memberId)!;
      withEnergy.push({ agentId: a._id, memberId: a.memberId, language: a.language, source: a.source, version: a.version, share: a.share, power: p.power, energy: e.energy, settledAt: e.settledAt });
    }
    return {
      phase: game.phase, seed: game.seed, variant: game.variant, settings: game.settings, leaseId: engine.leaseId, tick: engine.tick,
      acts: engine.acts, objects: engine.objects, worldSeconds: clock.worldSeconds, lastTickAt: clock.lastTickAt,
      seats: await seatRules(ctx, game), agents: withEnergy,
    };
  },
});

/** The states of the objects with these numbers. */
export const statesOf = internalQuery({
  args: { gameId: v.id("v2Games"), numbers: v.array(v.number()) },
  handler: async (ctx, { gameId, numbers }) => {
    const out = [];
    for (const n of [...new Set(numbers)]) {
      const o = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", gameId).eq("number", n)).unique();
      if (!o) continue;
      const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", o._id)).unique())!;
      out.push({ number: n, objectId: o._id, state: st.state, version: st.version });
    }
    return out;
  },
});

const actV = v.object({
  n: v.number(), verdict: v.string(), agentId: v.id("v2Agents"), memberId: v.id("v2Members"), objectId: v.id("v2Objects"), number: v.number(), version: v.number(),
  seed: v.string(), energy: v.number(), liveObjects: v.number(), programVersion: v.number(), record: v.any(),
});

/**
 * One tick's commit. Births first, then the acts in order: each act's state change (only when the object is still at
 * the version the act saw), its charge on the agent's settled account, every player's values, the moves rows of the
 * players it concerns, and its events. Then digests and totals, the clock, the scoreboard on its cadence, the end
 * when world time is up, and the next tick.
 */
export const commit = internalMutation({
  args: { gameId: v.id("v2Games"), leaseId: v.string(), world: v.number(), now: v.number(), born: v.array(v.string()), acts: v.array(actV), picks: v.number() },
  handler: async (ctx, a) => {
    const game = await ctx.db.get(a.gameId);
    const engine = game && await engineOf(ctx, a.gameId);
    if (!game || !engine || game.phase !== "live" || engine.leaseId !== a.leaseId) return { committed: false };
    if (engine.failures) await ctx.db.patch(engine._id, { failures: 0 });
    const clock = await clockOf(ctx, game._id), seats = await seatRules(ctx, game);
    const world = Math.max(clock.worldSeconds, Math.min(a.world, game.settings.worldSeconds));
    const changes: { number: number; values: Value[]; before?: Map<string, Value> }[] = [];
    // Acts are numbered by the tick's opportunities (their seeds are `act:<n>`), whether or not each one ran.
    let objects = engine.objects, acts = engine.acts + a.picks, moves = engine.moves;

    for (const wire of a.born) {
      const number = ++objects;
      const { objectId, values } = await addObject(ctx, game, seats, number, wire, world);
      changes.push({ number, values });
      await appendEvent(ctx, game._id, "objectBorn", { objectId, number, state: wire, worldSeconds: world });
      await appendEvent(ctx, game._id, "values", { objectId, number, values: values.map(({ memberId, score, level, rarityBits }) => ({ memberId, score, level, rarityBits })) });
    }

    const P = game.settings.economy;
    for (const act of a.acts) {
      const agent = await ctx.db.get(act.agentId);
      const energy = await ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", act.agentId)).unique();
      if (!agent || agent.destroyedAt !== undefined || !energy) continue;   // destroyed since the tick read it
      const record = act.record as { outcome: string; after: string; before: string; charge: number; readBits: number; calls: { mutator: string; site: number; args: Record<string, string>; rep: string }[]; reason?: string };
      const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", act.objectId)).unique())!;
      const income = agentIncome(P.powerPerSecond, agent.share), capacity = energyCapacity(income, P.fullChargeSeconds);
      const account: Account = settle({ balance: energy.energy, settledWorldSeconds: energy.settledAt }, world, income, capacity);
      // What happened (spec §6.1, docs/energy-model.md §7.2): a change commits only on the state it was made on, and
      // only if paying for it leaves the agent owing at most its capacity; otherwise it pays for its reads alone.
      const verdict = act.verdict as "committed" | "stale" | "unaffordable" | "skipped" | "failed";
      const committed = verdict === "committed" && st.version === act.version;
      const outcome = verdict === "committed" && !committed ? "stale" : verdict;
      const charge = committed || outcome === "skipped" || outcome === "failed" ? record.charge : readCharge(record.readBits);
      const charged = chargeAct(account, charge);
      const n = act.n;
      await ctx.db.patch(energy._id, {
        energy: charged.balance, settledAt: charged.settledWorldSeconds, acts: energy.acts + 1, spend: energy.spend + charge, lastActAt: world,
        ...(outcome === "skipped" ? { skips: energy.skips + 1 } : outcome === "failed" ? { failures: energy.failures + 1 } : {}),
      });
      await appendEvent(ctx, game._id, "act", {
        n, tick: engine.tick, worldSeconds: world, objectId: act.objectId, number: act.number, agentId: act.agentId, memberId: act.memberId,
        seed: act.seed, energy: act.energy, liveObjects: act.liveObjects, program: { version: act.programVersion, language: agent.language },
        ...record, ...(outcome !== record.outcome ? { outcome, after: record.before, charged: charge } : {}),
      });
      if (!committed) continue;
      const { before, after } = await changeObject(ctx, game, seats, act.objectId, record.after, world);
      changes.push({ number: act.number, values: after, before });
      await appendEvent(ctx, game._id, "values", { objectId: act.objectId, number: act.number, values: after.map(({ memberId, score, level, rarityBits }) => ({ memberId, score, level, rarityBits })) });
      const gained = (after.find(x => x.memberId === act.memberId)?.points ?? 0) - (before.get(act.memberId)?.points ?? 0);
      await ctx.db.patch(energy._id, { pointsGained: energy.pointsGained + gained });
      const program = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id).eq("version", agent.version)).unique();
      if (program) await ctx.db.patch(program._id, { acts: program.acts + 1, pointsGained: program.pointsGained + gained });
      const seq = moves++;
      for (const val of after) {
        const was = before.get(val.memberId)!;
        const mine = val.memberId === act.memberId;
        if (!mine && Math.abs(val.points - was.points) <= CONCERN) continue;
        await ctx.db.insert("v2Moves", {
          gameId: game._id, memberId: val.memberId as Id<"v2Members">, seq, worldSeconds: world, objectId: act.objectId, number: act.number,
          ...(mine ? { agentId: act.agentId, charge } : {}), mine,
          calls: record.calls.map(c => ({ mutator: c.mutator, site: c.site, args: c.args })), rep: record.calls[0]?.rep ?? "",
          stateBefore: record.before, stateAfter: record.after,
          before: { score: was.score, level: was.level, rarityBits: was.rarityBits, want: was.want, points: was.points },
          after: { score: val.score, level: val.level, rarityBits: val.rarityBits, want: val.want, points: val.points },
        });
      }
    }
    await applyToPlayers(ctx, game._id, changes);

    await ctx.db.patch(engine._id, { tick: engine.tick + 1, objects, acts, moves });
    await ctx.db.patch(clock._id, { tick: clock.tick + 1, worldSeconds: world, lastTickAt: a.now, objects, commits: clock.commits + 1 });
    const fresh = (await ctx.db.get(game._id))!;
    if (world >= game.settings.worldSeconds) { await endGame(ctx, fresh); return { committed: true, ended: true }; }
    if (world - engine.scoreboardAt >= SCOREBOARD_SECONDS) await scoreboard(ctx, fresh, world);
    await ctx.scheduler.runAfter(TICK_MS, TICK, { gameId: game._id, leaseId: a.leaseId });
    return { committed: true, ended: false };
  },
});

/** A tick that failed before committing schedules the next one itself (a failure must not stop the game). */
export const tickFailed = internalMutation({
  args: { gameId: v.id("v2Games"), leaseId: v.string(), error: v.string() },
  handler: async (ctx, { gameId, leaseId, error }) => {
    const engine = await engineOf(ctx, gameId);
    if (!engine || engine.leaseId !== leaseId) return;
    console.error(`v2 tick failed (${engine.failures + 1}): ${error}`);
    await ctx.db.patch(engine._id, { failures: engine.failures + 1 });
    // A game whose ticks keep failing is ended rather than left spinning (the failures are in the logs).
    if (engine.failures + 1 >= MAX_FAILURES) {
      const game = await ctx.db.get(gameId);
      if (game) await endGame(ctx, game);
      return;
    }
    await ctx.scheduler.runAfter(TICK_MS, TICK, { gameId, leaseId });
  },
});

