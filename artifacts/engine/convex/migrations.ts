/**
 * Data migrations (CLAUDE.md "Schema migrations"), with the official @convex-dev/migrations component:
 * `migrations.define({ table, migrateOne })`, idempotent (a row already in the new shape is left alone), appended to
 * RUN_ALL, which the deploy workflow runs after `convex deploy` (scripts/run-migrations.mjs starts `runAll`, waits for
 * `status` and fails the deploy on a failed migration). The component runs them online, in batches, resumably, once
 * per deployment. The schema change around one follows widen → migrate → narrow: the new shape is optional (or a union)
 * while it runs, and a later PR makes it required once every deployment reports it done (`migrations:status`).
 *
 * Pending: stripLevels, stripObjectLevels, stripRuleLadders (decision 23, #488: levels and ladders left v2's rows). The
 * earlier ones all migrated v1 tables, which left with the v1 engine (D2; their definitions and history are on the
 * branch archive/engine-v1). The v1 tables are loose in the schema until their rows go in D3.
 */
import type { MigrationStatus } from "@convex-dev/migrations";
import { Migrations } from "@convex-dev/migrations";
import type { FunctionReference } from "convex/server";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { newNoiseKey, noiseAt, shownAt } from "./v2/disclose";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

export const migrations = new Migrations<DataModel>(components.migrations);

/** A move's value snapshots lose the level they carried before decision 23 (#488). */
export const stripLevels = migrations.define({
  table: "v2Moves",
  migrateOne: (_ctx, m) => {
    if (m.before.level === undefined && m.after.level === undefined) return;
    const { level: _b, ...before } = m.before, { level: _a, ...after } = m.after;
    return { before, after };
  },
});
/** A player's value of an object loses its level (decision 23, #488). */
export const stripObjectLevels = migrations.define({
  table: "v2ObjectValues",
  migrateOne: (_ctx, r) => (r.level === undefined ? undefined : { level: undefined }),
});
/** A dealt rule loses its ladder (decision 23, #488: its value is the value function). */
export const stripRuleLadders = migrations.define({
  table: "v2Rules",
  migrateOne: (_ctx, r) => (r.ladder === undefined ? undefined : { ladder: undefined }),
});
/**
 * Disclosure noise restored (v1's peerNoiseBits; v2/disclose.ts): a game not yet ended gets its private noise key. An
 * ended game needs none (its reads are exact). `noiseKey` stays optional: games ended before it have none.
 */
export const noiseKeys = migrations.define({
  table: "v2Games",
  migrateOne: (_ctx, g) => (g.phase === "ended" || g.noiseKey ? undefined : { noiseKey: newNoiseKey() }),
});
/**
 * A value row of a game not yet ended gets its disclosed fields (the others' sum at its state's noise), so the live
 * sorts and reads disclose. Ended games' rows are read exact and keep none (the fields stay optional).
 */
export const shownValues = migrations.define({
  table: "v2ObjectValues",
  migrateOne: async (ctx, r) => {
    if (r.shownWant !== undefined) return;
    const game = await ctx.db.get(r.gameId);
    if (!game || game.phase === "ended") return;
    const state = await ctx.db.query("v2ObjectStates").withIndex("by_object", q => q.eq("objectId", r.objectId)).unique();
    if (!state) return;
    return shownAt(r, noiseAt(game, state.state));
  },
});

/** Every pending component migration, in order. Append new ones at the end; one leaves when it is narrowed. */
const RUN_ALL: FunctionReference<"mutation", "internal">[] = [internal.migrations.stripLevels, internal.migrations.stripObjectLevels, internal.migrations.stripRuleLadders, internal.migrations.noiseKeys, internal.migrations.shownValues];

/** Starts RUN_ALL in order (a migration already done is skipped); `reset: true` runs them again (the tests). */
export const runAll = internalMutation({
  args: { reset: v.optional(v.boolean()) },
  handler: async (ctx, { reset }) => {
    if (reset) for (const fn of RUN_ALL) await migrations.runOne(ctx, fn, { reset: true });
    else await migrations.runSerially(ctx, RUN_ALL);
  },
});
/** The state of each of RUN_ALL's migrations (scripts/run-migrations.mjs waits for all of them to succeed). */
export const status = internalQuery({
  args: {},
  handler: async (ctx): Promise<MigrationStatus[]> => (RUN_ALL.length ? migrations.getStatus(ctx, { migrations: RUN_ALL }) : []),
});
