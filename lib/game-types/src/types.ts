/**
 * The object-type contract (docs/clean-implementation-plan.md §2, docs/research/grid/architecture.md).
 *
 * An object type is a type constructor over runtime parameters: Int(min, max), string(maxLength),
 * Grid(size, symbols, colours). Applying it to arguments gives an Instantiation. Everything else a
 * type needs (wire codec, uniform spawn prior, capability classes, mutators, guest prelude) hangs off
 * its ObjectTypeDef, so a new type is one module plus a renderer in lib/object-views.
 *
 * This file is shared by every package and both UIs: keep it free of Node and DOM dependencies.
 */

// ------------------------------------------------------------------------------------------------
// values and randomness
// ------------------------------------------------------------------------------------------------

/** What crosses the wire, the database and the sandboxes: Int is a safe integer, others an ASCII string. */
export type ObjectValue = number | string;
export type ParamValue = number | string;
export type TypeArgs = Readonly<Record<string, ParamValue>>;

/** Uniform random integers. Generation never calls Math.random directly. */
export interface Rng {
  /** Uniform integer in [0, bound), bound a positive safe integer. */
  int(bound: number): number;
  /** Uniform bigint in [0, bound), bound > 0. */
  big(bound: bigint): bigint;
}

// ------------------------------------------------------------------------------------------------
// parameters, capability classes and constraints
// ------------------------------------------------------------------------------------------------

export interface ComponentOption {
  readonly id: string;
  readonly label: string;
  readonly emoji: string;
  /** Plain-language description for the settings picker. */
  readonly kid: string;
}

export type ParamSchema =
  /** Choose one registered component (a symbol set, a colour set...). */
  | { readonly kind: "component"; readonly id: string; readonly label: string; readonly slot: string;
      readonly options: readonly ComponentOption[] }
  /** An integer parameter. `presets` are the values the settings UI offers (calibrated values only). */
  | { readonly kind: "int"; readonly id: string; readonly label: string; readonly min: number; readonly max: number;
      readonly presets?: readonly number[] };

/** A kid-facing capability badge: "♠ Suits: Symbols belong to teams". */
export interface Badge {
  readonly id: string;
  readonly emoji: string;
  readonly label: string;
  readonly kid: string;
}

export interface CapabilityClass {
  /** "Valued", "Ranked", "Numeral", "Suited", "Faced", "Spectral", "Wheel", "Mixable", ... */
  readonly id: string;
  /** Which parameter the class attaches to ("symbols", "colours", "size", "bounds", ...). */
  readonly slot: string;
  readonly superclasses: readonly string[];
  readonly badge: Badge;
}

/**
 * Constraints are data: a small JSON AST evaluated identically by the server, both UIs and AI prompts.
 * Terms are numbers an instantiation exposes ("size", "colours.count", "symbols.base", "bounds.max",
 * "length.max", ...).
 */
export type Constraint =
  | { readonly has: string }
  | { readonly term: string; readonly op: ">=" | "<=" | "=="; readonly value: number }
  | { readonly term: string; readonly parity: "odd" | "even" }
  | { readonly not: Constraint };

export type Resolution =
  | { readonly ok: true; readonly badges: readonly Badge[] }
  /** `reason` is kid wording ("needs ♠ Suits: pick Playing cards"); `unlock` the smallest args patch that fixes it. */
  | { readonly ok: false; readonly unmet: readonly Constraint[]; readonly reason: string; readonly unlock?: TypeArgs };

/** A fully applied object type, e.g. Grid(5,base10,rgby). Never a "room". */
export interface Instantiation {
  readonly objectType: string;
  readonly args: TypeArgs;
  /** Canonical key, e.g. "Grid(5,base10,rgby)", "Int(-2147483648,2147483647)", "string(128)". Keys caches and tables. */
  readonly key: string;
  readonly terms: Readonly<Record<string, number>>;
  /** Capability classes this instantiation has, superclass closure applied. */
  readonly classes: readonly string[];
}

// ------------------------------------------------------------------------------------------------
// codec
// ------------------------------------------------------------------------------------------------

/** V is the host's decoded representation (e.g. GridValue); the wire form is canonical. */
export interface Codec<V> {
  /** Longest wire string (string-valued types), or 0 for numeric types. Always ≤ 1024. */
  readonly maxLength: number;
  /** Strict: throws on anything that is not the canonical encoding of a legal value. */
  decode(wire: ObjectValue): V;
  encode(value: V): ObjectValue;
  isValid(wire: unknown): wire is ObjectValue;
  assert(wire: unknown): asserts wire is ObjectValue;
}

// ------------------------------------------------------------------------------------------------
// guest prelude (generated per instantiation)
// ------------------------------------------------------------------------------------------------

export interface HelperDoc {
  readonly name: { readonly python: string; readonly typescript: string };
  readonly signature: { readonly python: string; readonly typescript: string };
  /** One kid-readable line. */
  readonly kid: string;
  /** The capability class that provides it, if any (helpers without one exist everywhere). */
  readonly class?: string;
  /** "read" helpers (grid API) or "mutator" constructors (agents only). */
  readonly group: "read" | "mutator";
}

/**
 * Trusted guest source for one instantiation, prepended to utility cards and agents.
 *
 * Python and JS preludes both define:
 *   __decode(wire)        wire value -> the kid-API object (Grid with .cells/.rows..., or the int / str itself)
 *   __encode_calls(calls) list of mutator calls -> ASCII JSON string (see MutatorCallWire)
 * plus the read helpers (kid API, lib/grid-lab/docs/kid-api.md) and one constructor per available mutator.
 * Private names are `_UPPER` in Python and `__UPPER` in JS; public names never shadow builtins.
 */
export interface PreludeParts {
  readonly python: string;
  readonly js: string;
  /** Declarations for the TypeScript type checker (agents and cards in TS rooms). */
  readonly dts: string;
  readonly helpers: readonly HelperDoc[];
  /** sha256 of python + js + dts, for cache and calibration keys. */
  readonly hash: string;
}

// ------------------------------------------------------------------------------------------------
// mutators (an agent changes an object ONLY through these)
// ------------------------------------------------------------------------------------------------

/**
 * Wire form of one call, as the guest's __encode_calls emits it: [mutatorId, params] with plain JSON
 * params. An act's output is the JSON text of MutatorCallWire[] (ASCII, ≤ 64 KiB, ≤ MAX_CALLS calls).
 */
export type MutatorCallWire = readonly [string, Readonly<Record<string, unknown>>];
export const MAX_CALLS = 16;

export type MutatorScope = "local" | "line" | "block" | "region" | "global";
export type MutatorKind = "bijective" | "overwrite";

export interface MutatorDef<V = unknown, P = unknown> {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  /** Kid summary: "Swap two cells". */
  readonly summary: string;
  readonly requires: readonly Constraint[];
  readonly scope: MutatorScope;
  readonly kind: MutatorKind;
  /** Validate raw guest params for this instantiation. Throws MutatorError on anything malformed. */
  parse(raw: Readonly<Record<string, unknown>>, inst: Instantiation): P;
  /** D(params): description bits of the parameters (prefix code; uniform sampling has probability 2^-D). */
  describeBits(params: P, inst: Instantiation): number;
  /** Deterministic. Returns null when the call cannot apply to this value (the act then fails). */
  apply(value: V, params: P, inst: Instantiation): V | null;
  /** Pointwise erasure: log2 of the preimage size of the result given the call (0 for bijections). */
  erasureBits(before: V, params: P, inst: Instantiation): number;
  /** Scope of this call when it depends on the params (a paint's region kind); defaults to `scope`. */
  scopeOf?(params: P, inst: Instantiation): MutatorScope;
  /** M(params): runtime selection bits (relative targeting, e.g. line* = log2 2N), paid as decision. */
  measureBits?(params: P, inst: Instantiation): number;
  /** Uniform draw of params (field by field), used by reference agents, tests and the AI prompt examples. */
  sample(rng: Rng, inst: Instantiation): P;
  /** Guest constructor(s) and their docs, emitted into the prelude by the type's prelude generator. */
  readonly guest: { readonly python: string; readonly js: string; readonly dts: string; readonly docs: readonly HelperDoc[] };
}

export class MutatorError extends Error {
  constructor(message: string) { super(message); this.name = "MutatorError"; }
}

/** Bits charged for one act; all terms already carry the scope/kind multipliers and knobs. */
export interface ActCost {
  /** Naming the tools and their parameters at run time (step_base·log2 #available + D). */
  readonly decision: number;
  /** Landauer: bits destroyed (pointwise). */
  readonly erasure: number;
  /** Thermodynamic length: how much of the object moved. */
  readonly motion: number;
  readonly total: number;
}

export type ActOutcome =
  | { readonly ok: true; readonly value: ObjectValue; readonly cost: ActCost; readonly calls: readonly MutatorCallWire[] }
  /** Failed acts pay decision bits only (at least MIN_FAILED_ACT_BITS). */
  | { readonly ok: false; readonly reason: string; readonly cost: ActCost };
export const MIN_FAILED_ACT_BITS = 1;

/** Cost-model weights (lib/grid-lab/gridlab/mutators.py COST_KNOBS). */
export interface CostKnobs {
  readonly stepBase: number;
  readonly describe: number;
  readonly erase: number;
  readonly move: number;
  /** × M (relative-targeting selection bits), part of the decision. */
  readonly measure: number;
  readonly scope: Readonly<Record<MutatorScope, number>>;
  readonly kind: Readonly<Record<MutatorKind, number>>;
}

// ------------------------------------------------------------------------------------------------
// the object type itself
// ------------------------------------------------------------------------------------------------

/** JSON description of an instantiation for the manifest, room state and renderers. */
export interface InstanceInfo {
  readonly objectType: string;
  readonly args: TypeArgs;
  readonly key: string;
  readonly label: string;
  readonly badges: readonly Badge[];
  readonly terms: Readonly<Record<string, number>>;
  /** Type-specific display tables (Grid: symbol codes/glyphs/names/values, colour letters/names/css/ink). */
  readonly display: Readonly<Record<string, unknown>>;
  readonly codec: { readonly format: string; readonly maxLength: number };
  readonly mutators: readonly { readonly id: string; readonly name: string; readonly emoji: string; readonly summary: string }[];
  readonly helpers: readonly HelperDoc[];
}

export interface ObjectTypeDef<V = unknown> {
  /** "Int" | "string" | "Grid" | future. Immutable once shipped. */
  readonly id: string;
  readonly label: string;
  readonly emoji: string;
  readonly kid: string;
  readonly params: readonly ParamSchema[];
  readonly defaults: TypeArgs;
  readonly classes: readonly CapabilityClass[];
  /** Validates args against `params` (throws) and resolves terms and classes. */
  instantiate(args: TypeArgs): Instantiation;
  /** Every instantiation the type can offer (finite types) or representatives (infinite ones), for tests. */
  representatives(): readonly TypeArgs[];
  codec(inst: Instantiation): Codec<V>;
  /** The uniform spawn prior μ ("uniform" spawn function). */
  spawn(inst: Instantiation, rng: Rng): V;
  /**
   * Symmetric MCMC proposals for multilevel splitting: each must leave μ invariant under
   * "accept iff u stays ≥ level" (e.g. resample one cell, swap two cells, change one digit).
   */
  propose(value: V, inst: Instantiation, rng: Rng): V;
  /** Information content of the value per layer, for the motion term: changed bits between two values. */
  changedBits(before: V, after: V, inst: Instantiation): Readonly<Record<string, number>>;
  /** Total bits per layer of a uniform value (log2 alphabet × cells), the motion term's denominator. */
  layerBits(inst: Instantiation): Readonly<Record<string, number>>;
  readonly mutators: readonly MutatorDef<V, any>[];
  prelude(inst: Instantiation): PreludeParts;
  describe(inst: Instantiation): InstanceInfo;
}
