/**
 * Mutation-cost prototypes (docs/mutation-cost-design.md). Not on any shipped code path: nothing in the engine, the
 * mutators, the preludes or the noise imports this. It prices one-cell moves under candidate cost functions, prints the
 * cost tables of the design document, and re-measures how fast the simplest agent earns bits per energy bit under each
 * candidate (a cost-weighted variant of the rule-difficulty greedy, scripts/rule-difficulty-lib.ts).
 *
 * Conventions: a "layer" is a finite value set with a structure (categorical, cyclic, bounded ordinal); an add of k on
 * a cyclic layer of b values moves x to (x + k) mod b; Lee(k) = min(k mod b, b − k mod b). W is an act's information
 * (bits), its energy is W + β·W² (energy-model.md §4.3). Every number here is in bits.
 */
import type { GridValue } from "@workspace/game-types";
import { compareOrdinals } from "../src/index.ts";
import { starts, type Rule, type Space } from "./rule-difficulty-lib.ts";

export const BETA = 0.05;
export const energyOf = (W: number, beta = BETA): number => W + beta * W * W;
const lg = (x: number) => Math.log2(x);
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const mod = (a: number, m: number) => ((a % m) + m) % m;

// ------------------------------------------------------------------------------------------------
// distances
// ------------------------------------------------------------------------------------------------

/** Lee distance of a shift k on Z_b: the shorter way round. */
export const lee = (k: number, b: number): number => { const r = mod(k, b); return Math.min(r, b - r); };
/** Distance of a step k on a bounded ordinal of b values (no wrap): |k|. */
export const linear = (k: number): number => Math.abs(k);

/** The multiset of distances of every non-identity shift on Z_b. */
export const leeSpectrum = (b: number): number[] => Array.from({ length: b - 1 }, (_, i) => lee(i + 1, b));

/**
 * The λ (bits per unit of distance) at which Σ over the arguments of 2^(−λ·d) equals `mass` (≤ 1): the geometric
 * (maximum-entropy, fixed-mean-distance) code that is Kraft-tight with no constant term. With mass = 1 the argument code
 * alone is complete; with mass = 1/n the code also pays for choosing one of n places, so cost = λ·d exactly ("strictly
 * proportional" with the location absorbed).
 */
export function kraftLambda(dists: readonly number[], mass = 1): number {
  const f = (lam: number) => dists.reduce((s, d) => s + 2 ** (-lam * d), 0) - mass;
  let lo = 0, hi = 64;
  if (f(lo) < 0) return 0; // already within budget at λ = 0 (uniform)
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** log2 Z(λ) = log2 Σ 2^(−λ·d): the constant of the normalised geometric code (cost = log2 Z + λ·d). */
export const log2Z = (dists: readonly number[], lam: number): number => lg(dists.reduce((s, d) => s + 2 ** (-lam * d), 0));

// ------------------------------------------------------------------------------------------------
// cost models for one cell of a cyclic digit layer
// ------------------------------------------------------------------------------------------------

/** A candidate pricing of one-cell moves on a board of `cells` cells, each a digit in Z_b. W of moving x to y. */
export interface CostModel {
  readonly id: string;
  readonly label: string;
  /** W (bits) of one act that moves one cell from x to y (x ≠ y). */
  cellW(x: number, y: number): number;
}

/** Today's set (energy-model.md §4.1) on a mono board: log2 N² (where) + log2 S (new) + log2 S (erased); one op, 0 bits. */
export function setModel(cells: number, b: number): CostModel {
  const w = lg(cells) + 2 * lg(b);
  return { id: "set", label: `today's set: log2 ${cells} + 2·log2 ${b} = ${w.toFixed(2)} for any change`, cellW: () => w };
}

/**
 * The recommended family: W = a + λ·Lee(y − x). Presets:
 * - "lee-located": a = log2 cells (where), λ Kraft-tight over the b − 1 shifts (the argument code is complete).
 * - "lee-proportional": a = 0, λ Kraft-tight over (cell, shift) pairs: the owner's "proportional to |k|" taken
 *   literally; the location is paid inside λ.
 * - "lee-diameter": a = log2 cells, λ = log2 b / diameter (the farthest add costs what naming a value outright costs).
 */
export function leeModel(preset: "lee-located" | "lee-proportional" | "lee-diameter", cells: number, b: number): CostModel {
  const spec = leeSpectrum(b), diam = Math.floor(b / 2);
  let a: number, lam: number;
  if (preset === "lee-located") { a = lg(cells); lam = kraftLambda(spec, 1); }
  else if (preset === "lee-proportional") { a = 0; lam = kraftLambda(spec, 1 / cells); }
  else { a = lg(cells); lam = lg(b) / diam; }
  // With a Kraft-tight λ the normaliser is the mass itself, so log2 Z = 0 (located) or −log2 cells (absorbed into λ).
  return {
    id: preset, label: `${preset}: ${a.toFixed(2)} + ${lam.toFixed(3)}·Lee(k)`,
    cellW: (x, y) => a + lam * lee(y - x, b),
  };
}

/**
 * A bounded ordinal (no wrap: 9 + 1 is refused): W = log2 cells + λ·|y − x|, λ Kraft-tight over the shifts ±1…±(b − 1)
 * (the code is complete for a middle value; an edge value wastes the out-of-range codewords, which is allowed by Kraft).
 */
export function linearModel(cells: number, b: number): CostModel {
  const spec = Array.from({ length: b - 1 }, (_, i) => [i + 1, i + 1]).flat(), lam = kraftLambda(spec, 1), a = lg(cells);
  return { id: "linear-located", label: `linear-located (no wrap): ${a.toFixed(2)} + ${lam.toFixed(3)}·|k|`, cellW: (x, y) => a + lam * Math.abs(y - x) };
}

/** A logarithmic alternative: W = log2 cells + log2 Z + s·log2 Lee(k) (power-law prior P ∝ Lee^−s, fixed mean log-distance). */
export function logModel(cells: number, b: number, s = 2): CostModel {
  const spec = leeSpectrum(b), Z = spec.reduce((t, d) => t + d ** -s, 0);
  return {
    id: "log", label: `log: log2 ${cells} + ${lg(Z).toFixed(2)} + ${s}·log2 Lee(k)`,
    cellW: (x, y) => lg(cells) + lg(Z) + s * lg(lee(y - x, b)),
  };
}

// ------------------------------------------------------------------------------------------------
// multiply and divide on Z_b
// ------------------------------------------------------------------------------------------------

export interface MultiplyRow {
  m: number;
  /** Size of the image of x ↦ m·x mod b. */
  image: number;
  /** Bits erased: log2 of each preimage's size (all equal here: gcd(m, b)). */
  erased: number;
  /** Is m a unit (invertible mod b)? */
  unit: boolean;
  /** Its inverse mod b, when a unit. */
  inverse?: number;
}
/** x ↦ m·x mod b for every m in 0..b−1. */
export function multiplyTable(b: number): MultiplyRow[] {
  return Array.from({ length: b }, (_, m) => {
    const g = gcd(m, b), unit = g === 1;
    const inverse = unit ? Array.from({ length: b }, (_, y) => y).find(y => (m * y) % b === 1) : undefined;
    return { m, image: b / g, erased: lg(g), unit, ...(inverse !== undefined ? { inverse } : {}) };
  });
}

/** Floor division x ↦ ⌊x / m⌋ on 0..b−1: the image size and the bits erased for a typical x (log2 of its block). */
export function floorDivideRow(m: number, b: number): { m: number; image: number; erasedMax: number; erasedMean: number } {
  const blocks = new Map<number, number>();
  for (let x = 0; x < b; x++) blocks.set(Math.floor(x / m), (blocks.get(Math.floor(x / m)) ?? 0) + 1);
  const sizes = [...Array(b).keys()].map(x => blocks.get(Math.floor(x / m))!);
  return { m, image: blocks.size, erasedMax: lg(Math.max(...sizes)), erasedMean: sizes.reduce((s, n) => s + lg(n), 0) / b };
}

/**
 * The cyclic subgroup word length of a unit u mod b: the fewest multiplications by `g` that reach u (g a generator of
 * the unit group when it is cyclic; Infinity if g does not reach u).
 */
export function unitWordLength(u: number, g: number, b: number): number {
  let x = 1;
  for (let n = 0; n < b; n++) { if (x === u) return n; x = (x * g) % b; }
  return Infinity;
}

// ------------------------------------------------------------------------------------------------
// the cost-weighted climb
// ------------------------------------------------------------------------------------------------

export type Policy = "steepest" | "per-energy";
export interface EnergyClimb {
  /** Bits held after spending at most each budget in `budgets`. */
  readonly bitsAt: number[];
  /** Moves made and energy spent before the climb stopped or ran out (at the largest budget). */
  readonly moves: number;
  readonly spent: number;
  /** Mean Lee distance of the moves made. */
  readonly meanStep: number;
}

/**
 * One agent climbing one rule, one-cell moves, one move per act, paying energy(model.cellW) per act. "steepest" is the
 * rule-difficulty greedy (best strictly higher ordinal; cost-blind but pays); "per-energy" takes the strictly improving
 * move with the most bits gained per energy bit (an ordinal gain worth 0 bits ranks below any bit gain, cheapest first).
 * Moves: every digit change of one cell (= add k for every k, the same move set as today's set).
 */
export function energyClimb(rule: Rule, sp: Space, start: GridValue, model: CostModel, budgets: readonly number[], policy: Policy, beta = BETA): EnergyClimb {
  const cap = Math.max(...budgets), b = sp.S;
  let g = start, o = rule.score(g), bits = rule.bits(o), spent = 0, moves = 0, steps = 0;
  const trace: [number, number][] = [[0, bits]];
  for (;;) {
    let best: { h: GridValue; ho: ReturnType<Rule["score"]>; hb: number; e: number; d: number } | null = null;
    let bestKey = -Infinity;
    for (let i = 0; i < sp.cells; i++) for (let v = 0; v < b; v++) {
      if (v === g.sym[i]) continue;
      const e = energyOf(model.cellW(g.sym[i], v), beta);
      if (spent + e > cap + 1e-9) continue;
      const sym = g.sym.slice(); sym[i] = v;
      const h = { size: g.size, sym, col: g.col }, ho = rule.score(h);
      if (compareOrdinals(ho, o) <= 0) continue;
      const hb = rule.bits(ho);
      let key: number;
      if (policy === "steepest") {
        if (best && compareOrdinals(ho, best.ho) <= 0) continue;
        key = 0;
      } else {
        const gain = hb - bits;
        key = gain > 1e-12 ? gain / e : -e; // a 0-bit ordinal gain ranks below every bit gain, cheapest first
        if (key <= bestKey) continue;
      }
      best = { h, ho, hb, e, d: lee(v - g.sym[i], b) };
      bestKey = key;
    }
    if (!best) break;
    g = best.h; o = best.ho; bits = best.hb; spent += best.e; moves++; steps += best.d;
    trace.push([spent, bits]);
  }
  const bitsAt = budgets.map(B => { let x = trace[0][1]; for (const [e, v] of trace) if (e <= B + 1e-9) x = v; return x; });
  return { bitsAt, moves, spent, meanStep: moves ? steps / moves : 0 };
}

/** The mean energy of one uniformly random retarget (a random cell to a random other digit) under a model. */
export function meanRetargetEnergy(model: CostModel, b: number, beta = BETA): number {
  let s = 0;
  for (let x = 0; x < b; x++) for (let y = 0; y < b; y++) if (x !== y) s += energyOf(model.cellW(x, y), beta);
  return s / (b * (b - 1));
}

export interface BalanceRow {
  rule: string;
  topBits: number;
  /** Mean bits held after spending at most each budget, over the start boards. */
  bitsAt: number[];
  meanStep: number;
}
/** Every rule climbed under one model and policy from the shared start boards, with the given energy budgets. */
export function balance(rules: readonly Rule[], sp: Space, model: CostModel, policy: Policy, budgets: readonly number[], nStarts: number, beta = BETA): BalanceRow[] {
  const boards = starts(sp, nStarts, "mutation-cost");
  return rules.map(rule => {
    const cs = boards.map(g => energyClimb(rule, sp, g, model, budgets, policy, beta));
    return {
      rule: rule.id, topBits: rule.topBits,
      bitsAt: budgets.map((_, j) => cs.reduce((s, c) => s + c.bitsAt[j], 0) / cs.length),
      meanStep: cs.reduce((s, c) => s + c.meanStep, 0) / cs.length,
    };
  });
}

/** max/min and coefficient of variation of a list of positive numbers (the pool-spread measures of rule-difficulty). */
export function spread(xs: readonly number[]): { ratio: number; cv: number } {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  return { ratio: Math.max(...xs) / Math.min(...xs), cv: sd / m };
}
