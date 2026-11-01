"use node";
/**
 * Node halves of the agent registry: background summon/validate commands (they examine the agent in the
 * sandbox and must finish even when the tool call stops waiting) and evaluate_value (the trusted utility
 * evaluator and calibration tables live behind "use node").
 */
import { ConvexError, v } from "convex/values";
import { instantiationOf, type GameSettings, type ObjectValue } from "@workspace/game-core";
import { candidateColumn, candidatesFor, family, fitMixture, type UtilityDescriptor } from "@workspace/game-utilities";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { runEnvelope } from "../commands";
import { gameTables, tablesFor } from "../engine/calibration";
import { priorOf, score } from "../engine/node";
import { gatherSeries } from "./series";
import { bindRuntime } from "../engine/runtime";
import { fail, messageOf } from "../lib/errors";
import { principalV } from "../lib/rooms";
import type { myUtilityFor } from "../player";

/** One scheduled summon/validate as the principal; a run that ends without a receipt records its error on the job. */
export const runCommand = internalAction({
  args: { principal: principalV, roomId: v.string(), subject: v.string(), envelope: v.any() },
  handler: async (ctx, { principal, roomId, subject, envelope }): Promise<void> => {
    const job = { roomId, subject, commandId: String(envelope?.commandId ?? "") };
    try {
      await bindRuntime(ctx);
      await runEnvelope(ctx, roomId, envelope, undefined, principal);
      await ctx.runMutation(internal.agent.store.finishJob, job);
    } catch (error) {
      const data = error instanceof ConvexError ? error.data as { code?: string } : undefined;
      await ctx.runMutation(internal.agent.store.finishJob, { ...job, error: { code: String(data?.code ?? "UNAVAILABLE"), message: messageOf(error).slice(0, 1000) } });
    }
  },
});

type Evaluation = {
  gameId: string; value: number | string; ordinal: unknown; rewardBits: number; netBits: number; penalty?: { ordinal: unknown; bits: number };
};
/** The caller's OWN utility on one wire value of the current game (never another god's). */
export const evaluate = internalAction({
  args: { principal: principalV, roomId: v.string(), value: v.union(v.number(), v.string()) },
  handler: async (ctx, { principal, roomId, value }): Promise<Evaluation> => {
    const mine: Awaited<ReturnType<typeof myUtilityFor>> = await ctx.runQuery(internal.player.myUtilityAs, { principal, roomId });
    if (!mine) return fail("CONFLICT", "You are not seated in a current game");
    let tables;
    try { tables = await gameTables(ctx, mine.settings as GameSettings, [mine.utility as UtilityDescriptor]); } catch (error) {
      return fail("UNAVAILABLE", `The calibration tables could not be loaded: ${messageOf(error).slice(0, 300)}`);
    }
    let s;
    try {
      s = score(tables, mine.settings as GameSettings, mine.utility as UtilityDescriptor, value as ObjectValue);
    } catch (error) {
      return fail("BAD_REQUEST", `Not a value of this game's object type: ${messageOf(error).slice(0, 300)}`);
    }
    return {
      gameId: mine.gameId, value, ordinal: s.ordinal, rewardBits: s.rewardBits, netBits: s.netBits,
      ...(s.penaltyBits !== undefined ? { penalty: { ordinal: s.penaltyOrdinal, bits: s.penaltyBits } } : {}),
    };
  },
});

// ------------------------------------------------------------------------------------------------
// rival inference (docs/public-log-design.md §4)
// ------------------------------------------------------------------------------------------------

/** The current game's settings and the number of other gods, for a seated principal (CONFLICT otherwise). */
async function seated(ctx: Parameters<typeof gatherSeries>[0], principal: Parameters<typeof gatherSeries>[1], roomId: string) {
  const mine: Awaited<ReturnType<typeof myUtilityFor>> = await ctx.runQuery(internal.player.myUtilityAs, { principal, roomId });
  if (!mine) return fail("CONFLICT", "You are not seated in a current game");
  const settings = mine.settings as GameSettings;
  return { mine, settings, inst: instantiationOf(settings) };
}
const candidateOptions = (settings: GameSettings, exclude: readonly string[] = []) => ({
  exclude: [...settings.excludedFamilies, ...exclude], excludeDefence: [...settings.excludedDefenceFamilies, ...exclude], defenceGoals: settings.defenceGoals,
});

type CandidateList = {
  others: number; defenceGoals: boolean; penaltyWeight: number;
  families: { familyId: string; name: string; theme: string; role: "reward" | "penalty"; tags: string[]; params: unknown[]; count: number }[];
};
/** Every rule another god might hold in the current game (public): families × parameter sets, grouped by family. */
export const candidates = internalAction({
  args: { principal: principalV, roomId: v.string(), family: v.optional(v.string()), paramsPerFamily: v.optional(v.number()) },
  handler: async (ctx, { principal, roomId, family: only, paramsPerFamily }): Promise<CandidateList> => {
    const { settings, inst } = await seated(ctx, principal, roomId);
    const head: { others: number } = await ctx.runQuery(internal.player.seriesAs, { principal, roomId, limit: 1 });
    const byFamily = new Map<string, CandidateList["families"][number]>();
    for (const c of candidatesFor(inst, candidateOptions(settings))) {
      if (only && c.familyId !== only) continue;
      let entry = byFamily.get(c.familyId);
      if (!entry) {
        const f = family(c.familyId);
        byFamily.set(c.familyId, entry = { familyId: f.id, name: f.name, theme: f.theme, role: f.role, tags: [...f.tags], params: [], count: 0 });
      }
      entry.count++;
      if (entry.params.length < (paramsPerFamily ?? 500)) entry.params.push(c.params);
    }
    return { others: head.others, defenceGoals: settings.defenceGoals, penaltyWeight: settings.penaltyWeight, families: [...byFamily.values()] };
  },
});

/**
 * Fit the other gods' rules to the player's observations: every distinct value seen (after spawns and on both sides of
 * transformations) with the others' summed bits there, against every candidate's bits from the game's own tables.
 */
export const fit = internalAction({
  args: {
    principal: principalV, roomId: v.string(),
    hints: v.array(v.object({ familyId: v.string(), params: v.optional(v.any()), probability: v.number() })),
    exclude: v.array(v.string()), maxObservations: v.number(), top: v.number(),
  },
  handler: async (ctx, { principal, roomId, hints, exclude, maxObservations, top }): Promise<unknown> => {
    const { settings, inst } = await seated(ctx, principal, roomId);
    // The whole log (a long 100 Hz game is tens of thousands of rows; the action holds them as columns).
    const series = await gatherSeries(ctx, principal, roomId, { limit: Infinity });
    // y(value) is a function of the value alone (every object is its own universe), so each distinct value counts once;
    // the latest are kept.
    const seen = new Map<ObjectValue, { y: number; world: number }>();
    const c = series.columns;
    for (let i = 0; i < series.rows; i++) {
      seen.set(c.value[i] as ObjectValue, { y: c.others[i], world: c.world[i] });
      if (c.before[i] !== null && c.othersBefore[i] !== null) seen.set(c.before[i] as ObjectValue, { y: c.othersBefore[i]!, world: c.world[i] });
    }
    const observed = [...seen].sort((a, b) => b[1].world - a[1].world).slice(0, maxObservations);
    const values = observed.map(([value]) => value), y = observed.map(([, o]) => o.y);
    if (values.length < 3) return { observations: values.length, message: "Too few observations yet: wait for more spawns and transformations." };
    let tables;
    try { tables = await tablesFor(ctx, inst); } catch (error) {
      return fail("UNAVAILABLE", `The calibration tables could not be loaded: ${messageOf(error).slice(0, 300)}`);
    }
    const prior = priorOf(settings.priorId);
    const all = candidatesFor(inst, candidateOptions(settings, exclude));
    const columns: { candidate: (typeof all)[number]; column: Float64Array }[] = [];
    let skipped = 0;
    for (const candidate of all) {
      const column = candidateColumn(candidate, values, tables, inst, settings.penaltyWeight, prior);
      if (column) columns.push({ candidate, column }); else skipped++;
    }
    // While live the others' sums carry the disclosure noise; after the end they are exact.
    const noiseBits = series.live ? settings.peerNoiseBits ?? 0 : 0;
    const result = fitMixture({ y, columns, others: series.others, defenceGoals: settings.defenceGoals, hints, top, noiseBits });
    return { ...result, skippedWithoutTables: skipped, gameId: series.gameId, ...(series.partial ? { partial: true } : {}) };
  },
});
