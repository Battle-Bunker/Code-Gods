/**
 * Data migrations (CLAUDE.md "Schema migrations"), with the official @convex-dev/migrations component:
 * `migrations.define({ table, migrateOne })`, idempotent (a row already in the new shape is left alone), appended to
 * RUN_ALL, which the deploy workflow runs after `convex deploy` (scripts/run-migrations.mjs starts `runAll`, waits for
 * `status` and fails the deploy on a failed migration). The component runs them online, in batches, resumably, once
 * per deployment. The schema change around one follows widen → migrate → narrow: the new shape is optional (or a union)
 * while it runs, and a later PR makes it required once every deployment reports it done (`migrations:status`).
 *
 * None is pending: the earlier ones all migrated v1 tables, which left with the v1 engine (D2; their definitions and
 * history are on the branch archive/engine-v1). The v1 tables are loose in the schema until their rows go in D3.
 */
import type { MigrationStatus } from "@convex-dev/migrations";
import { Migrations } from "@convex-dev/migrations";
import type { FunctionReference } from "convex/server";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

export const migrations = new Migrations<DataModel>(components.migrations);

/** Every pending component migration, in order. Append new ones at the end; one leaves when it is narrowed. */
const RUN_ALL: FunctionReference<"mutation", "internal">[] = [];

/** Starts RUN_ALL in order (a migration already done is skipped; nothing to do when it is empty). */
export const runAll = internalMutation({ args: {}, handler: async (ctx) => { await migrations.runSerially(ctx, RUN_ALL); } });
/** The state of each of RUN_ALL's migrations (scripts/run-migrations.mjs waits for all of them to succeed). */
export const status = internalQuery({
  args: {},
  handler: async (ctx): Promise<MigrationStatus[]> => (RUN_ALL.length ? migrations.getStatus(ctx, { migrations: RUN_ALL }) : []),
});
