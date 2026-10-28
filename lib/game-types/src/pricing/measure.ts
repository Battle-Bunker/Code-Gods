/**
 * The per-application price of an open agent, measured black-box at summon time
 * (open-agents.md §3–4; measure.py `_price` without the description and the ratchet).
 *
 *   summon_bits          = ast-bits-v1 description of the source       paid once, by the god (Runtime)
 *   per_application_bits = I(X; A) + E[erasure] + E[motion] + floor    paid by the agent on every act
 *
 * The agent is only ever RUN, on every value of the reference mixture (mixture.ts), never read:
 * - once per value, with seed deriveSeed(salt, ["measure", inst.key, i, 0]);
 * - if any run used `random`, R − 1 more times per value (replicates j = 1 … R − 1), and the
 *   decision is the jackknife I = Ĥ(A) − mean Ĥ(A|x); otherwise I = H(A) (estimators.ts).
 * Erasure and motion are those applyCalls charges for the moves actually returned (pointwise
 * erasure per call, motion on the whole act's net change), averaged over the runs; a run that does
 * nothing pays nothing.
 *
 * The ratchet (Grid Lab's closure surcharge) is OFF. Charging per application already pays for
 * compounding erasure as it happens, so §4.1 finds it mostly redundant (only full_greedy and
 * random_improver pay one), and it needs ~24 closures of re-application per summon.
 *
 * `perActFloorBits` (default 0) is added to every act's charge, valid or not.
 */
import { applyCalls, DEFAULT_COST_KNOBS } from "../mutators.ts";
import { objectType } from "../registry.ts";
import type { ActOutcome, CostKnobs, Instantiation, ObjectTypeDef, ObjectValue } from "../types.ts";
import {
  estimateDecision, type DecisionEstimate, type EntropyStats, type EstimateName, type Estimates, type RandomizedEstimate,
} from "./estimators.ts";
import type { ReferenceMixture } from "./mixture.ts";
import { deriveSeed } from "./rng.ts";
import { moveSpace, resolveAct, type Action, type MoveSpace } from "./space.ts";

/** What the runtime reports for one sandboxed run of the agent. */
export interface AgentRun {
  /** The act's wire output: JSON text of [[mutator id, params], ...] (or the parsed array). */
  readonly calls: unknown;
  /** True when the run drew from `random` (the runtime's seeded Random). */
  readonly usedRandom?: boolean;
  /** Set when the run raised, timed out or ran out of steps: the act does nothing. */
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
 * frozen clock. May return an AgentRun or the bare wire output (then usedRandom = false).
 */
export type RunActs = (value: ObjectValue, seed: bigint, at: RunContext) => Promise<AgentRun | unknown> | AgentRun | unknown;

export interface MeasureOptions {
  /** The SECRET season salt for the run seeds (the same one play seeds use). Required. */
  readonly salt: string | Uint8Array;
  /** Seeds per value for an agent that uses randomness (R). Default 8. */
  readonly replicates?: number;
  /** Label shuffles of the diagnostic. Default 32. */
  readonly shuffles?: number;
  /** Good–Turing coverage below which an entropy estimate is not trusted. Default 0.5. */
  readonly minCoverage?: number;
  readonly knobs?: CostKnobs;
  /** Bits added to every act's charge. Default 0. */
  readonly perActFloorBits?: number;
  /** Runs in flight at once. Default 1 (results never depend on it). */
  readonly concurrency?: number;
  /** Also estimate the decision per mixture component (diagnostics). Default true. */
  readonly byComponent?: boolean;
  /** Override the move space (tests). */
  readonly space?: MoveSpace;
}

export const MEASURE_DEFAULTS = Object.freeze({ replicates: 8, shuffles: 32, minCoverage: 0.5, perActFloorBits: 0, concurrency: 1 });

export interface ComponentDiagnostics {
  readonly n: number;
  readonly decision: number;
  readonly binding: EstimateName;
  readonly H_plugin: number;
  readonly erasure: number;
  readonly motion: number;
}

export interface MeasureDiagnostics {
  readonly n: number;
  readonly replicates: number;
  readonly joint: EntropyStats;
  /** Fraction of runs whose act was invalid or that raised (they did nothing). */
  readonly invalidRate: number;
  /** Fraction of runs that changed the value. */
  readonly changeRate: number;
  readonly errors: readonly (readonly [string, number])[];
  readonly mutators: readonly string[];
  readonly stepsMean?: number;
  readonly stepsMax?: number;
  readonly byComponent: Readonly<Record<string, ComponentDiagnostics>>;
  /** Randomized agents only (estimators.ts RandomizedEstimate). */
  readonly H_A?: number;
  readonly H_A_given_X?: number;
  readonly I_plugin?: number;
  readonly I_mm?: number;
  readonly I_jackknife?: number;
  readonly I_shuffle?: number;
  readonly I_shuffle_corrected?: number;
}

export interface MeasuredPrice {
  readonly instKey: string;
  /** I(X; A) in bits: charged on every act, valid or not. */
  readonly decisionBits: number;
  readonly binding: EstimateName;
  readonly estimates: Estimates;
  /** Mean pointwise erasure of the moves returned over the mixture. */
  readonly expectedErasure: number;
  /** Mean motion over the mixture. */
  readonly expectedMotion: number;
  readonly perActFloorBits: number;
  /** decisionBits + expectedErasure + expectedMotion + perActFloorBits. */
  readonly perApplicationBits: number;
  /** The same number, under the name the server stores on the agent. */
  readonly expectedActCost: number;
  readonly randomized: boolean;
  readonly ratchet: "off";
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
  readonly action: Action;
  readonly erasure: number;
  readonly motion: number;
  readonly changed: boolean;
  readonly usedRandom: boolean;
  readonly error?: string;
  readonly steps?: number;
}

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Measure an agent's per-application price on a reference mixture. */
export async function measureAgent(runActs: RunActs, inst: Instantiation, mixture: ReferenceMixture,
  opts: MeasureOptions): Promise<MeasuredPrice> {
  if (opts.salt === undefined || opts.salt === null || opts.salt.length === 0) throw new Error("measureAgent needs the season salt");
  if (mixture.instKey !== inst.key) throw new Error(`mixture is for ${mixture.instKey}, not ${inst.key}`);
  const o = { ...MEASURE_DEFAULTS, ...opts };
  const knobs = opts.knobs ?? DEFAULT_COST_KNOBS;
  const typeDef = objectType(inst.objectType) as ObjectTypeDef<unknown>;
  const space = opts.space ?? moveSpace(typeDef, inst);
  const n = mixture.values.length;
  if (n === 0) throw new Error("empty reference mixture");

  const runOne = async (i: number, j: number): Promise<Sample> => {
    const value = mixture.values[i];
    const seed = deriveSeed(opts.salt, ["measure", inst.key, i, j]);
    let res: unknown;
    try {
      res = await runActs(value, seed, { index: i, replicate: j, component: mixture.components[i] });
    } catch (e) {
      return { action: [], erasure: 0, motion: 0, changed: false, usedRandom: false, error: `run failed: ${(e as Error).message}` };
    }
    const run: AgentRun = isRun(res) ? res : { calls: res };
    const usedRandom = !!run.usedRandom;
    if (run.error) return { action: [], erasure: 0, motion: 0, changed: false, usedRandom, error: run.error, steps: run.steps };
    const act = resolveAct(typeDef, inst, value, run.calls, space);
    const out: ActOutcome = applyCalls(typeDef, inst, value, run.calls, knobs);
    return {
      action: act.action, usedRandom, steps: run.steps,
      erasure: out.ok ? out.cost.erasure : 0, motion: out.ok ? out.cost.motion : 0, changed: out.ok,
      ...(act.valid ? {} : { error: act.error ?? "invalid act" }),
    };
  };

  const first = await pool(o.concurrency, mixture.values.map((_, i) => () => runOne(i, 0)));
  const runs: Sample[][] = first.map(s => [s]);
  const randomized = first.some(s => s.usedRandom);
  if (randomized) {
    const jobs: (() => Promise<void>)[] = [];
    for (let i = 0; i < n; i++) for (let j = 1; j < o.replicates; j++) jobs.push(async () => { runs[i][j] = await runOne(i, j); });
    await pool(o.concurrency, jobs);
  }

  const acts = runs.map(row => row.map(s => s.action));
  const dec = estimateDecision(acts, randomized, space, {
    minCoverage: o.minCoverage, shuffles: o.shuffles, shuffleSeed: deriveSeed(opts.salt, ["shuffle", inst.key]),
  });
  const eraseI = runs.map(row => mean(row.map(s => s.erasure)));
  const motionI = runs.map(row => mean(row.map(s => s.motion)));
  const expectedErasure = mean(eraseI), expectedMotion = mean(motionI);

  const byComponent: Record<string, ComponentDiagnostics> = {};
  if (opts.byComponent ?? true) {
    for (const c of [...new Set(mixture.components)]) {
      const idx = mixture.components.flatMap((k, i) => (k === c ? [i] : []));
      const d = estimateDecision(idx.map(i => acts[i]), randomized, space, {
        minCoverage: o.minCoverage, shuffles: o.shuffles, shuffleSeed: deriveSeed(opts.salt, ["shuffle", inst.key, c]),
      });
      byComponent[c] = {
        n: idx.length, decision: d.bits, binding: d.binding, H_plugin: d.joint.plugin,
        erasure: mean(idx.map(i => eraseI[i])), motion: mean(idx.map(i => motionI[i])),
      };
    }
  }

  const all = runs.flat();
  const errors = new Map<string, number>();
  for (const s of all) if (s.error) { const k = s.error.split(":")[0]; errors.set(k, (errors.get(k) ?? 0) + 1); }
  const steps = all.flatMap(s => (s.steps === undefined ? [] : [s.steps]));
  const rnd = randomized ? (dec as RandomizedEstimate) : null;
  const diagnostics: MeasureDiagnostics = {
    n, replicates: randomized ? o.replicates : 1, joint: dec.joint,
    invalidRate: all.filter(s => s.error).length / all.length,
    changeRate: all.filter(s => s.changed).length / all.length,
    errors: [...errors].sort((a, b) => b[1] - a[1]).slice(0, 3),
    mutators: [...new Set(all.flatMap(s => s.action.map(m => m.mid)))].sort(),
    ...(steps.length ? { stepsMean: mean(steps), stepsMax: Math.max(...steps) } : {}),
    byComponent,
    ...(rnd ? {
      H_A: rnd.H_A, H_A_given_X: rnd.H_A_given_X, I_plugin: rnd.I_plugin, I_mm: rnd.I_mm, I_jackknife: rnd.I_jackknife,
      I_shuffle: rnd.I_shuffle, I_shuffle_corrected: rnd.I_shuffle_corrected,
    } : {}),
  };
  const floor = o.perActFloorBits;
  const perApp = dec.bits + expectedErasure + expectedMotion + floor;
  return {
    instKey: inst.key, decisionBits: dec.bits, binding: dec.binding, estimates: dec.estimates,
    expectedErasure, expectedMotion, perActFloorBits: floor, perApplicationBits: perApp, expectedActCost: perApp,
    randomized, ratchet: "off", diagnostics,
  };
}

/** The measured price as stored on a summoned agent. */
export interface StoredAgentPrice {
  readonly decisionBits: number;
  readonly perActFloorBits?: number;
}

export interface ActCharge {
  readonly decision: number;
  readonly erasure: number;
  readonly motion: number;
  readonly floor: number;
  readonly total: number;
}

/**
 * What one act of a measured agent costs. A valid act pays decisionBits + its pointwise erasure +
 * motion (applyCalls' cost; its naming `decision` term is NOT charged, the measured I replaces it);
 * a failed or duplicate act pays decisionBits only. Every act adds the floor.
 */
export function actCharge(price: StoredAgentPrice, outcome: ActOutcome, opts: { duplicate?: boolean } = {}): ActCharge {
  const floor = price.perActFloorBits ?? 0;
  const paid = outcome.ok && !opts.duplicate;
  const erasure = paid ? outcome.cost.erasure : 0, motion = paid ? outcome.cost.motion : 0;
  return { decision: price.decisionBits, erasure, motion, floor, total: price.decisionBits + erasure + motion + floor };
}

export type { DecisionEstimate };
