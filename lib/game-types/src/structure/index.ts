/**
 * Mutators as cost functions (docs/mutation-cost-design.md §0–§2, docs/energy-model.md §4).
 *
 * A value LAYER is the set of values one site (a cell's digit, a cell's colour) can hold, with a structure. A cost
 * model gives each layer one GENERATOR: the elementary mutator that moves a site's value, with
 *   - an argument space (every non-identity argument, by its distance from the identity),
 *   - a distance between two values (the fewest generator steps), and
 *   - the bits it erases.
 * The work of moving one site from a to b is then a function, not a constant:
 *
 *   w(a → b) = ℓ_where + ℓ_which + argBits(a, b) + erasedBits(a, b)
 *
 * ℓ_where = log2(number of sites), ℓ_which = log2(number of generator families the type offers). A call's work is the
 * sum over the sites its net effect changed, whatever mutator did it (a composite is priced by its net effect).
 *
 * Two models, in one structure:
 *   "set-v1"       every layer is overwritten: argBits = log2 n (the new value), erasedBits = log2 n (the old one).
 *   "distance-v1"  argBits = λ · distance, erased 0 (every generator is a bijection). λ is not tuned: it is the rate at
 *                  which the argument code is Kraft-tight with no constant, Σ over the argument space of 2^(−λ·d) = 1.
 *                  An ordinal layer (a slider, 0–9) steps ±1 without wrap: d = |b − a|, λ ≈ log2 3 = 1.585.
 *                  A categorical layer (colours, suits) has no smaller step than "another value": d = 1,
 *                  λ = log2(n − 1). A cyclic layer (a dial) steps ±1 with wrap: d = the shorter way round.
 */

/** A room's cost model (game-core settings.costModel). Absent means "set-v1". */
export type CostModel = "set-v1" | "distance-v1";
export const COST_MODELS: readonly CostModel[] = Object.freeze(["set-v1", "distance-v1"]);
export const DEFAULT_COST_MODEL: CostModel = "set-v1";
export const isCostModel = (x: unknown): x is CostModel => (COST_MODELS as readonly unknown[]).includes(x);

export type Layer =
  /** One value: nothing to move, no generator, 0 bits. */
  | { readonly kind: "unit" }
  /** Any change is one step (colours, suits). */
  | { readonly kind: "categorical"; readonly n: number }
  /** ±1 without wrap (a slider). */
  | { readonly kind: "ordinal"; readonly n: number }
  /** ±1 with wrap (a dial). */
  | { readonly kind: "cyclic"; readonly n: number };

export const layerSize = (l: Layer): number => (l.kind === "unit" ? 1 : l.n);

/** The elementary mutator of one layer under one cost model, as a cost function. */
export interface Generator {
  /** "set" (name the new value), "add" (±k on a slider), "turn" (±k on a dial). */
  readonly id: "set" | "add" | "turn";
  readonly layer: Layer;
  /** The argument space: the distance from the identity of every non-identity argument (a multiset). */
  readonly argDistances: readonly number[];
  /** λ, bits per unit of distance (0 for a code that does not depend on the distance). */
  readonly rate: number;
  /** The fewest generator steps from a to b (0 iff a = b). */
  distance(a: number, b: number): number;
  /** Bits to name the argument that takes a to b. 0 when a = b. */
  argBits(a: number, b: number): number;
  /** Bits the move erases: log2 of the preimage size (0 for a bijection). 0 when a = b. */
  erasedBits(a: number, b: number): number;
}

/**
 * The λ at which Σ over `dists` of 2^(−λ·d) = 1: the maximum-entropy code with a fixed mean distance, complete with no
 * constant term. 0 when the sum is already within budget at λ = 0.
 */
export function kraftRate(dists: readonly number[]): number {
  const f = (lam: number) => dists.reduce((s, d) => s + 2 ** (-lam * d), 0) - 1;
  if (f(0) <= 0) return 0;
  let lo = 0, hi = 64;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

const range1 = (n: number): number[] => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1);
const lee = (k: number, n: number): number => { const r = ((k % n) + n) % n; return Math.min(r, n - r); };

/** Today's overwrite: log2 n to name the new value, log2 n erased, whatever the distance. */
function setGenerator(layer: Layer): Generator {
  const n = layerSize(layer), bits = Math.log2(n);
  return Object.freeze({
    id: "set", layer, argDistances: Object.freeze(range1(n - 1).map(() => 1)), rate: 0,
    distance: (a: number, b: number) => (a === b ? 0 : 1),
    argBits: (a: number, b: number) => (a === b ? 0 : bits),
    erasedBits: (a: number, b: number) => (a === b ? 0 : bits),
  });
}

/** A bijective generator priced λ·distance, λ the Kraft-tight rate of its argument space. */
function distanceGenerator(id: Generator["id"], layer: Layer, argDistances: readonly number[], distance: (a: number, b: number) => number): Generator {
  const rate = kraftRate(argDistances);
  return Object.freeze({
    id, layer, argDistances: Object.freeze([...argDistances]), rate, distance,
    argBits: (a: number, b: number) => rate * distance(a, b),
    erasedBits: () => 0,
  });
}

const generators = new Map<string, Generator | null>();
/** The generator `model` gives a layer; null for a unit layer (no move). */
export function generatorOf(layer: Layer, model: CostModel): Generator | null {
  const key = `${model}|${layer.kind}|${layerSize(layer)}`;
  let g = generators.get(key);
  if (g !== undefined) return g;
  const n = layerSize(layer);
  if (layer.kind === "unit" || n < 2) g = null;
  else if (model === "set-v1") g = setGenerator(layer);
  else if (layer.kind === "ordinal") g = distanceGenerator("add", layer, range1(n - 1).flatMap(k => [k, k]), (a, b) => Math.abs(b - a));
  else if (layer.kind === "cyclic") g = distanceGenerator("turn", layer, range1(n - 1).map(k => lee(k, n)), (a, b) => lee(b - a, n));
  else g = distanceGenerator("set", layer, range1(n - 1).map(() => 1), (a, b) => (a === b ? 0 : 1));
  generators.set(key, g);
  return g;
}

/** One generator family of a type: a layer, how many sites carry it, and how a value's site reads. */
export interface Family<V> {
  /** "symbol", "rank", "suit", "colour". */
  readonly id: string;
  readonly generator: Generator;
  readonly sites: number;
  /** The site's value in this layer, 0 … n − 1. */
  get(value: V, site: number): number;
}

/** ℓ_where + ℓ_which of one family among `families`. */
export const locationBits = (family: { readonly sites: number }, families: number): number =>
  Math.log2(family.sites) + Math.log2(Math.max(1, families));

/** w of moving one site of `family` from a to b (0 when a = b). */
export function siteWork(family: { readonly generator: Generator; readonly sites: number }, families: number, a: number, b: number): number {
  if (a === b) return 0;
  return locationBits(family, families) + family.generator.argBits(a, b) + family.generator.erasedBits(a, b);
}

/** W of a net effect: the sum, over every family and site, of the site's work. */
export function effectWork<V>(families: readonly Family<V>[], before: V, after: V): number {
  let w = 0;
  for (const f of families) {
    for (let i = 0; i < f.sites; i++) {
      const a = f.get(before, i), b = f.get(after, i);
      if (a !== b) w += siteWork(f, families.length, a, b);
    }
  }
  return w;
}

/** One row of a type's cost table, for the texts that explain change cost. */
export interface CostRow {
  /** "a digit by ±1", "a colour". */
  readonly move: string;
  /** W, bits. */
  readonly work: number;
}
