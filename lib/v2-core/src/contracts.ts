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
  /**
   * The variant whose value functions this one uses. The law π ∝ 2^−φ depends on the type and its params, not on the
   * mutators offered (every price list is an exact potential, owner decision 19), so a variant that differs from another
   * only in its menu shares that variant's values (and their keys) instead of a duplicate set.
   */
  readonly valuesOf?: string;
  /**
   * The "which" code: bits per offered mutator id, a prefix code (Kraft sum Σ 2^−bits = 1). Absent: uniform, log2 N
   * each. A move and its inverse are the same mutator, so they pay the same bits and the potential stays exact.
   */
  readonly which?: Readonly<Record<string, number>>;
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
  /**
   * Small states, for seeding calibration (spec §7.2 step 1): a bounded enumeration near the centre, in a fixed order.
   * Thin upper sets (a run of six primes, an exact area) are found here rather than by a random climb.
   */
  enumerate?(variant: Variant): Iterable<S>;
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
  | { readonly kind: "pegboard"; readonly window: readonly [number, number]; readonly on: ElementRef }
  | GridScene;

/**
 * A board of cells (the grid object type, docs/engine-v2/grids.md §3): `cells` in reading order, `rows` × `cols`; a
 * representation's own elements sit in the margins (a row's or column's total) or on groups of cells (an opposite pair,
 * a box, the step between two neighbours), each group listing its cells by index.
 */
export interface GridScene {
  readonly kind: "grid";
  readonly rows: number;
  readonly cols: number;
  readonly cells: readonly ElementRef[];
  readonly right?: readonly ElementRef[];
  readonly bottom?: readonly ElementRef[];
  readonly groups?: readonly { readonly cells: readonly number[]; readonly el: ElementRef }[];
  /** A word or two for what each margin holds ("total", "off by"), drawn over it; the elements' labels say the rest. */
  readonly rightTitle?: string;
  readonly bottomTitle?: string;
  /** What the groups' values are ("pair totals"), for the scene's text form. */
  readonly groupTitle?: string;
}

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

/** A component of a score: the term that measures a layer, and its sense. */
export interface ScoreComponent {
  readonly term: TermId;
  readonly sense: "max" | "min";
}

export interface Evaluation {
  /**
   * The rule's utilities, compared lexicographically, bigger better (owner decision 23): the main layer's then the dealt
   * tie-breaker's, each negated for "min", with no saturation; null when the main layer is undefined. This is what a
   * value function (lib/v2-valuation value.ts) is keyed by.
   */
  readonly score: Score;
  /** The terms that make the score, in order: the main layer, then the dealt tie-breaker (views: main part, tie-breaker). */
  readonly components: readonly ScoreComponent[];
  readonly terms: readonly Term[];
  readonly marks: readonly Mark[];
  readonly reads: readonly ElementRef[];
}

/**
 * One layer of a rule (spec §4.1): a graded quantity with a direction, never a yes/no test (owner decision 13).
 */
export interface Layer<P> {
  /** Also the id of the term that measures it. */
  readonly id: string;
  /** "gradient close to a prime": in a 12-year-old's words for the main layer (owner decision 14). */
  readonly title: string;
  sentence(params: P): string;
  /** The representation this layer is read in: the compact view of the layer. */
  readonly rep: string;
  /** min: smaller is better (a distance); max: bigger is better (a count, a size). */
  readonly sense: "min" | "max";
  /**
   * What kind of number the layer measures, where its value function needs to know (owner decision 26): "prime" for a
   * layer whose value is a prime or a prime factor (bigger better), so the value keeps rising past the measured knots
   * at the code's own cost of a prime, STEP bits per unit. "ladder" for a ladder family's main part (a hill with no
   * top, RuleFamily.keepsParams): its tail continues at the rate measured over its top knots (the coordinator's declared
   * trial, 15 Nov: a flat tail is a top in disguise and freezes lines). Omitted: a plain size, a count or a distance.
   */
  readonly measure?: "prime" | "ladder";
  /**
   * For a tie-breaker: whether it is dealt on this variant (default: always). False where it cannot decide anything
   * there, e.g. a pile of b-coins on whole-number lines, where b is always 1.
   */
  dealtOn?(variant: Variant): boolean;
}

/**
 * A rule family (spec §4.1): one main layer and a list of alternative tie-breakers (owner decision 14 and its
 * correction: "I will want several secondary rule candidates within each family"). A dealt rule is the main layer plus
 * at most one chosen tie-breaker; never a third layer.
 */
export interface RuleFamily<S, P> {
  readonly id: string;
  readonly title: string;
  /** The rule in a sentence or two; with the dealt tie-breaker when there is one. */
  card(params: P, tieBreaker: string | null): string;
  readonly params: readonly ParamDecl[];
  dealable(variant: Variant): readonly P[];
  readonly depends: readonly string[];
  readonly main: Layer<P>;
  /** Alternatives; each has its own artefact with the main layer. */
  readonly tieBreakers: readonly Layer<P>[];
  /** Reads elements, records the main layer's term and every tie-breaker's (by the layers' ids), adds marks. */
  evaluate(ctx: EvalContext<S>, params: P): void;
  /** Worked examples for the goal card (integration plan §5.7); a seeded search when absent. */
  examples?(params: P, variant: Variant): readonly S[];
  /**
   * A ladder family (design-principles.md rows 1 to 3 pass) keeps its dealt parameters all game: parameter drift never
   * redraws it (the coordinator's amendment of call 18, 15 Nov: a redraw reset the climb). Absent: drift may redraw it.
   */
  readonly keepsParams?: boolean;
  /**
   * For a ladder family: a few cheap states reaching the n-th unit of its ladder (n ≥ 1: n primes, n digits, a run of
   * n …), for the cap on its value tail (CLAUDE.md: a value tail never grows faster than the φ of the cheapest state
   * that reaches it; the coordinator's amendment of trial 28). Any of them may be invalid on a variant; none may be
   * empty for a unit the ladder has no cheap witness for.
   */
  witness?(params: P, n: number): readonly S[];
}

/** Which tie-breaker a dealt rule uses: an id of the family's, or null for the main layer alone. */
export type TieBreaker = string | null;

// ---------------------------------------------------------------- mutators (§5)

export interface ArgCode<A> {
  bits(a: A): number;
  /** A draw with probability 2^−bits, or null for the code's leftover mass. */
  sample(rng: Rng): A | null;
  /** To the wire (JSON-safe: rationals as strings). */
  encode(a: A): Readonly<Record<string, string>>;
  /** From the wire; throws on anything outside the code's domain. */
  decode(w: unknown): A;
  /** Every argument whose price is at most maxBits, cheapest first (the views' nearest improvement). */
  enumerate?(maxBits: number): Iterable<A>;
}

export type Inverse<A> =
  | { readonly kind: "self" }
  | { readonly kind: "mutator"; readonly id: string; args(a: A): A }
  | { readonly kind: "partial"; readonly id: string; args(a: A): A; readonly note: string }
  | { readonly kind: "none"; readonly note: string };

/**
 * One argument of a move said for a person (playtest round 23: the form showed "centre", "turn", "f" and nothing about
 * what to type). Every surface that asks for the argument (What if, the forge's links, `rep.mutators` for assistants
 * and the CLI) reads it from here; none writes its own.
 */
export interface ArgHelp {
  /** What it is, in a few plain words: "How far to turn". */
  readonly label: string;
  /** What may be typed, with examples: "left or right for a quarter turn, or a slope such as 1 (an eighth of a turn)". */
  readonly hint: string;
  /** A sensible value to start from, as the wire writes it ("left", "2", "1/2"). */
  readonly example: string;
  /** Plain words for each word the argument takes ("m-c" → "the gradient and the y-intercept"). */
  readonly choices?: Readonly<Record<string, string>>;
}

export interface Mutator<S, A> {
  readonly id: string;
  readonly reps: readonly string[];
  readonly title: string;
  describe(args: A): string;
  /** Each argument said for a person, by its wire name (what the board's variant makes it, e.g. a grid's cell names). */
  argHelp?(variant: Variant): Readonly<Record<string, ArgHelp>>;
  /** The argument code; it may depend on the variant (integer or rational arguments). */
  args(variant: Variant): ArgCode<A>;
  readonly perSite: boolean;
  apply(state: S, site: number, args: A, variant: Variant): S | Invalid;
  readonly inverse: Inverse<A>;
  /**
   * A least fee for a call (the coordinator's call, 15 Nov: coef.swap is floored at φ of the larger number it swaps). It
   * must be the same for a call and its inverse, read from the two states alike, so the exact potential holds (decision
   * 19): the price is max(which + where + args, floor) + surcharge, and the top-up is reported in Price.arg.
   */
  floor?(before: S, after: S, site: number, args: A, variant: Variant): number;
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
