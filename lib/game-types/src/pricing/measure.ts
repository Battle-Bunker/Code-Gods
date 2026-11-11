/**
 * What an open agent's acts cost (docs/energy-model.md §2, §5).
 *
 *   summon price = ast-bits-v1 description of the source       paid once, by the god (Runtime)
 *   act charge   = READ_PRICE·R + (the change commits ? C : 0)  paid by the agent, per act
 *     R = the bits of information the act read (the prelude's read meter, §3)
 *     READ_PRICE = 1/κ energy bits per bit read (mutators.ts CHANGE_READ_RATIO, §2.1)
 *     C = the change cost of the act's calls (applyCalls: W + β·W², docs/energy-model.md §4)
 *
 * Two units, kept apart by name: "bits read" (readBits, meterBits, readBound, failedReadBits, expectedReadBits) are
 * information, what the meter counts; "read charge" (readCharge, ActCharge.read, expectedRead) is energy. The price is
 * applied in exactly one place, readCharge, which actCharge calls.
 *
 * There is no fixed per-act component: an act that reads nothing and returns no calls costs 0. The agent's code is
 * priced once, at summon. A change that does not commit (no change, an invalid call, a collision, the commit clause)
 * pays its reads only.
 *
 * measureAgent RUNS the agent once per value of the reference mixture (mixture.ts), with seed
 * deriveSeed(salt, ["measure", inst.key, i, 0]), and reports the expected charge per act and its read/change split, for
 * the UI and the assistant. Nothing is charged or scheduled from the estimate.
 */
import { applyCalls, changeCost, READ_PRICE } from "../mutators.ts";
import { objectType } from "../registry.ts";
import type { ActOutcome, Instantiation, ObjectTypeDef, ObjectValue } from "../types.ts";
import type { ReferenceMixture } from "./mixture.ts";
import { deriveSeed } from "./rng.ts";

/** What the runtime reports for one sandboxed run of the agent. */
export interface AgentRun {
  /** The act's wire output: JSON text of [[mutator id, params], ...] (or the parsed array). */
  readonly calls: unknown;
  /** True when the run drew from `random` (the runtime's seeded Random). */
  readonly usedRandom?: boolean;
  /** Bits of the object the run read (the prelude's read meter); 0 when absent. */
  readonly readBits?: number;
  /** Set when the run raised, timed out or ran out of steps: the act does nothing (it still paid its reads). */
  readonly error?: string;
  readonly steps?: number;
}

export interface RunContext {
  readonly index: number;
  readonly replicate: number;
  readonly component: string;
}

/**
 * Runs the agent once on `value` with the engine seed `seed` (an unsigned 64-bit integer) and the
 * frozen clock. May return an AgentRun or the bare wire output (then usedRandom = false, readBits = 0).
 */
export type RunActs = (value: ObjectValue, seed: bigint, at: RunContext) => Promise<AgentRun | unknown> | AgentRun | unknown;

export interface MeasureOptions {
  /** The SECRET season salt for the run seeds (the same one play seeds use). Required. */
  readonly salt: string | Uint8Array;
  /** Runs in flight at once. Default 1 (results never depend on it). */
  readonly concurrency?: number;
}

export const MEASURE_DEFAULTS = Object.freeze({ concurrency: 1 });

export interface MeasureDiagnostics {
  readonly n: number;
  /** Fraction of runs whose act was invalid or that raised (they did nothing). */
  readonly invalidRate: number;
  /** Fraction of runs that changed the value. */
  readonly changeRate: number;
  /** Fraction of runs that returned no calls (a skip: not a failure). */
  readonly skipRate: number;
  readonly errors: readonly (readonly [string, number])[];
  readonly mutators: readonly string[];
  readonly stepsMean?: number;
  readonly stepsMax?: number;
}

export interface MeasuredPrice {
  readonly instKey: string;
  /** Mean bits of information read per act (what the meter counts). */
  readonly expectedReadBits: number;
  /** Mean energy paid for reading per act: expectedReadBits × READ_PRICE. */
  readonly expectedRead: number;
  /** Mean change cost per act (0 for acts that change nothing). */
  readonly expectedChange: number;
  /** expectedRead + expectedChange: the estimated charge per act. */
  readonly expectedActCost: number;
  readonly randomized: boolean;
  readonly diagnostics: MeasureDiagnostics;
}

const isRun = (x: unknown): x is AgentRun =>
  typeof x === "object" && x !== null && !Array.isArray(x) && "calls" in x;

async function pool<T>(n: number, jobs: readonly (() => Promise<T>)[]): Promise<T[]> {
  const out = new Array<T>(jobs.length);
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, jobs.length)) }, worker));
  return out;
}

interface Sample {
  /** Bits read (information). */
  readonly read: number;
  readonly change: number;
  readonly changed: boolean;
  readonly skipped: boolean;
  readonly mutators: readonly string[];
  readonly usedRandom: boolean;
  readonly error?: string;
  readonly steps?: number;
}

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
/** A meter reading in bits of information: finite and non-negative, else 0. */
export const meterBits = (bits: unknown): number => (typeof bits === "number" && Number.isFinite(bits) && bits > 0 ? bits : 0);
/** The energy charged for reading `bits` bits of information: the one place the read price applies. */
export const readCharge = (bits: unknown, readPrice: number = READ_PRICE): number => meterBits(bits) * readPrice;

/**
 * The most an act can read, in bits of information: the whole object's (Σ layerBits). An act whose meter cannot be read
 * (it trapped, or its worker was killed at the hard wall) is charged as if it read this, so ending in a trap never dodges
 * the reads it made. Like every bit count, actCharge prices it.
 */
export function readBound(inst: Instantiation): number {
  const layers = (objectType(inst.objectType) as ObjectTypeDef<unknown>).layerBits(inst);
  return Object.values(layers).reduce((sum, b) => sum + b, 0);
}

/**
 * The bits read (information, not yet priced) by an act the runtime refused: the bits its meter reported, else the bound
 * only when the act was cut off while running (a LIMIT: a trap, the step or time limit, the hard wall), else 0 (it never
 * ran: a compile error). actCharge prices them.
 */
export function failedReadBits(error: { readBits?: unknown; code?: unknown }, bound: number): number {
  if (typeof error.readBits === "number") return meterBits(error.readBits);
  return error.code === "LIMIT" ? bound : 0;
}

/** True when the act's output is an empty call list (`[]`, None/null, or a clause around no calls): a skip. */
export function isSkip(calls: unknown): boolean {
  let parsed = calls;
  if (typeof calls === "string") { try { parsed = JSON.parse(calls); } catch { return false; } }
  if (parsed === null) return true;
  if (Array.isArray(parsed)) return parsed.length === 0;
  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { calls?: unknown }).calls)) return (parsed as { calls: unknown[] }).calls.length === 0;
  return false;
}

/** Measure an agent's expected charge per act on a reference mixture. */
export async function measureAgent(runActs: RunActs, inst: Instantiation, mixture: ReferenceMixture,
  opts: MeasureOptions): Promise<MeasuredPrice> {
  if (opts.salt === undefined || opts.salt === null || opts.salt.length === 0) throw new Error("measureAgent needs the season salt");
  if (mixture.instKey !== inst.key) throw new Error(`mixture is for ${mixture.instKey}, not ${inst.key}`);
  const o = { ...MEASURE_DEFAULTS, ...opts };
  const typeDef = objectType(inst.objectType) as ObjectTypeDef<unknown>;
  const n = mixture.values.length;
  if (n === 0) throw new Error("empty reference mixture");

  const runOne = async (i: number): Promise<Sample> => {
    const value = mixture.values[i];
    const seed = deriveSeed(opts.salt, ["measure", inst.key, i, 0]);
    let res: unknown;
    try {
      res = await runActs(value, seed, { index: i, replicate: 0, component: mixture.components[i] });
    } catch (e) {
      return { read: 0, change: 0, changed: false, skipped: false, mutators: [], usedRandom: false, error: `run failed: ${(e as Error).message}` };
    }
    const run: AgentRun = isRun(res) ? res : { calls: res };
    const usedRandom = !!run.usedRandom, read = meterBits(run.readBits);
    if (run.error) return { read, change: 0, changed: false, skipped: false, mutators: [], usedRandom, error: run.error, steps: run.steps };
    if (isSkip(run.calls)) return { read, change: 0, changed: false, skipped: true, mutators: [], usedRandom, steps: run.steps };
    const out: ActOutcome = applyCalls(typeDef, inst, value, run.calls);
    if (!out.ok) return { read, change: 0, changed: false, skipped: false, mutators: [], usedRandom, error: out.reason, steps: run.steps };
    return { read, change: actCharge(out, read).change, changed: true, skipped: false, mutators: out.calls.map(c => c[0]), usedRandom, steps: run.steps };
  };

  const all = await pool(o.concurrency, mixture.values.map((_, i) => () => runOne(i)));
  const errors = new Map<string, number>();
  for (const s of all) if (s.error) { const k = s.error.split(":")[0]; errors.set(k, (errors.get(k) ?? 0) + 1); }
  const steps = all.flatMap(s => (s.steps === undefined ? [] : [s.steps]));
  const diagnostics: MeasureDiagnostics = {
    n,
    invalidRate: all.filter(s => s.error).length / n,
    changeRate: all.filter(s => s.changed).length / n,
    skipRate: all.filter(s => s.skipped).length / n,
    errors: [...errors].sort((a, b) => b[1] - a[1]).slice(0, 3),
    mutators: [...new Set(all.flatMap(s => s.mutators))].sort(),
    ...(steps.length ? { stepsMean: mean(steps), stepsMax: Math.max(...steps) } : {}),
  };
  const expectedReadBits = mean(all.map(s => s.read)), expectedRead = readCharge(expectedReadBits), expectedChange = mean(all.map(s => s.change));
  return {
    instKey: inst.key, expectedReadBits, expectedRead, expectedChange, expectedActCost: expectedRead + expectedChange,
    randomized: all.some(s => s.usedRandom), diagnostics,
  };
}

/** What one act costs, in energy bits: its reads at READ_PRICE, plus its change cost when the change commits. */
export interface ActCharge {
  /** Energy paid for reading (bits read × READ_PRICE), not the bits read. */
  readonly read: number;
  /** Energy paid for the committed change, the breaking surcharge (`breaking`) included. */
  readonly change: number;
  readonly total: number;
  /**
   * Only in a room that charges for breaking (settings.breakCost > 0), on a committed change: the bits the change
   * destroyed (how far the object's disclosed worth to all the gods together fell; 0 when it did not fall).
   */
  readonly broke?: number;
  /** With `broke`: the part of `change` paid for breaking, changeCost(W + breakCost·broke) − changeCost(W). */
  readonly breaking?: number;
}

/** "Breaking costs extra" (docs/energy-model.md §2.2): the bits a committed change destroyed, and the room's price per bit. */
export interface Breaking {
  /** D: the drop of the object's disclosed salience, in bits (a rise counts as 0). */
  readonly bits: number;
  /** settings.breakCost: work bits added per bit destroyed. 0 is off. */
  readonly cost: number;
}

/**
 * The charge of one act (docs/energy-model.md §2): READ_PRICE·R + C when its change commits, READ_PRICE·R otherwise.
 * `readBits` is the bits of information read (the meter, failedReadBits or readBound): never an already priced charge.
 * `outcome` is applyCalls' result, or null for an act that produced no outcome (skipped, or the agent raised); `commits`
 * is false when the engine refuses an ok outcome (a collision, the commit clause). `readPrice` is for analysis only
 * (κ = 1 reproduces the old R + C); the engine never passes it. With `breaking` (a room whose breakCost > 0) a committed
 * change's work is W' = W + breakCost·D and it pays changeCost(W') (§2.2); the charge then says how much of it was for
 * breaking. An act that does not commit pays its reads only, as ever.
 */
export function actCharge(outcome: ActOutcome | null, readBits: number, opts: { commits?: boolean; readPrice?: number; breaking?: Breaking } = {}): ActCharge {
  const read = readCharge(readBits, opts.readPrice);
  if (!outcome?.ok || !(opts.commits ?? true)) return { read, change: 0, total: read };
  const plain = outcome.cost.total;
  if (!opts.breaking || !(opts.breaking.cost > 0)) return { read, change: plain, total: read + plain };
  const broke = Math.max(0, opts.breaking.bits);
  const change = broke > 0 ? changeCost(outcome.cost.work + opts.breaking.cost * broke) : plain;
  return { read, change, total: read + change, broke, breaking: change - plain };
}
