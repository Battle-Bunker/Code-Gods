"use node";
/**
 * The engine tick (plan §3.1): read one snapshot, simulate the window (lastTick, now] capped at one tick
 * window, and commit it through ONE mutation (engine/loop.ts:commit), which schedules the next tick.
 *
 * Opportunities run at most interactionRateHz × Δt (stochastically rounded, never accumulated: no
 * interaction debt), each sequentially against an in-memory copy of the world, exactly as the Express
 * engine's semantics: pick the target object (uniform/shelter), then an agent with probability proportional to
 * its positive energy (settled to the opportunity's world time; one draw over all agents, docs/energy-model.md §7)
 * with a CSPRNG, run the act with the season-salted seed
 * deriveSeed(salt, ["play", gameId, agentId, actIndex]), applyCalls, enforce uniqueness (onto any existing
 * value, the object's own included, fails), apply the commit clause, charge the act (the bits it read at READ_PRICE,
 * the offer itself counted as a read of which object it was given: §7.1, plus its change when that commits: §2) and score
 * the result. An act that returns no calls is skipped: not a failure.
 *
 * Throughput: up to WORKERS acts run concurrently in a "wave", but a wave never holds the same object or
 * agent twice (as the Express engine reserved them), and results are applied strictly in opportunity order,
 * so the outcome is the sequential one. An agent in the wave stays in the draw (its weight does not depend on how many
 * agents its god runs): when it is drawn again the wave is applied first, and the offer stays with it with probability
 * (its energy after that act) ÷ (the energy it was drawn at), else the draw is repeated: the sequential draw exactly.
 */
import { v } from "convex/values";
import { actCredit, affordable, chargeAct, instantiationOf, isLanguage, offerReadBits, pickByEnergy, poissonIntervalSeconds, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { actCharge, applyCalls, deriveSeed, failedReadBits, isSkip, objectType, readBound, type ActOutcome, type MutatorCallWire } from "@workspace/game-types";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { isIdle } from "../lib/rooms";
import { gameScoringTables } from "./pinned";
import { disclosureNoise, openUniform, scoresOf, seasonSalt, uniform01, uniqueSpawn } from "./node";
import { act, bindRuntime, ensureSandboxes, isAgentFault, runtimeVersion, WORKERS } from "./runtime";
import { effectiveSandbox, planningEnd } from "../lib/sandboxes";
import { FutileMemo, NO_FAILURES, failureKind, futileAfter, pickPair, unaffordableReason, type ActKind } from "../lib/futility";
import { agentCapacityOf } from "../lib/power";
import { MAX_OBJECTS, MIN_TICK_MS, TICK_SECONDS, planSpawns, agentStatus, pickObject, salienceOf, secondsUntilEligible, settledAccount, commitRaises, disclosedTotalsOf, scoreIntervalOf, scoreboardDue, totalsOf } from "../lib/world";
import { godTotalsOf } from "../lib/views";
import { paidLive, readWhole } from "../lib/knowledge";

type Score = Doc<"objects">["scores"][number];
type Ev = Doc<"tickBatches">["events"][number];
/** One act's runtime result: its calls, or the agent's own error; either way the bits it read (docs/energy-model.md §3.4). */
type ActResult = ({ calls: string; usedRandom: boolean } | { error: string }) & { readBits: number };

/** The previous commit's round trip per game (module scope: a warm instance reports it with the next commit). */
const lastCommitMs = new Map<string, number>();

/** How often a planning phase held for a warming (or failed: its retries back off) sandbox checks again. */
const HOLD_POLL_MS = 1000;
const HOLD_FAILED_POLL_MS = 5000;
/** The longest planning waits for hold rarity's corrections (docs/energy-model.md §8), from the start. */
const HOLD_MAX_MS = 10 * 60_000;

/** Wall-clock budget for one window's simulation: opportunities past it are dropped (no debt). */
const MAX_SIMULATE_MS = 4000;

const net = (scores: readonly Score[], roster: readonly string[]) => roster.map(id => scores.find(s => s.god === id)?.netBits ?? 0);

/** The outcome of one act on `before`: applyCalls, or a failure when the runtime refused it (the agent's fault). */
function actOutcome(settings: GameSettings, before: ObjectValue, result: ActResult): ActOutcome {
  if ("error" in result) return { ok: false, reason: result.error, cost: { work: 0, total: 0 } };
  const inst = instantiationOf(settings);
  return applyCalls(objectType(inst.objectType), inst, before, result.calls);
}

export const run = internalAction({
  args: { gameId: v.id("games"), seq: v.number() },
  handler: async (ctx, { gameId, seq }): Promise<unknown> => {
    try {
      return await tick(ctx, gameId, seq);
    } catch (error) {
      // Never a silent stall: the game shows the failure and retries with backoff (engine/loop.ts tickFailed).
      const message = error instanceof Error ? `${error.message}${error.stack ? `\n${error.stack.split("\n").slice(1, 4).join("\n")}` : ""}` : String(error);
      await ctx.runMutation(internal.engine.loop.tickFailed, { gameId, seq, message: message.slice(0, 2000) });
      return { result: "failed", message: message.slice(0, 300) };
    }
  },
});

async function tick(ctx: ActionCtx, gameId: Id<"games">, seq: number): Promise<unknown> {
    await bindRuntime(ctx);
    const snap = await ctx.runQuery(internal.engine.loop.snapshot, { gameId, seq });
    if (!snap) return { result: "stale" };
    const { game } = snap;
    const settings = game.settings as GameSettings;
    const base = {
      gameId, seq, epoch: game.executionEpoch, phaseBefore: game.phase, lastTickBefore: game.lastTick,
      objects: [], spawns: [], agents: [], events: [], stats: { opportunities: 0, acts: 0, simulateMs: 0 },
    };
    if (game.phase === "ended" || game.phase === "recovery") return { result: "stopped" };
    const now = Date.now();
    if (isIdle(snap.lastActivity, now)) return ctx.runMutation(internal.engine.loop.commit, { ...base, kind: "park" });

    // Clock: planning and pauses end at their deadline; world time then runs from that deadline.
    let phase: Doc<"games">["phase"] = game.phase, lastTick = game.lastTick;
    const events: Ev[] = [];
    // Agent sandboxes (lib/sandboxes.ts): a language not ready yet holds planning past its deadline (world time starts for
    // everyone once all can run) and, later, sits out the window; a due warm-up is scheduled either way.
    const sandboxes = snap.sandboxes.map(({ language, row }) => ({ language, ...effectiveSandbox(row, runtimeVersion(language)), readyAt: row?.readyAt }));
    const unready = new Set(sandboxes.filter(s => s.state !== "ready").map(s => s.language));
    if (unready.size) await ensureSandboxes(ctx, [...unready]);
    if (phase === "planning" || phase === "paused") {
      const deadline = phase === "planning" ? game.planningEndsAt : game.pauseEndsAt;
      if (now < deadline) return ctx.runMutation(internal.engine.loop.commit, { ...base, kind: "wait" });
      // Hold rarity's corrections (engine/hold.ts) hold planning the same way, until computed (or failed). Actions run at
      // most once: one that died without a word (a timeout, a restart) would hold planning for ever, so past
      // HOLD_MAX_MS from the start the game plays on static rarity.
      if (phase === "planning" && game.holdState === "computing" && now - game.createdAt > HOLD_MAX_MS) {
        await ctx.runMutation(internal.engine.holdData.failed, { gameId, message: `Not computed within ${HOLD_MAX_MS / 60_000} minutes of the start` });
        return ctx.runMutation(internal.engine.loop.commit, { ...base, kind: "wait", wakeAt: now + HOLD_POLL_MS });
      }
      const hold = game.holdState === undefined ? [] : [{ state: game.holdState === "computing" ? "warming" as const : "ready" as const, readyAt: game.holdReadyAt }];
      const end = phase === "planning" ? planningEnd(deadline, [...sandboxes, ...hold]) : { at: deadline };
      if ("hold" in end) {
        const failed = sandboxes.some(s => s.state === "failed");
        return ctx.runMutation(internal.engine.loop.commit, { ...base, kind: "wait", wakeAt: now + (failed ? HOLD_FAILED_POLL_MS : HOLD_POLL_MS) });
      }
      // Not before lastTick: a game whose ticks failed past its deadline starts its world at the retry (loop.ts tickFailed).
      phase = "running"; lastTick = Math.max(game.lastTick, Math.min(now, end.at));
      events.push({ t: "phase", phase: "running", world: game.worldSeconds });
    }
    // The game's own tables (engine/pinned.ts), pinned at its start (or by its first simulating tick, for a game started
    // before pinning): a deploy that re-keys the shipped tables never reaches a game in progress.
    const deals = snap.deities.map(d => ({ godId: d.godId, utility: d.utility as UtilityDescriptor }));
    const tables = await gameScoringTables(ctx, game, deals);
    const started = performance.now();
    const target = game.worldSeconds + Math.max(0, now - lastTick) / 1000;
    const until = Math.min(target, game.endAtWorld);
    const windowStart = Math.max(game.worldSeconds, until - TICK_SECONDS);
    const windowLength = Math.max(0, until - windowStart);

    // The in-memory world.
    const roster = snap.deities.map(d => d.godId);
    const objects = snap.objects.map(o => ({ ...o, fromVersion: o.version, changed: false, noise: o.noise }));
    const occupied = new Set<ObjectValue>(objects.map(o => o.value));
    // Which object holds each value (a collision remembers its holder: lib/futility.ts), and each object's version.
    const holders = new Map<ObjectValue, typeof objects[number]>(objects.map(o => [o.value, o]));
    const byId = new Map(objects.map(o => [o.id, o]));
    const versionOf = (id: string) => byId.get(id)?.version;
    // The futile pairs: an agent is never offered an object its deterministic act can only fail on.
    const futile = new FutileMemo(snap.futile);
    // An agent whose sandbox is not ready sits the window out: never picked, never charged, its energy still accrues.
    // A past game's agent in a retired language (game-core RETIRED_LANGUAGES) sits out too: it can no longer act.
    const agents = snap.agents.filter(a => isLanguage(a.language) && !unready.has(a.language)).map(a => ({ ...a, failures: { ...NO_FAILURES, ...a.failures }, lastFailures: { ...a.lastFailures }, fromActs: a.acts, touched: false }));
    const salt = seasonSalt();
    const readCap = readBound(instantiationOf(settings));
    // Paid observation (lib/knowledge.ts): which gods this window tells which objects (their agents changed the object,
    // or an act of theirs read all of it). The read-model sync rewrites only those gods' rows.
    const paid = paidLive(game);
    const told = new Map<string, Set<string>>();
    const tell = (objectId: string, godId: string) => { if (paid) told.set(objectId, (told.get(objectId) ?? new Set()).add(godId)); };

    // Opportunities: rate × Δt, stochastically rounded; spread evenly over the window.
    const expected = settings.interactionRateHz * windowLength;
    const count = agents.length && objects.length ? Math.floor(expected) + (uniform01() < expected - Math.floor(expected) ? 1 : 0) : 0;
    /** `offerBits`: what the offer told the agent, which of the live objects it holds (§7.1); read bits like the meter's. */
    type Pending = { object: typeof objects[number]; agent: typeof agents[number]; world: number; before: ObjectValue; seed: bigint; offerBits: number };
    let wave: Pending[] = [];
    let acts = 0, opportunities = 0, applied = 0, exhausted: string | null = null;

    const apply = (p: Pending, result: ActResult | null) => {
      if (!result) return; // a host failure (capacity, unavailable): not the agent's fault, nothing is charged
      applied++;
      const { object, agent } = p;
      if ("calls" in result && readWhole(result.readBits, readCap)) tell(object.id, agent.ownerId);
      // Every offer is a read (§7.1): the agent learned which object it holds, whatever it then looked at or did.
      const readBits = result.readBits + p.offerBits;
      if ("calls" in result && isSkip(result.calls)) {
        // Skipped (docs/energy-model.md §2): it read, chose not to act, and pays its reads; not a failure, never futile.
        const cost = actCharge(null, readBits);
        agent.account = chargeAct(settledAccount(settings, agent, p.world), cost.total);
        agent.acts++; agent.skips++; agent.spent += cost.total; agent.spentRead += cost.read; agent.touched = true; acts++;
        events.push({ t: "skip", objectId: object.id, world: p.world, agentId: agent.id, ownerId: agent.ownerId, cost, seed: p.seed.toString() });
        return;
      }
      let outcome = actOutcome(settings, p.before, result);
      let next: Score[] | undefined;
      if (outcome.ok && outcome.commit) {
        // The commit clause: commit only if the act strictly raises the owner's payoff on this object as the owner sees it
        // (the others' sums with their values' disclosure noise: no side channel to the exact sums).
        if (!settings.commitClause) outcome = { ok: false, reason: "this room does not offer the commit clause", cost: outcome.cost };
        else if (!occupied.has(outcome.value)) {
          next = scoresOf(tables, settings, deals, outcome.value);
          if (!commitRaises(object.scores, next, agent.ownerId, object.noise ?? 0, disclosureNoise(settings, game.noiseKey, outcome.value))) {
            outcome = { ok: false, reason: "the commit clause kept the object: it would not raise your points", cost: outcome.cost };
          }
        }
      }
      const duplicate = outcome.ok && occupied.has(outcome.value); // includes the object's own value
      let cost = actCharge(outcome, readBits, { commits: !duplicate });
      const settled = settledAccount(settings, agent, p.world);
      // No credit (§7.2): a change the agent cannot pay for does not commit; it pays its reads, like any change that does
      // not commit. (A game from before capacities keeps its debt: actCredit is then unbounded.)
      if (outcome.ok && !duplicate && !affordable(settled.balance, cost.total, actCredit(agentCapacityOf(agent, settings)))) {
        outcome = { ok: false, reason: unaffordableReason(cost.total, settled.balance), cost: outcome.cost };
        cost = actCharge(outcome, readBits);
      }
      agent.account = chargeAct(settled, cost.total);
      agent.acts++; agent.spent += cost.total; agent.spentRead += cost.read; agent.touched = true; acts++;
      const kind: ActKind = "error" in result ? "error" : !outcome.ok ? failureKind(outcome.reason) : duplicate ? "collision" : "transform";
      if (kind === "transform") agent.transforms++;
      else {
        agent.failures[kind]++;
        // The last invalid call or runtime error, verbatim (the other kinds say all there is): the diagnosis quotes it.
        if (kind === "invalid" || kind === "error") agent.lastFailures[kind] = ("error" in result ? result.error : outcome.ok ? "" : outcome.reason).slice(0, 300);
      }
      const holder = outcome.ok && duplicate ? holders.get(outcome.value) : undefined;
      futile.record(agent.id, object.id, futileAfter({ object, deterministic: "calls" in result && !result.usedRandom, kind,
        ...(holder ? { holder: { id: holder.id, version: holder.version } } : {}) }));
      if (outcome.ok && !duplicate) {
        occupied.delete(object.value); occupied.add(outcome.value);
        holders.delete(object.value); holders.set(outcome.value, object);
        object.value = outcome.value; object.version++; object.changed = true;
        object.scores = next ?? scoresOf(tables, settings, deals, outcome.value);
        object.salience = salienceOf(object.scores);
        // The new value's live disclosure noise (settings.peerNoiseBits): a function of the value, stored with the version.
        object.noise = disclosureNoise(settings, game.noiseKey, object.value);
        tell(object.id, agent.ownerId);
        events.push({ t: "transform", objectId: object.id, before: p.before, value: object.value, version: object.version, world: p.world,
          agentId: agent.id, ownerId: agent.ownerId, calls: outcome.calls as MutatorCallWire[], cost, net: net(object.scores, roster), noise: object.noise, seed: p.seed.toString() });
      } else {
        events.push({ t: "fail", objectId: object.id, world: p.world, agentId: agent.id, ownerId: agent.ownerId, cost, seed: p.seed.toString(),
          reason: outcome.ok ? "another object already has this value" : outcome.reason.slice(0, 300), ...(kind === "error" ? { error: true as const } : {}) });
      }
    };
    const flush = async () => {
      const results = await Promise.all(wave.map(async (p): Promise<ActResult | null> => {
        try {
          const { calls, usedRandom, readBits } = await act(ctx, p.agent.source, p.agent.language, p.before, settings, p.seed);
          return { calls, usedRandom, readBits: readBits ?? 0 };
        }
        catch (error) {
          // An unreadable meter (a trap, the hard wall) is charged the whole object's information; a compile error read nothing.
          if (isAgentFault(error)) return { error: (error as Error).message.slice(0, 300), readBits: failedReadBits(error as { readBits?: number; code?: string }, readCap) };
          console.warn(`act skipped (host): ${(error as Error).message}`);
          return null;
        }
      }));
      wave.forEach((p, i) => apply(p, results[i]));
      wave = [];
    };

    for (let k = 0; k < count; k++) {
      if (performance.now() - started > MAX_SIMULATE_MS) break;
      const world = windowStart + (k + 1) / count * windowLength;
      opportunities++;
      for (let attempt = 0; attempt < 2; attempt++) {
        const busyObjects = new Set(wave.map(p => p.object.id)), busyAgents = new Set(wave.map(p => p.agent.id));
        const freeObjects = objects.filter(o => !busyObjects.has(o.id));
        // Each candidate's energy at this opportunity, settled once: the filter and the energy-weighted draw share it.
        // Agents in the wave are candidates too (at their energy before the act in flight is charged): leaving them
        // out would hand their offers to the others, a limit per agent rather than per unit of energy (§7).
        const energy = new Map<string, number>();
        const eligible = agents.filter(a => {
          const status = agentStatus(settings, a, world);
          energy.set(a.id, status.energy);
          return status.eligible;
        });
        const energyAt = (a: typeof agents[number]) => energy.get(a.id) ?? 0;
        if (!freeObjects.length || !eligible.length) {
          if (wave.length) { await flush(); continue; }
          break;
        }
        // A world known to have no workable pair (same applied acts, same eligible agents, nothing in flight) is not
        // searched again: pickPair's fallback scans every object × agent.
        const key = wave.length ? null : `${applied}:${eligible.map(a => a.id).join()}`;
        const pair = key !== null && key === exhausted ? null
          : pickPair(freeObjects, eligible, os => pickObject(os, settings.objectSelection, uniform01), able => pickByEnergy(able, energyAt, uniform01),
            (a, o) => futile.isFutile(a.id, o, versionOf));
        if (!pair) {
          // Every free object is futile for every eligible agent: the acts in flight may change that; else it passes.
          if (wave.length) { await flush(); continue; }
          exhausted = key;
          break;
        }
        const { object, agent } = pair;
        if (busyAgents.has(agent.id)) {
          // It was drawn at its energy before its act in flight was charged. That act is applied first; the offer then
          // stays with it with probability (its energy now) ÷ (the energy it was drawn at), and otherwise the draw is
          // repeated on the settled world. That is exactly the sequential draw: an agent's chance is its settled energy
          // over the room's, in a wave or not.
          const drawnAt = energyAt(agent);
          await flush();
          const settled = agentStatus(settings, agent, world);
          if (!settled.eligible || uniform01() * drawnAt >= settled.energy || futile.isFutile(agent.id, object, versionOf)) continue;
        }
        wave.push({ object, agent, world, before: object.value, seed: deriveSeed(salt, ["play", game._id, agent.id, agent.acts]), offerBits: offerReadBits(objects.length) });
        if (wave.length >= WORKERS) await flush();
        break;
      }
    }
    if (wave.length) await flush();

    // Spawns (a Poisson process), the lifetime end and the object limit.
    const spawns: { tmp: string; value: ObjectValue; scores: Score[]; salience: number; noise: number }[] = [];
    let recoveryReason: string | undefined;
    const plan = planSpawns({
      nextSpawn: game.nextSpawn, windowStart, until, endAtWorld: game.endAtWorld, room: MAX_OBJECTS - objects.length,
      interval: () => poissonIntervalSeconds(settings.spawnRateHz, openUniform()),
      place: world => {
        const value = uniqueSpawn(settings, occupied);
        if (value === undefined) return false;
        occupied.add(value);
        const scores = scoresOf(tables, settings, deals, value), tmp = `tmp:${spawns.length}`;
        const noise = disclosureNoise(settings, game.noiseKey, value);
        spawns.push({ tmp, value, scores, salience: salienceOf(scores), noise });
        events.push({ t: "spawn", objectId: tmp, value: value as number | string, version: 0, world, net: net(scores, roster), noise });
        return true;
      },
    });
    const nextSpawn = plan.next;
    if (plan.full) {
      phase = "recovery"; recoveryReason = "The world reached its 2,000-object safety limit.";
      // Like idle parking and the end, the stop is in the event log (panels and the assistant follow it).
      events.push({ t: "phase", phase: "recovery", world: until, reason: recoveryReason });
    }
    if (phase === "running" && target >= game.endAtWorld) phase = "ended";

    // Next wake: soon if an agent can be offered an opportunity, else at the next spawn, the end, or then (≤ 5 s).
    let wakeAt: number | undefined;
    if (phase === "running") {
      const soonest = Math.min(
        ...agents.map(a => secondsUntilEligible(settings, a, until)),
        nextSpawn - until, game.endAtWorld - until, 5,
      );
      wakeAt = now + Math.max(MIN_TICK_MS, Math.max(0, soonest) * 1000);
    }
    const simulateMs = performance.now() - started;
    const due = !!game.scoreboard && phase !== "ended" && scoreboardDue(game.scoreboard.world, until, scoreIntervalOf(game));
    const changed = objects.filter(o => o.changed);
    const commitStarted = Date.now();
    const committed = await ctx.runMutation(internal.engine.loop.commit, {
      ...base, kind: "window",
      clock: { phase, worldSeconds: until, lastTick: now, nextSpawn, ...(recoveryReason ? { recoveryReason } : {}) },
      objects: changed.map(o => ({ id: o.id as Doc<"objects">["_id"], fromVersion: o.fromVersion, value: o.value as number | string, version: o.version, scores: o.scores, salience: o.salience,
        ...(o.noise !== undefined ? { noise: o.noise } : {}) })),
      spawns: spawns.map(s => ({ ...s, value: s.value as number | string })),
      agents: agents.filter(a => a.touched).map(a => ({ id: a.id as Doc<"agents">["_id"], fromActs: a.fromActs, acts: a.acts, spent: a.spent, spentRead: a.spentRead, account: a.account,
        transforms: a.transforms, skips: a.skips, failures: a.failures, lastFailures: a.lastFailures })),
      futile: futile.changedRows(versionOf).map(m => ({ agentId: m.agentId as Doc<"agents">["_id"],
        entries: m.entries as { o: Doc<"objects">["_id"]; v: number; by?: Doc<"objects">["_id"]; bv?: number }[] })),
      events, stats: { opportunities, acts, simulateMs, prevCommitMs: lastCommitMs.get(gameId) }, wakeAt,
      // The leaderboard after the window: the commit publishes it only when the scoreboard is due (scoreIntervalSeconds).
      // Exact totals for the log when scores changed; the disclosed ones only when the scoreboard is due (the commit
      // re-checks), so an ordinary tick does not pay for them.
      ...(changed.length || spawns.length || due ? { totals: totalsOf(roster, [...objects, ...spawns]) } : {}),
      ...(due ? { disclosedTotals: disclosedTotalsOf(roster, [...objects, ...spawns]) } : {}),
      // Each god's totals as disclosed, from the snapshot that already holds every object (game/objectViews.ts).
      // Under paid observation a god's own totals move with the published scoreboard only (the coarse leaderboard is free).
      ...((paid ? due : changed.length || spawns.length) ? { godTotals: godTotalsOf(roster, [...objects, ...spawns], true) } : {}),
      ...(told.size ? { told: [...told].map(([id, gods]) => ({ id: id as Doc<"objects">["_id"], gods: [...gods] })) } : {}),
    });
    lastCommitMs.set(gameId, Date.now() - commitStarted);
    return committed;
}
