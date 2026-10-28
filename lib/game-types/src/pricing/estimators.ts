/**
 * Decision information estimators (open-agents.md §3.3–3.4; a line-by-line port of measure.py).
 *
 * Deterministic agent (no run drew from `random`): I = H(A), the MINIMUM of four estimates in bits:
 *   joint       Miller–Madow H(A) = plug-in + (m − 1)/(2n ln 2); ∞ unless Good–Turing coverage
 *               1 − f₁/n ≥ ½ (f₁ = actions seen once). Saturates at log2 n.
 *   positional  H(len) + Σ_positions [H(mutator at p) + Σ_fields H(field at p)], absent = ⊥; each
 *               component Miller–Madow capped by log2 of its alphabet, or the cap when its coverage
 *               is below ½. Alphabets: max length + 2; #mutators + 1; #values of the field + 1.
 *   set         Σ_moves seen H_b(P(move ∈ A)), same fallback; only if every action lists its moves in
 *               strictly increasing enumeration order (then A is a function of its move set).
 *   naming      E[γ(len + 1) + Σ (log2 #mutators + D(move))], an upper bound by source coding.
 * Randomized agent (R runs per grid): I_jk = Ĥ_jk(A) − mean_x Ĥ_jk(A | x), jackknife-corrected,
 * clipped at 0 and used only if the joint coverage ≥ ½; the decision is min(I_jk, the four bounds
 * on H(A) over all n·R runs). Plug-in, Miller–Madow and the shuffle correction are diagnostics.
 */
import { SplitMix64 } from "./rng.ts";
import { actionKey, namingBits, type Action, type MoveSpace } from "./space.ts";

const LN2 = Math.log(2);

export interface EntropyStats {
  readonly n: number;
  readonly distinct: number;
  readonly plugin: number;
  /** Miller–Madow. */
  readonly mm: number;
  /** Standard error of the plug-in estimate. */
  readonly se: number;
  /** Good–Turing coverage 1 − f₁/n. */
  readonly coverage: number;
}

function counts<T>(keys: readonly T[]): number[] {
  const c = new Map<T, number>();
  for (const k of keys) c.set(k, (c.get(k) ?? 0) + 1);
  return [...c.values()];
}

export function entropyStats<T>(keys: readonly T[]): EntropyStats {
  const n = keys.length;
  if (n === 0) return { n: 0, distinct: 0, plugin: 0, mm: 0, se: 0, coverage: 1 };
  const cnt = counts(keys);
  let H = 0, H2 = 0, f1 = 0;
  for (const c of cnt) {
    const p = c / n, lp = Math.log2(p);
    H -= p * lp;
    H2 += p * lp * lp;
    if (c === 1) f1++;
  }
  const m = cnt.length;
  return {
    n, distinct: m, plugin: H, mm: H + (m - 1) / (2 * n * LN2),
    se: Math.sqrt(Math.max((H2 - H * H) / n, 0)), coverage: 1 - f1 / n,
  };
}

/** Plug-in entropy (bits). */
export function pluginEntropy<T>(keys: readonly T[]): number {
  return entropyStats(keys).plugin;
}

const xlx = (x: number): number => (x > 0 ? x * Math.log2(Math.max(x, 1)) : 0);

/**
 * Jackknife bias-corrected entropy (bits): n·H − (n−1)/n · Σ_i H(sample without i), in closed form:
 * with S = Σ c log2 c, removing one copy of outcome k gives S_k = S − c_k log2 c_k + (c_k − 1) log2(c_k − 1)
 * and H_k = log2(n − 1) − S_k/(n − 1).
 */
export function jackknifeEntropy<T>(keys: readonly T[]): number {
  const n = keys.length;
  if (n <= 1) return 0;
  const cnt = counts(keys);
  let S = 0;
  for (const c of cnt) S += xlx(c);
  const H = Math.log2(n) - S / n;
  let acc = 0;
  for (const c of cnt) {
    const Sk = S - xlx(c) + xlx(c - 1);
    acc += c * (Math.log2(n - 1) - Sk / (n - 1));
  }
  return n * H - ((n - 1) / n) * acc;
}

/** One component of the positional and set bounds: Miller–Madow capped by log2 alphabet. */
export function componentBits<T>(keys: readonly T[], alphabet: number, minCoverage: number): number {
  const st = entropyStats(keys);
  const cap = Math.log2(Math.max(alphabet, 1));
  return st.coverage < minCoverage ? cap : Math.min(st.mm, cap);
}

export type EstimateName = "joint" | "positional" | "set" | "naming" | "mutual";
export type Estimates = Partial<Record<EstimateName, number>>;

export interface DecisionEstimate {
  /** The decision information charged: max(0, the binding estimate). */
  readonly bits: number;
  readonly binding: EstimateName;
  readonly estimates: Estimates;
  /** Joint statistics of the actions (all n·R runs when randomized). */
  readonly joint: EntropyStats;
}

export interface RandomizedEstimate extends DecisionEstimate {
  /** Miller–Madow H(A) over all runs. */
  readonly H_A: number;
  /** Mean plug-in H(A | x). */
  readonly H_A_given_X: number;
  readonly I_plugin: number;
  /** Mean plug-in I of the table with grid labels shuffled (SplitMix64 + Fisher–Yates). */
  readonly I_shuffle: number;
  readonly I_shuffle_corrected: number;
  readonly I_mm: number;
  readonly I_jackknife: number;
}

const ABSENT = "⊥";
const vkey = (v: unknown): string => JSON.stringify(v) ?? "undefined";

/** Keep the first minimum, in the order joint, positional, set, naming, mutual (Python min(dict)). */
function bindingOf(est: Estimates): EstimateName {
  let best: EstimateName | null = null;
  for (const k of ["joint", "positional", "set", "naming", "mutual"] as const) {
    const v = est[k];
    if (v === undefined) continue;
    if (best === null || v < est[best]!) best = k;
  }
  return best ?? "joint";
}

/** H(action) of a deterministic agent: min of the joint, positional, set and naming estimates. */
export function decisionDeterministic(acts: readonly Action[], space: MoveSpace, minCoverage = 0.5): DecisionEstimate {
  const keys = acts.map(actionKey);
  const joint = entropyStats(keys);
  const nmax = acts.reduce((m, a) => Math.max(m, a.length), 0);
  const nmut = space.nMutators + 1;
  // fields: the space's (enumeration order), then any others the actions use (non-enumerable types)
  const fields = [...space.fieldOrder];
  const known = new Set(fields);
  for (const a of acts) for (const m of a) for (const [f] of m.items) if (!known.has(f)) { known.add(f); fields.push(f); }

  let pos = componentBits(acts.map(a => a.length), nmax + 2, minCoverage);
  for (let p = 0; p < nmax; p++) {
    pos += componentBits(acts.map(a => (p < a.length ? a[p].mid : ABSENT)), nmut, minCoverage);
    for (const f of fields) {
      const col = acts.map(a => {
        if (p >= a.length) return ABSENT;
        const it = a[p].items.find(([k]) => k === f);
        return it ? vkey(it[1]) : ABSENT;
      });
      if (col.some(v => v !== ABSENT)) pos += componentBits(col, space.fieldAlphabet(f), minCoverage);
    }
  }

  // set bound: valid only if every action lists its moves in strictly increasing canonical order
  const enumerable = space.enumerable;
  const canonical = acts.every(a => a.every((m, i) => {
    if (enumerable && space.rank(m) === undefined) return false;
    return i === 0 || (enumerable ? space.rank(a[i - 1])! < space.rank(m)! : space.compare(a[i - 1], m) < 0);
  }));
  let setb = Infinity;
  if (canonical) {
    const universe = new Map<string, Action[number]>();
    for (const a of acts) for (const m of a) universe.set(m.key, m);
    const sets = acts.map(a => new Set(a.map(m => m.key)));
    setb = 0;
    for (const k of universe.keys()) setb += componentBits(sets.map(s => s.has(k)), 2, minCoverage);
  }

  const naming = acts.length ? acts.reduce((s, a) => s + namingBits(a, space), 0) / acts.length : 0;
  const est: Estimates = {
    joint: joint.coverage >= minCoverage ? joint.mm : Infinity,
    positional: pos, set: setb, naming,
  };
  const binding = bindingOf(est);
  return { bits: Math.max(0, est[binding]!), binding, estimates: est, joint };
}

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/**
 * I(X; A) = H(A) − H(A|X) from R runs per grid (actsByGrid[i] = the R actions on grid i), each
 * entropy jackknife-corrected, capped by the H(A) bounds of decisionDeterministic over all runs.
 */
export function decisionRandomized(actsByGrid: readonly (readonly Action[])[], space: MoveSpace, minCoverage = 0.5,
  shuffles = 32, shuffleSeed: bigint | number = 0n): RandomizedEstimate {
  const flat = actsByGrid.flat();
  const det = decisionDeterministic(flat, space, minCoverage);
  const keys = actsByGrid.map(row => row.map(actionKey));
  const allk = keys.flat();
  const all = entropyStats(allk);
  const HA = all.plugin;
  const HAX = mean(keys.map(r => pluginEntropy(r)));
  const I_plugin = HA - HAX;
  const rng = new SplitMix64(BigInt(shuffleSeed));
  const R = keys.length ? keys[0].length : 0;
  const shuf: number[] = [];
  for (let s = 0; s < shuffles; s++) {
    const perm = rng.permutation(allk.length);
    const rows = keys.map((_, i) => Array.from({ length: R }, (_, j) => allk[perm[i * R + j]]));
    shuf.push(HA - mean(rows.map(r => pluginEntropy(r))));
  }
  const I_shuffle = mean(shuf);
  const I_jackknife = jackknifeEntropy(allk) - mean(keys.map(r => jackknifeEntropy(r)));
  const I_mm = all.mm - mean(keys.map(r => entropyStats(r).mm));
  const est: Estimates = { ...det.estimates, mutual: all.coverage >= minCoverage ? Math.max(0, I_jackknife) : Infinity };
  const binding = bindingOf(est);
  return {
    bits: Math.max(0, est[binding]!), binding, estimates: est, joint: all,
    H_A: all.mm, H_A_given_X: HAX, I_plugin, I_shuffle, I_shuffle_corrected: I_plugin - I_shuffle, I_mm, I_jackknife,
  };
}

/**
 * The decision of measure.py `_decision`: randomized → decisionRandomized over the R runs per grid;
 * deterministic → decisionDeterministic over the first run of each grid.
 */
export function estimateDecision(actsByGrid: readonly (readonly Action[])[], randomized: boolean, space: MoveSpace,
  opts: { minCoverage?: number; shuffles?: number; shuffleSeed?: bigint } = {}): DecisionEstimate | RandomizedEstimate {
  const minCoverage = opts.minCoverage ?? 0.5;
  return randomized
    ? decisionRandomized(actsByGrid, space, minCoverage, opts.shuffles ?? 32, opts.shuffleSeed ?? 0n)
    : decisionDeterministic(actsByGrid.map(r => r[0]), space, minCoverage);
}
