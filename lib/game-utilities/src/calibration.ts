/**
 * Calibration tables: ordinal utility → surprisal (bits) under the type's uniform spawn prior μ
 * (docs/clean-implementation-plan.md §§4.4, 4.5; reference lib/grid-lab/gridlab/calibrate.py, estimator 3).
 *
 *   G(t) = μ{u ≥ t},   s(t) = −log2 G(t)   (✨ reward bits; a defence goal's badness uses the same table form)
 *
 * Tables are produced offline by `pnpm --filter @workspace/game-utilities calibrate` (scripts/calibrate.ts) and
 * shipped under data/calibration/v1/ (one file per instantiation). Nothing here imports them: the host loads an
 * instantiation's file (the engine from Convex file storage, artifacts/engine/convex/engine/calibration.ts; tests and
 * scripts from disk, src/calibration-data.ts), wraps it with `instanceTables`, and passes that to `tableFor` /
 * `hasTable`. What exists is described by a `CalibrationManifest` (built from the files with `manifestEntry`), which
 * `coverage` and `offeredInstantiations` take as an argument (diagnostics: what is shipped; what can be played is
 * `playableInstantiations`, whatever is shipped).
 *
 * A table is **fresh** only while its key matches the current code (`tableKey`): the key hashes the family id, the
 * canonical params, the instantiation, the family's TypeScript card source for those params (the body the host
 * evaluates), the instantiation's prelude hash, the spawn function ("uniform"), the estimator and the id of the family's
 * analytic survival function when it has one (`analyticFor`; src/analytic.ts). `tableFor` and
 * `hasTable` serve fresh tables only, so a game can never be scored with a stale table; test/calibration.test.ts
 * fails (naming the regenerate command) whenever a shipped table is stale.
 */
import { ENCODE_CALLS_JS, objectType, sha256, type Instantiation } from "@workspace/game-types";
import { canonicalSupport, context, entryPoint, family, familiesFor, available, paramsKey, type Draw } from "./catalog.ts";
import type { Ordinal, Params, ScoreShape } from "./types.ts";
import { ANALYTIC_MAX_ERROR_BITS, assertAnalyticHeader, cmpOrdinals, type AnalyticSurvival } from "./analytic.ts";

// ------------------------------------------------------------------------------------------------
// format
// ------------------------------------------------------------------------------------------------

/**
 * The estimator. Bump `version` whenever the estimate a key produces would change (the algorithm, the clean-up,
 * the lookup semantics or the default budget): every key changes, so every table is regenerated.
 *  id "mc-ams", version 3: grid-lab estimator 3 semantics (Monte Carlo body, adaptive multilevel splitting tail
 *  with the type's symmetric `propose` kernel, weighted isotonic + strictly increasing clean-up, interpolation in
 *  ordinal distance, uncapped extrapolation above the top). Domains of at most EXACT_DOMAIN values (Int(0,9999))
 *  are enumerated exactly instead.
 */
export const ESTIMATOR = Object.freeze({ id: "mc-ams", version: 3 });
const analyticMemo = new Map<string, AnalyticSurvival | null>();
/**
 * The family's analytic survival function for (canonical params, instantiation), validated, or null when the family
 * has none there, or offers only an approximation whose error bound exceeds ANALYTIC_MAX_ERROR_BITS. Its id is part of
 * the table key (`tableKeyParts.exact`), so a changed formula regenerates exactly the tables built from it. Memoised
 * per process by (instance, family, params). Cheap: the levels are not read here (they may be lazy; the estimator
 * validates them with `assertAnalytic` when it builds the table).
 */
export function analyticFor(familyId: string, canonicalParams: Params, inst: Instantiation): AnalyticSurvival | null {
  const m = `${inst.key}\0${familyId}\0${paramsKey(canonicalParams)}`;
  let a = analyticMemo.get(m);
  if (a === undefined) {
    const f = family(familyId);
    a = f.analytic && f.objectType === inst.objectType ? f.analytic(canonicalParams, context(inst)) : null;
    if (a) {
      // The id and kind are checked here (they key tables); the levels, which may be lazy, when a table is built.
      assertAnalyticHeader(a, `${familyId} ${paramsKey(canonicalParams)} on ${inst.key}`);
      if (a.kind === "approx" && a.maxErrorBits! > ANALYTIC_MAX_ERROR_BITS) a = null;
    }
    analyticMemo.set(m, a);
  }
  return a;
}

/** Data layout version: data/calibration/<FORMAT>/. */
export const CALIBRATION_FORMAT = "v1";
export const REGENERATE_COMMAND = "pnpm --filter @workspace/game-utilities calibrate";

/** Smallest gap between neighbouring levels after the clean-up (calibrate.py MIN_STEP_BITS). */
export const MIN_STEP_BITS = 1e-6;
/** Extrapolation above the top level: at least this many bits per ordinal step. */
export const MIN_SLOPE_BITS = 0.05;
/** The extrapolation slope is fitted over this many levels below the top. */
export const SLOPE_LEVELS = 4;

export interface CalibrationBudget {
  /** Monte Carlo samples from the spawn prior. */
  readonly nMc: number;
  /** An MC level needs at least this many samples at or above it. */
  readonly minMcCount: number;
  readonly particles: number;
  /** Target survival fraction per splitting stage. */
  readonly p0: number;
  /** MCMC steps per particle per stage = ceil(sweeps × kernel size) (Grid: cells; Int: bit width; string: maxLength). */
  readonly sweeps: number;
  readonly targetBits: number;
  readonly maxStages: number;
  readonly maxStuck: number;
}

/**
 * The calibration prior ρ (what "surprising" is measured against). Versioned and part of the table key.
 *  - uniform v1: the type's spawn prior μ (the default; every shipped table).
 *  - mixture: ρ = ½·uniform + ½·(uniform draw from a frozen pool of objects, e.g. grids from earlier games);
 *    version = "<pool id>:<sha256 of the pool's canonical JSON>", so a different pool is a different prior.
 */
export interface PriorRef { readonly id: string; readonly version: number | string }
export const UNIFORM_PRIOR: PriorRef = Object.freeze({ id: "uniform", version: 1 });
export const isUniform = (p: PriorRef | undefined): boolean => !p || (p.id === UNIFORM_PRIOR.id && p.version === UNIFORM_PRIOR.version);
export const priorKey = (p: PriorRef = UNIFORM_PRIOR): string => `${p.id}@${p.version}`;

/** One shipped table. `levels` are [ordinal, bits] pairs, strictly increasing in both. */
export interface CalibrationTable {
  readonly key: string;
  readonly family: string;
  readonly canonicalParams: Params;
  /** Instantiation key, e.g. "Grid(5,base10,rgby)". */
  readonly instance: string;
  readonly shape: ScoreShape;
  readonly levels: readonly (readonly [Ordinal, number])[];
  /** Bits per ordinal step above the top level. */
  readonly slope: number;
  /** E_ρ[softHinge(s)] (penalty families only). */
  readonly penaltyMeanBits?: number;
  /** The prior; absent = UNIFORM_PRIOR. */
  readonly prior?: PriorRef;
  readonly estimator: {
    readonly id: string;
    readonly version: number;
    /** Hex seed of the estimator's Rng (derived from the key). */
    readonly seed: string;
    /**
     * "exact": the whole domain was enumerated; "exact:<id>" / "approx:<id>": built from the family's analytic survival
     * function with that id (src/analytic.ts).
     */
    readonly budget: CalibrationBudget | "exact" | `exact:${string}` | `approx:${string}`;
    /**
     * Built as `replicates` independent runs on 1/R of the budget each, merged in probability (scripts/estimator.ts
     * mergeReplicates; the engine's on-demand split, architecture.md §3.2). Absent: the single run. Same key, same
     * statistics: the plan is how the estimate was computed, not what it estimates.
     */
    readonly split?: { readonly replicates: number };
  };
  readonly meta: {
    readonly mcLevels: number;
    readonly splitLevels: number;
    /** Splitting stopped before targetBits (the ordinal's top was reached, or the kernel could not climb). */
    readonly stoppedEarly: boolean;
    /** Whether the exemplar's ordinal is among the levels (null without an exemplar). */
    readonly topReached: boolean | null;
    readonly maxBits: number;
    /**
     * For display only (default 1): multiply bits by this when showing them, so magnitudes stay comparable across
     * priors (the ½-mixture caps every surprisal near 1 + its pool share, so it suggests 2). Lookups return raw bits.
     */
    readonly displayScale?: number;
    /** Mixture tables: the uniform table they were derived from and the pool size. */
    readonly uniformKey?: string;
    readonly poolSize?: number;
  };
}

/** The table's display scale (1 unless the table says otherwise). */
export const displayScale = (t: CalibrationTable): number => t.meta.displayScale ?? 1;

/** One instance file: data/calibration/v1/<instance key>.json. */
export interface CalibrationFile {
  readonly format: string;
  readonly instance: string;
  readonly tables: readonly CalibrationTable[];
}

/** data/calibration/v1/manifest.json: which tables exist (small; what the settings UI needs). */
export interface CalibrationManifest {
  readonly format: string;
  readonly estimator: { readonly id: string; readonly version: number };
  /** instance key → objectType, args, and familyId → paramsKey(canonical params) → table key. */
  readonly instances: Readonly<Record<string, {
    readonly objectType: string;
    readonly args: Readonly<Record<string, number | string>>;
    readonly file: string;
    readonly tables: Readonly<Record<string, Readonly<Record<string, string>>>>;
    /** Tables for non-uniform priors: priorKey → familyId → paramsKey → table key. */
    readonly priors?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>>;
  }>>;
}

// ------------------------------------------------------------------------------------------------
// deterministic keys
// ------------------------------------------------------------------------------------------------

/** JSON with sorted object keys at every depth, no whitespace. */
export function canonicalJson(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(",")}]`;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  if (typeof x === "number" && !Number.isFinite(x)) throw new Error("canonicalJson: non-finite number");
  return JSON.stringify(x);
}

/** Everything a table key depends on. */
export interface TableKeyParts {
  readonly family: string;
  readonly params: Params;
  readonly instance: string;
  /** sha256 of the family's TypeScript card source for these params (the evaluated body). */
  readonly card: string;
  /** The family's entry point ("utility" or "penalty") and shape. */
  readonly entry: string;
  readonly shape: ScoreShape;
  /** `utilityPreludeHash`: the JS read prelude the evaluator runs (helpers + __decode, no mutator constructors). */
  readonly prelude: string;
  readonly spawn: "uniform";
  readonly estimator: { readonly id: string; readonly version: number };
  /** The family's analytic survival id (`analyticFor`), absent when the table comes from the estimator. */
  readonly exact?: string;
  /**
   * The prior, when it is not uniform v1. Uniform v1 is the implicit default (`spawn: "uniform"` and no `prior`
   * field), so introducing priors left every uniform key unchanged.
   */
  readonly prior?: PriorRef;
}

export const keyFromParts = (parts: TableKeyParts): string => sha256(canonicalJson(parts));

/** The parts of the current code's key for (family, canonical params, instantiation). */
export function tableKeyParts(familyId: string, canonicalParams: Params, inst: Instantiation, prior: PriorRef = UNIFORM_PRIOR): TableKeyParts {
  const f = family(familyId), ctx = context(inst), analytic = analyticFor(familyId, canonicalParams, inst);
  return {
    family: familyId,
    params: canonicalParams,
    instance: inst.key,
    card: sha256(f.card.typescript(canonicalParams, ctx)),
    entry: entryPoint(f),
    shape: f.shape(ctx),
    prelude: utilityPreludeHash(inst),
    spawn: "uniform",
    estimator: { id: ESTIMATOR.id, version: ESTIMATOR.version },
    ...(analytic ? { exact: analytic.id } : {}),
    ...(isUniform(prior) ? {} : { prior: { id: prior.id, version: prior.version } }),
  };
}

const preludeMemo = new Map<string, string>();
/**
 * sha256 of the part of the instantiation's JS prelude a utility card can use: everything before the call encoder
 * and the mutator constructors (lib/game-types assemblePrelude order). Adding or removing a mutator therefore does
 * not invalidate calibration; changing a read helper or __decode does.
 */
export function utilityPreludeHash(inst: Instantiation): string {
  let h = preludeMemo.get(inst.key);
  if (h === undefined) {
    const js = objectType(inst.objectType).prelude(inst).js, at = js.indexOf(ENCODE_CALLS_JS);
    if (at < 0) throw new Error(`${inst.key}: prelude has no call encoder; cannot isolate the read prelude`);
    preludeMemo.set(inst.key, h = sha256(js.slice(0, at)));
  }
  return h;
}

const keyMemo = new Map<string, string>();
/** sha256 of the canonical JSON of `tableKeyParts`: changes whenever the body, the prelude or the estimator does. */
export function tableKey(familyId: string, canonicalParams: Params, inst: Instantiation, prior: PriorRef = UNIFORM_PRIOR): string {
  const m = `${inst.key}\0${familyId}\0${paramsKey(canonicalParams)}\0${priorKey(prior)}`;
  let k = keyMemo.get(m);
  if (k === undefined) keyMemo.set(m, k = keyFromParts(tableKeyParts(familyId, canonicalParams, inst, prior)));
  return k;
}

// ------------------------------------------------------------------------------------------------
// ordinal distance (calibrate.py ordinal_distance)
// ------------------------------------------------------------------------------------------------

const tupleOf = (o: Ordinal): readonly number[] => (typeof o === "number" ? [o] : o);

/** Lexicographic comparison; scalars as 1-tuples (analytic.ts `cmpOrdinals`). */
export const cmpOrdinal = cmpOrdinals;

/** Strictly increasing squash of any real into (0, 1). */
const sq = (x: number) => 0.5 + 0.5 * x / (1 + Math.abs(x));
/** Strictly increasing (lexicographic) map of an int tuple into (0, 1); () → 0.5. */
function unit(s: readonly number[], from = 0): number {
  if (from >= s.length) return 0.5;
  const lo = sq(s[from]), hi = sq(s[from] + 1);
  return lo + (hi - lo) * unit(s, from + 1);
}
const tails = (a: readonly number[], t: readonly number[]) => 0.5 * (unit(t) + 1 - unit(a));
function above(a: readonly number[], t: readonly number[]): number {
  let m = 0;
  while (a[m] === t[m]) m++;
  const e = t[m] - a[m], r0 = 1 - 1 / (e + 1), r1 = 1 - 1 / (e + 2), w = 2 ** -(m + 1);
  return w + w * (r0 + (r1 - r0) * tails(a.slice(m + 1), t.slice(m + 1)));
}

/**
 * How far ordinal t lies above ordinal a (t > a): positive, strictly increasing in t and strictly decreasing in a.
 * Scalars: t − a. Tuples: whole steps of the first component plus a fraction in (0, 1) from the rest.
 */
export function ordinalDistance(a: Ordinal, t: Ordinal): number {
  if (typeof a === "number" && typeof t === "number") return t - a;
  const x = tupleOf(a), y = tupleOf(t);
  if (y[0] > x[0]) return (y[0] - x[0]) + tails(x.slice(1), y.slice(1));
  return above(x.slice(1), y.slice(1));
}

// ------------------------------------------------------------------------------------------------
// lookup
// ------------------------------------------------------------------------------------------------

/**
 * Surprisal in bits, ≥ 0 and STRICTLY increasing in the ordinal (estimator-3 lookup semantics):
 *  - at a level: its bits;
 *  - between two levels: linear in ordinal distance from the lower one;
 *  - below the lowest level: bits[0] / (1 + distance), still positive;
 *  - above the highest level: bits[top] + slope × distance, uncapped.
 */
export function surprisal(table: CalibrationTable, ordinal: Ordinal): number {
  const L = table.levels, n = L.length;
  let lo = 0, hi = n - 1, i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cmpOrdinal(L[mid][0], ordinal) <= 0) { i = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (i < 0) return L[0][1] / (1 + ordinalDistance(ordinal, L[0][0]));
  const [a, b] = L[i];
  if (cmpOrdinal(a, ordinal) === 0) return b;
  if (i === n - 1) return b + table.slope * ordinalDistance(a, ordinal);
  const [c, d] = L[i + 1];
  return b + (d - b) * ordinalDistance(a, ordinal) / ordinalDistance(a, c);
}

/** The defence goal's soft hinge (identical to lib/game-core/src/scoring.ts softHinge, duplicated to avoid a cycle). */
export function softHinge(bits: number): number {
  const x = bits - 1, hi = Math.max(0, x);
  return hi + Math.log2(1 + 2 ** -Math.abs(x)) - Math.log2(1.5);
}

/**
 * E_μ[f(s(u(X)))] for X ~ μ, exact for the step table (calibrate.py prior_mean_bits): an ordinal in
 * [level_k, level_k+1) scores s_k and has mass G_k − G_{k+1}; ordinals below the lowest level score 0 bits.
 */
export function priorMeanBits(table: CalibrationTable, f: (s: number) => number = s => s): number {
  const L = table.levels;
  let total = 0;
  for (let k = 0; k < L.length; k++) {
    const s = L[k][1], G = 2 ** -s, next = k + 1 < L.length ? 2 ** -L[k + 1][1] : 0;
    total += f(s) * Math.max(0, G - next);
  }
  return total + f(0) * Math.max(0, 1 - 2 ** -L[0][1]);
}

/** E_μ[softHinge(s)]: the defence goal's prior mean penalty bits (n = s⁺ − w(h − E_μh)). */
export const penaltyMeanBits = (table: CalibrationTable): number => priorMeanBits(table, softHinge);

/** E_μ[s]: the prior mean reward bits. */
export const meanBits = (table: CalibrationTable): number => priorMeanBits(table);

// ------------------------------------------------------------------------------------------------
// one instantiation's tables, and the manifest of what exists
// ------------------------------------------------------------------------------------------------

/** "Grid(5,base10,rgby)" → the instantiation (throws unless the key round-trips). */
export function instantiateKey(key: string): Instantiation {
  const m = /^(\w+)\((.*)\)$/.exec(key);
  if (!m) throw new Error(`Bad instance key ${key}`);
  const parts = m[2].split(",");
  const args: Record<string, string | number> =
    m[1] === "Int" ? { min: Number(parts[0]), max: Number(parts[1]) }
      : m[1] === "string" ? { maxLength: Number(parts[0]) }
        : { size: Number(parts[0]), symbols: parts[1], colours: parts[2] };
  const inst = objectType(m[1]).instantiate(args);
  if (inst.key !== key) throw new Error(`Instance key ${key} does not round-trip (${inst.key})`);
  return inst;
}

const slot = (familyId: string, canon: Params, prior: PriorRef | undefined) => `${familyId}\0${paramsKey(canon)}\0${priorKey(prior)}`;

/** One instantiation's shipped tables, indexed for lookup (`instanceTables`). Hosts load and cache these. */
export interface InstanceTables {
  /** Instance key, e.g. "Grid(5,base10,rgby)". */
  readonly instance: string;
  readonly count: number;
  /** @internal (family, canonical params, prior) slot → table. */
  readonly bySlot: ReadonlyMap<string, CalibrationTable>;
}

/**
 * Index an instance file for `tableFor`. `file` null/undefined (nothing shipped for the instantiation) gives an empty
 * set: every lookup misses. Throws when the file is for another instantiation or another format.
 */
export function instanceTables(instKey: string, file: CalibrationFile | null | undefined): InstanceTables {
  if (file && file.format !== CALIBRATION_FORMAT) throw new Error(`Calibration file for ${instKey} has format ${file.format}, expected ${CALIBRATION_FORMAT}`);
  if (file && file.instance !== instKey) throw new Error(`Calibration file for ${file.instance} given as ${instKey}`);
  const bySlot = new Map((file?.tables ?? []).map(t => [slot(t.family, t.canonicalParams, t.prior), t]));
  return Object.freeze({ instance: instKey, count: bySlot.size, bySlot });
}

/**
 * The fresh shipped table for a draw (a reward draw, a descriptor (its reward channel), or a defence goal) under a
 * prior (default uniform), canonicalised through `family.canonical`; undefined when none is shipped or the shipped
 * one is stale. `tables` must be the instantiation's own (`instanceTables(inst.key, …)`).
 */
export function tableFor(tables: InstanceTables, draw: Draw, inst: Instantiation, prior: PriorRef = UNIFORM_PRIOR): CalibrationTable | undefined {
  if (tables.instance !== inst.key) throw new Error(`Calibration tables for ${tables.instance} used for ${inst.key}`);
  const f = family(draw.familyId);
  if (f.objectType !== inst.objectType) return undefined;
  const canon = f.canonical(draw.params, context(inst));
  const t = tables.bySlot.get(slot(draw.familyId, canon, prior));
  return t && t.key === tableKey(draw.familyId, canon, inst, prior) ? t : undefined;
}

export function hasTable(tables: InstanceTables, draw: Draw, inst: Instantiation, prior?: PriorRef): boolean {
  return tableFor(tables, draw, inst, prior) !== undefined;
}

type ManifestEntry = CalibrationManifest["instances"][string];
const orderKey = (t: CalibrationTable) => `${t.family}\0${paramsKey(t.canonicalParams)}\0${t.prior ? priorKey(t.prior) : ""}`;
/** The pipeline's table order inside a file (family, params, prior). */
export const tableOrder = (a: CalibrationTable, b: CalibrationTable): number => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0);
const sortArgs = (a: Readonly<Record<string, number | string>>) => Object.fromEntries(Object.keys(a).sort().map(k => [k, a[k]]));

/** A file's manifest entry: its instantiation and the key of every table it holds (what `coverage` checks). */
export function manifestEntry(file: CalibrationFile): ManifestEntry {
  if (file.format !== CALIBRATION_FORMAT) throw new Error(`Calibration file for ${file.instance} has format ${file.format}, expected ${CALIBRATION_FORMAT}`);
  const inst = instantiateKey(file.instance);
  const tables: Record<string, Record<string, string>> = {};
  const priors: Record<string, Record<string, Record<string, string>>> = {};
  for (const t of [...file.tables].sort(tableOrder)) {
    if (t.instance !== file.instance) throw new Error(`Table ${t.key} of ${t.instance} is in the file of ${file.instance}`);
    const into = t.prior ? (priors[priorKey(t.prior)] ??= {}) : tables;
    (into[t.family] ??= {})[paramsKey(t.canonicalParams)] = t.key;
  }
  return { objectType: inst.objectType, args: sortArgs(inst.args), file: `${file.instance}.json`, tables, ...(Object.keys(priors).length ? { priors } : {}) };
}

/** A manifest from entries, in the given order (the order `offeredInstantiations` lists them in). */
export function manifestOf(entries: Iterable<readonly [string, ManifestEntry]>): CalibrationManifest {
  return { format: CALIBRATION_FORMAT, estimator: { id: ESTIMATOR.id, version: ESTIMATOR.version }, instances: Object.fromEntries(entries) };
}

/**
 * Every calibration prior with shipped tables: uniform v1 first (always: it is the spawn prior), then each other prior
 * `manifest` (what the host holds) has tables for (`instances[].priors`, keyed by priorKey). A prior is choosable for a room only through
 * tables, so this is the list the settings' `priorId` choices come from (synergy matrices are keyed by prior too, but
 * cannot score anything on their own).
 */
export function shippedPriors(manifest: CalibrationManifest): PriorRef[] {
  const out: PriorRef[] = [UNIFORM_PRIOR];
  for (const entry of Object.values(manifest.instances)) {
    for (const key of Object.keys(entry.priors ?? {})) {
      const at = key.lastIndexOf("@");
      const id = key.slice(0, at), raw = key.slice(at + 1);
      if (at <= 0 || out.some(p => p.id === id)) continue;
      out.push(Object.freeze({ id, version: /^\d+$/.test(raw) ? Number(raw) : raw }));
    }
  }
  return out;
}


export interface Coverage {
  readonly instance: string;
  /** Draws (family, canonical params) that are dealable here but have no fresh table. */
  readonly missing: readonly { readonly familyId: string; readonly params: Params; readonly stale: boolean }[];
  readonly tables: number;
}

/** Grid sizes retired from play (3×3: too small for most families' structure). Never offered, tables or not. */
export const RETIRED_GRID_SIZES: readonly number[] = Object.freeze([3]);

const coverageMemo = new WeakMap<CalibrationManifest, Map<string, Coverage>>();
/**
 * Which dealable draws of an instantiation (every available reward and penalty family × canonical support, minus
 * `excludedFamilies`, default none) lack a fresh table in `manifest`. Memoised per manifest object.
 */
export function coverage(manifest: CalibrationManifest, inst: Instantiation, excludedFamilies: readonly string[] = [],
  prior: PriorRef = UNIFORM_PRIOR): Coverage {
  const memoKey = `${inst.key}\0${[...excludedFamilies].sort().join(",")}\0${priorKey(prior)}`;
  let memo = coverageMemo.get(manifest);
  if (!memo) coverageMemo.set(manifest, memo = new Map());
  let c = memo.get(memoKey);
  if (c) return c;
  const ctx = context(inst), entry = manifest.instances[inst.key], excluded = new Set(excludedFamilies);
  const missing: { familyId: string; params: Params; stale: boolean }[] = [];
  let tables = 0;
  for (const f of familiesFor(inst.objectType)) {
    if (excluded.has(f.id) || !available(f, inst).ok) continue;
    for (const p of canonicalSupport(f, ctx)) {
      const stored = (isUniform(prior) ? entry?.tables : entry?.priors?.[priorKey(prior)])?.[f.id]?.[paramsKey(p)];
      if (stored !== undefined && stored === tableKey(f.id, p, inst, prior)) tables++;
      else missing.push({ familyId: f.id, params: p, stale: stored !== undefined });
    }
  }
  memo.set(memoKey, c = Object.freeze({ instance: inst.key, missing, tables }));
  return c;
}

/** Whether an instantiation can be played at all: it exists and is not retired. Tables are never a condition. */
export const isPlayableInstantiation = (inst: Instantiation): boolean =>
  !(inst.objectType === "Grid" && RETIRED_GRID_SIZES.includes(inst.terms.size));

const playableMemo = new Map<string, readonly Instantiation[]>();
/**
 * The instantiations the settings UI lists for an object type (docs/analytic-calibration/architecture.md §3.5): every
 * combination of its parameters' choices (a component's options, an integer's presets), the type's defaults first,
 * minus what the type itself refuses and the retired shapes (3×3). Whether tables exist plays no part: a shape with no
 * shipped tables prepares them on its first game (`firstUseSeconds`). Any other valid arguments are playable too
 * (`isPlayableInstantiation`), so an owner may still name, say, Int(5,100): this list is what pickers show.
 */
export function playableInstantiations(objectTypeId: string): readonly Instantiation[] {
  let found = playableMemo.get(objectTypeId);
  if (found) return found;
  const T = objectType(objectTypeId);
  let combos: Record<string, number | string>[] = [{ ...T.defaults } as Record<string, number | string>];
  for (const p of T.params) {
    const values: (number | string)[] = p.kind === "component" ? p.options.map(o => o.id) : [...(p.presets ?? [])];
    if (!values.length) continue;
    combos = combos.flatMap(c => values.map(value => ({ ...c, [p.id]: value })));
  }
  const out = new Map<string, Instantiation>();
  for (const args of [T.defaults, ...combos]) {
    let inst: Instantiation;
    try { inst = T.instantiate(args); } catch { continue; }
    if (isPlayableInstantiation(inst) && !out.has(inst.key)) out.set(inst.key, inst);
  }
  playableMemo.set(objectTypeId, found = Object.freeze([...out.values()]));
  return found;
}

/**
 * Cloud first-use latency (architecture.md §9, measured on the dev deployment with `scripts/first-use-probe.ts`): the
 * wall time, in seconds, from dealing a 6-god game with defence goals on a shape with no tables to every table ready,
 * one Node action per sampled table running concurrently. Rounded up; what the settings page's "first game prepares
 * its tables" note and the room's preparing estimate quote.
 */
export const FIRST_USE_SECONDS: Readonly<Record<string, number | Readonly<Record<number, number>>>> = Object.freeze({
  Int: 250, string: 15, Grid: Object.freeze({ 4: 35, 5: 70, 6: 130, 7: 260 }),
});
/** The expected wall time of preparing a first game's missing tables on `inst` (seconds, `FIRST_USE_SECONDS`). */
export function firstUseSeconds(inst: Instantiation): number {
  const e = FIRST_USE_SECONDS[inst.objectType];
  if (typeof e === "number") return e;
  if (!e) return 60;
  const sizes = Object.keys(e).map(Number).sort((a, b) => a - b), size = inst.terms.size ?? sizes[0]!;
  return e[size] ?? e[sizes.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), sizes[0]!)]!;
}

export interface OfferOptions {
  /**
   * Families the room will never deal (settings.excludedFamilies): a fixed list, or one per instantiation (e.g. the
   * tuned defaults, game-core `typeDefaults`). Default: none. Excluded families need no tables.
   */
  readonly excludedFamilies?: readonly string[] | ((inst: Instantiation) => readonly string[]);
  /** The calibration prior (default uniform). */
  readonly prior?: PriorRef;
}

/**
 * The instantiations the settings UI may offer for an object type, given the manifest of what the host holds.
 *
 * Rule: an instantiation is offered iff
 *  1. it is not retired (Grid sizes in RETIRED_GRID_SIZES, i.e. 3×3, are never offered), and
 *  2. EVERY family that can be dealt in it (each available reward family and each available penalty family, for
 *     every canonical params of its support), except the excluded ones, has a fresh shipped table.
 * A partial rule ("enough families") would make the catalog the settings page shows dishonest: it lists every
 * available family as possible, and the selector would silently never deal the uncalibrated ones. Penalty families
 * count even though defence goals are opt-in, so turning `defenceGoals` on can never break a room. Stale tables
 * (key ≠ current code) count as missing. The order is the manifest's (the pipeline's curated order: Int and string
 * presets, then the curated GridTypes with the Grid default first).
 */
export function offeredInstantiations(manifest: CalibrationManifest, objectTypeId: string, options: OfferOptions = {}): Instantiation[] {
  const T = objectType(objectTypeId);
  return Object.values(manifest.instances)
    .filter(e => e.objectType === objectTypeId)
    .map(e => T.instantiate(e.args))
    .filter(inst => !(inst.objectType === "Grid" && RETIRED_GRID_SIZES.includes(inst.terms.size)))
    .filter(inst => coverage(manifest, inst, (typeof options.excludedFamilies === "function" ? options.excludedFamilies(inst) : options.excludedFamilies) ?? [], options.prior).missing.length === 0);
}
