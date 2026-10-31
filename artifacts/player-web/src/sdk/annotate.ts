/**
 * Annotations of the player's own utility, for any family (pure; the hook is use-annotations.ts).
 *
 * A family with a bespoke annotator (`annotatorFor` in @workspace/game-utilities) uses it. Every other family gets the
 * generic one here, a sensitivity analysis: re-score the value with each cell (Int: decimal digit; string: character)
 * changed to a few alternatives and see what each position does to your net bits. A position whose change can lower
 * the score supports it (weight: the largest drop); one no change lowers but some change raises holds it back
 * (weight: the largest rise); weights are normalised to the strongest position. It needs only `score(value)`, the
 * local evaluator of your own utility, so it works for every family, defence goal included. A bespoke annotator
 * explains the utility alone, so with a defence goal the cells that feed the goal are added from a sensitivity analysis
 * of the penalty bits.
 *
 * Bounds: at most MAX_ALTERNATIVES (6) alternatives per position and MAX_SCORINGS (300) scorings per object (a 7×7 grid
 * is 49 × 6 = 294); longer strings get fewer alternatives per character, and past 300 positions an even sample of them.
 * The work is cut into jobs of one position each (≤ 6 scorings), so an idle slice can stop between any two.
 */
import {
  COLOUR_COMPONENTS, SYMBOL_COMPONENTS, decodeGrid, encodeGrid, gridArgs, type Instantiation, type ObjectValue,
} from "@workspace/game-types";
import type { Annotation, Annotator, UtilityDescriptor } from "@workspace/game-utilities";

export const MAX_ALTERNATIVES = 6;
export const MAX_SCORINGS = 300;
/** Positions weighing less than this (relative to the strongest) are not marked: noise, not insight. */
export const MIN_SHOWN_WEIGHT = 0.08;
export const SUPPORTS = "supports your score";
export const HOLDS_BACK = "holds your score back";
export const FEEDS_DEFENCE = "feeds your defence goal";

/** The positions of a value the generic annotation varies, and the values with one position changed. */
export interface Alternatives {
  kind: "grid" | "digits" | "chars";
  /** Grid side (positions are row-major cells). */
  size?: number;
  count: number;
  /** Distinct values with exactly position `i` changed, most informative first. */
  variants(i: number): ObjectValue[];
}

/** Up to `k` indices spread evenly round a cycle of `n`, other than `current` (near and far changes alike). */
function spread(current: number, n: number, k: number): number[] {
  const out: number[] = [];
  for (let j = 1; j <= k && out.length < n - 1; j++) {
    const x = (current + Math.round((j * n) / (k + 1))) % n;
    if (x !== current && !out.includes(x)) out.push(x);
  }
  return out;
}
const interleave = <T,>(a: readonly T[], b: readonly T[]): T[] =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter((x): x is T => x !== undefined);

function gridAlternatives(value: ObjectValue, inst: Instantiation): Alternatives | null {
  if (typeof value !== "string") return null;
  try {
    const args = gridArgs(inst), g = decodeGrid(value, args), N = g.size;
    const C = COLOUR_COMPONENTS[args.colours].count, S = SYMBOL_COMPONENTS[args.symbols].count;
    // Half the alternatives change the colour and half the symbol (every other colour when there are few), each spread
    // over its set, interleaved so a smaller budget still tries both.
    const colourSlots = Math.min(C - 1, Math.max(Math.ceil(MAX_ALTERNATIVES / 2), MAX_ALTERNATIVES - (S - 1)));
    const symbolSlots = Math.min(S - 1, MAX_ALTERNATIVES - colourSlots);
    return {
      kind: "grid", size: N, count: N * N,
      variants(i) {
        const colours = spread(g.col[i], C, colourSlots).map(k => { const col = g.col.slice(); col[i] = k; return encodeGrid({ size: N, sym: g.sym, col }, args); });
        const symbols = spread(g.sym[i], S, symbolSlots).map(s => { const sym = g.sym.slice(); sym[i] = s; return encodeGrid({ size: N, sym, col: g.col }, args); });
        return interleave(colours, symbols).slice(0, MAX_ALTERNATIVES);
      },
    };
  } catch {
    return null;
  }
}

function intAlternatives(value: ObjectValue, inst: Instantiation): Alternatives | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  const min = Number(inst.args.min ?? Number.MIN_SAFE_INTEGER), max = Number(inst.args.max ?? Number.MAX_SAFE_INTEGER);
  const digits = [...String(Math.abs(value))], sign = value < 0 ? -1 : 1;
  return {
    kind: "digits", count: digits.length,
    variants(i) {
      const out: ObjectValue[] = [];
      for (const d of spread(Number(digits[i]), 10, MAX_ALTERNATIVES)) {
        const next = digits.slice();
        next[i] = String(d);
        const v = sign * Number(next.join(""));
        if (Number.isSafeInteger(v) && v >= min && v <= max && v !== value && !out.includes(v)) out.push(v === 0 ? 0 : v);
      }
      return out;
    },
  };
}

const STRING_POOL = [" ", "a", "0", "A", ".", "z"];
function stringAlternatives(value: ObjectValue): Alternatives | null {
  if (typeof value !== "string") return null;
  const chars = [...value];
  const counts = new Map<string, number>();
  for (const ch of chars) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  // Characters already in the string first (most frequent first), then a fixed mix of classes.
  const frequent = [...counts].sort((a, b) => b[1] - a[1]).map(([ch]) => ch).slice(0, 3);
  const pool = [...new Set([...frequent, ...STRING_POOL])];
  return {
    kind: "chars", count: chars.length,
    variants(i) {
      return pool.filter(ch => ch !== chars[i]).slice(0, MAX_ALTERNATIVES).map(ch => { const next = chars.slice(); next[i] = ch; return next.join(""); });
    },
  };
}

/** The generic annotation's alternatives for a value of this instantiation, or null when the value cannot be read. */
export function alternativesFor(value: ObjectValue, inst: Instantiation): Alternatives | null {
  if (inst.objectType === "Grid") return gridAlternatives(value, inst);
  if (inst.objectType === "Int") return intAlternatives(value, inst);
  if (inst.objectType === "string") return stringAlternatives(value);
  return null;
}

// ------------------------------------------------------------------------------------------------
// jobs: annotation work cut into small steps
// ------------------------------------------------------------------------------------------------

/** Work done a step at a time: `step()` does one small piece and returns true once `result()` is ready. */
export interface Job<T> {
  step(): boolean;
  result(): T;
}
const done = <T,>(value: T): Job<T> => ({ step: () => true, result: () => value });
const finish = <T,>(job: Job<T>): T => { while (!job.step()) { /* next position */ } return job.result(); };

/** The generic annotation as a job: the value's own score, then one position per step. */
export function sensitivityJob(value: ObjectValue, score: (value: ObjectValue) => number, alternatives: Alternatives | null): Job<Annotation[]> {
  if (!alternatives || alternatives.count === 0) return done([]);
  // Past MAX_SCORINGS positions, an even sample of them, one scoring each.
  const stride = Math.ceil(alternatives.count / MAX_SCORINGS);
  const positions = Array.from({ length: Math.ceil(alternatives.count / stride) }, (_, k) => k * stride);
  const per = Math.min(MAX_ALTERNATIVES, Math.max(1, Math.floor(MAX_SCORINGS / positions.length)));
  const contribution = new Map<number, number>();
  let base: number | null = null, next = -1, out: Annotation[] = [];
  const close = () => { out = marksOf(contribution, alternatives); return true; };
  return {
    result: () => out,
    step() {
      if (next === -1) {
        try { base = score(value); } catch { base = null; }
        next = 0;
        return base === null || !Number.isFinite(base) ? true : false;
      }
      if (base === null || next >= positions.length) return true;
      const i = positions[next++];
      let low = Infinity, high = -Infinity;
      for (const v of alternatives.variants(i).slice(0, per)) {
        let s: number;
        try { s = score(v); } catch { continue; }
        if (!Number.isFinite(s)) continue;
        low = Math.min(low, s);
        high = Math.max(high, s);
      }
      const drop = base - low, rise = high - base;
      contribution.set(i, drop > 1e-9 ? drop : rise > 1e-9 ? -rise : 0);
      return next >= positions.length ? close() : false;
    },
  };
}

function marksOf(contribution: ReadonlyMap<number, number>, alternatives: Alternatives): Annotation[] {
  const strongest = Math.max(0, ...[...contribution.values()].map(Math.abs));
  if (strongest === 0) return [];
  const marked = [...contribution]
    .map(([i, c]) => ({ i, tone: c > 0 ? ("good" as const) : ("bad" as const), weight: Math.round((Math.abs(c) / strongest) * 100) / 100 }))
    .filter(m => m.weight >= MIN_SHOWN_WEIGHT)
    .sort((a, b) => a.i - b.i);
  const out: Annotation[] = [];
  for (const tone of ["good", "bad"] as const) {
    const these = marked.filter(m => m.tone === tone);
    if (!these.length) continue;
    const label = tone === "good" ? SUPPORTS : HOLDS_BACK;
    if (alternatives.kind === "grid") {
      const N = alternatives.size!;
      out.push({ kind: "cells", tone, label, cells: these.map(m => ({ r: Math.floor(m.i / N), c: m.i % N, weight: m.weight })) });
    } else if (alternatives.kind === "digits") {
      out.push({ kind: "digits", tone, label, positions: these.map(m => m.i), weights: these.map(m => m.weight) });
    } else {
      out.push({ kind: "spans", tone, label, spans: these.map(m => ({ start: m.i, end: m.i + 1, weight: m.weight })) });
    }
  }
  return out;
}

/**
 * The generic annotation: what each position of `value` does to `score` (your net bits). Good marks for positions that
 * support the score, bad for those holding it back; empty when the score is flat, the value unreadable or the scorer
 * throws on the value itself.
 */
export function sensitivity(value: ObjectValue, score: (value: ObjectValue) => number, alternatives: Alternatives | null): Annotation[] {
  return finish(sensitivityJob(value, score, alternatives));
}

export interface AnnotateOptions {
  descriptor: UtilityDescriptor;
  inst: Instantiation;
  /** The family's bespoke annotator, when it has one. */
  annotator?: Annotator;
  /** Your net bits of a value (the local evaluator). */
  score?: (value: ObjectValue) => number;
  /** Your defence goal's penalty bits of a value (bigger is worse), when you have one. */
  penalty?: (value: ObjectValue) => number;
}

/**
 * One object's annotation of your utility as a job: the family's own annotator when it has one (plus, with a defence
 * goal, the positions that feed it), else the generic sensitivity analysis of your net bits, else nothing.
 */
export function annotateJob(value: ObjectValue, opts: AnnotateOptions): Job<Annotation[]> {
  if (!opts.annotator) return opts.score ? sensitivityJob(value, opts.score, alternativesFor(value, opts.inst)) : done([]);
  const own = opts.annotator(value, opts.descriptor, opts.inst);
  if (!opts.descriptor.penalty || !opts.penalty) return done(own);
  const penalty = opts.penalty;
  const defence = sensitivityJob(value, v => -penalty(v), alternativesFor(value, opts.inst));
  return {
    step: () => defence.step(),
    result: () => [...own, ...defence.result().filter(a => a.tone === "bad").map(a => ({ ...a, label: FEEDS_DEFENCE }))],
  };
}

/** One object's annotation, computed at once (annotateJob run to the end). */
export function annotateValue(value: ObjectValue, opts: AnnotateOptions): Annotation[] {
  return finish(annotateJob(value, opts));
}

// ------------------------------------------------------------------------------------------------
// caching and idle-time scheduling
// ------------------------------------------------------------------------------------------------

/** The cache key of one value's annotation; `scope` names the game and whose utility (e.g. `${gameId}:${godId}`). */
export const annotationKey = (scope: string, value: ObjectValue) => `${scope}:${value}`;

/** A small least-recently-used cache of annotations. */
export class AnnotationCache {
  readonly #entries = new Map<string, Annotation[]>();
  readonly #max: number;
  constructor(max = 2000) { this.#max = max; }
  get size() { return this.#entries.size; }
  has(key: string) { return this.#entries.has(key); }
  get(key: string): Annotation[] | undefined {
    const hit = this.#entries.get(key);
    if (hit) { this.#entries.delete(key); this.#entries.set(key, hit); }
    return hit;
  }
  set(key: string, value: Annotation[]) {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.#max) this.#entries.delete(this.#entries.keys().next().value!);
  }
}

export type IdleDeadline = { timeRemaining(): number };
/** Runs `run` when the browser is idle; returns a cancel function. */
export type IdleScheduler = (run: (deadline: IdleDeadline) => void) => () => void;

/** requestIdleCallback with a 500 ms timeout, or a timer where the browser has none. */
export const browserIdle: IdleScheduler = run => {
  const g = globalThis as { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (g.requestIdleCallback && g.cancelIdleCallback) {
    const id = g.requestIdleCallback(run, { timeout: 500 });
    return () => g.cancelIdleCallback!(id);
  }
  const t = setTimeout(() => run({ timeRemaining: () => 8 }), 16);
  return () => clearTimeout(t);
};

/**
 * Run `steps` in idle time, never during the call itself: each step is called until it returns true (done), then the
 * next. An idle slice runs at least one step and keeps going while it has more than `minRemainingMs` left, then calls
 * `onBatch` (to re-render once per slice). Returns a cancel function that stops further slices.
 */
export function runWhenIdle(steps: readonly (() => boolean)[], opts: { schedule?: IdleScheduler; onBatch?: () => void; minRemainingMs?: number } = {}): () => void {
  const schedule = opts.schedule ?? browserIdle, min = opts.minRemainingMs ?? 2;
  let next = 0, cancelled = false, cancel: () => void = () => {};
  const slice = (deadline: IdleDeadline) => {
    if (cancelled) return;
    do { if (steps[next]()) next++; } while (next < steps.length && deadline.timeRemaining() > min);
    opts.onBatch?.();
    if (next < steps.length && !cancelled) cancel = schedule(slice);
  };
  if (steps.length) cancel = schedule(slice);
  return () => { cancelled = true; cancel(); };
}
