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
import { CHANGE_BETA, generatorOf, siteWork, type GridValue, type Layer } from "@workspace/game-types";
import { energyClimb as paidClimb, spread, starts, type Policy, type Rule, type Space } from "./rule-difficulty-lib.ts";

export { spread, type Policy };
export const BETA = CHANGE_BETA;
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

/** W of moving one site of a lone layer (a numbers-only board: one family) under a shipped cost model (game-types structure). */
const shipped = (layer: Layer, model: "set-v1" | "distance-v1", cells: number) => {
  const family = { generator: generatorOf(layer, model)!, sites: cells };
  return { rate: family.generator.rate, cellW: (x: number, y: number) => siteWork(family, 1, x, y) };
};

/** Today's set (energy-model.md §4.1) on a mono board: log2 N² (where) + log2 S (new) + log2 S (erased); one op, 0 bits.
 * It is the shipped "set-v1" (game-types structure), not a copy. */
export function setModel(cells: number, b: number): CostModel {
  const { cellW } = shipped({ kind: "categorical", n: b }, "set-v1", cells);
  return { id: "set", label: `today's set: log2 ${cells} + 2·log2 ${b} = ${cellW(0, 1).toFixed(2)} for any change`, cellW };
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
 * R, the slider (a bounded ordinal, no wrap: 9 + 1 is refused): W = log2 cells + λ·|y − x|, λ Kraft-tight over the shifts
 * ±1…±(b − 1) (the code is complete for a middle value; an edge value wastes the out-of-range codewords, which is
 * allowed by Kraft). This is the model that shipped as "distance-v1": it delegates to game-types' generator.
 */
export function linearModel(cells: number, b: number): CostModel {
  const { rate, cellW } = shipped({ kind: "ordinal", n: b }, "distance-v1", cells);
  return { id: "linear-located", label: `linear-located (no wrap): ${lg(cells).toFixed(2)} + ${rate.toFixed(3)}·|k|`, cellW };
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
 * rule-difficulty's energy climb (one agent, one rule, one-cell moves, one move per act; "steepest" or "per-energy"),
 * paying energy(model.cellW) per act under a candidate model. Moves: every digit change of one cell (= add k for every
 * k, the same move set as today's set); the candidate models price digits only.
 */
export function energyClimb(rule: Rule, sp: Space, start: GridValue, model: CostModel, budgets: readonly number[], policy: Policy, beta = BETA): EnergyClimb {
  const moved = (g: GridValue, h: GridValue) => g.sym.findIndex((x, i) => x !== h.sym[i]);
  const c = paidClimb(rule, sp, start, (g, h) => { const i = moved(g, h); return i < 0 ? Infinity : energyOf(model.cellW(g.sym[i], h.sym[i]), beta); }, budgets, policy);
  const moves = c.boards.length - 1;
  const steps = c.boards.slice(1).reduce((s, h, k) => { const g = c.boards[k], i = moved(g, h); return s + lee(h.sym[i] - g.sym[i], sp.S); }, 0);
  return { bitsAt: c.bitsAt, moves, spent: c.spent, meanStep: moves ? steps / moves : 0 };
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
