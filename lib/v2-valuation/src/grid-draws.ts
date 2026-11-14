/**
 * Direct and importance-sampled draws of grid boards (owner decisions 22 and 23; docs/engine-v2/grids.md §5.2). The
 * grid's stationary law is a product of independent cells, π(board) = Π p(v), so boards are drawn from π itself, and
 * rare scores from proposals that cross-entropy adapts towards the best boards, each a product over blocks of cells
 * (a categorical law per cell, or per pair of cells a family's units tie together). Draws come from a defensive mixture
 * of every proposal, π included, and carry exact weights π(x)/q_mix(x).
 *
 * "Best" is an ordering the caller gives (a utility in lexicographic order for value functions; a rung level for the
 * schema-5 ladders until decision 23 deletes them).
 */
import { rng, type Rng, type Variant } from "@workspace/v2-core";
import { cellProbability, gridParams, gridSums } from "@workspace/v2-grid";

export interface DrawConfig {
  /** Boards per adaptation round. */
  readonly roundSamples: number;
  /** The elite share. */
  readonly rho: number;
  /** Smoothing: the new law's weight. */
  readonly alpha: number;
  /** Each value's least share in a proposal (mixed with the uniform law). */
  readonly floor: number;
  readonly maxRounds: number;
  /** Rounds without a better elite threshold before adaptation stops. */
  readonly patience: number;
}

export const DRAW_CONFIG: DrawConfig = { roundSamples: 2_000, rho: 0.1, alpha: 0.7, floor: 0.01, maxRounds: 40, patience: 5 };

type Proposal = { readonly p: number[][]; readonly logp: number[][]; readonly cdf: number[][] };

/** One board drawn from the mixture, with its exact weight π(x)/q_mix(x). */
export interface WeightedBoard { readonly cells: number[]; readonly w: number }

export class GridMixture {
  readonly proposals: Proposal[];
  private readonly S: number;
  private readonly cells: number;
  private readonly blocks: number[][];
  private readonly logP: number[];
  private readonly r: Rng;
  private mixCdf: number[] = [1];
  private logMix: number[] = [0];

  /** `seed`: the parts of the generator's seed, in order. */
  constructor(variant: Variant, familyId: string, seed: readonly (string | number)[]) {
    const { size, cap } = gridParams(variant);
    this.cells = size * size;
    this.S = cap + 1;
    this.logP = Array.from({ length: this.S }, (_, v) => Math.log(cellProbability(v, variant)));
    this.r = rng(...seed);
    // Blocks of more than two cells are split into cells: a table of 10^4 joint values cannot be fitted from a few hundred
    // elite boards (measured: the weights degenerate), while a pair's 100 can.
    const declared = (gridSums[familyId]?.units(variant) ?? []).filter(b => b.length <= 2);
    const covered = new Set(declared.flat());
    this.blocks = [...declared.map(b => [...b]), ...Array.from({ length: this.cells }, (_, i) => i).filter(i => !covered.has(i)).map(i => [i])];
    this.proposals = [this.make(this.blocks.map(b => this.piBlock(b)))];
    this.setMix();
  }

  private codeOf(x: readonly number[], b: readonly number[]): number { return b.reduce((t, i, j) => t + x[i]! * this.S ** j, 0); }
  private make(p: number[][]): Proposal {
    return { p, logp: p.map(row => row.map(Math.log)), cdf: p.map(row => { let a = 0; return row.map(x => (a += x)); }) };
  }
  private piBlock(b: readonly number[]): number[] {
    return Array.from({ length: this.S ** b.length }, (_, code) => {
      let lp = 0;
      for (let j = 0; j < b.length; j++) { lp += this.logP[code % this.S]!; code = Math.floor(code / this.S); }
      return Math.exp(lp);
    });
  }
  private drawFrom(q: Proposal): number[] {
    const x = new Array<number>(this.cells).fill(0);
    this.blocks.forEach((b, k) => {
      const c = q.cdf[k]!, u = this.r.unit() * c[c.length - 1]!;
      let lo = 0, hi = c.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (u < c[mid]!) hi = mid; else lo = mid + 1; }
      let code = lo;
      for (const i of b) { x[i] = code % this.S; code = Math.floor(code / this.S); }
    });
    return x;
  }
  private logPi(x: readonly number[]): number { return x.reduce((t, v) => t + this.logP[v]!, 0); }
  private logQ(q: Proposal, x: readonly number[]): number { return this.blocks.reduce((t, b, k) => t + q.logp[k]![this.codeOf(x, b)]!, 0); }

  /** Half the draws from the last proposal, which aims at the best boards; half evenly over all (π included). */
  private setMix(): void {
    const K = this.proposals.length;
    const mix = this.proposals.map((_, k) => 0.5 / K + (k === K - 1 ? 0.5 : 0));
    let a = 0;
    this.mixCdf = mix.map(x => (a += x));
    this.logMix = mix.map(Math.log);
  }

  /**
   * Cross-entropy adaptation: each round draws from the last proposal, keeps the best ρ by `rank` (bigger is better;
   * `top` stops early once the elite reach it), and refits each block's law to them, weighted by π/q, smoothed and
   * floored. Returns the boards evaluated.
   */
  adapt<R>(rank: (cells: number[]) => R, compare: (a: R, b: R) => number, cfg: DrawConfig = DRAW_CONFIG, top?: R): number {
    let q = this.proposals[this.proposals.length - 1]!, best: R | null = null, stale = 0, evaluated = 0;
    for (let round = 0; round < cfg.maxRounds; round++) {
      const xs = Array.from({ length: cfg.roundSamples }, () => this.drawFrom(q));
      const rs = xs.map(rank);
      evaluated += xs.length;
      const sorted = [...rs].sort((a, b) => compare(b, a));
      const gamma = sorted[Math.max(0, Math.floor(cfg.rho * rs.length) - 1)]!;
      const counts = this.blocks.map(b => new Array<number>(this.S ** b.length).fill(0));
      let total = 0;
      xs.forEach((x, k) => {
        if (compare(rs[k]!, gamma) < 0) return;
        const w = Math.exp(this.logPi(x) - this.logQ(q, x));
        total += w;
        this.blocks.forEach((b, j) => { counts[j]![this.codeOf(x, b)]! += w; });
      });
      if (total === 0) break;
      q = this.make(q.p.map((row, j) => row.map((old, code) => {
        const fit = counts[j]![code]! / total;
        return (1 - cfg.floor) * (cfg.alpha * fit + (1 - cfg.alpha) * old) + cfg.floor / row.length;
      })));
      this.proposals.push(q);
      if (top !== undefined && compare(gamma, top) >= 0) break;
      if (best === null || compare(gamma, best) > 0) { best = gamma; stale = 0; } else if (++stale >= cfg.patience) break;
    }
    this.setMix();
    return evaluated;
  }

  /** One board from the defensive mixture, with its exact weight π(x)/q_mix(x). */
  draw(): WeightedBoard {
    const u = this.r.unit(), K = this.proposals.length;
    let c = 0;
    while (c < K - 1 && u >= this.mixCdf[c]!) c++;
    const x = this.drawFrom(this.proposals[c]!);
    const lq = this.proposals.map((pr, k) => this.logMix[k]! + this.logQ(pr, x));
    const m = Math.max(...lq);
    const lmix = m + Math.log(lq.reduce((t, l) => t + Math.exp(l - m), 0));
    return { cells: x, w: Math.exp(this.logPi(x) - lmix) };
  }
}
