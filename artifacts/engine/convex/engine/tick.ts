"use node";
/**
 * The engine tick (plan §3.1): read one snapshot, simulate the window (lastTick, now] capped at one tick
 * window, and commit it through ONE mutation (engine/loop.ts:commit), which schedules the next tick.
 *
 * Opportunities run at most interactionRateHz × Δt (stochastically rounded, never accumulated: no
 * interaction debt), each sequentially against an in-memory copy of the world, exactly as the Express
 * engine's semantics: pick the target object (uniform/shelter) and an eligible agent (energy ≥ expected act
 * cost, settled to the opportunity's world time) with a CSPRNG, run the act with the season-salted seed
 * deriveSeed(salt, ["play", gameId, agentId, actIndex]), applyCalls, enforce uniqueness (onto any existing
 * value, the object's own included, fails), apply the commit clause, charge the act, and score the result.
 *
 * Throughput: up to WORKERS acts run concurrently in a "wave", but a wave never holds the same object or
 * agent twice (as the Express engine reserved them), and results are applied strictly in opportunity order,
 * so the outcome is the sequential one.
 */
import { v } from "convex/values";
import { chargeAct, instantiationOf, personalView, poissonIntervalSeconds, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { actCharge, applyCalls, deriveSeed, objectType, type ActOutcome, type MutatorCallWire } from "@workspace/game-types";
import type { UtilityDescriptor } from "@workspace/game-utilities";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { isIdle } from "../lib/rooms";
import { cryptoRng, openUniform, scoresOf, seasonSalt, uniform01, uniqueSpawn } from "./node";
import { act, bindRuntime, isAgentFault, WORKERS } from "./runtime";
import { MAX_OBJECTS, MIN_TICK_MS, TICK_SECONDS, planSpawns, agentStatus, pickObject, salienceOf, secondsUntilEligible, settledAccount } from "../lib/world";

type Score = Doc<"objects">["scores"][number];
type Ev = Doc<"tickBatches">["events"][number];
type ActResult = { calls: string } | { error: string };

/** The previous commit's round trip per game (module scope: a warm instance reports it with the next commit). */
const lastCommitMs = new Map<string, number>();

/** Wall-clock budget for one window's simulation: opportunities past it are dropped (no debt). */
const MAX_SIMULATE_MS = 4000;

const net = (scores: readonly Score[], roster: readonly string[]) => roster.map(id => scores.find(s => s.god === id)?.netBits ?? 0);
const ownPayoff = (scores: readonly Score[], godId: string) => personalView(new Map(scores.map(s => [s.god, s.netBits])), godId).payoff;

/** The outcome of one act on `before`: applyCalls, or a failure when the runtime refused it (the agent's fault). */
function actOutcome(settings: GameSettings, before: ObjectValue, result: ActResult): ActOutcome {
  if ("error" in result) return { ok: false, reason: result.error, cost: { decision: 0, erasure: 0, motion: 0, total: 0 } };
  const inst = instantiationOf(settings);
  return applyCalls(objectType(inst.objectType), inst, before, result.calls);
}

export const run = internalAction({
  args: { gameId: v.id("games"), seq: v.number() },
  handler: async (ctx, { gameId, seq }): Promise<unknown> => {
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
    if (phase === "planning" || phase === "paused") {
      const deadline = phase === "planning" ? game.planningEndsAt : game.pauseEndsAt;
      if (now < deadline) return ctx.runMutation(internal.engine.loop.commit, { ...base, kind: "wait" });
      phase = "running"; lastTick = deadline;
      events.push({ t: "phase", phase: "running", world: game.worldSeconds });
    }
    const started = performance.now();
    const target = game.worldSeconds + Math.max(0, now - lastTick) / 1000;
    const until = Math.min(target, game.endAtWorld);
    const windowStart = Math.max(game.worldSeconds, until - TICK_SECONDS);
    const windowLength = Math.max(0, until - windowStart);

    // The in-memory world.
    const roster = snap.deities.map(d => d.godId);
    const deals = snap.deities.map(d => ({ godId: d.godId, utility: d.utility as UtilityDescriptor }));
    const objects = snap.objects.map(o => ({ ...o, fromVersion: o.version, changed: false }));
    const occupied = new Set<ObjectValue>(objects.map(o => o.value));
    const agents = snap.agents.map(a => ({ ...a, fromActs: a.acts, touched: false }));
    const salt = seasonSalt();

    // Opportunities: rate × Δt, stochastically rounded; spread evenly over the window.
    const expected = settings.interactionRateHz * windowLength;
    const count = agents.length && objects.length ? Math.floor(expected) + (uniform01() < expected - Math.floor(expected) ? 1 : 0) : 0;
    type Pending = { object: typeof objects[number]; agent: typeof agents[number]; world: number; before: ObjectValue; seed: bigint };
    let wave: Pending[] = [];
    let acts = 0, opportunities = 0;

    const apply = (p: Pending, result: ActResult | null) => {
      if (!result) return; // a host failure (capacity, unavailable): not the agent's fault, nothing is charged
      const { object, agent } = p;
      let outcome = actOutcome(settings, p.before, result);
      let next: Score[] | undefined;
      if (outcome.ok && outcome.commit) {
        // The commit clause: commit only if the act strictly raises the owner's own payoff on this object.
        if (!settings.commitClause) outcome = { ok: false, reason: "this room does not offer the commit clause", cost: outcome.cost };
        else if (!occupied.has(outcome.value)) {
          next = scoresOf(settings, deals, outcome.value);
          if (!(ownPayoff(next, agent.ownerId) - ownPayoff(object.scores, agent.ownerId) > 0)) {
            outcome = { ok: false, reason: "the commit clause kept the object: it would not raise your points", cost: outcome.cost };
          }
        }
      }
      const duplicate = outcome.ok && occupied.has(outcome.value); // includes the object's own value
      const cost = { ...actCharge(agent, outcome, { duplicate }), naming: outcome.cost.decision };
      agent.account = chargeAct(settledAccount(settings, agent, p.world), cost.total);
      agent.acts++; agent.spent += cost.total; agent.touched = true; acts++;
      if (outcome.ok && !duplicate) {
        occupied.delete(object.value); occupied.add(outcome.value);
        object.value = outcome.value; object.version++; object.changed = true;
        object.scores = next ?? scoresOf(settings, deals, outcome.value);
        object.salience = salienceOf(object.scores);
        events.push({ t: "transform", objectId: object.id, before: p.before, value: object.value, version: object.version, world: p.world,
          agentId: agent.id, ownerId: agent.ownerId, calls: outcome.calls as MutatorCallWire[], cost, net: net(object.scores, roster) });
      } else {
        events.push({ t: "fail", objectId: object.id, world: p.world, agentId: agent.id, ownerId: agent.ownerId, cost,
          reason: outcome.ok ? "another object already has this value" : outcome.reason.slice(0, 300) });
      }
    };
    const flush = async () => {
      const results = await Promise.all(wave.map(async (p): Promise<ActResult | null> => {
        try { return { calls: (await act(p.agent.source, p.before, settings, p.seed)).calls }; }
        catch (error) {
          if (isAgentFault(error)) return { error: (error as Error).message.slice(0, 300) };
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
        const eligible = agents.filter(a => !busyAgents.has(a.id) && agentStatus(settings, a, world).eligible);
        if (!freeObjects.length || !eligible.length) {
          if (wave.length) { await flush(); continue; }
          break;
        }
        const object = pickObject(freeObjects, settings.objectSelection, uniform01);
        const agent = eligible[cryptoRng.int(eligible.length)];
        wave.push({ object, agent, world, before: object.value, seed: deriveSeed(salt, ["play", game._id, agent.id, agent.acts]) });
        if (wave.length >= WORKERS) await flush();
        break;
      }
    }
    if (wave.length) await flush();

    // Spawns (a Poisson process), the lifetime end and the object limit.
    const spawns: { tmp: string; value: ObjectValue; scores: Score[]; salience: number }[] = [];
    let recoveryReason: string | undefined;
    const plan = planSpawns({
      nextSpawn: game.nextSpawn, windowStart, until, endAtWorld: game.endAtWorld, room: MAX_OBJECTS - objects.length,
      interval: () => poissonIntervalSeconds(settings.spawnRateHz, openUniform()),
      place: world => {
        const value = uniqueSpawn(settings, occupied);
        if (value === undefined) return false;
        occupied.add(value);
        const scores = scoresOf(settings, deals, value), tmp = `tmp:${spawns.length}`;
        spawns.push({ tmp, value, scores, salience: salienceOf(scores) });
        events.push({ t: "spawn", objectId: tmp, value: value as number | string, version: 0, world, net: net(scores, roster) });
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

    // Next wake: soon if an agent will be eligible, else at the next spawn, the end, or eligibility (≤ 5 s).
    let wakeAt: number | undefined;
    if (phase === "running") {
      const soonest = Math.min(
        ...agents.map(a => secondsUntilEligible(settings, a, until)),
        nextSpawn - until, game.endAtWorld - until, 5,
      );
      wakeAt = now + Math.max(MIN_TICK_MS, Math.max(0, soonest) * 1000);
    }
    const simulateMs = performance.now() - started;
    const changed = objects.filter(o => o.changed);
    const commitStarted = Date.now();
    const committed = await ctx.runMutation(internal.engine.loop.commit, {
      ...base, kind: "window",
      clock: { phase, worldSeconds: until, lastTick: now, nextSpawn, ...(recoveryReason ? { recoveryReason } : {}) },
      objects: changed.map(o => ({ id: o.id as Doc<"objects">["_id"], fromVersion: o.fromVersion, value: o.value as number | string, version: o.version, scores: o.scores, salience: o.salience })),
      spawns: spawns.map(s => ({ ...s, value: s.value as number | string })),
      agents: agents.filter(a => a.touched).map(a => ({ id: a.id as Doc<"agents">["_id"], fromActs: a.fromActs, acts: a.acts, spent: a.spent, account: a.account })),
      events, stats: { opportunities, acts, simulateMs, prevCommitMs: lastCommitMs.get(gameId) }, wakeAt,
    });
    lastCommitMs.set(gameId, Date.now() - commitStarted);
    return committed;
  },
});

