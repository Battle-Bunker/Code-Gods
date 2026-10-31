/**
 * Annotations of the player's own utility, for any family (pure; the hook is use-annotations.ts).
 *
 * A family with a bespoke annotator (`annotatorFor` in @workspace/game-utilities) uses it. Every other family gets the
 * generic one here, a sensitivity analysis: re-score the value with each cell (Int: decimal digit; string: character)
 * changed to a few alternatives and see what each position does to your net bits. A position whose change can lower
 * the score supports it (weight: the largest drop); one no change lowers but some change raises holds it back
 * (weight: the largest rise); weights are normalised to the strongest position. It needs only `score(value)`, the
 * local evaluator of your own utility, so it works for every family, defence goal included.
 *
 * Bounds: at most MAX_ALTERNATIVES (6) alternatives per position and MAX_SCORINGS (300) scorings per object (a 7×7 grid
 * is 49 × 6 = 294); longer strings get fewer alternatives per character.
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

/** The positions of a value the generic annotation varies, and the values with one position changed. */
export interface Alternatives {
  kind: "grid" | "digits" | "chars";
  /** Grid side (positions are row-major cells). */
  size?: number;
  count: number;
  /** Distinct values with exactly position `i` changed, most informative first. */
  variants(i: number): ObjectValue[];
}

/** `k` indices spread evenly round a cycle of `n`, starting after `current` (near and far changes alike). */
function spread(current: number, n: number, k: number): number[] {
  const out: number[] = [];
  for (let j = 1; j <= k && out.length < n - 1; j++) {
    const x = (current + Math.round((j * n) / (k + 1))) % n;
    if (x !== current && !out.includes(x)) out.push(x);
  }
  return out;
}

function gridAlternatives(value: ObjectValue, inst: Instantiation): Alternatives | null {
  if (typeof value !== "string") return null;
  try {
    const args = gridArgs(inst), g = decodeGrid(value, args), N = g.size;
    const C = COLOUR_COMPONENTS[args.colours].count, S = SYMBOL_COMPONENTS[args.symbols].count;
    return {
      kind: "grid", size: N, count: N * N,
      variants(i) {
        // Every other colour first (colour rules are the commonest), then symbols spread over the set.
        const colours = Array.from({ length: C - 1 }, (_, j) => (g.col[i] + 1 + j) % C).slice(0, MAX_ALTERNATIVES);
        const symbols = spread(g.sym[i], S, MAX_ALTERNATIVES - colours.length);
        const out: ObjectValue[] = [];
        for (const k of colours) { const col = g.col.slice(); col[i] = k; out.push(encodeGrid({ size: N, sym: g.sym, col }, args)); }
        for (const s of symbols) { const sym = g.sym.slice(); sym[i] = s; out.push(encodeGrid({ size: N, sym, col: g.col }, args)); }
        return out;
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

/**
 * The generic annotation: what each position of `value` does to `score` (your net bits). Good marks for positions that
 * support the score, bad for those holding it back; empty when the score is flat, the value unreadable or the scorer
 * throws on the value itself.
 */
export function sensitivity(value: ObjectValue, score: (value: ObjectValue) => number, alternatives: Alternatives | null): Annotation[] {
  if (!alternatives || alternatives.count === 0) return [];
  let base: number;
  try { base = score(value); } catch { return []; }
  if (!Number.isFinite(base)) return [];
  const per = Math.min(MAX_ALTERNATIVES, Math.max(1, Math.floor(MAX_SCORINGS / alternatives.count)));
  const contribution: number[] = [];
  for (let i = 0; i < alternatives.count; i++) {
    let low = Infinity, high = -Infinity;
    for (const v of alternatives.variants(i).slice(0, per)) {
      let s: number;
      try { s = score(v); } catch { continue; }
      if (!Number.isFinite(s)) continue;
      low = Math.min(low, s);
      high = Math.max(high, s);
    }
    const drop = base - low, rise = high - base;
    contribution.push(drop > 1e-9 ? drop : rise > 1e-9 ? -rise : 0);
  }
  const strongest = Math.max(0, ...contribution.map(Math.abs));
  if (strongest === 0) return [];
  const marked = contribution
    .map((c, i) => ({ i, tone: c > 0 ? ("good" as const) : ("bad" as const), weight: Math.round((Math.abs(c) / strongest) * 100) / 100 }))
    .filter(m => m.weight >= MIN_SHOWN_WEIGHT);
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

/** One object's annotation of your utility: the family's own annotator when it has one, else the generic one, else none. */
export function annotateValue(value: ObjectValue, opts: {
  descriptor: UtilityDescriptor; inst: Instantiation; annotator?: Annotator; score?: (value: ObjectValue) => number;
}): Annotation[] {
  if (opts.annotator) return opts.annotator(value, opts.descriptor, opts.inst);
  if (opts.score) return sensitivity(value, opts.score, alternativesFor(value, opts.inst));
  return [];
}

// ------------------------------------------------------------------------------------------------
// caching and idle-time scheduling
// ------------------------------------------------------------------------------------------------

/** The cache key of one value's annotation in one game (a player has one utility per game). */
export const annotationKey = (gameId: string, value: ObjectValue) => `${gameId}:${value}`;

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
 * Work through `items` in idle time, never during the call itself: each idle slice does at least one item and keeps
 * going while the slice has more than `minRemainingMs` left, then calls `onBatch` (to re-render once per slice).
 * Returns a cancel function that stops further slices.
 */
export function runWhenIdle<T>(items: readonly T[], work: (item: T) => void, opts: { schedule?: IdleScheduler; onBatch?: () => void; minRemainingMs?: number } = {}): () => void {
  const schedule = opts.schedule ?? browserIdle, min = opts.minRemainingMs ?? 2;
  let next = 0, cancelled = false, cancel: () => void = () => {};
  const slice = (deadline: IdleDeadline) => {
    if (cancelled) return;
    do { work(items[next++]); } while (next < items.length && deadline.timeRemaining() > min);
    opts.onBatch?.();
    if (next < items.length && !cancelled) cancel = schedule(slice);
  };
  if (items.length) cancel = schedule(slice);
  return () => { cancelled = true; cancel(); };
}
