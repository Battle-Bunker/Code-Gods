/**
 * Rule difficulty: how hard a rule (a utility function) is to write an algorithm for, and to combine with other rules.
 * Offline, deterministic (every sample comes from a seeded Rng keyed by rule, estimator and index), black-box: a rule is
 * only `score(board) → ordinal` plus a calibration to bits, so a brainstormed rule that exists only as an evaluator is
 * measured exactly like a family. Definitions, rationale and thresholds: docs/rule-difficulty.md.
 *
 * Moves are the elementary one-cell changes of docs/energy-model.md §4.1: set one cell's symbol (and, unless the move
 * set is "symbol", one cell's colour). Climbs compare ordinals (lexicographic tuples), never bits; bits (capped at the
 * rule's top) are only the yardstick that makes rules comparable.
 */
import ts from "typescript";
import {
  COLOUR_COMPONENTS, DEFAULT_COST_MODEL, SYMBOL_COMPONENTS, changeCost, gridArgs, objectType, seededRng,
  type CostModel, type GridValue, type Instantiation, type Rng,
} from "@workspace/game-types";
import { makeTsAstBits } from "../../game-runtime/engine/ts-ast-bits.mjs";
import {
  assertOrdinal, availableFamilies, cardProgram, compareOrdinals, context, evaluator, family, surprisal, tableFor,
  type CalibrationTable, type Ordinal, type Params,
} from "../src/index.ts";
import { shippedTables } from "../src/calibration-data.ts";
import { calibrateScore } from "./estimator.ts";
import type { CalibrationBudget } from "../src/calibration.ts";

// ------------------------------------------------------------------------------------------------
// rules
// ------------------------------------------------------------------------------------------------

/** A rule as the framework sees it. */
export interface Rule {
  readonly id: string;
  /** The card's (or ad-hoc rule's) JavaScript source: `function utility(grid) {...}` against the room's prelude. */
  readonly source: string;
  score(g: GridValue): Ordinal;
  /** Calibrated surprisal bits of an ordinal, capped at `topBits`. */
  bits(o: Ordinal): number;
  /** The best bits the rule can reach here (closed form or exemplar for families; else the best any search found). */
  topBits: number;
  /** Where the bits came from: "shipped" table, "calibrated" here, or "given" (a test's own bits function). */
  readonly calibration: "shipped" | "calibrated" | "given";
}

const SMALL_BUDGET: CalibrationBudget = {
  nMc: 1 << 13, minMcCount: 64, particles: 200, p0: 0.5, sweeps: 1, targetBits: 64, maxStages: 300, maxStuck: 3,
};

const capped = (levels: readonly (readonly [Ordinal, number])[], slope: number) => {
  const table = { levels, slope } as unknown as CalibrationTable;
  return (o: Ordinal) => surprisal(table, o);
};

/** Compiles a card-like source (`function utility(grid)`, plain JavaScript) against the instantiation's prelude. */
export function compileSource(source: string, inst: Instantiation): (g: GridValue) => Ordinal {
  const prelude = objectType(inst.objectType).prelude(inst), codec = objectType(inst.objectType).codec(inst);
  const raw = new Function(`"use strict";\n${prelude.js}\n;\n${cardProgram(source)}\n;\nreturn (wire) => utility(__decode(wire));`)() as (w: unknown) => unknown;
  return g => {
    const o = raw(codec.encode(g));
    if (typeof o === "number" && Number.isFinite(o)) return o;
    if (Array.isArray(o) && o.length && o.every(x => typeof x === "number" && Number.isFinite(x))) return o as number[];
    throw new Error(`utility returned ${JSON.stringify(o)}: expected a number or a non-empty list of numbers`);
  };
}

/** A family draw as a rule: the shipped table when there is one, else a calibration here (SMALL_BUDGET). */
export function familyRule(familyId: string, params: Params, inst: Instantiation, opts: { calibrate?: boolean; id?: string } = {}): Rule {
  const f = family(familyId), ctx = context(inst), codec = objectType(inst.objectType).codec(inst);
  const ev = evaluator({ familyId, params }, inst), shape = f.shape(ctx);
  const score = (g: GridValue) => assertOrdinal(shape, ev(codec.encode(g)));
  const shipped = opts.calibrate ? undefined : tableFor(shippedTables(inst.key), { familyId, params }, inst);
  const cal = shipped ? { levels: shipped.levels, slope: shipped.slope }
    : calibrateScore(v => score(v as GridValue), inst, SMALL_BUDGET, `rule-difficulty|${familyId}|${JSON.stringify(params)}|${inst.key}`);
  const raw = capped(cal.levels, cal.slope);
  let topBits = cal.levels[cal.levels.length - 1][1];
  const topOrdinal = f.top?.(params, ctx) ?? (f.exemplar ? safe(() => ev(f.exemplar!(params, ctx))) : undefined);
  if (topOrdinal !== undefined) topBits = Math.max(topBits, raw(topOrdinal));
  const rule: Rule = {
    id: opts.id ?? familyId, source: f.card.typescript(params, ctx), score, calibration: shipped ? "shipped" : "calibrated", topBits,
    bits: o => Math.min(rule.topBits, raw(o)),
  };
  return rule;
}
function safe<T>(fn: () => T): T | undefined { try { return fn(); } catch { return undefined; } }

/** An ad-hoc rule from its source: calibrated here; its top is the best any of the framework's searches finds. */
export function adHocRule(id: string, source: string, inst: Instantiation, opts: { top?: Ordinal } = {}): Rule {
  const score = compileSource(source, inst);
  const cal = calibrateScore(v => score(v as GridValue), inst, SMALL_BUDGET, `rule-difficulty|adhoc|${id}|${source}|${inst.key}`);
  const raw = capped(cal.levels, cal.slope);
  const rule: Rule = {
    id, source, score, calibration: "calibrated",
    topBits: Math.max(cal.levels[cal.levels.length - 1][1], opts.top !== undefined ? raw(opts.top) : 0),
    bits: o => Math.min(rule.topBits, raw(o)),
  };
  return rule;
}

/** A rule with its own bits function (tests: hand-checkable rules). */
export function givenRule(id: string, score: (g: GridValue) => Ordinal, bits: (o: Ordinal) => number, topBits: number): Rule {
  return { id, source: "", score, bits: o => Math.min(topBits, bits(o)), topBits, calibration: "given" };
}

/** The pool's families (one rule per distinct canonical params, up to `perFamily`). */
export function poolFamilies(inst: Instantiation, excluded: readonly string[]): string[] {
  return availableFamilies(inst, "reward", excluded).map(f => f.id);
}
export function familyParams(familyId: string, inst: Instantiation, perFamily = 1): Params[] {
  const f = family(familyId), ctx = context(inst), seen = new Set<string>(), out: Params[] = [];
  const support = f.support(ctx);
  // Evenly spaced through the support, deduplicated by canonical params.
  for (let k = 0; k < support.length && out.length < perFamily; k++) {
    const p = support[Math.floor(k * support.length / Math.min(perFamily, support.length)) % support.length];
    const c = f.canonical(p, ctx), key = JSON.stringify(c);
    if (seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// boards and moves
// ------------------------------------------------------------------------------------------------

export type MoveSet = "cell" | "symbol";
/** One elementary change: layer 0 = symbol, 1 = colour. */
export interface Move { readonly cell: number; readonly layer: 0 | 1; readonly value: number }

export interface Space {
  readonly inst: Instantiation;
  readonly cells: number;
  readonly S: number;
  readonly C: number;
  readonly moveSet: MoveSet;
  spawn(rng: Rng): GridValue;
  /** Every elementary move from g (a fixed order: cell, layer, value). */
  moves(g: GridValue): Move[];
}
export function space(inst: Instantiation, moveSet: MoveSet = "cell"): Space {
  const t = gridArgs(inst), S = SYMBOL_COMPONENTS[t.symbols].count, C = COLOUR_COMPONENTS[t.colours].count, cells = t.size * t.size;
  const T = objectType(inst.objectType);
  return {
    inst, cells, S, C, moveSet,
    spawn: rng => T.spawn(inst, rng) as GridValue,
    moves(g) {
      const out: Move[] = [];
      for (let i = 0; i < cells; i++) {
        for (let v = 0; v < S; v++) if (v !== g.sym[i]) out.push({ cell: i, layer: 0, value: v });
        if (moveSet === "cell") for (let v = 0; v < C; v++) if (v !== g.col[i]) out.push({ cell: i, layer: 1, value: v });
      }
      return out;
    },
  };
}
export function apply(g: GridValue, m: Move): GridValue {
  const sym = m.layer === 0 ? g.sym.slice() : g.sym, col = m.layer === 1 ? g.col.slice() : g.col;
  (m.layer === 0 ? sym : col)[m.cell] = m.value;
  return { size: g.size, sym, col };
}
const keyOf = (g: GridValue) => `${g.sym.join("")}|${g.col.join("")}`;
const cmp = compareOrdinals;

/** A random move other than a no-op, over the move set. */
function randomMove(sp: Space, g: GridValue, rng: Rng, cell?: number): Move {
  const i = cell ?? rng.int(sp.cells);
  const layer: 0 | 1 = sp.moveSet === "cell" && rng.int(sp.S - 1 + sp.C - 1) >= sp.S - 1 ? 1 : 0;
  const n = layer === 0 ? sp.S : sp.C, cur = layer === 0 ? g.sym[i] : g.col[i];
  return { cell: i, layer, value: (cur + 1 + rng.int(n - 1)) % n };
}

// ------------------------------------------------------------------------------------------------
// climbs
// ------------------------------------------------------------------------------------------------

export interface Climb {
  /** bits after 0, 1, ... moves (constant once stopped). */
  readonly bits: number[];
  readonly boards: GridValue[];
  /** Moves made before the climb stopped at a strict local optimum (or `steps` if it never stopped). */
  readonly moves: number;
  readonly stopped: boolean;
}

/** Steepest-ascent one-cell greedy on the ordinal: the best strictly improving move, else stop. */
export function greedy(rule: Rule, sp: Space, start: GridValue, steps: number): Climb {
  let g = start, o = rule.score(g);
  const bits = [rule.bits(o)], boards = [g];
  let moves = 0, stopped = false;
  for (let s = 0; s < steps; s++) {
    let best: GridValue | null = null, bo = o;
    if (!stopped) for (const m of sp.moves(g)) {
      const h = apply(g, m), ho = rule.score(h);
      if (cmp(ho, bo) > 0) { best = h; bo = ho; }
    }
    if (best) { g = best; o = bo; moves++; } else stopped = true;
    bits.push(rule.bits(o)); boards.push(g);
  }
  return { bits, boards, moves, stopped };
}

/**
 * Beam search over one-cell moves (width W, `steps` moves deep), ranked by `value` (higher better; ties by the order
 * found). Returns the best value seen after each depth (best-so-far, so monotone). Duplicate boards are merged.
 */
export function beam(value: (g: GridValue) => number, sp: Space, start: GridValue, steps: number, width: number): number[] {
  let frontier = [{ g: start, v: value(start) }];
  const best = [frontier[0].v];
  for (let s = 0; s < steps; s++) {
    const seen = new Set<string>(), kids: { g: GridValue; v: number }[] = [];
    for (const { g } of frontier) for (const m of sp.moves(g)) {
      const h = apply(g, m), k = keyOf(h);
      if (seen.has(k)) continue;
      seen.add(k); kids.push({ g: h, v: value(h) });
    }
    kids.sort((a, b) => b.v - a.v);
    frontier = kids.slice(0, width);
    best.push(Math.max(best[best.length - 1], frontier[0]?.v ?? -Infinity));
  }
  return best;
}

// ------------------------------------------------------------------------------------------------
// energy: what a climb costs (docs/rule-difficulty.md §2.6, docs/mutation-cost-design.md §8)
// ------------------------------------------------------------------------------------------------

/** The agent of an energy climb: "steepest" is `greedy` (cost-blind, but it pays); "per-energy" weighs gain against cost. */
export type Policy = "steepest" | "per-energy";
/** Energy budgets (bits) the energy climbs are read at; the climb may spend up to the largest. */
export const ENERGY_BUDGETS = Object.freeze([32, 64, 128] as const);

/** The energy of one act that takes g to h under a cost model: changeCost(W), W the type's callWork of the net effect. */
export function moveEnergy(inst: Instantiation, g: GridValue, h: GridValue, model: CostModel = DEFAULT_COST_MODEL): number {
  return changeCost(objectType(inst.objectType).callWork(g, h, { id: "", params: null }, inst, model));
}

export interface EnergyClimb {
  /** Bits held after spending at most each budget. */
  readonly bitsAt: number[];
  /** The boards after 0, 1, ... moves, until the climb stopped or the largest budget ran out. */
  readonly boards: GridValue[];
  readonly spent: number;
}

/**
 * One agent climbing one rule by one-cell moves, one move per act, paying `cost(before, after)` energy per act and
 * never more than the largest budget in all. "steepest" takes the best strictly higher ordinal (the first found on
 * ties), whatever it costs; "per-energy" takes the strictly improving move with the most bits gained per energy bit
 * (the first found on ties; a higher ordinal worth no more bits ranks below every bit gain, cheapest first).
 */
export function energyClimb(rule: Rule, sp: Space, start: GridValue, cost: (g: GridValue, h: GridValue) => number, budgets: readonly number[], policy: Policy): EnergyClimb {
  const cap = Math.max(...budgets);
  let g = start, o = rule.score(g), bits = rule.bits(o), spent = 0;
  const boards = [g], trace: [number, number][] = [[0, bits]];
  for (;;) {
    let best: { h: GridValue; ho: Ordinal; hb: number; e: number } | null = null, bestKey = -Infinity;
    for (const m of sp.moves(g)) {
      const h = apply(g, m), e = cost(g, h);
      if (!(spent + e <= cap + 1e-9)) continue;
      const ho = rule.score(h);
      if (cmp(ho, o) <= 0) continue;
      const hb = rule.bits(ho);
      if (policy === "steepest") {
        if (best && cmp(ho, best.ho) <= 0) continue;
      } else {
        const gain = hb - bits, key = gain > 1e-12 ? gain / e : -e;
        if (key <= bestKey) continue;
        bestKey = key;
      }
      best = { h, ho, hb, e };
    }
    if (!best) break;
    g = best.h; o = best.ho; bits = best.hb; spent += best.e;
    boards.push(g); trace.push([spent, bits]);
  }
  const bitsAt = budgets.map(B => { let x = trace[0][1]; for (const [e, v] of trace) if (e <= B + 1e-9) x = v; return x; });
  return { bitsAt, boards, spent };
}

/** Mean, max/min and coefficient of variation of a list of positive numbers (the pool-spread measures). */
export function spread(xs: readonly number[]): { mean: number; ratio: number; cv: number } {
  const m = mean(xs), sd = Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
  return { mean: m, ratio: xs.length ? Math.max(...xs) / Math.max(1e-9, Math.min(...xs)) : NaN, cv: m > 0 ? sd / m : NaN };
}

// ------------------------------------------------------------------------------------------------
// per-rule estimators
// ------------------------------------------------------------------------------------------------

export interface Budget {
  /** Random start boards per rule. */
  starts: number;
  /** Moves per climb (greedy runs to a local optimum within `longSteps`). */
  steps: number;
  longSteps: number;
  beamWidth: number;
  /** Boards × moves sampled for entanglement. */
  entangleBoards: number;
  entangleMoves: number;
  /** Starts per pair for the joint climbs. */
  pairStarts: number;
  /** Annealing runs per pair (from the first seeds) and proposals per run, for the joint ceiling. */
  annealRuns: number;
  annealEvals: number;
}
export const DEFAULT_BUDGET: Budget = {
  starts: 12, steps: 16, longSteps: 48, beamWidth: 6, entangleBoards: 24, entangleMoves: 3, pairStarts: 4, annealRuns: 3, annealEvals: 8000,
};
export const QUICK_BUDGET: Budget = {
  starts: 6, steps: 12, longSteps: 32, beamWidth: 4, entangleBoards: 12, entangleMoves: 2, pairStarts: 2, annealRuns: 2, annealEvals: 4000,
};

export interface RuleReport {
  id: string;
  calibration: Rule["calibration"];
  topBits: number;
  /** Comprehension: ts-ast-bits of the card source (the same price a summoned TypeScript program pays). */
  cardBits: number;
  /** Whether the score ignores colours (measured on random recolourings). */
  colourBlind: boolean;
  /** Mean bits greedy holds after 10 and 20 moves (the quantity to equalise across a pool, beginner-rules brainstorm). */
  greedy10: number; greedy20: number;
  /** The digits d for which the uniform board (every cell d, every colour) reaches 99% of top bits: a degenerate maximum. */
  uniformTop: number[];
  /** Climb: mean bits after 4 / 8 / 16 one-cell greedy moves, and the mean bits per move over the first 4 and 8 moves.
   * rate4 is the balance column: it ranks the Annotated basics greedy win shares with Spearman 0.78 (docs). */
  greedy4: number; greedy8: number; greedy16: number; rate4: number; rate8: number;
  /** Greedy reach as a share of top bits after 16 moves, and at its local optimum. */
  reach16: number; reachEnd: number;
  /** Median moves for greedy to reach 50% / 90% of top (Infinity: not within longSteps). */
  movesTo50: number; movesTo90: number;
  /** Oracle (beam) bits after `steps` moves; cleverness gap = (beam − greedy) / beam at that depth. */
  beam16: number; gap: number;
  /** Plateau: share of random boards with no strictly improving one-cell move. */
  plateau: number;
  /** Trap: share of top bits greedy leaves on the table at its local optimum, (top − end) / top, mean over starts. */
  trap: number;
  /** Share of greedy climbs that stop at a strict local optimum below 90% of top. */
  stall: number;
  /** Of the stalled climbs (up to 3), the share a two-cell change can improve (NaN: none stalled). */
  escape2: number;
  /** Entanglement K_eff: mean number of other cells whose change flips whether a move helps. */
  entangle: number;
  /** Headline: algorithmic difficulty, 100 × (gap + trap) / 2. */
  difficulty: number;
  /** Energy climbs under the room's cost model: mean bits held after each of ENERGY_BUDGETS energy bits, per agent. */
  energyBits: Record<Policy, number[]>;
  /** The per-energy greedy: mean bits gained per energy bit over the first 64, and the share of top held after 32 and 64. */
  rateE: number; e32: number; e64: number;
}

export interface Context {
  sp: Space; budget: Budget;
  /** The room's cost model (default set-v1): only the energy columns depend on it. */
  costModel?: CostModel;
  /** Energy every act pays besides its change (its offer and what it reads; docs/energy-model.md §3, §7.1). Default 0. */
  actOverhead?: number;
}

/** The start boards a rule (or pair) is measured from: seeded by the label only, so every rule shares them. */
export function starts(sp: Space, n: number, label = "starts"): GridValue[] {
  const rng = seededRng(`rule-difficulty|${label}|${sp.inst.key}`);
  return Array.from({ length: n }, () => sp.spawn(rng));
}

function mean(a: readonly number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
const median = (a: readonly number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };

let tsBits: ReturnType<typeof makeTsAstBits>["tsAstBits"] | null = null;
/** ts-ast-bits-v1 (uniform) of a card source, with the room's TypeScript pricing vocabulary (0 for an empty source). */
export function cardBits(source: string, inst: Instantiation): number {
  if (!source.trim()) return 0;
  tsBits ??= makeTsAstBits(ts).tsAstBits;
  const vocab = objectType(inst.objectType).prelude(inst).pricing.typescript;
  const file = ts.createSourceFile("/card.ts", cardProgram(source), ts.ScriptTarget.ES2022, true);
  const p = tsBits(file, vocab, () => null).parts;
  return p.structure + p.names + p.literals + p.moveFlags;
}

/** Whether recolouring every cell at random never changes the ordinal (on 32 seeded boards). */
export function colourBlind(rule: Rule, sp: Space): boolean {
  const rng = seededRng(`rule-difficulty|colour|${rule.id}`);
  for (let k = 0; k < 32; k++) {
    const g = sp.spawn(rng), h = { size: g.size, sym: g.sym, col: g.col.map(() => rng.int(sp.C)) };
    if (cmp(rule.score(g), rule.score(h)) !== 0) return false;
  }
  return true;
}

/**
 * Entanglement: on boards from three strata (random, greedy after 4 moves, greedy's end), pick a move that changes the
 * ordinal (a random one if none does); count the other cells j for which some change at j (every value of every layer
 * in the move set) flips the sign of that move's effect (helps / neutral / hurts). The mean count is K_eff: how many
 * other cells an agent must read to know whether a change helps.
 */
export function entanglement(rule: Rule, sp: Space, boards: readonly GridValue[], movesPerBoard: number): number {
  const rng = seededRng(`rule-difficulty|entangle|${rule.id}`), counts: number[] = [];
  const sign = (g: GridValue, m: Move) => Math.sign(cmp(rule.score(apply(g, m)), rule.score(g)));
  for (const g of boards) {
    const all = sp.moves(g), live = all.filter(m => sign(g, m) !== 0);
    for (let t = 0; t < movesPerBoard; t++) {
      const pickFrom = live.length ? live : all, m = pickFrom[rng.int(pickFrom.length)], s0 = sign(g, m);
      const flips = new Set<number>();
      for (const q of all) if (q.cell !== m.cell && !flips.has(q.cell) && sign(apply(g, q), m) !== s0) flips.add(q.cell);
      counts.push(flips.size);
    }
  }
  return mean(counts);
}

/**
 * Escape: of the boards where greedy stopped below 90% of top (up to `max`), the share where some change of two cells
 * at once improves the ordinal (exhaustive over pairs of one-cell moves on distinct cells). Low: the traps are deep.
 */
export function escape2(rule: Rule, sp: Space, stuck: readonly GridValue[], max = 3): number {
  const boards = stuck.slice(0, max);
  if (!boards.length) return NaN;
  return mean(boards.map(g => {
    const o = rule.score(g), ms = sp.moves(g);
    for (let i = 0; i < ms.length; i++) {
      const h = apply(g, ms[i]);
      for (let j = i + 1; j < ms.length; j++) if (ms[j].cell !== ms[i].cell && cmp(rule.score(apply(h, ms[j])), o) > 0) return 1;
    }
    return 0;
  }));
}

/** Symbols whose uniform board (every cell that symbol, for some single colour) scores at least 99% of the top bits. */
export function uniformTop(rule: Rule, sp: Space): number[] {
  const out: number[] = [];
  for (let v = 0; v < sp.S; v++) {
    for (let c = 0; c < sp.C; c++) {
      const g: GridValue = { size: Math.sqrt(sp.cells), sym: new Uint8Array(sp.cells).fill(v), col: new Uint8Array(sp.cells).fill(c) };
      if (rule.bits(rule.score(g)) >= 0.99 * rule.topBits) { out.push(v); break; }
    }
  }
  return out;
}

export function measureRule(rule: Rule, ctx: Context): RuleReport {
  const { sp, budget: b } = ctx, inst = sp.inst;
  const S = starts(sp, b.starts);
  const climbs = S.map(g => greedy(rule, sp, g, b.longSteps));
  // The top is at least what any search reaches (ad-hoc rules have no closed form).
  const beams = S.map(g => beam(h => rule.bits(rule.score(h)), sp, g, b.steps, b.beamWidth));
  rule.topBits = Math.max(rule.topBits, ...climbs.map(c => c.bits[c.bits.length - 1]), ...beams.map(x => x[x.length - 1]));
  const top = Math.max(rule.topBits, 1e-9);
  // Recompute bits capped at the (possibly raised) top: bits never exceed it.
  const at = (c: Climb, k: number) => Math.min(top, c.bits[Math.min(k, c.bits.length - 1)]);
  const first = (c: Climb, share: number) => { const i = c.bits.findIndex(x => x >= share * top - 1e-9); return i < 0 ? Infinity : i; };
  const g16 = mean(climbs.map(c => at(c, b.steps))), bm = mean(beams.map(x => x[b.steps]));
  const strata = [...S.slice(0, b.entangleBoards / 3), ...climbs.slice(0, b.entangleBoards / 3).map(c => c.boards[4]),
    ...climbs.slice(0, b.entangleBoards / 3).map(c => c.boards[c.boards.length - 1])];
  const plateauBoards = starts(sp, 48, "plateau");
  const plateau = mean(plateauBoards.map(g => { const o = rule.score(g); return sp.moves(g).some(m => cmp(rule.score(apply(g, m)), o) > 0) ? 0 : 1; }));
  const end = climbs.map(c => at(c, b.longSteps));
  const gap = bm > 0 ? Math.max(0, (bm - g16) / bm) : 0;
  const trap = mean(end.map(e => (top - e) / top));
  // Energy: the same starts, each act paying the cost model's price of its net effect.
  const overhead = ctx.actOverhead ?? 0;
  const cost = (g: GridValue, h: GridValue) => moveEnergy(inst, g, h, ctx.costModel) + overhead;
  const paid = (policy: Policy) => S.map(g => energyClimb(rule, sp, g, cost, ENERGY_BUDGETS, policy).bitsAt.map(x => Math.min(top, x)));
  const careful = paid("per-energy"), heldAt = (cs: number[][]) => ENERGY_BUDGETS.map((_, j) => mean(cs.map(c => c[j])));
  const energyBits = { steepest: heldAt(paid("steepest")), "per-energy": heldAt(careful) };
  return {
    id: rule.id, calibration: rule.calibration, topBits: top, cardBits: cardBits(rule.source, inst), colourBlind: colourBlind(rule, sp),
    greedy10: mean(climbs.map(c => at(c, 10))), greedy20: mean(climbs.map(c => at(c, 20))), uniformTop: uniformTop(rule, sp),
    greedy4: mean(climbs.map(c => at(c, 4))), greedy8: mean(climbs.map(c => at(c, 8))), greedy16: g16,
    rate4: mean(climbs.map(c => (at(c, 4) - at(c, 0)) / 4)), rate8: mean(climbs.map(c => (at(c, 8) - at(c, 0)) / 8)),
    reach16: g16 / top, reachEnd: mean(end) / top,
    movesTo50: median(climbs.map(c => first(c, 0.5))), movesTo90: median(climbs.map(c => first(c, 0.9))),
    beam16: bm, gap,
    plateau, trap,
    stall: mean(climbs.map((c, i) => (c.stopped && end[i] < 0.9 * top ? 1 : 0))),
    escape2: escape2(rule, sp, climbs.filter((c, i) => c.stopped && end[i] < 0.9 * top).map(c => c.boards[c.boards.length - 1])),
    entangle: entanglement(rule, sp, strata, b.entangleMoves),
    difficulty: 100 * (gap + trap) / 2,
    energyBits, rateE: mean(careful.map((c, i) => (c[1] - at(climbs[i], 0)) / ENERGY_BUDGETS[1])),
    e32: energyBits["per-energy"][0] / top, e64: energyBits["per-energy"][1] / top,
  };
}

// ------------------------------------------------------------------------------------------------
// pairs
// ------------------------------------------------------------------------------------------------

export interface PairReport {
  a: string; b: string;
  /** P(B's ordinal falls | A's rises), averaged over both directions, on random and mid-climb boards. */
  conflict: number;
  /** Pearson correlation of the share-of-top gained under A and under B over all one-cell moves on those boards. */
  corr: number;
  /** Two naive agents taking turns (steepest greedy on own rule) until both stop: joint value √(sA·sB), sX = share of top. */
  naive: number;
  /** Two considerate agents (each greedy on its own rule, never lowering the other's ordinal), same joint value. */
  considerate: number;
  /** The best joint value found by a pair-aware search (greedy on √(sA·sB) from the naive end, from each rule's own optimum
   * and from the shared starts, plus simulated annealing): a lower bound on how good one board can be for both. 1 = both tops on one board. */
  ceiling: number;
  /** (ceiling − considerate) / ceiling: what a pair-aware design earns over two considerate one-cell agents. */
  gap: number;
  /** Headline: synergy difficulty, 100 × (1 − considerate): the share of the joint value √(sA·sB) the simplest
   * considerate pair of agents leaves on the table (incompatibility 1 − ceiling plus search ceiling − considerate). */
  difficulty: number;
}

/**
 * Simulated annealing on a numeric value in [0, 1] over random one-cell moves (seeded): temperature falls geometrically
 * from 0.1 to 0.001 over `evals` proposals. Returns the best value seen.
 */
export function anneal(value: (g: GridValue) => number, sp: Space, start: GridValue, evals: number, rng: Rng): number {
  let g = start, v = value(g), best = v;
  for (let t = 0; t < evals; t++) {
    const T = 0.1 * 0.01 ** (t / evals), h = apply(g, randomMove(sp, g, rng)), hv = value(h);
    if (hv >= v || rng.int(1 << 30) / (1 << 30) < Math.exp((hv - v) / T)) { g = h; v = hv; if (v > best) best = v; }
  }
  return best;
}

/** Steepest greedy on a numeric value (strict improvement), until it stops or `steps` moves. Returns the end board. */
function climbValue(value: (g: GridValue) => number, sp: Space, start: GridValue, steps: number): { g: GridValue; v: number } {
  let g = start, v = value(g);
  for (let s = 0; s < steps; s++) {
    let best: GridValue | null = null, bv = v;
    for (const m of sp.moves(g)) { const h = apply(g, m), hv = value(h); if (hv > bv + 1e-12) { best = h; bv = hv; } }
    if (!best) break;
    g = best; v = bv;
  }
  return { g, v };
}

export function measurePair(A: Rule, B: Rule, ctx: Context): PairReport {
  const { sp, budget: b } = ctx, steps = b.longSteps;
  const sA = (g: GridValue) => Math.max(0, A.bits(A.score(g)) / A.topBits), sB = (g: GridValue) => Math.max(0, B.bits(B.score(g)) / B.topBits);
  const jointValue = (g: GridValue) => Math.sqrt(sA(g) * sB(g));
  const S = starts(sp, b.pairStarts, "pairs");
  // Alignment on random boards and on each rule's own mid-climb boards.
  const boards = [...S, ...S.map(g => greedy(A, sp, g, 4).boards[4]), ...S.map(g => greedy(B, sp, g, 4).boards[4])];
  let upA = 0, upAdownB = 0, upB = 0, upBdownA = 0;
  const xs: number[] = [], ys: number[] = [];
  for (const g of boards) {
    const oa = A.score(g), ob = B.score(g), ba = A.bits(oa), bb = B.bits(ob);
    for (const m of sp.moves(g)) {
      const h = apply(g, m), ha = A.score(h), hb = B.score(h), ca = cmp(ha, oa), cb = cmp(hb, ob);
      if (ca > 0) { upA++; if (cb < 0) upAdownB++; }
      if (cb > 0) { upB++; if (ca < 0) upBdownA++; }
      xs.push((A.bits(ha) - ba) / A.topBits); ys.push((B.bits(hb) - bb) / B.topBits);
    }
  }
  const conflict = mean([upA ? upAdownB / upA : 0, upB ? upBdownA / upB : 0]);
  // Two naive agents taking turns, one move each, until neither can improve its own rule (or 2 × longSteps moves).
  const naiveEnds = S.map(g0 => turns(g0, false)), kindEnds = S.map(g0 => turns(g0, true));
  const naive = mean(naiveEnds.map(jointValue)), considerate = mean(kindEnds.map(jointValue));
  function turns(g0: GridValue, kind: boolean): GridValue {
    let g = g0, idle = 0;
    for (let s = 0; s < 2 * steps && idle < 2; s++) {
      const [me, other] = s % 2 === 0 ? [A, B] : [B, A];
      const o = me.score(g), oo = other.score(g);
      let best: GridValue | null = null, bo = o;
      for (const m of sp.moves(g)) {
        const h = apply(g, m), ho = me.score(h);
        if (cmp(ho, bo) > 0 && (!kind || cmp(other.score(h), oo) >= 0)) { best = h; bo = ho; }
      }
      idle = best ? 0 : idle + 1;
      if (best) g = best;
    }
    return g;
  }
  // Pair-aware search: greedy on the joint value from the naive ends, from each rule's own greedy optimum, and from the
  // starts. The best value found anywhere is the ceiling (a lower bound on the true joint optimum).
  const seeds = [...naiveEnds.slice(0, 2), ...kindEnds.slice(0, 2), ...S.slice(0, 1).flatMap(g => [greedy(A, sp, g, steps).boards[steps], greedy(B, sp, g, steps).boards[steps]])];
  const rng = seededRng(`rule-difficulty|anneal|${A.id}|${B.id}`);
  const ceiling = Math.max(naive, considerate, ...seeds.map(g => climbValue(jointValue, sp, g, steps).v),
    ...seeds.slice(0, b.annealRuns).map(g => anneal(jointValue, sp, g, b.annealEvals, rng)));
  const gap = ceiling > 0 ? (ceiling - considerate) / ceiling : 0;
  return { a: A.id, b: B.id, conflict, corr: pearson(xs, ys), naive, considerate, ceiling, gap, difficulty: 100 * (1 - considerate) };
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i] - mx, c = y[i] - my; sxy += a * c; sxx += a * a; syy += c * c; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

// ------------------------------------------------------------------------------------------------
// pools
// ------------------------------------------------------------------------------------------------

export interface PoolReport {
  rules: RuleReport[];
  pairs: PairReport[];
  /** Per rule: mean synergy difficulty and conflict over its partners ("plays well with others" is the reverse). */
  partners: { id: string; synergy: number; conflict: number; ceiling: number }[];
  summary: PoolSummary;
}
export interface PoolSummary {
  /** max / min of the early climb rate rate4 (bits per move) and of reach16 across the pool, and the CV of rate4. */
  rateRatio: number; rateCv: number; reachRatio: number;
  /** Spread of the headline difficulty (max − min) and its maximum. */
  difficultySpread: number; difficultyMax: number;
  /** Worst (highest) pair synergy difficulty and the lowest joint ceiling. */
  worstPair: string; worstPairDifficulty: number; minCeiling: number;
  /** Dominated rules: another rule climbs at least 25% faster (rate4), reaches at least as far (reach16) and is at least
   * 10 points easier (DIFF). */
  dominated: string[];
  cardBitsRatio: number;
  /** Energy balance (reported, not a threshold yet): max / min and CV of rateE; mean, max / min and CV of e32 and e64. */
  rateERatio: number; rateECv: number;
  e32: { mean: number; ratio: number; cv: number }; e64: { mean: number; ratio: number; cv: number };
}

export function summarise(rules: readonly RuleReport[], pairs: readonly PairReport[]): PoolSummary {
  const rate = rules.map(r => r.rate4), reach = rules.map(r => r.reach16), diff = rules.map(r => r.difficulty), card = rules.map(r => r.cardBits).filter(x => x > 0);
  const m = mean(rate), sd = Math.sqrt(mean(rate.map(x => (x - m) ** 2)));
  const worst = pairs.reduce<PairReport | null>((w, p) => (!w || p.difficulty > w.difficulty ? p : w), null);
  const dominated = rules.filter(r => rules.some(o => o !== r && o.rate4 > 0 && o.rate4 >= 1.25 * r.rate4 && o.reach16 >= r.reach16 && o.difficulty <= r.difficulty - 10)).map(r => r.id);
  const ratio = (a: number[]) => (a.length ? Math.max(...a) / Math.max(1e-9, Math.min(...a)) : NaN);
  const rateE = spread(rules.map(r => r.rateE));
  return {
    rateRatio: ratio(rate), rateCv: m > 0 ? sd / m : NaN, reachRatio: ratio(reach),
    difficultySpread: Math.max(...diff) - Math.min(...diff), difficultyMax: Math.max(...diff),
    worstPair: worst ? `${worst.a} × ${worst.b}` : "", worstPairDifficulty: worst?.difficulty ?? NaN,
    minCeiling: pairs.length ? Math.min(...pairs.map(p => p.ceiling)) : NaN, dominated, cardBitsRatio: ratio(card),
    rateERatio: rateE.ratio, rateECv: rateE.cv, e32: spread(rules.map(r => r.e32)), e64: spread(rules.map(r => r.e64)),
  };
}

export function measurePool(rules: readonly Rule[], ctx: Context, opts: { pairs?: boolean; log?: (s: string) => void } = {}): PoolReport {
  const reports = rules.map(r => { const t = performance.now(); const x = measureRule(r, ctx); opts.log?.(`  ${r.id}: ${((performance.now() - t) / 1000).toFixed(1)}s`); return x; });
  const pairs: PairReport[] = [];
  if (opts.pairs !== false) for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) pairs.push(measurePair(rules[i], rules[j], ctx));
  const partners = rules.map(r => {
    const mine = pairs.filter(p => p.a === r.id || p.b === r.id);
    return { id: r.id, synergy: mean(mine.map(p => p.difficulty)), conflict: mean(mine.map(p => p.conflict)), ceiling: mean(mine.map(p => p.ceiling)) };
  });
  return { rules: reports, pairs, partners, summary: summarise(reports, pairs) };
}

/**
 * Proposed thresholds for a balanced ("comparably simple") beginner pool, set from where the current families fall
 * (docs/rule-difficulty.md "Thresholds"). Every rule greedy-solvable and local, climb rates and card sizes within a
 * factor, every pair with a board good for both, and no rule another rule beats on both climb and difficulty.
 */
export const SYMMETRIC_POOL = Object.freeze({
  /** Per rule. */
  difficultyMax: 10, entangleMax: 3.5, cardBitsMax: 800,
  /** Across the pool. */
  rateRatioMax: 1.6, cardRatioMax: 2.5, synergySpreadMax: 15,
  /** Rules with a uniform-board maximum (all cells one digit tops the rule): at most this many per pool. */
  uniformTopMax: 1,
  /** Bits greedy holds at 10 and 20 moves: every rule within this fraction of the pool median. */
  greedyBitsBand: 0.25,
  /** Per pair. */
  pairSynergyMax: 75, ceilingMin: 0.5,
});
export type Thresholds = typeof SYMMETRIC_POOL;

/** The thresholds a pool fails, one line each (empty: it passes). */
export function verdict(r: PoolReport, t: Thresholds = SYMMETRIC_POOL): string[] {
  const out: string[] = [], s = r.summary, f = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
  for (const x of r.rules) {
    if (x.difficulty > t.difficultyMax) out.push(`${x.id}: DIFF ${f(x.difficulty)} > ${t.difficultyMax} (greedy is trapped or a cleverer search earns more)`);
    if (x.entangle > t.entangleMax) out.push(`${x.id}: K ${f(x.entangle)} > ${t.entangleMax} (a move's effect depends on too many cells)`);
    if (x.cardBits > t.cardBitsMax) out.push(`${x.id}: card ${f(x.cardBits)} bits > ${t.cardBitsMax}`);
  }
  const uni = r.rules.filter(x => x.uniformTop.length);
  if (uni.length > t.uniformTopMax) out.push(`${uni.length} rules have a uniform-board maximum (> ${t.uniformTopMax}): ${uni.map(x => x.id).join(", ")}`);
  for (const k of ["greedy10", "greedy20"] as const) {
    const vals = r.rules.map(x => x[k]).sort((a, b) => a - b), med = vals[Math.floor((vals.length - 1) / 2)];
    for (const x of r.rules) if (r.rules.length > 1 && Math.abs(x[k] - med) > t.greedyBitsBand * med) out.push(`${x.id}: ${k} ${f(x[k])} bits outside ±${t.greedyBitsBand * 100}% of the pool median ${f(med)}`);
  }
  if (s.rateRatio > t.rateRatioMax) out.push(`climb rate4 max/min ${f(s.rateRatio)} > ${t.rateRatioMax}`);
  if (s.cardBitsRatio > t.cardRatioMax) out.push(`card bits max/min ${f(s.cardBitsRatio)} > ${t.cardRatioMax}`);
  const syn = r.partners.map(p => p.synergy).filter(Number.isFinite);
  if (syn.length && Math.max(...syn) - Math.min(...syn) > t.synergySpreadMax) {
    out.push(`per-rule synergy spread ${f(Math.max(...syn) - Math.min(...syn))} > ${t.synergySpreadMax}`);
  }
  for (const p of r.pairs) {
    if (p.difficulty > t.pairSynergyMax) out.push(`${p.a} × ${p.b}: SYN ${f(p.difficulty)} > ${t.pairSynergyMax}`);
    if (p.ceiling < t.ceilingMin) out.push(`${p.a} × ${p.b}: best joint board found ${f(p.ceiling)} < ${t.ceilingMin}`);
  }
  for (const id of s.dominated) out.push(`${id}: dominated (another rule climbs ≥ 25% faster, reaches as far and is ≥ 10 points easier)`);
  if (!r.pairs.length && r.rules.length > 1) out.push("pair thresholds not checked (no pairs measured)");
  return out;
}
