"use node";
/**
 * The calibration tables, loaded lazily from Convex file storage (calibration/tables.ts; uploaded at deploy by
 * scripts/upload-calibration.mjs). Nothing bundles table data: a Node action asks for what it needs and this module
 * caches it per process (module scope; a warm instance keeps it across actions, a cold one refetches).
 *
 *   const manifest = await calibrationManifest(ctx);           // what storage holds: offered instantiations, coverage
 *   const tables = await tablesFor(ctx, instantiationOf(settings));   // one instantiation's tables, for tableFor / scoring
 *
 * - The manifest (each stored file's entry: instantiation and table keys) is re-read at most every INDEX_TTL_MS, so a
 *   newly uploaded shape is offered within a minute of the upload, with no code change. Freshness is the library's:
 *   a stored table whose key is not the current code's counts as missing (`coverage`, `tableFor`).
 * - Instance files are cached by content hash (at most MAX_INSTANCES at a time, least recently used out). A game's
 *   start and each tick load their instantiation's tables once (a cache hit after the first), never per act.
 * - Concurrent actions share one load. The action that starts a load awaits it, so its context outlives the load.
 */
import { createHash } from "node:crypto";
import {
  instanceTables, manifestOf, type CalibrationFile, type CalibrationManifest, type InstanceTables,
} from "@workspace/game-utilities";
import type { Instantiation } from "@workspace/game-types";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { rememberPriors } from "./node";

export const INDEX_TTL_MS = 60_000;
export const MAX_INSTANCES = 8;

type Row = { instance: string; sha256: string; storageId: Id<"_storage">; entry: string };
type Index = { manifest: CalibrationManifest; rows: ReadonlyMap<string, Row>; signature: string };

let index: { at: number; load: Promise<Index> } | undefined;
const files = new Map<string, Promise<{ tables: InstanceTables; bytes: number }>>();
/** How the last tables were obtained (diagnostics and the round-trip test). */
export const calibrationLoad: { instance?: string; source?: "memory" | "storage" | "none"; ms?: number; bytes?: number } = {};

/**
 * The stored rows as a manifest. Unchanged rows (same instances, order and bytes) keep the previous manifest object,
 * so the memos keyed by it (coverage, the settings domain, manifest.get's lists) survive the refresh.
 */
async function readIndex(ctx: ActionCtx, previous: Promise<Index> | undefined): Promise<Index> {
  const rows: Row[] = await ctx.runQuery(internal.calibration.files.index, {});
  const signature = rows.map(r => `${r.instance}\0${r.sha256}\0${r.storageId}`).join("\n");
  const old = await previous?.catch(() => undefined);
  if (old && old.signature === signature) return old;
  return {
    manifest: manifestOf(rows.map(r => [r.instance, JSON.parse(r.entry)] as const)),
    rows: new Map(rows.map(r => [r.instance, r])),
    signature,
  };
}

async function currentIndex(ctx: ActionCtx): Promise<Index> {
  if (!index || Date.now() - index.at > INDEX_TTL_MS) {
    const entry = { at: Date.now(), load: readIndex(ctx, index?.load) };
    index = entry;
    entry.load.catch(() => { if (index === entry) index = undefined; });
  }
  return index.load;
}

/** Drop this process's cached manifest (the next call re-reads it): for the round-trip probe after an upload. */
export function forgetCalibrationIndex(): void { index = undefined; }

/** The manifest of the calibration files this deployment holds, in offered order (cached per process, ≤ 1 min old). */
export async function calibrationManifest(ctx: ActionCtx): Promise<CalibrationManifest> {
  return (await currentIndex(ctx)).manifest;
}

async function loadFile(ctx: ActionCtx, row: Row): Promise<{ tables: InstanceTables; bytes: number }> {
  const start = performance.now();
  const blob = await ctx.storage.get(row.storageId);
  if (!blob) throw new Error(`The calibration file of ${row.instance} is missing from file storage: run upload-calibration`);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== row.sha256) throw new Error(`The stored calibration file of ${row.instance} has SHA-256 ${sha256}, expected ${row.sha256}`);
  const tables = instanceTables(row.instance, JSON.parse(bytes.toString("utf8")) as CalibrationFile);
  Object.assign(calibrationLoad, { instance: row.instance, source: "storage", ms: performance.now() - start, bytes: bytes.length });
  return { tables, bytes: bytes.length };
}

/**
 * The instantiation's tables (empty when storage holds no file for it: every lookup misses, so nothing is offered or
 * dealt there). Cached per process by content hash; a re-uploaded file is a new hash, hence a fresh load.
 */
export async function tablesFor(ctx: ActionCtx, inst: Instantiation): Promise<InstanceTables> {
  try {
    return await tablesFrom(ctx, inst);
  } catch (error) {
    // A re-upload deletes the file it replaces: an index cached before it may name a deleted file. Retry once with a
    // fresh index (a real failure fails again).
    if (!index) throw error;
    forgetCalibrationIndex();
    return tablesFrom(ctx, inst);
  }
}

async function tablesFrom(ctx: ActionCtx, inst: Instantiation): Promise<InstanceTables> {
  const row = (await currentIndex(ctx)).rows.get(inst.key);
  if (!row) {
    Object.assign(calibrationLoad, { instance: inst.key, source: "none", ms: 0, bytes: 0 });
    return instanceTables(inst.key, null);
  }
  const key = `${row.instance}\0${row.sha256}`;
  let load = files.get(key);
  if (load) {
    files.delete(key); files.set(key, load);   // most recently used last
    const { tables, bytes } = await load;
    Object.assign(calibrationLoad, { instance: inst.key, source: "memory", ms: 0, bytes });
    return tables;
  } else {
    const started = loadFile(ctx, row);
    load = started;
    files.set(key, started);
    started.catch(() => { if (files.get(key) === started) files.delete(key); });
    while (files.size > MAX_INSTANCES) files.delete(files.keys().next().value!);
  }
  return (await load).tables;
}
