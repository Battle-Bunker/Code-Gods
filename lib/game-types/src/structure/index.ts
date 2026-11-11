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

/**
 * A room's cost model (game-core settings.costModel). Absent means "set-v1". The three distance models differ in one
 * declaration each:
 *   "distance-v1"  numbers are a slider (ordinal); the argument code is λ·d.
 *   "dial-v1"      numbers are a dial (cyclic: 9 and 0 are one step apart); the argument code is λ·d.
 *   "log-v1"       numbers are a slider; the argument code grows with log2 d (a far move costs little more than a
 *                  middling one): the maximum-entropy code with a fixed mean of log-distance, P(k) ∝ |k|^(−2).
 *   "multiply-v1"  distance-v1 plus a second number generator, multiply modulo the number of digits (and divide by a
 *                  unit): a number's move costs the cheaper of an add and a multiply, plus 1 bit to say which.
 */
export type CostModel = "set-v1" | "distance-v1" | "dial-v1" | "log-v1" | "multiply-v1";
export const COST_MODELS: readonly CostModel[] = Object.freeze(["set-v1", "distance-v1", "dial-v1", "log-v1", "multiply-v1"]);
export const DEFAULT_COST_MODEL: CostModel = "set-v1";
export const isCostModel = (x: unknown): x is CostModel => (COST_MODELS as readonly unknown[]).includes(x);
/** How a model walks a counting order (digits, card ranks): overwritten, a slider or a dial. */
export const numberLayerKind = (model: CostModel): "categorical" | "ordinal" | "cyclic" =>
  model === "set-v1" ? "categorical" : model === "dial-v1" ? "cyclic" : "ordinal";
/** The exponent s of log-v1's power-law prior P(k) ∝ |k|^(−s): each doubling of the distance costs s bits. */
export const LOG_EXPONENT = 2;

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

/** One argument of a generator. */
export interface Argument {
  /** "+2", "-1", "×3", "=7". */
  readonly label: string;
  /** Bits to name this argument (its code length against doing nothing). */
  readonly bits: number;
  /** Bits it erases: log2 of its preimage size (0 for a bijection). */
  readonly erased: number;
  /** The value it takes `a` to, or null where it cannot apply. */
  apply(a: number): number | null;
}

/** The elementary mutator of one layer under one cost model, as a cost function. */
export interface Generator {
  /**
   * "set" (name the new value), "add" (±k on a slider), "turn" (±k on a dial), "multiply" (×m modulo the layer's
   * size), "any" (the cheapest of several generators on one layer, each named with log2 of their number).
   */
  readonly id: "set" | "add" | "turn" | "multiply" | "any";
  readonly layer: Layer;
  /**
   * The argument space as actions: every argument the generator takes, with the bits that name it, the bits it erases
   * and what it does to a value (null: it cannot apply there, e.g. 9 + 1 on a slider). The price of moving a to b is
   * the cheapest argument that does it; the mutation noise draws from this list.
   */
  readonly args: readonly Argument[];
  /** The argument space: the distance from the identity of every non-identity argument (a multiset). */
  readonly argDistances: readonly number[];
  /** λ, bits per unit of distance (0 for a code that does not depend on the distance; log-v1: bits per doubling). */
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
    args: Object.freeze(range1(n).map(v => ({ label: `=${v - 1}`, bits, erased: bits, apply: () => v - 1 }))),
    distance: (a: number, b: number) => (a === b ? 0 : 1),
    argBits: (a: number, b: number) => (a === b ? 0 : bits),
    erasedBits: (a: number, b: number) => (a === b ? 0 : bits),
  });
}

/** The moves of a layer's ±1 walk: both signs on a slider (failing out of range), the n − 1 turns on a dial or a categorical layer. */
function shifts(layer: Layer): { label: string; d: number; apply(a: number): number | null }[] {
  const n = layerSize(layer);
  if (layer.kind === "ordinal") {
    return range1(n - 1).flatMap(k => [k, -k]).map(k => ({
      label: k > 0 ? `+${k}` : `${k}`, d: Math.abs(k), apply: (a: number) => (a + k >= 0 && a + k < n ? a + k : null),
    }));
  }
  return range1(n - 1).map(k => ({ label: `+${k}`, d: layer.kind === "cyclic" ? lee(k, n) : 1, apply: (a: number) => (a + k) % n }));
}

/**
 * A bijective generator whose argument code depends only on the distance: `code(d)` bits for an argument at distance d.
 * "linear": λ·d with λ the Kraft-tight rate of the argument space. "log": log2 Z + s·log2 d, the power-law code
 * P(d) = d^(−s)/Z (complete: Σ 2^(−bits) = 1); `rate` is then s, the bits per doubling of the distance.
 */
function distanceGenerator(id: Generator["id"], layer: Layer, code: "linear" | "log"): Generator {
  const moves = shifts(layer), n = layerSize(layer), argDistances = moves.map(m => m.d);
  const distance = layer.kind === "ordinal" ? (a: number, b: number) => Math.abs(b - a)
    : layer.kind === "cyclic" ? (a: number, b: number) => lee(b - a, n) : (a: number, b: number) => (a === b ? 0 : 1);
  const rate = code === "linear" ? kraftRate(argDistances) : LOG_EXPONENT;
  const logZ = code === "linear" ? 0 : Math.log2(argDistances.reduce((t, d) => t + d ** -rate, 0));
  const bitsAt = code === "linear" ? (d: number) => rate * d : (d: number) => (d === 0 ? 0 : logZ + rate * Math.log2(d));
  return Object.freeze({
    id, layer, argDistances: Object.freeze(argDistances), rate, distance,
    args: Object.freeze(moves.map(m => ({ label: m.label, bits: bitsAt(m.d), erased: 0, apply: m.apply }))),
    argBits: (a: number, b: number) => bitsAt(distance(a, b)),
    erasedBits: () => 0,
  });
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** A generator given by its arguments alone: moving a to b costs the cheapest argument that does it (Infinity if none). */
function tableGenerator(id: Generator["id"], layer: Layer, args: readonly Argument[], argDistances: readonly number[], rate: number): Generator {
  const n = layerSize(layer), best: (Argument | null)[] = Array.from({ length: n * n }, () => null);
  for (const arg of args) for (let a = 0; a < n; a++) {
    const b = arg.apply(a);
    if (b === null || b === a) continue;
    const old = best[a * n + b];
    if (!old || arg.bits + arg.erased < old.bits + old.erased) best[a * n + b] = arg;
  }
  const at = (a: number, b: number) => (a === b ? null : best[a * n + b]);
  return Object.freeze({
    id, layer, args: Object.freeze([...args]), argDistances: Object.freeze([...argDistances]), rate,
    distance: (a: number, b: number) => (a === b ? 0 : at(a, b) ? at(a, b)!.bits / (rate || 1) : Infinity),
    argBits: (a: number, b: number) => (a === b ? 0 : at(a, b)?.bits ?? Infinity),
    erasedBits: (a: number, b: number) => (a === b ? 0 : at(a, b)?.erased ?? 0),
  });
}

/**
 * Multiply modulo the layer's size (docs/mutation-cost-design.md §4): the arguments are m = 0, 2, 3 … n − 1 (×1 is the
 * identity). The argument's distance is its magnitude log2 m, with ×0 read as ×n (0 ≡ n), and the rate is the
 * Kraft-tight one, so a bigger multiplier costs more. ×m merges gcd(m, n) values into one: it erases log2 gcd(m, n)
 * bits whatever the value. Dividing by a unit u is multiplying by its inverse.
 */
function multiplyGenerator(layer: Layer): Generator {
  const n = layerSize(layer), ms = [0, ...range1(n - 1).slice(1)], magnitude = (m: number) => Math.log2(m === 0 ? n : m);
  const dists = ms.map(magnitude), rate = kraftRate(dists);
  return tableGenerator("multiply", layer, ms.map(m => ({
    label: `×${m}`, bits: rate * magnitude(m), erased: Math.log2(gcd(m, n)), apply: (a: number) => (a * m) % n,
  })), dists, rate);
}

/** The cheapest of several generators on one layer: each argument also pays log2(how many generators) to say which. */
function anyOf(layer: Layer, members: readonly Generator[]): Generator {
  const which = Math.log2(members.length);
  return tableGenerator("any", layer, members.flatMap(g => g.args.map(x => ({ ...x, bits: which + x.bits }))),
    members.flatMap(g => g.argDistances), 0);
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
  else if (model === "multiply-v1" && layer.kind === "ordinal") g = anyOf(layer, [distanceGenerator("add", layer, "linear"), multiplyGenerator(layer)]);
  else if (layer.kind === "ordinal") g = distanceGenerator("add", layer, model === "log-v1" ? "log" : "linear");
  else g = distanceGenerator(layer.kind === "cyclic" ? "turn" : "set", layer, "linear");
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
  /** Write the site's value in this layer, in place (on a copy the caller owns). */
  set(value: V, site: number, x: number): void;
}

/** ℓ_where + ℓ_which of one family among `families`. */
export const locationBits = (family: { readonly sites: number }, families: number): number =>
  Math.log2(family.sites) + Math.log2(Math.max(1, families));

/**
 * w of moving one site of `family` from a to b (0 when a = b). The grouping is deliberate: under set-v1 it is, bit for
 * bit, the closed form the prices had before cost models, (op + cell) + 2·log2 n (test/cost-models.test.ts).
 */
export function siteWork(family: { readonly generator: Generator; readonly sites: number }, families: number, a: number, b: number): number {
  if (a === b) return 0;
  return locationBits(family, families) + (family.generator.argBits(a, b) + family.generator.erasedBits(a, b));
}

/**
 * W of a net effect: the sum, over every family and site, of the site's work. Sites of a family that cost the same are
 * counted and priced together (count × w), not added one by one: the sum is the same number of bits, and under set-v1 it
 * is bit for bit the old ds·w_symbol + dc·w_colour (a running sum rounds differently in the last place).
 */
export function effectWork<V>(families: readonly Family<V>[], before: V, after: V): number {
  let w = 0;
  for (const f of families) {
    const moved = new Map<number, number>();
    for (let i = 0; i < f.sites; i++) {
      const a = f.get(before, i), b = f.get(after, i);
      if (a !== b) { const s = siteWork(f, families.length, a, b); moved.set(s, (moved.get(s) ?? 0) + 1); }
    }
    for (const [s, k] of moved) w += k * s;
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
