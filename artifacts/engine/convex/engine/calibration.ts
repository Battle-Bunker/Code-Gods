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
  CALIBRATION_FORMAT, UNIFORM_PRIOR, analyticFor, context, family, instanceTables, manifestOf, paramsKey, priorKey, tableFor, tableKey,
  type CalibrationFile, type CalibrationManifest, type CalibrationTable, type Draw, type InstanceTables, type PriorRef, type UtilityDescriptor,
} from "@workspace/game-utilities";
import { budgetFor, buildTable, estimateCost, isSampled, planSplit } from "@workspace/game-utilities/estimator";
import { instantiationOf, type GameSettings } from "@workspace/game-core";
import type { Instantiation } from "@workspace/game-types";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { priorOf, rememberPriors } from "./node";

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

// ------------------------------------------------------------------------------------------------
// on demand: analytic first, then the warm file, then the computed cache, then a fan-out of compute actions
// ------------------------------------------------------------------------------------------------

export type TableSource = "file" | "analytic" | "computed";
export interface ResolvedDraw { readonly draw: Draw; readonly key: string; readonly source: TableSource; readonly buildMs?: number }
export interface PendingDraw { readonly draw: Draw; readonly key: string; /** This call claimed the key and scheduled its computation. */ readonly scheduled: boolean }
export interface Resolution {
  /** The instantiation's tables including every resolved draw's: pass to score / scoresOf. */
  readonly tables: InstanceTables;
  readonly ready: readonly ResolvedDraw[];
  readonly pending: readonly PendingDraw[];
}

/** Analytic tables, built once per process (milliseconds each; never stored); computed ones, read once per process. */
const analyticTables = new Map<string, CalibrationTable>();
const computedTables = new Map<string, CalibrationTable>();
const MAX_ANALYTIC = 2048, MAX_COMPUTED = 2048;
const remember = (memo: Map<string, CalibrationTable>, max: number, key: string, t: CalibrationTable) => {
  if (memo.size >= max) memo.delete(memo.keys().next().value!);
  memo.set(key, t);
};

export interface ResolveOptions {
  /**
   * Claim and schedule the computation of missing tables (default true: the game start). False reports them pending
   * without computing anything: the paths any caller can reach (scoring ticks, a player's own tables), whose draws a
   * started game has already prepared.
   */
  readonly schedule?: boolean;
  /** The owner whose start this is: new computation is rate limited per owner (calibration/cache.ts claimMany). */
  readonly owner?: { readonly id: string; readonly roomId: Id<"rooms"> };
}

/**
 * Each piece of a split table should take about this long where it runs (architecture.md §3.2, §9.2): the planning
 * window is 60 s by default and a first use adds a few seconds of action starts, the merge and the game's launch.
 */
export const PIECE_TARGET_SECONDS = 20;

export interface DrawPlan { readonly key: string; readonly familyId: string; readonly pieces: number; readonly seconds: number; readonly pieceSeconds: number; readonly usPerSpawn: number; readonly usPerProposal: number }

/**
 * The split plan of each missing table (architecture.md §3.2): its single-run cost measured here (`estimateCost`: a few
 * hundred evaluations, tens of milliseconds, at this machine's speed, which is the compute actions'), then as many
 * replicate pieces as keep each near PIECE_TARGET_SECONDS. Tables that are not sampled (an enumerable Int range) and
 * cheap ones stay one action.
 */
export function planDraws(inst: Instantiation, draws: readonly { draw: Draw; canon: Draw["params"]; key: string }[]): DrawPlan[] {
  const budget = budgetFor(inst.objectType), seen = new Map<string, DrawPlan>();
  for (const { draw, canon, key } of draws) {
    if (seen.has(key)) continue;
    if (!isSampled(draw.familyId, canon, inst)) { seen.set(key, { key, familyId: draw.familyId, pieces: 1, seconds: 0, pieceSeconds: 0, usPerSpawn: 0, usPerProposal: 0 }); continue; }
    const cost = estimateCost(draw.familyId, canon, inst, budget), plan = planSplit(cost, budget, PIECE_TARGET_SECONDS);
    seen.set(key, { key, familyId: draw.familyId, pieces: plan.replicates, seconds: cost.seconds, pieceSeconds: cost.seconds / plan.replicates, usPerSpawn: cost.usPerSpawn, usPerProposal: cost.usPerProposal });
  }
  return [...seen.values()];
}

/**
 * The tables of `draws` (reward draws and defence goals, raw params) in `inst` under `prior`: from the warm file, the
 * family's analytic survival function, or the computed cache; whatever is missing is claimed and scheduled as one
 * `calibration.compute.run` action per table (docs/analytic-calibration/architecture.md §3). Throws (BAD_REQUEST-like
 * errors for the caller to surface) when a draw cannot have a table here: a family of another object type, a table that
 * failed to compute twice, or a non-uniform prior (its tables derive from pools the deployment does not hold, so they
 * are shipped or nothing).
 */
export async function resolveTables(ctx: ActionCtx, inst: Instantiation, draws: readonly Draw[], prior: PriorRef = UNIFORM_PRIOR,
  options: ResolveOptions = {}): Promise<Resolution> {
  const schedule = options.schedule ?? true;
  const base = await tablesFor(ctx, inst), ctx_ = context(inst), uniform = priorKey(prior) === priorKey(UNIFORM_PRIOR);
  const ready: ResolvedDraw[] = [], pending: PendingDraw[] = [], extra: CalibrationTable[] = [];
  const toCheck: { draw: Draw; canon: Draw["params"]; key: string }[] = [];
  for (const draw of draws) {
    const f = family(draw.familyId);
    if (f.objectType !== inst.objectType) throw new Error(`${draw.familyId} is a ${f.objectType} family; ${inst.key} cannot deal it`);
    const canon = f.canonical(draw.params, ctx_), key = tableKey(draw.familyId, canon, inst, prior);
    if (tableFor(base, draw, inst, prior)) { ready.push({ draw, key, source: "file" }); continue; }
    if (uniform && analyticFor(draw.familyId, canon, inst)) {
      let t = analyticTables.get(key);
      if (!t) {
        const started = performance.now();
        t = buildTable(draw.familyId, canon, inst).table;
        remember(analyticTables, MAX_ANALYTIC, key, t);
        ready.push({ draw, key, source: "analytic", buildMs: performance.now() - started });
      } else ready.push({ draw, key, source: "analytic" });
      extra.push(t);
      continue;
    }
    // The memo serves the hot paths of a started game (ticks); a start reads the cache rows, which also marks them used.
    const memo = schedule ? undefined : computedTables.get(key);
    if (memo) { extra.push(memo); ready.push({ draw, key, source: "computed" }); continue; }
    toCheck.push({ draw, canon, key });
  }
  if (toCheck.length) {
    const rows = new Map((await ctx.runMutation(internal.calibration.cache.getMany, { keys: toCheck.map(c => c.key) })).map(r => [r.key, r]));
    const missing: typeof toCheck = [];
    for (const c of toCheck) {
      const row = rows.get(c.key);
      if (row?.status === "ready" && row.table) {
        const t = JSON.parse(row.table) as CalibrationTable;
        if (t.key === c.key) {
          remember(computedTables, MAX_COMPUTED, c.key, t);
          extra.push(t); ready.push({ draw: c.draw, key: c.key, source: "computed", buildMs: row.buildMs }); continue;
        }
      }
      missing.push(c);
    }
    if (!schedule) {
      for (const { draw, key } of missing) pending.push({ draw, key, scheduled: false });
      missing.length = 0;
    }
    if (missing.length && !uniform) {
      throw new Error(`No calibration tables for ${missing.map(c => c.draw.familyId).join(", ")} on ${inst.key} under prior ${priorKey(prior)}: tables for this prior are shipped, not computed on demand`);
    }
    // Claim every missing key at once, each under its split plan; the claim schedules the work (costliest first) and
    // applies the owner's rate limit (a refusal throws RATE_LIMITED and claims nothing).
    const plans = new Map(missing.length ? planDraws(inst, missing).map(p => [p.key, p]) : []);
    const verdicts = missing.length ? new Map((await ctx.runMutation(internal.calibration.cache.claimMany, {
      items: missing.map(({ draw, canon, key }) => ({
        key, instance: inst.key, family: draw.familyId, paramsKey: paramsKey(canon), prior: priorKey(prior), params: canon,
        pieces: plans.get(key)!.pieces, pieceSeconds: plans.get(key)!.pieceSeconds,
      })),
      ...(options.owner ? { owner: options.owner } : {}),
    })).map(r => [r.key, r.verdict])) : new Map<string, string>();
    const counted = new Set<string>();
    for (const { draw, canon, key } of missing) {
      const verdict = verdicts.get(key);
      if (verdict === "failed") throw new Error(`The calibration table of ${draw.familyId} ${paramsKey(canon)} on ${inst.key} could not be computed; see calibrationComputed`);
      // "ready" here means a race with a finishing action: it is read on the next call. A key two gods share is scheduled once.
      pending.push({ draw, key, scheduled: verdict === "compute" && !counted.has(key) });
      counted.add(key);
    }
  }
  const tables = extra.length
    ? instanceTables(inst.key, { format: CALIBRATION_FORMAT, instance: inst.key, tables: [...base.bySlot.values(), ...extra] } satisfies CalibrationFile)
    : base;
  return { tables, ready, pending };
}

/** Every draw of some utilities (each reward and its defence goal), in order. */
export const drawsOf = (utilities: readonly UtilityDescriptor[]): Draw[] => utilities.flatMap(u => [u, ...(u.penalty ? [u.penalty] : [])]);

/**
 * The tables of a started game's utilities (scoring ticks, a player's own score): ready by construction, since the
 * start prepared every draw; never schedules anything. Throws when one is missing (a pruned row is recomputed only by a
 * new start).
 */
export async function gameTables(ctx: ActionCtx, settings: GameSettings, utilities: readonly UtilityDescriptor[]): Promise<InstanceTables> {
  const inst = instantiationOf(settings), prior = priorOf(settings.priorId ?? "uniform");
  // Every tick of a game asks for the same utilities: resolve them once per process (a table key is its content).
  const memoKey = `${inst.key}\0${priorKey(prior)}\0${utilities.map(u => paramsKey(u)).join("|")}`;
  const known = gameTableMemo.get(memoKey);
  if (known) return known;
  const r = await resolveTables(ctx, inst, drawsOf(utilities), prior, { schedule: false });
  if (r.pending.length) throw new Error(`No calibration table for ${r.pending.map(p => p.draw.familyId).join(", ")} in ${inst.key}`);
  if (gameTableMemo.size >= 64) gameTableMemo.delete(gameTableMemo.keys().next().value!);
  gameTableMemo.set(memoKey, r.tables);
  return r.tables;
}
const gameTableMemo = new Map<string, InstanceTables>();
