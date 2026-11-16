/**
 * Rival inference (v1's fit_utility_mixture, restored under the coordinator's call 36; archive lib/game-utilities/src/
 * inference.ts, docs/public-log-design.md §4): which rules do the OTHER players hold, given the others' summed bits a
 * player has seen? Each observed value is y = Σ over the k others of their rule's bits at that state (+ the game's
 * disclosure noise). This module scores hypotheses two ways, as v1 did:
 *  - exact structure: every set of k candidate rules of different families (the dealer never seats one family twice),
 *    by a Gaussian likelihood at σ and the dealer's prior (a uniform family, then uniform parameters) times the odds of
 *    the player's hints, giving a posterior and each family's probability of being held;
 *  - the spectrum: non-negative least squares of y on every candidate's column (a weight per candidate).
 * Pure: the caller supplies each candidate's bits at the observed states (the server, from the game's value functions).
 */

/** A rule the dealer could deal, with its bits at each observed state. */
export interface FitCandidate { readonly family: string; readonly params: unknown; readonly tieBreaker: string | null; readonly bits: readonly number[] }
/** A clue from play ("I like big primes"): a family, maybe some of its params, and how likely it is to be true. */
export interface FitHint { readonly family: string; readonly params?: Record<string, unknown>; readonly probability: number }
export interface FitInput {
  /** The others' summed bits as shown, one per observed state. */
  readonly y: readonly number[];
  readonly candidates: readonly FitCandidate[];
  /** How many other players there are (k). */
  readonly others: number;
  /** The game's disclosure noise, σ in bits (0: exact). */
  readonly sigma: number;
  readonly hints?: readonly FitHint[];
  /** Families the player is sure nobody holds. */
  readonly exclude?: readonly string[];
  /** How many hypotheses to report (default 10). */
  readonly top?: number;
}
export interface FitHypothesis { readonly rules: readonly { family: string; params: unknown; tieBreaker: string | null }[]; readonly posterior: number; readonly rms: number }
export interface FitResult {
  readonly hypotheses: readonly FitHypothesis[];
  /** Each family's probability of being held by someone (over the hypotheses scored). */
  readonly families: Readonly<Record<string, number>>;
  /** Does the best hypothesis explain the data to within the noise? */
  readonly exact: boolean;
  /** The non-negative least-squares weight of each candidate (same order as the input). */
  readonly spectrum: readonly number[];
  readonly observations: number;
}

/** σ's floor in bits: exact sums still differ in the last bits (v1's SIGMA_FLOOR_BITS). */
export const SIGMA_FLOOR_BITS = 0.05;
/** Beyond this many candidate sets, a beam search replaces enumeration. */
const ENUMERATE_UP_TO = 20_000;
const BEAM = 400;

/** Non-negative least squares by projected coordinate descent (v1's). */
export function nnls(y: readonly number[], cols: readonly Float64Array[], sweeps = 200): Float64Array {
  const n = y.length, w = new Float64Array(cols.length), r = Float64Array.from(y);
  const norms = cols.map(c => c.reduce((t, x) => t + x * x, 0));
  for (let s = 0; s < sweeps; s++) {
    let moved = 0;
    for (let j = 0; j < cols.length; j++) {
      if (!(norms[j]! > 0)) continue;
      const c = cols[j]!;
      let g = 0;
      for (let i = 0; i < n; i++) g += c[i]! * r[i]!;
      const next = Math.max(0, w[j]! + g / norms[j]!), d = next - w[j]!;
      if (d !== 0) { for (let i = 0; i < n; i++) r[i]! -= d * c[i]!; w[j] = next; moved = Math.max(moved, Math.abs(d)); }
    }
    if (moved < 1e-10) break;
  }
  return w;
}

/** log prior of each candidate: a uniform family, then uniform parameters within it; times the odds of matching hints. */
function logPriors(cands: readonly FitCandidate[], hints: readonly FitHint[]): number[] {
  const perFamily = new Map<string, number>();
  for (const c of cands) perFamily.set(c.family, (perFamily.get(c.family) ?? 0) + 1);
  const families = perFamily.size;
  return cands.map(c => {
    let lp = -Math.log(families) - Math.log(perFamily.get(c.family)!);
    for (const h of hints) {
      if (h.family !== c.family) continue;
      const matches = !h.params || Object.entries(h.params).every(([k, v]) => JSON.stringify((c.params as Record<string, unknown>)?.[k]) === JSON.stringify(v));
      if (!matches) continue;
      // A hint of probability p against the prior share of its family: odds p/(1 − p) over the family's base odds.
      const p = Math.min(0.999, Math.max(0.001, h.probability)), base = 1 / families;
      lp += Math.log((p / (1 - p)) / (base / (1 - base)));
    }
    return lp;
  });
}

export function fitRules(input: FitInput): FitResult {
  const exclude = new Set(input.exclude ?? []);
  const cands = input.candidates.filter(c => !exclude.has(c.family));
  const n = input.y.length, k = Math.max(1, input.others), sigma = Math.max(SIGMA_FLOOR_BITS, input.sigma), top = input.top ?? 10;
  const priors = logPriors(cands, input.hints ?? []);
  const sse = (set: readonly number[]) => {
    let t = 0;
    for (let i = 0; i < n; i++) { let p = 0; for (const j of set) p += cands[j]!.bits[i]!; t += (input.y[i]! - p) ** 2; }
    return t;
  };
  const score = (set: readonly number[]) => set.reduce((t, j) => t + priors[j]!, 0) - sse(set) / (2 * sigma * sigma);
  // Sets of k candidates of distinct families, in increasing index order.
  const sets: number[][] = [];
  const total = (() => { let c = 1; for (let i = 0; i < k; i++) c = (c * (cands.length - i)) / (i + 1); return c; })();
  if (total <= ENUMERATE_UP_TO) {
    const walk = (from: number, set: number[]) => {
      if (set.length === k) { sets.push(set.slice()); return; }
      for (let j = from; j < cands.length; j++) if (!set.some(x => cands[x]!.family === cands[j]!.family)) { set.push(j); walk(j + 1, set); set.pop(); }
    };
    walk(0, []);
  } else {
    // Beam search: grow sets one candidate at a time, keeping the best BEAM partial sets by score.
    let beam: number[][] = [[]];
    for (let depth = 0; depth < k; depth++) {
      const next: number[][] = [];
      for (const set of beam) for (let j = (set.at(-1) ?? -1) + 1; j < cands.length; j++) if (!set.some(x => cands[x]!.family === cands[j]!.family)) next.push([...set, j]);
      beam = next.map(s => ({ s, v: score(s) })).sort((a, b) => b.v - a.v).slice(0, BEAM).map(x => x.s);
    }
    sets.push(...beam);
  }
  const scored = sets.map(s => ({ s, v: score(s) })).sort((a, b) => b.v - a.v);
  const mx = scored[0]?.v ?? 0;
  let z = 0;
  for (const x of scored) z += Math.exp(x.v - mx);
  const post = scored.map(x => ({ s: x.s, p: Math.exp(x.v - mx) / z }));
  const families: Record<string, number> = {};
  for (const c of cands) families[c.family] = 0;
  for (const { s, p } of post) for (const f of new Set(s.map(j => cands[j]!.family))) families[f]! += p;
  const rule = (j: number) => ({ family: cands[j]!.family, params: cands[j]!.params, tieBreaker: cands[j]!.tieBreaker });
  const hypotheses = post.slice(0, top).map(({ s, p }) => ({ rules: s.map(rule), posterior: p, rms: n ? Math.sqrt(sse(s) / n) : 0 }));
  const exact = n > 0 && hypotheses.length > 0 && hypotheses[0]!.rms <= 1.5 * sigma;
  const w = nnls(input.y, input.candidates.map(c => Float64Array.from(c.bits)));
  return { hypotheses, families, exact, spectrum: [...w], observations: n };
}
