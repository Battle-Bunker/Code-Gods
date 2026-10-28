/**
 * Moves, actions and the move space of an instantiation, as the decision estimator sees them
 * (open-agents.md §3.1, §3.3; measure.py field_alphabets / move_index / naming_bits).
 *
 * A move is one mutator call in canonical form: the mutator id and its fields IN FIELD ORDER, with
 * any runtime-relative target resolved (`line*`, the busiest line, becomes the line it hits). Its key
 * is the JSON text of `[mutator id, [[field, value], ...]]`, exactly the key of the Grid Lab vectors.
 *
 * Grid keys follow mutators.py: a region whose only choice is () there (line*, core, all) is omitted
 * by our wire format (grid/mutators.ts) and re-inserted here as `["region", []]`, so keys, field
 * alphabets and the positional bound match measure.py.
 *
 * An ACTION is the tuple of moves one run returned. A run whose output is not a valid act (bad JSON,
 * an unknown or unavailable mutator, bad params, a call that cannot apply, too many calls) does
 * nothing, and its action is the empty tuple, as in measure.py where such a run raises. A valid act
 * whose calls change nothing keeps its moves (it was still a decision).
 */
import { availableOf } from "../prelude.ts";
import { lg, parseCallShape, parseWire } from "../mutators.ts";
import { MAX_CALLS, type Instantiation, type MutatorDef, type ObjectTypeDef, type ObjectValue } from "../types.ts";
import type { GridMutator } from "../grid/mutators.ts";
import { gammaBits } from "./codes.ts";

export type MoveItems = readonly (readonly [string, unknown])[];

export interface Move {
  readonly mid: string;
  /** Fields in field order (canonical key form: Grid regions with no choice appear as []). */
  readonly items: MoveItems;
  /** Parsed params as the mutator takes them (describeBits, apply). */
  readonly params: Readonly<Record<string, unknown>>;
  /** JSON of [mid, items]. */
  readonly key: string;
}
export type Action = readonly Move[];

export const actionKey = (a: Action): string => "[" + a.map(m => m.key).join(",") + "]";

const isGridMutator = (m: MutatorDef<any, any>): m is GridMutator =>
  typeof (m as Partial<GridMutator>).space === "function" && Array.isArray((m as Partial<GridMutator>).fieldNames);

/** What the estimator needs to know about the moves of one instantiation. */
export interface MoveSpace {
  readonly inst: Instantiation;
  /** Available mutators in the type's order. */
  readonly mutators: readonly MutatorDef<any, any>[];
  /** #available mutators: log2 of it names a tool (naming bound); +1 is the positional alphabet. */
  readonly nMutators: number;
  /** Field names over every legal move, in first-seen enumeration order (positional bound). */
  readonly fieldOrder: readonly string[];
  /** #distinct values of a field over every legal move + 1 (absent); Infinity when not enumerable. */
  fieldAlphabet(field: string): number;
  /** True when every legal move is enumerated (Grid): rank() then defines the set bound's order. */
  readonly enumerable: boolean;
  /** Index in the enumeration of every legal move; undefined when outside it (or not enumerable). */
  rank(m: Move): number | undefined;
  /** The set bound's order for non-enumerable spaces: mutator order, then field values. */
  compare(a: Move, b: Move): number;
  /** D(move): the mutator's description bits of its params. */
  describeBits(m: Move): number;
  /** Canonical move from a mutator id and parsed params (already resolved). */
  move(mid: string, params: Readonly<Record<string, unknown>>): Move;
  /** Canonical move from a key ([mid, [[field, value], ...]]); throws on an illegal move. */
  fromKey(key: readonly [string, readonly (readonly [string, unknown])[]]): Move;
}

export interface MoveSpaceOptions {
  /**
   * Override #available mutators. Only for checking Grid Lab vectors: gridlab offers `flatten`, which
   * our port leaves out (24 versus 23 mutators on Grid(5,base10,rgby)).
   */
  readonly nMutators?: number;
}

function cmpValue(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = cmpValue(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  const x = JSON.stringify(a) ?? "", y = JSON.stringify(b) ?? "";
  return x < y ? -1 : x > y ? 1 : 0;
}

const spaceCache = new Map<string, MoveSpace>();

/** The move space of an instantiation (cached unless options are given). */
export function moveSpace(typeDef: ObjectTypeDef<any>, inst: Instantiation, opts: MoveSpaceOptions = {}): MoveSpace {
  const cacheKey = `${inst.key}|${opts.nMutators ?? ""}`;
  const hit = spaceCache.get(cacheKey);
  if (hit) return hit;
  const mutators = availableOf(typeDef.mutators, inst);
  const order = new Map(mutators.map((m, i) => [m.id, i]));
  const byId = new Map(mutators.map(m => [m.id, m]));
  const grid = mutators.length > 0 && mutators.every(isGridMutator);

  const itemsOf = (m: MutatorDef<any, any>, params: Readonly<Record<string, unknown>>): MoveItems => {
    if (!isGridMutator(m)) return Object.entries(params);
    const out: [string, unknown][] = [];
    for (const f of m.fieldNames) {
      if (f in params) out.push([f, params[f]]);
      else if (f === "region") out.push([f, []]);   // mutators.py region_choices → [()]
    }
    return out;
  };
  const move = (mid: string, params: Readonly<Record<string, unknown>>): Move => {
    const m = byId.get(mid);
    if (!m) throw new Error(`"${mid}" is not available for ${inst.key}`);
    const items = itemsOf(m, params);
    return Object.freeze({ mid, items, params, key: JSON.stringify([mid, items]) });
  };

  // enumeration (Grid): move index and field alphabets
  let index: Map<string, number> | null = null;
  const values = new Map<string, Set<string>>();
  if (grid) {
    index = new Map();
    for (const m of mutators as GridMutator[]) {
      for (const p of m.space(inst)) {
        const mv = move(m.id, p);
        index.set(mv.key, index.size);
        for (const [f, v] of mv.items) {
          let s = values.get(f);
          if (!s) values.set(f, s = new Set());
          s.add(JSON.stringify(v));
        }
      }
    }
  }
  const alphabets = new Map([...values].map(([f, s]) => [f, s.size + 1]));

  const compare = (a: Move, b: Move): number => {
    const d = (order.get(a.mid) ?? Infinity) - (order.get(b.mid) ?? Infinity);
    if (d) return d;
    for (let i = 0; i < Math.min(a.items.length, b.items.length); i++) {
      const c = cmpValue(a.items[i][1], b.items[i][1]);
      if (c) return c;
    }
    return a.items.length - b.items.length;
  };

  const space: MoveSpace = Object.freeze({
    inst, mutators, enumerable: grid,
    nMutators: opts.nMutators ?? mutators.length,
    fieldOrder: Object.freeze([...values.keys()]),
    fieldAlphabet: (f: string) => alphabets.get(f) ?? (grid ? 1 : Infinity),
    rank: (m: Move) => (index ? index.get(m.key) : undefined),
    compare,
    describeBits: (m: Move) => byId.get(m.mid)!.describeBits(m.params, inst),
    move,
    fromKey: ([mid, items]: readonly [string, readonly (readonly [string, unknown])[]]) => {
      const m = byId.get(mid);
      if (!m) throw new Error(`"${mid}" is not available for ${inst.key}`);
      const raw: Record<string, unknown> = {};
      for (const [f, v] of items) {
        if (isGridMutator(m) && f === "region" && Array.isArray(v) && v.length === 0) continue;
        raw[f] = v;
      }
      return move(mid, m.parse(raw, inst) as Record<string, unknown>);
    },
  });
  if (opts.nMutators === undefined) spaceCache.set(cacheKey, space);
  return space;
}

/** Length of the action written out literally: γ(#moves + 1) + Σ (log2 #mutators + D(move)). */
export function namingBits(a: Action, space: MoveSpace): number {
  const k = lg(space.nMutators);
  let b = gammaBits(a.length + 1);
  for (const m of a) b += k + space.describeBits(m);
  return b;
}

// ------------------------------------------------------------------------------------------------
// the resolver: a run's wire output → its action
// ------------------------------------------------------------------------------------------------

export interface ResolvedAct {
  /** The canonical action ([] when the act is invalid: the engine would do nothing). */
  readonly action: Action;
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * The same call with a runtime-relative target resolved against `value` (decoded): Grid `line*`
 * becomes the line it hits (grid/mutators.ts `resolve`, the same feature and tie-break apply uses).
 * Types without relative targets return the params unchanged.
 */
export function resolveParams<V>(m: MutatorDef<V, any>, value: V, params: Readonly<Record<string, unknown>>,
  inst: Instantiation): Readonly<Record<string, unknown>> {
  return isGridMutator(m) ? m.resolve(value as never, params, inst) : params;
}

/**
 * Parse an act's wire output on `value` into its canonical action, as applyCalls would run it: each
 * call is validated, resolved against the value it acts on (the result of the calls before it), and
 * applied. Never throws on agent input.
 */
export function resolveAct<V>(typeDef: ObjectTypeDef<V>, inst: Instantiation, value: ObjectValue, wire: unknown,
  space: MoveSpace = moveSpace(typeDef, inst)): ResolvedAct {
  const byId = new Map(space.mutators.map(m => [m.id, m]));
  try {
    let x = typeDef.codec(inst).decode(value);
    const list = parseWire(wire);
    if (list.length > MAX_CALLS) return { action: [], valid: false, error: `more than ${MAX_CALLS} calls` };
    const out: Move[] = [];
    for (let i = 0; i < list.length; i++) {
      const [id, raw] = parseCallShape(list[i], i);
      const m = byId.get(id) as MutatorDef<V, any> | undefined;
      if (!m) return { action: [], valid: false, error: `"${id}" is not available for ${inst.key}` };
      const p = m.parse(raw, inst) as Record<string, unknown>;
      const y = m.apply(x, p, inst);
      if (y === null) return { action: [], valid: false, error: `call ${i + 1} (${id}) cannot apply` };
      out.push(space.move(id, resolveParams(m, x, p, inst)));
      x = y;
    }
    return { action: out, valid: true };
  } catch (e) {
    return { action: [], valid: false, error: (e as Error).message };
  }
}
