/**
 * The v2 game loop (integration plan §4.3, spec §6.1, §7.7, §8, §9): a chain of tick actions (tick.ts, Node) holding
 * the game's lease, each committing through `commit` here: births, the acts it ran, energy, values, moves, digests,
 * events, the clock, and the scoreboard on its cadence. Only the chain whose `leaseId` the engine row holds may commit;
 * a pause or the end clears the lease, so a stale tick's commit is refused and the chain stops.
 *
 * Copied and cleaned in spirit from v1's engine/loop.ts (lease, commit pattern); nothing is imported from it.
 */
import { agentIncome, chargeAct, energyCapacity, readCharge, settle, type Account } from "@workspace/v2-economy";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { EndReason } from "./tables.ts";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { decode, distinctBirths, heldReason, penaltyWeightOf, scopeOf, valuesOf, type SeatRule, type Value as ExactValue } from "./world.ts";
import { stepCycle, type Cycle } from "./cycles.ts";
import { agentSeen, measured, objectReading, quadrantOf, readingNoise, shownAt } from "./disclose.ts";
import { durationModeOf, endWorldOf, scoreIntervalOf, timeScaleOf } from "./duration.ts";
import { shouldPark } from "./activity.ts";
import { allReady, ensureWarm, isReady, LANGUAGES } from "./readiness.ts";
import { paysToRead, tell } from "./knowledge.ts";
import { driftEventsDue, driftSecondsOf, redrawParams } from "./drift.ts";
import { ruleView } from "./deal.ts";
import { capOf, liveLines } from "./turnover.ts";

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

const BUILD_REPLAY = makeFunctionReference<"action", { gameId: Id<"v2Games"> }>("v2/replayBuild:build");
const TICK = makeFunctionReference<"action", { gameId: Id<"v2Games">; leaseId: string }>("v2/tick:tick");
/** How often held planning looks again for ready sandboxes. */
const HOLD_MS = 1000;
const PLANNING_ENDS = makeFunctionReference<"mutation", { gameId: Id<"v2Games"> }>("v2/loop:planningEnds");
const EXACT_VALUES = makeFunctionReference<"mutation", { gameId: Id<"v2Games">; memberId: Id<"v2Members"> }>("v2/loop:exactValues");

// ---------------------------------------------------------------- reading the game

export async function engineOf(ctx: QueryCtx, gameId: Id<"v2Games">) {
  return (await ctx.db.query("v2Engine").withIndex("by_game", q => q.eq("gameId", gameId)).unique())!;
}
export async function clockOf(ctx: QueryCtx, gameId: Id<"v2Games">) {
  return (await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", gameId)).unique())!;
}
/** An agent's current program (v2AgentPrograms at its version; the agent row no longer carries the source). */
export async function programOf(ctx: QueryCtx, agent: Pick<Doc<"v2Agents">, "_id" | "version" | "source" | "language">): Promise<Pick<Doc<"v2AgentPrograms">, "source" | "language">> {
  const p = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id).eq("version", agent.version)).unique();
  if (p) return p;
  // A row stored before the source moved off v2Agents still carries it: never stall a tick over a missing program row.
  if (agent.source !== undefined) return { source: agent.source, language: agent.language };
  throw new Error(`Agent ${agent._id} has no program at version ${agent.version}`);
}

export async function seatRules(ctx: QueryCtx, game: Doc<"v2Games">): Promise<SeatRule[]> {
  const out: SeatRule[] = [];
  for (const s of game.roster) {
    const r = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", s.memberId)).unique();
    if (r) out.push({
      memberId: s.memberId, rule: { family: r.family, params: r.params, tieBreaker: r.tieBreaker, ruleKey: r.ruleKey, contentHash: r.contentHash },
      ...(r.defence ? { defence: { family: r.defence.family, params: r.defence.params, ruleKey: r.defence.ruleKey } } : {}),
    });
  }
  return out;
}
export const powerTerms = (game: Doc<"v2Games">, p: Doc<"v2Players">) =>
  ({ powerPerSecond: p.power, allocated: p.allocated, fullChargeSeconds: game.settings.economy.fullChargeSeconds });

/** The next event seq per game within one transaction, so a commit of many events reads the engine row once. */
const nextSeq = new WeakMap<MutationCtx, Map<string, { engineId: Id<"v2Engine">; seq: number }>>();
/** Appends an event to the record (dense seq from 0). */
export async function appendEvent(ctx: MutationCtx, gameId: Id<"v2Games">, kind: Doc<"v2Events">["kind"], data: unknown): Promise<number> {
  let games = nextSeq.get(ctx);
  if (!games) nextSeq.set(ctx, games = new Map());
  let at = games.get(gameId);
  if (!at) {
    const engine = await engineOf(ctx, gameId);
    games.set(gameId, at = { engineId: engine._id, seq: engine.events });
  }
  const seq = at.seq;
  await ctx.db.insert("v2Events", { gameId, seq, kind, data });
  at.seq += 1;
  await ctx.db.patch(at.engineId, { events: at.seq });
  return seq;
}

/** Every roster seat's exact bits of a state, in roster order (a v2Log row's; each reader's reading is theirs: play.ts log). */
function logBits(game: Doc<"v2Games">, values: readonly Value[]) {
  const by = new Map(values.map(v => [v.memberId, v]));
  return { bits: game.roster.map(r => by.get(r.memberId)?.rarityBits ?? 0) };
}

// ---------------------------------------------------------------- values in the read model

/**
 * The state rows of a game that hold states (decision 24), from the uniqueness index: a retired line that released its
 * state (turnover, `retiredHolds` false) holds nothing, so it is filtered out before any `take`. Every reader of who
 * holds what goes through here.
 */
export function holdingRows(ctx: QueryCtx, gameId: Id<"v2Games">, state?: string) {
  return ctx.db.query("v2ObjectStates").withIndex("by_game_state", q => state === undefined ? q.eq("gameId", gameId) : q.eq("gameId", gameId).eq("state", state))
    .filter(q => q.neq(q.field("released"), true));
}

/** The object of the game that holds `state`, other than `except` (decision 24), or null: one index read. */
async function holderOf(ctx: MutationCtx, gameId: Id<"v2Games">, state: string, except?: Id<"v2Objects">) {
  for (const row of await holdingRows(ctx, gameId, state).take(2)) {
    if (row.objectId === except) continue;
    const object = await ctx.db.get(row.objectId);
    return { objectId: row.objectId, number: object?.number ?? 0 };
  }
  return null;
}

/** A player's value of an object at a version, exact and as they read it while live (disclose.ts: their own reading). */
type Value = ExactValue & { shownWant: number; shownPoints: number };
function valuesAt(game: Doc<"v2Games">, seats: SeatRule[], wire: string, objectId: Id<"v2Objects">, version: number): Value[] {
  return valuesOf(decode(wire, game.variant), game.variant, seats, scopeOf(game).objects, penaltyWeightOf(game))
    .map(v => ({ ...v, ...shownAt(v, readingNoise(game, v.memberId, objectReading(objectId, version))) }));
}
/** The disclosed fields of a value row, with its filter (disclose.ts quadrantOf, on the disclosed others' sum). */
const shownOf = (v: Value) => ({ shownWant: v.shownWant, shownPoints: v.shownPoints, quadrant: quadrantOf(v.rarityBits, v.shownWant) });

/** Writes a new object's state and every player's value; returns the values. */
async function addObject(ctx: MutationCtx, game: Doc<"v2Games">, seats: SeatRule[], number: number, wire: string, world: number) {
  const objectId = await ctx.db.insert("v2Objects", { gameId: game._id, number, bornAt: world });
  await ctx.db.insert("v2ObjectStates", { objectId, gameId: game._id, state: wire, version: 1, changedAt: world });
  const values = valuesAt(game, seats, wire, objectId, 1);
  for (const val of values) {
    await ctx.db.insert("v2ObjectValues", { objectId, gameId: game._id, memberId: val.memberId as Id<"v2Members">, number, score: val.score, rarityBits: val.rarityBits, want: val.want, points: val.points, ...shownOf(val), version: 1, changedAt: world });
    // Paid observation: a birth is public, so every player is told it (knowledge.ts).
    if (paysToRead(game)) await tell(ctx, game, val.memberId as Id<"v2Members">, { objectId, number, state: wire, version: 1, score: val.score, rarityBits: val.rarityBits, want: val.shownWant, points: val.shownPoints }, world);
  }
  return { objectId, values };
}

/** Points leaving the totals when lines retire in "dropped" mode, by member: exact and as disclosed. */
type Drops = Map<string, { points: number; shown: number }>;

/**
 * Retires a line (turnover, retirement-design.md): no agent is offered it again and drift passes it over. Its points
 * stay in every total ("banked") or leave them ("dropped": added to `drops`, applied once by `applyDrops`); its state
 * stays held unless the settings release it. The record gets a `retired` event with each player's points on it,
 * before the birth that retired it.
 */
async function retireLine(ctx: MutationCtx, game: Doc<"v2Games">, number: number, world: number, drops: Drops) {
  const turnover = game.settings.turnover!;
  const object = await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", game._id).eq("number", number)).unique();
  if (!object || object.retiredAt !== undefined) return;
  await ctx.db.patch(object._id, { retiredAt: world });
  const st = await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", object._id)).unique();
  if (st && !turnover.retiredHolds) await ctx.db.patch(st._id, { released: true });
  const rows = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", object._id)).take(16);
  // A retirement is public, like a birth: in a game that pays to read, every player is told the line as it ends (its
  // final state and their value of it as disclosed), so the retired list shows what it banked.
  if (st && paysToRead(game)) for (const r of rows) {
    await tell(ctx, game, r.memberId, { objectId: object._id, number, state: st.state, version: st.version, score: r.score, rarityBits: r.rarityBits, want: r.shownWant ?? r.want, points: r.shownPoints ?? r.points }, world);
  }
  // Its rows leave the live lists (the sort indexes key on `retired`) for the retired list (play.ts banked).
  for (const r of rows) await ctx.db.patch(r._id, { retired: true });
  for (const k of await ctx.db.query("v2Knowledge").withIndex("by_object_member", q => q.eq("objectId", object._id)).take(16)) await ctx.db.patch(k._id, { retired: true });
  if (turnover.retiredPoints === "dropped") for (const r of rows) {
    const d = drops.get(r.memberId) ?? { points: 0, shown: 0 };
    drops.set(r.memberId, { points: d.points + r.points, shown: d.shown + (r.shownPoints ?? r.points) });
  }
  await appendEvent(ctx, game._id, "retired", {
    objectId: object._id, number, worldSeconds: world, state: st?.state ?? null, banked: turnover.retiredPoints === "banked",
    points: rows.map(r => ({ memberId: r.memberId, points: r.points })),
  });
}

/** Takes the retired lines' points out of the totals ("dropped" mode), in one write of the engine row. */
async function applyDrops(ctx: MutationCtx, gameId: Id<"v2Games">, drops: Drops) {
  if (drops.size === 0) return;
  const engine = await engineOf(ctx, gameId), totals = { ...engine.totals }, shownTotals = { ...(engine.shownTotals ?? engine.totals) };
  for (const [m, d] of drops) { totals[m] = (totals[m] ?? 0) - d.points; shownTotals[m] = (shownTotals[m] ?? 0) - d.shown; }
  await ctx.db.patch(engine._id, { totals, shownTotals });
}

/** Whether a move is recorded for a player (a `v2Moves` row): their own, or one that changed their points. */
const concerns = (mine: boolean, was: number, now: number) => mine || Math.abs(now - was) > CONCERN;

/**
 * Rewrites an object's state and every player's value; returns the values before and after. Each player the move
 * concerns gets it on their row's `recent` (the last HISTORY, what actInputs tells their agents), beside its move row.
 */
async function changeObject(ctx: MutationCtx, game: Doc<"v2Games">, seats: SeatRule[], objectId: Id<"v2Objects">, wire: string, world: number, mover: string) {
  const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", objectId)).unique())!;
  await ctx.db.patch(st._id, { state: wire, version: st.version + 1, changedAt: world });
  const after = valuesAt(game, seats, wire, objectId, st.version + 1);
  const before = new Map<string, Value>();
  for (const val of after) {
    const row = (await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", val.memberId as Id<"v2Members">)).unique())!;
    // A row written before the noise was restored has no shown fields: its disclosed values were the exact ones.
    before.set(val.memberId, { memberId: val.memberId, score: row.score, rarityBits: row.rarityBits, want: row.want, points: row.points, shownWant: row.shownWant ?? row.want, shownPoints: row.shownPoints ?? row.points });
    const mine = val.memberId === mover;
    // An agent's history is what its owner was shown: the disclosed points.
    const recent = concerns(mine, row.points, val.points) ? [...(row.recent ?? []), { mine, pointsBefore: row.shownPoints ?? row.points, pointsAfter: val.shownPoints }].slice(-HISTORY) : undefined;
    await ctx.db.patch(row._id, { score: val.score, rarityBits: val.rarityBits, want: val.want, points: val.points, ...shownOf(val), version: row.version + 1, changedAt: world, ...(recent ? { recent } : {}) });
  }
  return { before, after, stateBefore: st.state };
}

/** A move as it concerns one player, in commit order (oldest first). */
interface TugMove { memberId: Id<"v2Members">; objectId: Id<"v2Objects">; number: number; mine: boolean; by: Id<"v2Members">; charge: number; world: number; state: string; points: number }

/** Folds a commit's moves into each player's `v2Tugs` row per object: one read and one write per (player, object). */
async function foldTugs(ctx: MutationCtx, gameId: Id<"v2Games">, moves: readonly TugMove[]) {
  const byPair = new Map<string, TugMove[]>();
  for (const m of moves) { const k = `${m.memberId}:${m.objectId}`; byPair.set(k, [...(byPair.get(k) ?? []), m]); }
  for (const list of byPair.values()) {
    const { memberId, objectId, number } = list[0]!;
    const row = await ctx.db.query("v2Tugs").withIndex("by_game_member_object", q => q.eq("gameId", gameId).eq("memberId", memberId).eq("objectId", objectId)).unique();
    const t = row ? { moves: row.moves, flips: row.flips, lastMine: row.lastMine, mySpend: row.mySpend, others: [...row.others], from: row.from, to: row.to, best: row.best, lastStates: [...(row.lastStates ?? [])], cycle: row.cycle ?? null }
      : { moves: 0, flips: 0, lastMine: list[0]!.mine, mySpend: 0, others: [] as Id<"v2Members">[], from: list[0]!.world, to: list[0]!.world, best: null as { state: string; points: number } | null, lastStates: [] as string[], cycle: null as Cycle | null };
    for (const m of list) {
      ({ lastStates: t.lastStates, cycle: t.cycle } = stepCycle(t.lastStates, t.cycle, m.state));
      if (t.moves > 0 && m.mine !== t.lastMine) t.flips++;
      t.moves++; t.lastMine = m.mine; t.mySpend += m.charge; t.to = m.world;
      if (!m.mine && !t.others.includes(m.by)) t.others.push(m.by);
      if (!t.best || m.points > t.best.points) t.best = { state: m.state, points: m.points };
    }
    if (row) await ctx.db.patch(row._id, t);
    else await ctx.db.insert("v2Tugs", { gameId, memberId, objectId, number, ...t });
  }
}

/** Patches each player's digest (packed [number, rarity, want] by object number) and running total (on the engine). */
async function applyToPlayers(ctx: MutationCtx, gameId: Id<"v2Games">, changes: { number: number; values: Value[]; before?: Map<string, Value> }[]) {
  if (changes.length === 0) return;
  const players = await ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", gameId)).take(16);
  const engine = await engineOf(ctx, gameId), totals = { ...engine.totals }, shownTotals = { ...(engine.shownTotals ?? engine.totals) };
  const paid = paysToRead((await ctx.db.get(gameId))!);
  for (const p of players) {
    let delta = 0, shownDelta = 0, touched = false;
    // A paid game's scatter shows what each player was told: the tellings write it (knowledge.ts tell).
    const digest = paid ? null : await ctx.db.query("v2Digests").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", p.memberId)).unique();
    const packed = digest ? [...digest.packed] : [];
    for (const c of changes) {
      const now = c.values.find(x => x.memberId === p.memberId);
      if (!now) continue;
      touched = true;
      delta += now.points - (c.before?.get(p.memberId)?.points ?? 0);
      shownDelta += now.shownPoints - (c.before?.get(p.memberId)?.shownPoints ?? 0);
      const at = 3 * (c.number - 1);
      while (packed.length < at) packed.push(0);
      // The scatter shows the others' sum as disclosed while live (exact again at the end: exactValues).
      packed.splice(at, 3, c.number, now.rarityBits, now.shownWant);
    }
    if (!touched) continue;
    totals[p.memberId] = (totals[p.memberId] ?? 0) + delta;
    shownTotals[p.memberId] = (shownTotals[p.memberId] ?? 0) + shownDelta;
    if (paid) continue;
    if (digest) await ctx.db.patch(digest._id, { packed, version: digest.version + 1 });
    else await ctx.db.insert("v2Digests", { gameId, memberId: p.memberId, packed, version: 1 });
  }
  await ctx.db.patch(engine._id, { totals, shownTotals });
}

/**
 * Drift events (drift.ts; the coordinator's trials under call 18): each due event redraws one seat's parameters, if its
 * rule has other values (events in the end guard are passed over); the rule documents and cards update, every object's values are recomputed under the new rules (totals and
 * scatters follow), and the record gets a `drift` event (each redrawn seat's new rule) and a `values` event per object.
 */
async function driftRules(ctx: MutationCtx, game: Doc<"v2Games">, world: number, events: { e: number; seat: number; skip: boolean }[]) {
  const engine = await engineOf(ctx, game._id);
  await ctx.db.patch(engine._id, { drifts: events.at(-1)!.e });
  const drifted: { memberId: string; family: string; params: unknown; tieBreaker: string | null; ruleKey: string; contentHash: string; card: string }[] = [];
  // The seats' rules as they stand (updated as seats redraw): a redraw avoids a pair the seating rule forbids.
  const standing = new Map((await seatRules(ctx, game)).map(x => [x.memberId, { family: x.rule.family, params: x.rule.params }]));
  for (const { e, seat, skip } of events) {
    const s = game.roster[seat];
    if (skip || !s) continue;
    const r = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", s.memberId)).unique();
    if (!r) continue;
    const others = [...standing].filter(([m]) => m !== s.memberId).map(([, x]) => x);
    const next = redrawParams(game.variant, r.family, r.tieBreaker, r.params, game.seed, seat, e, others);
    if (!next) continue;
    standing.set(s.memberId, { family: r.family, params: next.params });
    const view = ruleView({ family: r.family, params: next.params, tieBreaker: r.tieBreaker, ruleKey: next.ruleKey, contentHash: next.contentHash });
    await ctx.db.patch(r._id, { params: next.params, ruleKey: next.ruleKey, contentHash: next.contentHash, ...view, drifts: (r.drifts ?? 0) + 1, driftedAt: world, previous: { params: r.params, card: r.card } });
    drifted.push({ memberId: s.memberId, family: r.family, params: next.params, tieBreaker: r.tieBreaker, ruleKey: next.ruleKey, contentHash: next.contentHash, card: view.card });
  }
  if (drifted.length === 0) return;
  await appendEvent(ctx, game._id, "drift", { worldSeconds: world, k: events.at(-1)!.e, seats: drifted });
  // Every object's values under the new rules (the same object versions: each player's reading keeps its draw).
  const seats = await seatRules(ctx, game), changes: { number: number; values: Value[]; before: Map<string, Value> }[] = [];
  for await (const st of ctx.db.query("v2ObjectStates").withIndex("by_game_state", q => q.eq("gameId", game._id))) {
    const object = await ctx.db.get(st.objectId);
    // A retired line (turnover) keeps its values as they stood: drift passes it over.
    if (!object || object.retiredAt !== undefined) continue;
    const after = valuesAt(game, seats, st.state, st.objectId, st.version), before = new Map<string, Value>();
    for (const val of after) {
      const row = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", st.objectId).eq("memberId", val.memberId as Id<"v2Members">)).unique();
      if (!row) continue;
      before.set(val.memberId, { memberId: val.memberId, score: row.score, rarityBits: row.rarityBits, want: row.want, points: row.points, shownWant: row.shownWant ?? row.want, shownPoints: row.shownPoints ?? row.points });
      await ctx.db.patch(row._id, { score: val.score, rarityBits: val.rarityBits, want: val.want, points: val.points, ...shownOf(val) });
    }
    changes.push({ number: object.number, values: after, before });
    await appendEvent(ctx, game._id, "values", { objectId: st.objectId, number: object.number, values: after.map(({ memberId, score, rarityBits }) => ({ memberId, score, rarityBits })) });
  }
  await applyToPlayers(ctx, game._id, changes);
  if (paysToRead(game)) for (const d of drifted) await reknow(ctx, game, seats, d.memberId as Id<"v2Members">);
}

/**
 * After a redraw, a player's knowledge shows their OWN bits under their new parameters on the states they last saw
 * (their rule applied to what they know: nothing new about the world), with the others' sum as last told and points
 * from the two; their scatter follows. `learnedAt` is unchanged: nothing was seen anew.
 */
async function reknow(ctx: MutationCtx, game: Doc<"v2Games">, seats: SeatRule[], memberId: Id<"v2Members">) {
  const scope = scopeOf(game).objects;
  const digest = await ctx.db.query("v2Digests").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", memberId)).unique();
  const packed = digest ? [...digest.packed] : [];
  for await (const k of ctx.db.query("v2Knowledge").withIndex("by_game_member_born", q => q.eq("gameId", game._id).eq("memberId", memberId).eq("retired", undefined))) {
    // (Retired lines keep what was banked: their rows are past this range.)
    const mine = valuesOf(decode(k.state, game.variant), game.variant, seats, scope, penaltyWeightOf(game)).find(x => x.memberId === memberId);
    if (!mine) continue;
    await ctx.db.patch(k._id, { score: mine.score, rarityBits: mine.rarityBits, points: mine.rarityBits * Math.max(0, k.want), quadrant: quadrantOf(mine.rarityBits, k.want) });
    const at = 3 * (k.number - 1);
    while (packed.length < at) packed.push(0);
    packed.splice(at, 3, k.number, mine.rarityBits, k.want);
  }
  if (digest) await ctx.db.patch(digest._id, { packed, version: digest.version + 1 });
}

/**
 * Writes the scoreboard: standings ranked by net total, a history row and a `tick` event, every scoreIntervalSeconds.
 * The published totals are exact (the coordinator's call 15); per-object figures stay blurred (disclose.ts).
 */
async function scoreboard(ctx: MutationCtx, game: Doc<"v2Games">, world: number) {
  const engine = await engineOf(ctx, game._id);
  const players = await ctx.db.query("v2Players").withIndex("by_game", q => q.eq("gameId", game._id)).take(16);
  const handicap = new Map<string, number>();
  for (const p of players) {
    const r = await ctx.db.query("v2Rules").withIndex("by_game_member", q => q.eq("gameId", game._id).eq("memberId", p.memberId)).unique();
    handicap.set(p.memberId, r?.handicap ?? 0);
  }
  const rank = (totals: Record<string, number>) => players.map(p => {
    const h = handicap.get(p.memberId) ?? 0, total = totals[p.memberId] ?? 0;
    return { memberId: p.memberId, name: game.roster.find(r => r.memberId === p.memberId)?.name ?? "", total, handicap: h, net: total - (h / 100) * Math.abs(total), rank: 0 };
  }).sort((a, b) => b.net - a.net).map((r, i) => ({ ...r, rank: i + 1 }));
  const rows = rank(engine.totals);
  // Published exact (the coordinator's call 15, a declared trial departing from v1, whose totals were the disclosed
  // sums): a batched total leaks only an aggregate over all objects, and the leaderboard agrees with the final result.
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

/**
 * The starting board, at world 0: the starting objects born, valued and scored, and the first standings published.
 * Done when the game starts (lobby.ts startGame), so planning shows the board each player plans against (v1; baseline-1
 * item 3); world time starts later (startWorld). Idempotent: a game whose board exists already is left alone.
 * Returns whether it published the first standings.
 */
export async function bornAtStart(ctx: MutationCtx, game: Doc<"v2Games">): Promise<boolean> {
  const engine = await engineOf(ctx, game._id);
  if (engine.objects > 0) return false;
  const seats = await seatRules(ctx, game);
  const states = distinctBirths(game.variant, game.seed, game.settings.startingObjects);
  const changes = [];
  for (const [i, wire] of states.entries()) {
    const { objectId, values } = await addObject(ctx, game, seats, i + 1, wire, 0);
    changes.push({ number: i + 1, values });
    const seq = await appendEvent(ctx, game._id, "objectBorn", { objectId, number: i + 1, state: wire, worldSeconds: 0 });
    await ctx.db.insert("v2Log", { gameId: game._id, seq, worldSeconds: 0, kind: "born", objectId, number: i + 1, version: 1, state: wire, ...logBits(game, values) });
    await appendEvent(ctx, game._id, "values", { objectId, number: i + 1, values: values.map(({ memberId, score, rarityBits }) => ({ memberId, score, rarityBits })) });
  }
  await applyToPlayers(ctx, game._id, changes);
  // Turnover with more starting lines than the cap: the oldest retire at once (retirement-design.md).
  const cap = capOf(game.settings), live = states.map((_, i) => i + 1), drops: Drops = new Map();
  while (cap !== null && live.length > cap) await retireLine(ctx, game, live.shift()!, 0, drops);
  await applyDrops(ctx, game._id, drops);
  const clock = await clockOf(ctx, game._id);
  await ctx.db.patch(engine._id, { objects: states.length, ...(cap !== null ? { live } : {}) });
  await ctx.db.patch(clock._id, { objects: states.length });
  await scoreboard(ctx, game, 0);
  return true;
}

/**
 * Planning ends (its deadline, everyone ready, or the owner): the lease, world time and the first tick. The board was
 * born when the game started (bornAtStart); a game started before that (or a fixture) gets it here.
 */
export async function startWorld(ctx: MutationCtx, game: Doc<"v2Games">) {
  if (game.phase !== "planning") return;
  // Planning holds past its deadline until every language's sandbox is ready (readiness.ts, v1): world time then
  // starts for everyone at once, and no agent waits for a boot.
  if (!await allReady(ctx)) {
    await ensureWarm(ctx);
    await ctx.scheduler.runAfter(HOLD_MS, PLANNING_ENDS, { gameId: game._id });
    return;
  }
  const now = Date.now();
  await bornAtStart(ctx, game);
  const leaseId = crypto.randomUUID();
  const engine = await engineOf(ctx, game._id), clock = await clockOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId });
  await ctx.db.patch(clock._id, { lastTickAt: now, worldSeconds: 0 });
  // A dilated game's world runs timeScale times faster than the wall (decision 37): it ends that much sooner.
  await ctx.db.patch(game._id, { phase: "live", startedAt: now, endsAt: now + endWorldOf(game) * 1000 / timeScaleOf(game.settings) });
  await appendEvent(ctx, game._id, "phase", { phase: "live", worldSeconds: 0 });
  await ctx.scheduler.runAfter(0, TICK, { gameId: game._id, leaseId });
  await ctx.scheduler.runAfter(WATCHDOG_MS, WATCHDOG, { gameId: game._id, leaseId });
}

/** An act record without its host transcript (what a skipped act stores). */
const withoutTranscript = ({ transcript: _, ...rest }: { transcript?: unknown; [k: string]: unknown }) => rest;

/** The game ends: the lease goes, the final scoreboard and `gameEnded`, the room is free for the next game. */
export async function endGame(ctx: MutationCtx, game: Doc<"v2Games">, reason: EndReason) {
  if (game.phase === "ended") return;
  const engine = await ctx.db.query("v2Engine").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  const clock = await ctx.db.query("v2Clocks").withIndex("by_game", q => q.eq("gameId", game._id)).unique();
  if (engine && clock) {
    await ctx.db.patch(engine._id, { leaseId: "" });
    const rows = await scoreboard(ctx, game, clock.worldSeconds);
    await ctx.db.patch(game._id, { phase: "ended", endedAt: Date.now(), endReason: reason, summary: { winner: rows[0]?.memberId ?? null, objects: engine.objects, acts: engine.acts } });
    await appendEvent(ctx, game._id, "gameEnded", { worldSeconds: clock.worldSeconds, standings: rows.map(r => ({ memberId: r.memberId, total: r.total, net: r.net, rank: r.rank })) });
    await ctx.scheduler.runAfter(0, BUILD_REPLAY, { gameId: game._id });
    // An ended game is fully transparent: each player's values, sorts, scatter and (paid) knowledge become exact.
    for (const s of game.roster) await ctx.scheduler.runAfter(0, EXACT_VALUES, { gameId: game._id, memberId: s.memberId });
  } else {
    // A game with no engine or clock (a seeded fixture: v2/testing seedGame) has no world to score or record: it just ends.
    await ctx.db.patch(game._id, { phase: "ended", endedAt: Date.now(), endReason: reason, summary: { winner: null, objects: 0, acts: 0 } });
  }
  const room = (await ctx.db.get(game.roomId))!;
  if (room.gameId === game._id) await ctx.db.patch(room._id, { gameId: undefined, revision: room.revision + 1 });
  // Who joined while it ran watched it; the next game seats them.
  for (const m of await ctx.db.query("v2Members").withIndex("by_room", q => q.eq("roomId", room._id)).take(16))
    if (m.seatNext) await ctx.db.patch(m._id, { spectator: false, seatNext: undefined });
}

/** Parks a live game for idleness: paused with no owner's pause used, resumed by the next human activity. */
export async function parkGame(ctx: MutationCtx, game: Doc<"v2Games">) {
  const engine = await engineOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId: "" });
  await ctx.db.patch(game._id, { phase: "paused", parked: true, endsAt: undefined });
  await appendEvent(ctx, game._id, "phase", { phase: "paused", parked: true });
}

/** v1's pause length when the room sets none, wall seconds (archive settings.ts pauseSeconds). */
export const DEFAULT_PAUSE_SECONDS = 180;
const PAUSE_ENDS = makeFunctionReference<"mutation", { gameId: Id<"v2Games">; pauseEndsAt: number }>("v2/loop:pauseEnds");

/** A player's pause (one each): it ends by itself after the game's pauseSeconds (v1), or earlier when the owner resumes. */
export async function pauseGame(ctx: MutationCtx, game: Doc<"v2Games">, by: Id<"v2Members">) {
  const engine = await engineOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId: "" });
  const pauseEndsAt = Date.now() + (game.settings.pauseSeconds ?? DEFAULT_PAUSE_SECONDS) * 1000;
  // No countdown to the world's end while paused: it is set again on resume from the world time left.
  await ctx.db.patch(game._id, { phase: "paused", pausedBy: by, pauseEndsAt, endsAt: undefined });
  await appendEvent(ctx, game._id, "phase", { phase: "paused", by, pauseEndsAt });
  await ctx.scheduler.runAt(pauseEndsAt, PAUSE_ENDS, { gameId: game._id, pauseEndsAt });
}

/** A player's pause runs out (v1): the game resumes, unless it was resumed, re-paused or ended meanwhile. */
export const pauseEnds = internalMutation({
  args: { gameId: v.id("v2Games"), pauseEndsAt: v.number() },
  handler: async (ctx, { gameId, pauseEndsAt }) => {
    const game = await ctx.db.get(gameId);
    if (game?.phase === "paused" && !game.parked && game.pauseEndsAt === pauseEndsAt) await resumeGame(ctx, game);
  },
});

export async function resumeGame(ctx: MutationCtx, game: Doc<"v2Games">) {
  const leaseId = crypto.randomUUID(), now = Date.now();
  const engine = await engineOf(ctx, game._id), clock = await clockOf(ctx, game._id);
  await ctx.db.patch(engine._id, { leaseId });
  await ctx.db.patch(clock._id, { lastTickAt: now });
  await ctx.db.patch(game._id, { phase: "live", pausedBy: undefined, pauseEndsAt: undefined, endsAt: now + Math.max(0, endWorldOf(game) - clock.worldSeconds) * 1000 / timeScaleOf(game.settings) });
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
      if (engine.failures + 1 >= MAX_FAILURES) { await endGame(ctx, game, "retired"); return; }
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

/** At most this many objects' states a tick reads for its `occupied` view (games stay far below it). */
const MAX_HELD = 8000;
/**
 * Live agents a tick reads a page at a time. A game holds at most 8 players × 200 agents (MAX_PLAYERS × MAX_AGENTS,
 * call 35) = 1,600; a page reads 3 documents an agent (the agent, its energy, its current program of ≤ 16 KiB), so at
 * worst 300 documents and about 1.7 MiB, inside a query's limits (16,384 documents, 8 MiB) beside the snapshot's
 * ≤ 8,000 held states; a full game is the snapshot and 15 more pages.
 */
export const TICK_AGENT_PAGE = 100;
/** Samples an agent's energy row keeps for the sparkline (one a tick at most: at the default ~1 s ticks, two minutes). */
export const AGENT_HISTORY = 120;

/** One page of a game's live agents with their programs and energy, as the tick runs them. */
async function tickAgentsPage(ctx: QueryCtx, gameId: Id<"v2Games">, cursor: string | null) {
  const page = await ctx.db.query("v2Agents").withIndex("by_game_live", q => q.eq("gameId", gameId).eq("destroyedAt", undefined))
    .paginate({ cursor, numItems: TICK_AGENT_PAGE });
  const agents = [];
  for (const a of page.page) {
    const e = (await ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", a._id)).unique())!;
    const program = await programOf(ctx, a);
    agents.push({ agentId: a._id, memberId: a.memberId, language: a.language, source: program.source, version: a.version, share: a.share, energy: e.energy, settledAt: e.settledAt });
  }
  return { agents, cursor: page.isDone ? null : page.continueCursor };
}

/** The live agents after `cursor` (the snapshot's `agentsCursor`; null for the first page), a page at a time. */
export const tickAgents = internalQuery({
  args: { gameId: v.id("v2Games"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { gameId, cursor }) => await tickAgentsPage(ctx, gameId, cursor),
});

/** The objects of the live lines, oldest first (turnover: at most the cap point reads). */
async function liveObjectIds(ctx: QueryCtx, gameId: Id<"v2Games">, live: readonly number[]) {
  const out: string[] = [];
  for (const n of live) out.push((await ctx.db.query("v2Objects").withIndex("by_game", q => q.eq("gameId", gameId).eq("number", n)).unique())?._id ?? "");
  return out;
}

/** What a tick needs: the clock, the economy, the first page of live agents with their programs and energy, the rules. */

export const snapshot = internalQuery({
  args: { gameId: v.id("v2Games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const engine = await engineOf(ctx, gameId), clock = await clockOf(ctx, gameId);
    const first = await tickAgentsPage(ctx, gameId, null);
    return {
      phase: game.phase, seed: game.seed, variant: game.variant, settings: game.settings, endsAt: game.endsAt ?? null, endWorld: endWorldOf(game), leaseId: engine.leaseId, tick: engine.tick,
      acts: engine.acts, objects: engine.objects, worldSeconds: clock.worldSeconds, lastTickAt: clock.lastTickAt,
      // Line turnover: the live lines, oldest first (absent: every number up to `objects`); when retired lines release
      // their states, each live line's object, so the tick frees the states of the lines its births retire.
      ...(engine.live ? { live: engine.live } : {}),
      ...(engine.live && game.settings.turnover && !game.settings.turnover.retiredHolds ? { liveObjectIds: await liveObjectIds(ctx, gameId, engine.live) } : {}),
      // The first page of live agents; the tick reads the rest with `tickAgents` from `agentsCursor` (null: none left).
      seats: await seatRules(ctx, game), agents: first.agents, agentsCursor: first.cursor,
      // Languages whose sandbox has booted: the tick skips the others' agents rather than wait (readiness.ts).
      ready: (await Promise.all(LANGUAGES.map(async l => (await isReady(ctx, l) ? l : null)))).filter(l => l !== null),
      // Decision 24: every object's state (the tick's `occupied`), and the disclosure noise's key (the tick's `disclosed`).
      held: (await holdingRows(ctx, gameId).take(MAX_HELD)).map(s => ({ objectId: s.objectId, state: s.state })),
      noiseKey: game.noiseKey ?? null,
    };
  },
});

/**
 * What players' agents are told about lines they may be offered (lib/v2-agents HostInput), for each player and line
 * asked: the player's own value on it as of the last commit, and the last moves on it the player may see (their own,
 * and others' that changed their points). Read for a tick's offered lines in a few batches; recorded with each act,
 * so replay re-executes from the record.
 */
export const actInputs = internalQuery({
  args: { gameId: v.id("v2Games"), memberIds: v.array(v.id("v2Members")), objectIds: v.array(v.id("v2Objects")) },
  handler: async (ctx, { gameId, memberIds, objectIds }) => {
    const out: { memberId: string; objectId: string; value?: { mine: number; others: number; points: number }; history: { mine: boolean; pointsBefore: number; pointsAfter: number }[] }[] = [];
    for (const objectId of objectIds) for (const memberId of memberIds) {
      // One document a pair: the value row carries the last moves that concerned this player (changeObject).
      const val = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", objectId).eq("memberId", memberId)).unique();
      // Exact here: the tick measures it afresh for each act (decision 32; tick.ts), as its agent reads it.
      out.push({ memberId, objectId, ...(val ? { value: { mine: val.rarityBits, others: val.want, points: val.points } } : {}), history: val?.recent ?? [] });
    }
    return out;
  },
});
/** Moves on the offered line an agent is told of, at most. */
export const HISTORY = 8;

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
  /** What the agent was told of its owner's stake in the line (actInput), recorded so replay re-executes exactly. */
  input: v.optional(v.any()),
});

/**
 * One tick's commit. Births first, then the acts in order: each act's state change (only when the object is still at
 * the version the act saw), its charge on the agent's settled account, every player's values, the moves rows of the
 * players it concerns, and its events. Then digests and totals, the clock, the scoreboard on its cadence, the end
 * when world time is up, and the next tick.
 */
export const commit = internalMutation({
  args: { gameId: v.id("v2Games"), leaseId: v.string(), world: v.number(), now: v.number(), born: v.array(v.array(v.string())), acts: v.array(actV), picks: v.number() },
  handler: async (ctx, a) => {
    const game = await ctx.db.get(a.gameId);
    const engine = game && await engineOf(ctx, a.gameId);
    if (!game || !engine || game.phase !== "live" || engine.leaseId !== a.leaseId) return { committed: false };
    if (engine.failures) await ctx.db.patch(engine._id, { failures: 0 });
    const clock = await clockOf(ctx, game._id), seats = await seatRules(ctx, game);
    const world = Math.max(clock.worldSeconds, Math.min(a.world, endWorldOf(game)));
    const changes: { number: number; values: Value[]; before?: Map<string, Value> }[] = [];
    const tugMoves: TugMove[] = [];
    // Acts are numbered by the tick's opportunities (their seeds are `act:<n>`), whether or not each one ran.
    let objects = engine.objects, acts = engine.acts + a.picks, moves = engine.moves;
    // Line turnover (retirement-design.md): the live lines, oldest first; a birth that would pass the cap retires the
    // oldest first. Off (no cap): the engine keeps no list.
    const cap = capOf(game.settings);
    let live = cap === null ? null : liveLines(engine);
    const retiredNow = new Set<number>(), drops: Drops = new Map();

    for (const draws of a.born) {
      // The first draw no object holds (decision 24); none of them free (vanishingly rare): no birth. Placed against the
      // holders before this birth's retirement, as the tick predicts it.
      let wire: string | undefined;
      for (const d of draws) if (!await holderOf(ctx, game._id, d)) { wire = d; break; }
      if (wire === undefined) continue;
      // Turnover: the oldest live lines retire before the birth that would pass the cap.
      while (live !== null && cap !== null && live.length >= cap) {
        const n = live.shift()!;
        await retireLine(ctx, game, n, world, drops);
        retiredNow.add(n);
      }
      const number = ++objects;
      live?.push(number);
      const { objectId, values } = await addObject(ctx, game, seats, number, wire, world);
      changes.push({ number, values });
      const bornSeq = await appendEvent(ctx, game._id, "objectBorn", { objectId, number, state: wire, worldSeconds: world });
      await ctx.db.insert("v2Log", { gameId: game._id, seq: bornSeq, worldSeconds: world, kind: "born", objectId, number, version: 1, state: wire, ...logBits(game, values) });
      await appendEvent(ctx, game._id, "values", { objectId, number, values: values.map(({ memberId, score, rarityBits }) => ({ memberId, score, rarityBits })) });
    }

    await applyDrops(ctx, game._id, drops);
    const P = game.settings.economy;
    for (const act of a.acts) {
      const agent = await ctx.db.get(act.agentId);
      const energy = await ctx.db.query("v2AgentEnergy").withIndex("by_agent", q => q.eq("agentId", act.agentId)).unique();
      if (!agent || agent.destroyedAt !== undefined || !energy) continue;   // destroyed since the tick read it
      if (retiredNow.has(act.number)) continue;   // retired by this commit's births (the tick offers none such)
      const record = act.record as { outcome: string; after: string; before: string; charge: number; readBits: number; calls: { mutator: string; site: number; args: Record<string, string>; rep: string }[]; reason?: string; notes?: string[] };
      const st = (await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", act.objectId)).unique())!;
      const income = agentIncome(P.powerPerSecond, agent.share), capacity = energyCapacity(income, P.fullChargeSeconds);
      const account: Account = settle({ balance: energy.energy, settledWorldSeconds: energy.settledAt }, world, income, capacity);
      // What happened (spec §6.1, docs/energy-model.md §7.2): a change commits only on the state it was made on, and
      // only if paying for it leaves the agent owing at most its capacity; otherwise it pays for its reads alone.
      const verdict = act.verdict as "committed" | "stale" | "unaffordable" | "skipped" | "failed";
      const current = verdict === "committed" && st.version === act.version;
      // Decision 24: a move onto a state another object holds is refused like an invalid call (it pays its reads).
      const holder = current ? await holderOf(ctx, game._id, record.after, act.objectId) : null;
      const committed = current && !holder;
      const outcome = holder ? "failed" : verdict === "committed" && !committed ? "stale" : verdict;
      const charge = committed || outcome === "skipped" || (outcome === "failed" && !holder) ? record.charge : readCharge(record.readBits);
      const charged = chargeAct(account, charge);
      // v1's split of the spend: what the reads cost (paid whatever happened) and the rest, the change (committed acts only).
      const readPart = Math.min(charge, readCharge(record.readBits)), changePart = charge - readPart;
      const n = act.n;
      // The sparkline's sample: the balance after this act (a later act in the same tick replaces it).
      const kept = (energy.history ?? []).filter(h => h.at < world);
      const history = [...kept, { at: world, energy: charged.balance }].slice(-AGENT_HISTORY);
      await ctx.db.patch(energy._id, {
        energy: charged.balance, settledAt: charged.settledWorldSeconds, acts: energy.acts + 1, spend: energy.spend + charge, lastActAt: world, history,
        spendRead: (energy.spendRead ?? 0) + readPart, spendChange: (energy.spendChange ?? 0) + changePart,
        lastAct: { at: world, read: readPart, change: changePart, outcome },
        ...(outcome === "skipped" ? { skips: energy.skips + 1 } : outcome === "failed" ? { failures: energy.failures + 1 } : {}),
      });
      const actSeq = await appendEvent(ctx, game._id, "act", {
        n, tick: engine.tick, worldSeconds: world, objectId: act.objectId, number: act.number, agentId: act.agentId, memberId: act.memberId,
        seed: act.seed, energy: act.energy, liveObjects: act.liveObjects, program: { version: act.programVersion, language: agent.language },
        ...(act.input ? { input: act.input } : {}),
        // A skip keeps no transcript (the coordinator, 15 Nov: 3.3 KB of each act event, and act events were 95% of a
        // game's writes); an act that moved or failed keeps it. Any act can be re-run from its seed and inputs.
        ...(outcome === "skipped" ? withoutTranscript(record) : record), ...(outcome !== record.outcome ? { outcome, after: record.before, charged: charge } : {}),
        ...(holder ? { reason: heldReason(game.variant, holder.number) } : {}),
      });
      // Owner decision 36: "Players should still know everything their agents learn for free". Every act an agent runs
      // on an object tells its owner the object as the agent saw it, with the agent's own measurement of its value (a
      // change commits below and tells it as changed). A stale act saw an older version: nothing newer to tell.
      if (!committed && paysToRead(game) && st.version === act.version) {
        const row = await ctx.db.query("v2ObjectValues").withIndex("by_object_member", q => q.eq("objectId", act.objectId).eq("memberId", act.memberId as Id<"v2Members">)).unique();
        const seen = (act.input as { value?: { mine: number; others: number; points: number } } | undefined)?.value;
        if (row) await tell(ctx, game, act.memberId as Id<"v2Members">, { objectId: act.objectId, number: act.number, state: st.state, version: st.version, score: row.score, rarityBits: row.rarityBits, ...(seen ? agentSeen(row, seen) : measured(game, row)) }, world);
      }
      if (!committed) continue;
      const { before, after } = await changeObject(ctx, game, seats, act.objectId, record.after, world, act.memberId);
      changes.push({ number: act.number, values: after, before });
      // The mover is told the object its agent changed, free (decision 36).
      if (paysToRead(game)) {
        const mine = after.find(x => x.memberId === act.memberId)!;
        await tell(ctx, game, act.memberId as Id<"v2Members">, { objectId: act.objectId, number: act.number, state: record.after, version: st.version + 1, score: mine.score, rarityBits: mine.rarityBits, ...measured(game, mine) }, world);
      }
      const was = logBits(game, [...before.values()]), now = logBits(game, after);
      await ctx.db.insert("v2Log", {
        gameId: game._id, seq: actSeq, worldSeconds: world, kind: "move", objectId: act.objectId, number: act.number, version: st.version + 1,
        stateBefore: record.before, state: record.after, bits: now.bits, bitsBefore: was.bits,
        by: act.memberId as Id<"v2Members">, agentId: act.agentId, calls: record.calls.map(c => ({ mutator: c.mutator, site: c.site, args: c.args })), charge,
      });
      await appendEvent(ctx, game._id, "values", { objectId: act.objectId, number: act.number, values: after.map(({ memberId, score, rarityBits }) => ({ memberId, score, rarityBits })) });
      // What the agent gained as its owner is shown it (disclosed points; the record holds the exact values).
      const gained = (after.find(x => x.memberId === act.memberId)?.shownPoints ?? 0) - (before.get(act.memberId)?.shownPoints ?? 0);
      await ctx.db.patch(energy._id, { pointsGained: energy.pointsGained + gained });
      const program = await ctx.db.query("v2AgentPrograms").withIndex("by_agent", q => q.eq("agentId", agent._id).eq("version", agent.version)).unique();
      if (program) await ctx.db.patch(program._id, { acts: program.acts + 1, pointsGained: program.pointsGained + gained });
      const seq = moves++;
      for (const val of after) {
        const was = before.get(val.memberId)!;
        const mine = val.memberId === act.memberId;
        if (!concerns(mine, was.points, val.points)) continue;
        tugMoves.push({ memberId: val.memberId as Id<"v2Members">, objectId: act.objectId, number: act.number, mine, by: act.memberId as Id<"v2Members">, charge: mine ? charge : 0, world, state: record.after, points: val.shownPoints });
        await ctx.db.insert("v2Moves", {
          gameId: game._id, memberId: val.memberId as Id<"v2Members">, seq, worldSeconds: world, objectId: act.objectId, number: act.number,
          ...(mine ? { agentId: act.agentId, charge, ...(record.notes?.length ? { notes: record.notes } : {}) } : {}), mine, by: act.memberId as Id<"v2Members">,
          calls: record.calls.map(c => ({ mutator: c.mutator, site: c.site, args: c.args })), rep: record.calls[0]?.rep ?? "",
          stateBefore: record.before, stateAfter: record.after,
          before: { score: was.score, rarityBits: was.rarityBits, want: was.want, points: was.points, shownWant: was.shownWant, shownPoints: was.shownPoints },
          after: { score: val.score, rarityBits: val.rarityBits, want: val.want, points: val.points, shownWant: val.shownWant, shownPoints: val.shownPoints },
        });
      }
    }
    await applyToPlayers(ctx, game._id, changes);
    await foldTugs(ctx, game._id, tugMoves);
    // Parameter drift on its schedule (drift.ts): before the scoreboard, so standings follow at the next interval.
    const due = driftEventsDue(driftSecondsOf(game), game.roster.length, world, engine.drifts ?? 0, durationModeOf(game) === "fixed" ? endWorldOf(game) : null);
    if (due.length) await driftRules(ctx, game, world, due);

    await ctx.db.patch(engine._id, { tick: engine.tick + 1, objects, acts, moves, ...(live !== null ? { live } : {}) });
    await ctx.db.patch(clock._id, { tick: clock.tick + 1, worldSeconds: world, lastTickAt: a.now, objects, commits: clock.commits + 1 });
    const fresh = (await ctx.db.get(game._id))!;
    if (world >= endWorldOf(game)) { await endGame(ctx, fresh, "lifetime"); return { committed: true, ended: true }; }
    if (world - engine.scoreboardAt >= scoreIntervalOf(game)) await scoreboard(ctx, fresh, world);
    // Nobody has acted for 30 minutes (activity.ts, v1's idle parking): park, so ticks cost nothing until someone returns.
    if (await shouldPark(ctx, fresh)) { await parkGame(ctx, fresh); return { committed: true, ended: false }; }
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
      if (game) await endGame(ctx, game, "retired");
      return;
    }
    await ctx.scheduler.runAfter(TICK_MS, TICK, { gameId, leaseId });
  },
});

/**
 * At the end everything is open and exact, for one player: their value rows' disclosed fields become the exact ones
 * (the list sorts keep reading the same index: objectOrder.ts), their scatter shows the exact sums, and in a paid
 * game they are told every object as it is, exact (their list keeps reading their knowledge: knowledge.ts listsKnowledge).
 */
export const exactValues = internalMutation({
  args: { gameId: v.id("v2Games"), memberId: v.id("v2Members") },
  handler: async (ctx, { gameId, memberId }) => {
    const game = (await ctx.db.get(gameId))!;
    const paid = paysToRead(game), world = (await clockOf(ctx, gameId)).worldSeconds;
    const digest = await ctx.db.query("v2Digests").withIndex("by_game_member", q => q.eq("gameId", gameId).eq("memberId", memberId)).unique();
    const packed = digest ? [...digest.packed] : [];
    for await (const r of ctx.db.query("v2ObjectValues").withIndex("by_game_member_born", q => q.eq("gameId", gameId).eq("memberId", memberId))) {
      // The filter follows the exact others' sum from here, as the sorts do (a filtered list re-runs on the same index).
      const quadrant = quadrantOf(r.rarityBits, r.want);
      if (r.shownWant !== undefined && (r.shownWant !== r.want || r.shownPoints !== r.points || r.quadrant !== quadrant)) await ctx.db.patch(r._id, { shownWant: r.want, shownPoints: r.points, quadrant });
      const at = 3 * (r.number - 1);
      while (packed.length < at) packed.push(0);
      packed.splice(at, 3, r.number, r.rarityBits, r.want);
      if (!paid) continue;
      const st = await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", r.objectId)).unique();
      if (!st) continue;
      const told = { state: st.state, version: st.version, score: r.score, rarityBits: r.rarityBits, want: r.want, points: r.points, quadrant };
      const known = await ctx.db.query("v2Knowledge").withIndex("by_object_member", q => q.eq("objectId", r.objectId).eq("memberId", memberId)).unique();
      if (known) await ctx.db.patch(known._id, told);   // learnedAt kept: the "recent" sort stays the order of telling
      else await ctx.db.insert("v2Knowledge", { gameId, memberId, objectId: r.objectId, number: r.number, learnedAt: world, ...told, ...(r.retired ? { retired: true as const } : {}) });
    }
    if (digest) await ctx.db.patch(digest._id, { packed, version: digest.version + 1 });
  },
});
