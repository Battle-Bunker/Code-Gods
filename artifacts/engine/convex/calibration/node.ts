"use node";
import { v } from "convex/values";
import { createHash } from "node:crypto";
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import { manifestEntry, tableFor, type CalibrationFile } from "@workspace/game-utilities";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import { priorOf } from "../engine/node";
import { calibrationLoad, forgetCalibrationIndex, tablesFor } from "../engine/calibration";
import { fail } from "../lib/errors";

const fileV = v.object({ instance: v.string(), rank: v.number(), sha256: v.string(), storageId: v.id("_storage") });
type Registered = { instance: string; size: number; tables: number; replaced: string | null };

/**
 * Registers uploaded calibration files (scripts/upload-calibration.mjs; see calibration/files.ts): for each, checks
 * the stored bytes' SHA-256 and that they are an instance file of `instance`, derives its manifest entry (the
 * instantiation and every table key) and records it. An upload that fails a check is deleted and named in the error
 * (the others are still registered).
 */
export const register = internalAction({
  args: { files: v.array(fileV) },
  handler: async (ctx, { files }): Promise<Registered[]> => {
    const done: Registered[] = [], failed: string[] = [];
    for (const { instance, rank, sha256, storageId } of files) {
      try {
        if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("sha256 must be 64 hex digits");
        const blob = await ctx.storage.get(storageId);
        if (!blob) throw new Error("Uploaded object not found");
        const bytes = Buffer.from(await blob.arrayBuffer());
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== sha256) throw new Error(`Stored bytes have SHA-256 ${actual}, expected ${sha256}`);
        const file = JSON.parse(bytes.toString("utf8")) as CalibrationFile;
        if (file.instance !== instance) throw new Error(`The file is ${file.instance}'s, not ${instance}'s`);
        const entry = manifestEntry(file);
        const { replaced } = await ctx.runMutation(internal.calibration.files.record, {
          instance, rank, sha256, storageId, size: bytes.length, tableCount: file.tables.length, entry: JSON.stringify(entry),
        });
        done.push({ instance, size: bytes.length, tables: file.tables.length, replaced });
      } catch (error) {
        await ctx.runMutation(internal.calibration.files.discard, { storageId });
        failed.push(`${instance}: ${(error as Error).message}`);
      }
    }
    if (failed.length) throw new Error(`Calibration uploads discarded (${done.length} others registered): ${failed.join("; ")}`);
    return done;
  },
});

const drawV = v.object({ familyId: v.string(), params: v.any() });

/**
 * The calibration tables of some draws of a game's instantiation (the player client's own utility: its reward channel
 * and its defence goal), as JSON text. The tables are public data (they are in the repository); only the requested
 * ones are sent, never a whole file. Fails when a draw has no fresh table.
 */
export const tables = action({
  args: { settings: v.any(), draws: v.array(drawV) },
  handler: async (ctx, { settings, draws }): Promise<string> => {
    if (draws.length < 1 || draws.length > 2) fail("BAD_REQUEST", "Ask for one or two draws (a utility and its defence goal)");
    let inst;
    try { inst = instantiationOf(settings as GameSettings); } catch (error) { return fail("BAD_REQUEST", `Invalid settings: ${(error as Error).message}`); }
    const prior = priorOf((settings as GameSettings).priorId);
    const loaded = await tablesFor(ctx, inst);
    const found = draws.map(d => {
      let t;
      try { t = tableFor(loaded, d, inst, prior); } catch (error) { return fail("BAD_REQUEST", (error as Error).message); }
      return t ?? fail("NOT_FOUND", `No calibration table for ${d.familyId} in ${inst.key}`);
    });
    return JSON.stringify(found);
  },
});

/**
 * One lazy load and lookup, and how it was served (the deploy smoke test and the round-trip test). `refresh` re-reads
 * the stored manifest first instead of using this process's (≤ 1 min old) copy.
 */
export const probe = internalAction({
  args: { settings: v.any(), draw: drawV, refresh: v.optional(v.boolean()) },
  handler: async (ctx, { settings, draw, refresh }) => {
    if (refresh) forgetCalibrationIndex();
    const inst = instantiationOf(settings as GameSettings);
    const loaded = await tablesFor(ctx, inst);
    const load = { ...calibrationLoad };
    const t = tableFor(loaded, draw, inst, priorOf((settings as GameSettings).priorId));
    return { instance: inst.key, tables: loaded.count, load, key: t?.key ?? null };
  },
});
