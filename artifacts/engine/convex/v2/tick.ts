"use node";
/**
 * One tick of a live v2 game (spec §6.1): advance world time by the wall time that passed (at most MAX_DT), draw the
 * window's births and opportunities from the game's seed, give each opportunity to an agent with probability
 * proportional to its settled energy and an object uniformly, run the act in the sandbox (`runAct`, lib/v2-agents),
 * and send everything to `loop:commit`, which owns every write. Deterministic given the seed and the tick's inputs.
 */
import { births, runAct } from "@workspace/v2-agents";
import { hash64, rng } from "@workspace/v2-core";
import { agentIncome, energyCapacity, opportunities, pickByEnergy, settle } from "@workspace/v2-economy";
import { lineType } from "@workspace/v2-linear";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { MAX_DT } from "./loop";
import { sandboxFor } from "./runtime";
import { decode, encode, variantOf } from "./world";

type Snapshot = {
  phase: string; seed: string; variant: string; leaseId: string; tick: number; acts: number; objects: number;
  worldSeconds: number; lastTickAt: number;
  settings: { worldSeconds: number; economy: { powerPerSecond: number; fullChargeSeconds: number; opportunitiesPerSecond: number; birthsPerSecond: number } };
  seats: { memberId: string; rule: { family: string; params: unknown; tieBreaker: string | null } }[];
  agents: { agentId: string; memberId: string; language: "typescript" | "python"; source: string; version: number; share: number; energy: number; settledAt: number }[];
};
const SNAPSHOT = makeFunctionReference<"query", { gameId: Id<"v2Games"> }, Snapshot | null>("v2/loop:snapshot");
const STATES = makeFunctionReference<"query", { gameId: Id<"v2Games">; numbers: number[] }, { number: number; objectId: string; state: string; version: number }[]>("v2/loop:statesOf");
const COMMIT = makeFunctionReference<"mutation">("v2/loop:commit");
const FAILED = makeFunctionReference<"mutation">("v2/loop:tickFailed");

export const tick = internalAction({
  args: { gameId: v.id("v2Games"), leaseId: v.string() },
  handler: async (ctx, { gameId, leaseId }) => {
    try {
      const snap = await ctx.runQuery(SNAPSHOT, { gameId });
      if (!snap || snap.phase !== "live" || snap.leaseId !== leaseId) return;
      const now = Date.now();
      const dt = Math.min(MAX_DT, Math.max(0, (now - snap.lastTickAt) / 1000));
      const world = snap.worldSeconds + dt;
      const variant = variantOf(snap.variant), econ = snap.settings.economy;
      const r = rng(snap.seed, "tick", snap.tick);

      const nBorn = opportunities(econ.birthsPerSecond, dt, r);
      const born = Array.from({ length: nBorn }, (_, i) => encode(births(lineType, variant, `${snap.seed}:${snap.objects + i + 1}`, 1)[0]!));
      const nOffers = snap.objects > 0 ? opportunities(econ.opportunitiesPerSecond, dt, r) : 0;
      const picks = Array.from({ length: nOffers }, () => 1 + r.below(snap.objects));
      const states = new Map((await ctx.runQuery(STATES, { gameId, numbers: picks })).map(s => [s.number, s]));

      // Energy settled to this tick's world time, then spent act by act (the commit settles again, authoritatively).
      const balance = new Map(snap.agents.map(a => {
        const income = agentIncome(econ.powerPerSecond, a.share);
        return [a.agentId, settle({ balance: a.energy, settledWorldSeconds: a.settledAt }, world, income, energyCapacity(income, econ.fullChargeSeconds)).balance];
      }));
      const local = new Map<number, string>();   // states changed earlier in this tick
      const acts = [];
      for (const [i, number] of picks.entries()) {
        const agent = pickByEnergy(snap.agents, a => balance.get(a.agentId)!, r);
        if (!agent) break;
        const s = states.get(number);
        if (!s) continue;
        const seat = snap.seats.find(x => x.memberId === agent.memberId);
        if (!seat) continue;
        // The act's seed (spec §9.3: `act:<n>` from the game seed), as the 64-bit integer the sandbox takes.
        const seed = hash64(`${snap.seed}:act:${snap.acts + i}`).toString(), energy = balance.get(agent.agentId)!;
        const sandbox = await sandboxFor(ctx, agent.language);
        const { record } = await runAct(sandbox, {
          type: lineType, variant, state: decode(local.get(number) ?? s.state),
          rule: { family: seat.rule.family, params: seat.rule.params as Record<string, unknown>, tieBreaker: seat.rule.tieBreaker },
          program: { language: agent.language, source: agent.source }, seed, energy, object: number - 1, liveObjects: snap.objects,
        });
        balance.set(agent.agentId, energy - record.charge);
        if (record.outcome === "committed") local.set(number, record.after);
        acts.push({
          n: snap.acts + i, agentId: agent.agentId, memberId: agent.memberId, objectId: s.objectId, number, version: s.version,
          seed, energy, liveObjects: snap.objects, programVersion: agent.version, record,
        });
      }
      await ctx.runMutation(COMMIT, { gameId, leaseId, world, now, born, acts: chainVersions(acts), picks: picks.length });
    } catch (e) {
      await ctx.runMutation(FAILED, { gameId, leaseId, error: String((e as Error)?.stack ?? e).slice(0, 2000) });
    }
  },
});

/** Acts on the same object within one tick chain: each later act saw the earlier one's result (version + 1). */
function chainVersions<T extends { objectId: string; version: number; record: { outcome: string; before: string; after: string } }>(acts: T[]): T[] {
  const bumped = new Map<string, number>();
  return acts.map(a => {
    const version = a.version + (bumped.get(a.objectId) ?? 0);
    if (a.record.outcome === "committed" && a.record.after !== a.record.before) bumped.set(a.objectId, (bumped.get(a.objectId) ?? 0) + 1);
    return { ...a, version };
  });
}
