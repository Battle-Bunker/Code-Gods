/** The v2 contracts as types (spec §2–§5). Implementations: v2-core's evaluate.ts and walk.ts, and the object types. */
import type { Q } from "./q.ts";
import type { Rng } from "./rng.ts";

/** Why a state or a result is not allowed: a sentence for people. */
export interface Invalid {
  readonly invalid: string;
}
export const isInvalid = (x: unknown): x is Invalid =>
  typeof x === "object" && x !== null && typeof (x as Invalid).invalid === "string";

// ---------------------------------------------------------------- variants and object types (§2)

export interface Variant {
  readonly id: string;
  readonly objectType: string;
  /** The mutators offered, by id. Their count is the "which" code. */
  readonly mutators: readonly string[];
  /** Walk steps between births (§2.4). */
  readonly birthMixSteps: number;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface ObjectType<S> {
  readonly id: string;
  readonly version: number;
  readonly variants: readonly Variant[];
  canonical(state: S, variant: Variant): S | Invalid;
  encode(state: S): string;
  decode(wire: string): S;
  /** φ: bits to read the whole state. */
  readLength(state: S, variant: Variant): number;
  sites(state: S, variant: Variant): number;
  origin(variant: Variant): S;
  readonly representations: readonly Representation<S>[];
  readonly mutators: readonly Mutator<S, any>[];
  readonly families: readonly RuleFamily<S, any>[];
}

// ---------------------------------------------------------------- representations (§3)

export type SceneKind = "equation" | "plane" | "table" | "sequence" | "machine" | "pegboard" | "grid";

export interface Point {
  readonly x: Q;
  readonly y: Q;
}

export type ElementValue =
  | { readonly kind: "number"; readonly q: Q }
  | { readonly kind: "point"; readonly x: Q; readonly y: Q }
  | { readonly kind: "segment"; readonly from: Point; readonly to: Point }
  | { readonly kind: "symbol"; readonly text: string }
  | { readonly kind: "undefined"; readonly reason: string };

export interface ParamDecl {
  readonly name: string;
  readonly domain: "Z" | "Q";
}

/** Arguments of a dynamic element or a rule, by name. */
export type ArgValues = Readonly<Record<string, Q>>;

export interface ElementDecl<S> {
  readonly name: string;
  readonly label: string;
  readonly kind: "number" | "point" | "segment" | "symbol";
  readonly role: "coordinate" | "derived" | "dynamic";
  readonly params?: readonly ParamDecl[];
  /** Shared across representations: "yIntercept". Dynamic elements match on meaning and arguments. */
  readonly meaning?: string;
  value(state: S, site: number, args: ArgValues): ElementValue;
}

/** A reference to an element. Arguments travel as rational wire strings ("3", "-1/2"). */
export interface ElementRef {
  readonly rep: string;
  readonly name: string;
  readonly site?: number;
  readonly args?: Readonly<Record<string, string>>;
}

export type SceneData =
  | { readonly kind: "equation"; readonly template: readonly (string | { readonly el: string })[] }
  | { readonly kind: "plane"; readonly window: readonly [Q, Q, Q, Q]; readonly items: readonly PlaneItem[] }
  | { readonly kind: "table"; readonly columns: readonly { readonly header: string; readonly el: ElementRef }[] }
  | { readonly kind: "sequence"; readonly terms: readonly { readonly n: number; readonly el: ElementRef }[]; readonly picture: "tiles" | "dots" }
  | { readonly kind: "machine"; readonly stages: readonly { readonly label: string; readonly el?: string }[]; readonly input: ElementRef; readonly output: ElementRef }
  | { readonly kind: "pegboard"; readonly window: readonly [number, number]; readonly on: ElementRef };

export interface PlaneItem {
  readonly draw: "line" | "point" | "segment" | "region" | "tick";
  readonly el: ElementRef;
}

export interface Representation<S> {
  readonly id: string;
  readonly title: string;
  readonly scene: SceneKind;
  readonly perSite: boolean;
  readonly elements: readonly ElementDecl<S>[];
  layout(state: S, site: number): SceneData;
}

// ---------------------------------------------------------------- rules (§4)

/**
 * Bigger is better, compared lexicographically, one component per layer. null is WORST, below everything (the primary
 * layer is undefined); a null component ranks last in its own component only (a secondary layer that is undefined).
 */
export type Score = readonly (Q | null)[] | null;

export interface Undef {
  readonly undefined: string;
}
export type TermId = string;

export interface Term {
  readonly id: TermId;
  readonly label: string;
  readonly value: Q | Undef;
  readonly from: readonly ElementRef[];
}

export type Mark =
  | { readonly kind: "focus"; readonly ref: ElementRef }
  | { readonly kind: "measure"; readonly from: ElementRef; readonly to: ElementRef; readonly term: TermId }
  | { readonly kind: "candidate"; readonly ref: ElementRef; readonly term?: TermId }
  | { readonly kind: "note"; readonly ref: ElementRef; readonly text: string };

export interface EvalContext<S> {
  readonly state: S;
  /** The line (site) being evaluated; refs without a site mean this one. */
  readonly site: number;
  readonly variant: Variant;
  read(ref: ElementRef): ElementValue;
  /** Record a term. A term whose id is a layer's id is that layer's measure: the score is made of them. */
  term(id: TermId, label: string, value: Q | Undef, from: readonly ElementRef[]): TermId;
  mark(mark: Mark): void;
}

export interface Evaluation {
  readonly score: Score;
  readonly terms: readonly Term[];
  readonly marks: readonly Mark[];
  readonly reads: readonly ElementRef[];
}

export interface Rung {
  /** Threshold: a state meets the rung when its score meets or beats this on the threshold's components. */
  readonly score: Score;
  readonly label: string;
  /** The layer this rung belongs to (−1 for the bottom rung, "anything"). */
  readonly layer: number;
}

/**
 * One layer of a rule (spec §4.4): a graded quantity with a direction, never a yes/no test (owner decision 13). The
 * primary layer is layer 0; a later layer only counts once every earlier layer is at its top.
 */
export interface Layer<P> {
  /** Also the id of the term that measures it. */
  readonly id: string;
  /** "gradient near a prime", in a 12-year-old's words for the primary (owner decision 14). */
  readonly title: string;
  sentence(params: P): string;
  /** The representation this layer is read in: the compact view of the layer. */
  readonly rep: string;
  /** min: smaller is better (a distance); max: bigger is better (a count, a size). */
  readonly sense: "min" | "max";
  /** distance and count/size tell calibration which curve to fit (§7.4). */
  readonly measure: "distance" | "count" | "size";
  /** The rung thresholds, from the easiest to the top. The last is the layer's top. */
  thresholds(params: P, variant: Variant): readonly Q[];
  /** Words for a rung: "within 1/4 of a prime". */
  rungLabel(threshold: Q, params: P): string;
}

export interface RuleFamily<S, P> {
  readonly id: string;
  readonly title: string;
  card(params: P): string;
  readonly params: readonly ParamDecl[];
  dealable(variant: Variant): readonly P[];
  readonly depends: readonly string[];
  readonly primary: string;
  /** The ladder, primary first; a pool deals a prefix of it (the beginner pool deals two). */
  readonly layers: readonly Layer<P>[];
  /** Reads elements, records one term per layer (by the layer's id) and any others, adds marks. */
  evaluate(ctx: EvalContext<S>, params: P): void;
}

// ---------------------------------------------------------------- mutators (§5)

export interface ArgCode<A> {
  bits(a: A): number;
  /** A draw with probability 2^−bits, or null for the code's leftover mass. */
  sample(rng: Rng): A | null;
  /** To the wire (JSON-safe: rationals as strings). */
  encode(a: A): Readonly<Record<string, string>>;
  /** From the wire; throws on anything outside the code's domain. */
  decode(w: unknown): A;
}

export type Inverse<A> =
  | { readonly kind: "self" }
  | { readonly kind: "mutator"; readonly id: string; args(a: A): A }
  | { readonly kind: "partial"; readonly id: string; args(a: A): A; readonly note: string }
  | { readonly kind: "none"; readonly note: string };

export interface Mutator<S, A> {
  readonly id: string;
  readonly reps: readonly string[];
  readonly title: string;
  describe(args: A): string;
  /** The argument code; it may depend on the variant (integer or rational arguments). */
  args(variant: Variant): ArgCode<A>;
  readonly perSite: boolean;
  apply(state: S, site: number, args: A, variant: Variant): S | Invalid;
  readonly inverse: Inverse<A>;
}

/** What an agent returns. */
export interface Call {
  readonly mutator: string;
  readonly site: number;
  readonly args: Readonly<Record<string, string>>;
}

export interface Price {
  readonly which: number;
  readonly where: number;
  readonly arg: number;
  readonly surcharge: number;
  readonly total: number;
}
