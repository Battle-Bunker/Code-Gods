/**
 * Rival inference (docs/public-log-design.md §4): which utility functions do the OTHER gods hold, given what one player
 * sees? For every object value x the player has seen, the engine discloses the peers' net bits y(x) = Σ_{j≠i} n_j(x).
 * Each other god's n_j is one dealt draw's bits (plus a defence goal's, when the game deals them), so
 *
 *   y(x) = Σ over the k other gods of  s⁺_{d_j}(x)  [ − w (h_{p_j}(x) − E h_{p_j}) ]
 *
 * exactly, with coefficient 1 per god. This module builds the candidate columns (every draw the dealer could deal, its
 * bits on every observed value, from the game's own calibration tables) and scores hypotheses two ways:
 *
 * - the spectrum: non-negative least squares of y on every column (the owner's Fourier analogy: a weight per
 *   candidate, robust when the data cannot pin an exact set);
 * - the exact structure: a beam search over multisets of k draws (and k defence goals), each scored by its residual
 *   and its prior (the dealer's: a uniform family, then a uniform parameter set; times the odds of the player's hints),
 *   giving a posterior over the beam and each family's probability of being present.
 *
 * Pure: the caller supplies the tables (the engine's for a live game; the shipped ones in tests and the experiment).
 */
import type { Instantiation, ObjectValue } from "@workspace/game-types";
import { available, context, evaluator, familiesFor, paramsKey } from "./catalog.ts";
import { penaltyMeanBits, softHinge, surprisal, tableFor, UNIFORM_PRIOR, type InstanceTables, type PriorRef } from "./calibration.ts";
import type { Params, UtilityFamily } from "./types.ts";

export type Role = "reward" | "penalty";
/** One draw a god might hold: a family and one parameter set of its support. */
export interface Candidate { readonly familyId: string; readonly params: Params; readonly role: Role }

/** Everything the dealer could deal in this instantiation: every available family (not excluded) × its support. */
export function candidatesFor(inst: Instantiation, options: { exclude?: readonly string[]; excludeDefence?: readonly string[]; defenceGoals?: boolean } = {}): Candidate[] {
  const ctx = context(inst);
  const out: Candidate[] = [];
  const add = (f: UtilityFamily<any>, role: Role) => { for (const params of f.support(ctx)) out.push({ familyId: f.id, params, role }); };
  for (const f of familiesFor(inst.objectType, "reward")) if (available(f, inst).ok && !options.exclude?.includes(f.id)) add(f, "reward");
  if (options.defenceGoals) for (const f of familiesFor(inst.objectType, "penalty")) if (available(f, inst).ok && !options.excludeDefence?.includes(f.id)) add(f, "penalty");
  return out;
}

/**
 * A candidate's contribution to a god's net bits on each value: s⁺ for a reward draw, −w (h − E h) for a defence goal.
 * null when the game has no calibration table for it (it cannot be scored).
 */
export function candidateColumn(c: Candidate, values: readonly ObjectValue[], tables: InstanceTables, inst: Instantiation,
  penaltyWeight: number, prior: PriorRef = UNIFORM_PRIOR): Float64Array | null {
  const table = tableFor(tables, c, inst, prior);
  if (!table) return null;
  const f = evaluator(c, inst), col = new Float64Array(values.length);
  if (c.role === "reward") values.forEach((v, t) => { col[t] = surprisal(table, f(v)); });
  else {
    const mean = penaltyMeanBits(table);
    values.forEach((v, t) => { col[t] = -penaltyWeight * (softHinge(surprisal(table, f(v))) - mean); });
  }
  return col;
}

/**
 * A clue from negotiation: "with probability p some other god holds a draw like this". `params` may be partial (a draw
 * matches when it agrees on every given key). It multiplies the prior odds of every matching candidate by p / (1 − p)
 * against the rest of its role.
 */
export interface Hint { readonly familyId: string; readonly params?: Params; readonly probability: number }

export interface FitInput {
  /** The peers' net bits at each observed value. */
  readonly y: readonly number[];
  /** Candidates with their columns (same length as y). */
  readonly columns: readonly { readonly candidate: Candidate; readonly column: Float64Array }[];
  /** How many other gods there are (the roster size − 1). */
  readonly others: number;
  /** Whether every god also holds a defence goal. */
  readonly defenceGoals?: boolean;
  readonly hints?: readonly Hint[];
  /**
   * The disclosure noise's standard deviation in bits (the game's peerNoiseBits): the others' sums the player sees are
   * the exact sums plus independent Gaussian noise of this scale, so the likelihood never trusts them more closely.
   */
  readonly noiseBits?: number;
  /** Beam width (default 64) and hypotheses reported (default 5). */
  readonly beam?: number;
  readonly top?: number;
}

/** A group of candidates whose columns are identical on the observed values: the data cannot tell them apart. */
export interface DrawClass {
  readonly familyId: string; readonly params: Params; readonly role: Role;
  /** Other draws with the same column (at most 5 listed) and how many there are in all. */
  readonly aliases: readonly { readonly familyId: string; readonly params: Params }[]; readonly aliasCount: number;
}
export interface Hypothesis {
  readonly draws: readonly DrawClass[];
  readonly rss: number; readonly rms: number; readonly r2: number;
  readonly logLikelihood: number; readonly logPrior: number; readonly posterior: number;
}
export interface FitResult {
  readonly observations: number;
  readonly candidates: number;
  /** Distinct columns after merging identical ones. */
  readonly distinct: number;
  readonly others: number;
  /** The Gaussian noise scale behind the likelihood: max(best RMS, SIGMA_FLOOR_BITS, noiseBits). */
  readonly sigma: number;
  /**
   * Whether the best hypothesis explains the observations to within the noise (max(SIGMA_FLOOR_BITS, noiseBits) RMS, with
   * three standard errors of slack). When false, no hypothesis in
   * the beam is right (too few observations, a draw without a table, or too many gods for the search): the posterior is
   * then relative to wrong hypotheses, and the spectrum's families are the better guide.
   */
  readonly exact: boolean;
  readonly hypotheses: readonly Hypothesis[];
  /** Each family's posterior probability of being held by at least one other god (over the beam), best first. */
  readonly families: readonly { readonly familyId: string; readonly role: Role; readonly probability: number }[];
  /** The free-weight fit: the largest non-negative weights, by draw, and its R². */
  readonly spectrum: { readonly r2: number; readonly weights: readonly { readonly familyId: string; readonly params: Params; readonly role: Role; readonly weight: number }[] };
}

/** The likelihood's floor on the noise scale: the model is exact in principle; this keeps the posterior from collapsing on rounding. */
export const SIGMA_FLOOR_BITS = 0.05;

const matches = (c: Candidate, h: Hint) =>
  c.familyId === h.familyId && Object.entries(h.params ?? {}).every(([k, v]) => paramsKey(c.params[k]) === paramsKey(v));

/** The dealer's prior (a uniform family of the role, then a uniform parameter set) times the hints' odds, as logs. */
export function logPriors(candidates: readonly Candidate[], hints: readonly Hint[] = []): Float64Array {
  const out = new Float64Array(candidates.length);
  for (const role of ["reward", "penalty"] as const) {
    const idx = candidates.map((c, i) => [c, i] as const).filter(([c]) => c.role === role);
    const support = new Map<string, number>();
    for (const [c] of idx) support.set(c.familyId, (support.get(c.familyId) ?? 0) + 1);
    for (const [c, i] of idx) out[i] = -Math.log(support.size) - Math.log(support.get(c.familyId)!);
    for (const h of hints) {
      const p = Math.min(0.99, Math.max(0.01, h.probability));
      const hit = idx.filter(([c]) => matches(c, h));
      if (!hit.length || hit.length === idx.length) continue;
      // Mass of the matching set moves from its prior share to p.
      const mass = hit.reduce((m, [, i]) => m + Math.exp(out[i]), 0);
      const boost = Math.log(p / (1 - p)) - Math.log(mass / (1 - mass));
      for (const [, i] of hit) out[i] += boost;
    }
  }
  return out;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const logSumExp = (xs: readonly number[]) => { const m = Math.max(...xs); return m === -Infinity ? m : m + Math.log(xs.reduce((s, x) => s + Math.exp(x - m), 0)); };

/** Non-negative least squares by cyclic coordinate descent (columns are few hundred to a few thousand). */
export function nnls(y: readonly number[], cols: readonly Float64Array[], sweeps = 200): Float64Array {
  const w = new Float64Array(cols.length), r = Float64Array.from(y);
  const norms = cols.map(c => dot(c, c));
  for (let s = 0; s < sweeps; s++) {
    let moved = 0;
    for (let j = 0; j < cols.length; j++) {
      if (!(norms[j] > 0)) continue;
      const c = cols[j], next = Math.max(0, w[j] + dot(c, r) / norms[j]), d = next - w[j];
      if (d === 0) continue;
      for (let t = 0; t < r.length; t++) r[t] -= d * c[t];
      w[j] = next; moved = Math.max(moved, Math.abs(d));
    }
    if (moved < 1e-10) break;
  }
  return w;
}

export function fitMixture(input: FitInput): FitResult {
  const y = Float64Array.from(input.y), T = y.length, k = input.others;
  const beamWidth = input.beam ?? 64, top = input.top ?? 5;
  const priors = logPriors(input.columns.map(c => c.candidate), input.hints);
  // Merge identical columns into classes (prior = log Σ of the members').
  type Cls = { members: number[]; column: Float64Array; role: Role; logPrior: number; norm: number };
  const byKey = new Map<string, Cls>();
  input.columns.forEach(({ candidate, column }, i) => {
    const key = `${candidate.role}:${Array.from(column, x => x.toPrecision(12)).join(",")}`;
    const found = byKey.get(key);
    if (found) { found.members.push(i); found.logPrior = logSumExp([found.logPrior, priors[i]]); }
    else byKey.set(key, { members: [i], column, role: candidate.role, logPrior: priors[i], norm: dot(column, column) });
  });
  const classes = [...byKey.values()];
  const mean = T ? y.reduce((a, b) => a + b, 0) / T : 0;
  const tss = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const floor = Math.max(SIGMA_FLOOR_BITS, input.noiseBits ?? 0);
  const searchSigma2 = floor ** 2;

  // Beam search: k reward classes, then k defence classes, each a multiset (non-decreasing class index).
  type State = { picks: number[]; residual: Float64Array; rss: number; logPrior: number };
  let beam: State[] = [{ picks: [], residual: y, rss: dot(y, y), logPrior: 0 }];
  const phases: Role[] = [...Array(k).fill("reward"), ...(input.defenceGoals ? Array(k).fill("penalty") : [])];
  const score = (s: { rss: number; logPrior: number }) => s.rss / (2 * searchSigma2) - s.logPrior;
  phases.forEach((role, step) => {
    const pool = classes.map((c, i) => [c, i] as const).filter(([c]) => c.role === role);
    const candidates: { from: State; cls: number; rss: number; logPrior: number }[] = [];
    for (const state of beam) {
      const last = step > 0 && phases[step - 1] === role ? state.picks.at(-1)! : -1;
      for (const [c, i] of pool) {
        if (i < last) continue;
        const rss = state.rss - 2 * dot(state.residual, c.column) + c.norm;
        candidates.push({ from: state, cls: i, rss: Math.max(0, rss), logPrior: state.logPrior + c.logPrior });
      }
    }
    candidates.sort((a, b) => score(a) - score(b));
    beam = candidates.slice(0, beamWidth).map(c => {
      const col = classes[c.cls].column, residual = new Float64Array(T);
      for (let t = 0; t < T; t++) residual[t] = c.from.residual[t] - col[t];
      return { picks: [...c.from.picks, c.cls], residual, rss: dot(residual, residual), logPrior: c.logPrior };
    });
  });

  // Polish: from each of the best states, swap one pick for any class of its role while that lowers the score (the
  // beam is greedy, so with many gods its first picks can be wrong; a swap repairs one at a time).
  const residualOf = (picks: number[]) => {
    const r = Float64Array.from(y);
    for (const p of picks) { const col = classes[p].column; for (let t = 0; t < T; t++) r[t] -= col[t]; }
    return r;
  };
  const seen = new Set(beam.map(s => [...s.picks].sort((a, b) => a - b).join(",")));
  for (const start of beam.slice(0, 8)) {
    let state = start;
    for (let round = 0; round < 4 * phases.length; round++) {
      let improved: State | null = null;
      state.picks.forEach((old, slot) => {
        const base = Float64Array.from(state.residual);
        const oldCol = classes[old].column;
        for (let t = 0; t < T; t++) base[t] += oldCol[t];
        const baseRss = dot(base, base), basePrior = state.logPrior - classes[old].logPrior;
        classes.forEach((c, i) => {
          if (i === old || c.role !== classes[old].role) return;
          const rss = Math.max(0, baseRss - 2 * dot(base, c.column) + c.norm);
          const cand = { rss, logPrior: basePrior + c.logPrior };
          if (score(cand) < score(improved ?? state) - 1e-12) {
            const picks = [...state.picks]; picks[slot] = i;
            improved = { picks, residual: new Float64Array(0), rss, logPrior: cand.logPrior };
          }
        });
      });
      if (!improved) break;
      const next = improved as State;
      state = { ...next, residual: residualOf(next.picks), rss: dot(residualOf(next.picks), residualOf(next.picks)) };
    }
    const key = [...state.picks].sort((a, b) => a - b).join(",");
    if (!seen.has(key)) { seen.add(key); beam.push(state); }
  }

  const best = beam.length ? Math.min(...beam.map(s => s.rss)) : 0;
  const sigma = Math.max(T ? Math.sqrt(best / T) : 0, floor);
  const logLik = (rss: number) => -T * Math.log(sigma * Math.sqrt(2 * Math.PI)) - rss / (2 * sigma * sigma);
  const logPost = beam.map(s => logLik(s.rss) + s.logPrior);
  const z = logSumExp(logPost);
  const posterior = logPost.map(l => Math.exp(l - z));
  const order = beam.map((_, i) => i).sort((a, b) => posterior[b] - posterior[a]);
  const drawOf = (cls: number): DrawClass => {
    const members = classes[cls].members.map(i => input.columns[i].candidate);
    return {
      familyId: members[0].familyId, params: members[0].params, role: members[0].role,
      aliases: members.slice(1, 6).map(m => ({ familyId: m.familyId, params: m.params })), aliasCount: members.length - 1,
    };
  };
  const hypotheses = order.slice(0, top).map(i => {
    const s = beam[i];
    return {
      draws: s.picks.map(drawOf), rss: s.rss, rms: T ? Math.sqrt(s.rss / T) : 0, r2: tss > 0 ? 1 - s.rss / tss : 1,
      logLikelihood: logLik(s.rss), logPrior: s.logPrior, posterior: posterior[i],
    };
  });
  // Family presence: Σ posterior over beam states holding any member of the family.
  const presence = new Map<string, { role: Role; p: number }>();
  beam.forEach((s, i) => {
    const fams = new Set<string>();
    for (const cls of s.picks) for (const m of classes[cls].members) fams.add(`${input.columns[m].candidate.role}\0${input.columns[m].candidate.familyId}`);
    for (const f of fams) {
      const [role, familyId] = f.split("\0") as [Role, string];
      const e = presence.get(familyId) ?? { role, p: 0 };
      e.p += posterior[i]; presence.set(familyId, e);
    }
  });
  const families = [...presence].map(([familyId, e]) => ({ familyId, role: e.role, probability: Math.min(1, e.p) })).sort((a, b) => b.probability - a.probability);

  const w = nnls(input.y, classes.map(c => c.column));
  const fitted = new Float64Array(T);
  classes.forEach((c, j) => { if (w[j] > 0) for (let t = 0; t < T; t++) fitted[t] += w[j] * c.column[t]; });
  const sres = y.reduce((s, v, t) => s + (v - fitted[t]) ** 2, 0);
  const weights = classes.map((c, j) => ({ j, w: w[j] })).filter(x => x.w > 1e-6).sort((a, b) => b.w - a.w).slice(0, 12)
    .map(({ j, w }) => { const d = drawOf(j); return { familyId: d.familyId, params: d.params, role: d.role, weight: w }; });

  return {
    observations: T, candidates: input.columns.length, distinct: classes.length, others: k, sigma, exact: (T ? Math.sqrt(best / T) : 0) <= floor * (1 + 3 / Math.sqrt(Math.max(1, T))), hypotheses, families,
    spectrum: { r2: tss > 0 ? 1 - sres / tss : 1, weights },
  };
}
