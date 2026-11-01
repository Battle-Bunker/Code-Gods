import type { Constraint, Instantiation, InstanceInfo, ObjectValue, Rng } from "@workspace/game-types";
import type { AnalyticSurvival } from "./analytic.ts";

export type Language = "python" | "typescript";
/** Params are plain JSON. `null` marks an unset option (grid-lab `None`, e.g. Royal Court "any suit"). */
export type ParamScalar = number | string | boolean | null;
/** Any JSON value built from scalars (lists of lists are fine, e.g. Residue Oracle's omens). */
export type ParamJson = ParamScalar | readonly ParamJson[] | { readonly [key: string]: ParamJson };
export type Params = { readonly [key: string]: ParamJson };

/**
 * An ordinal utility: a number, or a fixed-arity tuple compared lexicographically. Bigger is better.
 * Only the order matters; magnitudes never reach scoring (lib/grid-lab/docs/kid-api.md §1).
 */
export type Ordinal = number | readonly number[];
export type ScoreShape = { readonly kind: "scalar" } | { readonly kind: "tuple"; readonly arity: number };

/** What a family sees of the instantiation: the instance plus its display tables (names for summaries). */
export interface FamilyContext {
  readonly inst: Instantiation;
  readonly info: InstanceInfo;
}

/**
 * A family of utility functions sharing one idea. Sampling params turns it into one god's draw.
 *
 * The TypeScript card is the host evaluator and the calibration target; the Python card must induce
 * exactly the same ordinals (test/parity.py). Cards are complete kid-readable programs: a header
 * comment (emoji, name, plain sentences), the dealt params as UPPER_CASE constants, and
 * `def utility(grid):` / `function utility(grid)` written against the room's generated prelude
 * (`x` for Int and string). Penalty cards define `def penalty(grid):` / `function penalty(grid)` instead
 * (lib/grid-lab/docs/defence-goals.md §6). TypeScript cards are plain JavaScript (no annotations), so the
 * host compiles them as they are.
 */
export interface UtilityFamily<P extends Params = Params> {
  readonly id: string;
  /** Public: the catalog of possible families is common knowledge. */
  readonly name: string;
  readonly emoji: string;
  readonly objectType: string;
  /** Public, parameter-free description. */
  readonly theme: string;
  /** What the family needs from every shape it is dealt on (docs/rules-design.md §4). `applicable` checks it. */
  readonly requires: readonly Constraint[];
  /** Optional: what one draw additionally needs from the shape (params-dependent needs). `applicable` checks it. */
  needs?(params: P, ctx: FamilyContext): readonly Constraint[];
  /** Fixed per (family, instantiation): a few families change arity with the board (Sudoku Scholar at N ≤ 4). */
  shape(ctx: FamilyContext): ScoreShape;
  /** "reward" families are dealt as utilities; "penalty" families only as defence goals (badness, higher = worse). */
  readonly role: "reward" | "penalty";
  readonly tags: readonly string[];
  /** Finite parameter support in this instantiation; `sample` returns one of these. */
  support(ctx: FamilyContext): readonly P[];
  sample(rng: Rng, ctx: FamilyContext): P;
  /** Representative of the params' symmetry orbit: draws in one orbit share a calibration table. */
  canonical(params: P, ctx: FamilyContext): P;
  /** Private: the incentive in plain language. */
  summary(params: P, ctx: FamilyContext): string;
  readonly card: {
    python(params: P, ctx: FamilyContext): string;
    typescript(params: P, ctx: FamilyContext): string;
  };
  /** Optional: a legal value reaching the family's best ordinal (reachability tests; penalties: the worst value). */
  exemplar?(params: P, ctx: FamilyContext): ObjectValue;
  /** Optional: the best ordinal these params can reach here, in closed form; the exemplar must reach it (test/rules.test.ts). */
  top?(params: P, ctx: FamilyContext): Ordinal;
  /** Optional: a tiny example board (its own size) for the goal card, with a caption saying what it scores. */
  example?(params: P, ctx: FamilyContext): CardExample;
  /** Penalties only: the word before "than 90% of grids" on the ⚠️ line ("redder", "blobbier"). */
  comparative?(params: P, ctx: FamilyContext): string;
  /**
   * Optional: the survival function log2 μ{u ≥ t} computed analytically for these (canonical) params on this
   * instantiation, or null when there is no analytic answer here (the Monte Carlo + splitting estimator then runs).
   * Deterministic and cheap (milliseconds to a second): it is called at deal time and when keying tables. See
   * src/analytic.ts and docs/analytic-calibration/architecture.md.
   */
  analytic?(params: P, ctx: FamilyContext): AnalyticSurvival | null;
}

/** A tiny board shown on a goal card: a grid wire value of `size`×`size` cells and one plain caption. */
export interface CardExample {
  readonly value: ObjectValue;
  readonly size: number;
  readonly caption: string;
}

/** Persisted, server-private description of one god's utility function (and optional defence goal). */
export interface UtilityDescriptor {
  readonly familyId: string;
  readonly params: Params;
  readonly penalty?: { readonly familyId: string; readonly params: Params };
}

/** What a god is told about their own utility function. */
export interface UtilityCard {
  readonly familyId: string;
  readonly emoji: string;
  readonly name: string;
  readonly theme: string;
  readonly summary: string;
  readonly shape: ScoreShape;
  readonly source: Readonly<Record<Language, string>>;
  readonly example?: CardExample;
  readonly penalty?: {
    readonly familyId: string; readonly emoji: string; readonly name: string; readonly summary: string;
    /** "redder", "blobbier": the ⚠️ line reads "⚠️ redder than 90% of grids". */
    readonly comparative: string;
    readonly shape: ScoreShape;
    /** Defines `penalty(grid)`: bigger is worse. */
    readonly source: Readonly<Record<Language, string>>;
  };
}

/** One god's private evaluation of one object (server-private). */
export interface GodScore {
  readonly ordinal: Ordinal;
  /** ✨ s⁺ = −log2 μ{u ≥ u(x)}: reward surprisal. */
  readonly rewardBits: number;
  /** The defence goal's badness ordinal, only with a defence goal. */
  readonly penaltyOrdinal?: Ordinal;
  /** ⚠️ h = softhinge(−log2 μ{d ≥ d(x)}), only with a defence goal. */
  readonly penaltyBits?: number;
  /** n = s⁺ − w(h − E_μh), or s⁺ without a defence goal. */
  readonly netBits: number;
}
