/**
 * The one description the shipped agents are generated from (starters.ts): for every rule family, how an agent
 * scores a line y = mx + c itself (its main part and each tie-breaker, in both languages), and which moves can
 * improve each tie-breaker without spoiling the main part. Everything else (reading, trying moves in the agent's own
 * head, pricing the best and making the cheapest) is the same skeleton for every family.
 *
 * Scores mirror lib/v2-linear's families exactly (the starters test checks every one against the engine's evaluation
 * on sampled lines). Lines are read as y = mx + c, so these agents are for the whole-number and fraction boards of
 * one line per object, where every line has a gradient.
 */

/** A way to change the line, as the agent predicts it: the move and where it takes m and c. */
import { DYNAMIC_CATALOGUE } from "./dynamic-catalogue.ts";

export interface Lens {
  readonly comment: string;
  readonly ts: string;
  readonly py: string;
  /** Lines to put before the move inside the loop over k (both languages), if the move needs a value of its own. */
  readonly pre?: { readonly ts: string; readonly py: string };
  /** The families whose rule parameters the move uses (the move is only offered to them). */
  readonly only?: readonly string[];
  /** A condition (both languages) under which the move is tried; it is skipped otherwise (the engine would refuse it). */
  readonly when?: { readonly ts: string; readonly py: string };
}

export const LENSES = {
  shift: { comment: "move the line up or down", ts: `[move("si.shift", { k }), m, Q.add(c, k)]`, py: `(move("si.shift", k=k), m, c + k)` },
  tilt: { comment: "make it steeper or flatter", ts: `[move("si.tilt", { k }), Q.add(m, k), c]`, py: `(move("si.tilt", k=k), m + k, c)` },
  step: { comment: "change the pattern's step, keeping y(1)", ts: `[move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]`, py: `(move("seq.step", k=k), m + k, c - k)` },
  turnAtMinusOne: {
    comment: "turn the line about its point at x = -1 (m and c both change by k)",
    ts: `[move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]`, py: `(move("cart.pivot", x0=-1, k=k), m + k, c + k)`,
  },
  turnAtK: {
    comment: "turn the line about its point at x = k of the rule (y(k) stays put)",
    ts: `[move("cart.pivot", { x0: p.k, k }), Q.add(m, k), Q.sub(c, Q.mul(k, p.k))]`, py: `(move("cart.pivot", x0=p["k"], k=k), m + k, c - k * p["k"])`,
    only: ["crossing-check", "treasure"],
  },
  stretch: {
    comment: "multiply every output by f (m and c both)",
    pre: { ts: "const f = k > 0 ? k + 1 : k - 1;", py: "f = k + 1 if k > 0 else k - 1" },
    ts: `[move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]`, py: `(move("mach.stretch", f=f), m * f, c * f)`,
  },
  // The beginner lenses (coordinator's call 23, 15 Nov): offered only where they serve the main part, so the other
  // families' Thorough starters keep their QUOTES for their own moves.
  zoom: {
    comment: "zoom from the origin by f: the y-intercept times f, the same gradient",
    // The same factor as the stretch's (one line in the loop when both are tried).
    pre: { ts: "const f = k > 0 ? k + 1 : k - 1;", py: "f = k + 1 if k > 0 else k - 1" },
    when: { ts: "!Q.isZero(c)", py: "c != 0" },   // through the origin a zoom changes nothing
    ts: `[move("basis.zoom", { f }), m, Q.mul(c, f)]`, py: `(move("basis.zoom", f=f), m, c * f)`,
    // Offered to no family while basis.zoom is out of line-q (a straight hill on Prime Landing, 15 Nov); it returns to
    // Smooth Intercept and Divisibility Ladder with the zoom.
    only: [],
  },
  turn: {
    comment: "turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)",
    pre: { ts: "const den = Q.sub(1, Q.mul(m, k));", py: "den = 1 - m * k" },
    when: { ts: "!Q.isZero(den)", py: "den != 0" },   // a turn that would stand the line upright is refused
    ts: `[move("rot.turn", { centre: 0, turn: k }), Q.div(Q.add(m, k), den), c]`, py: `(move("rot.turn", centre=0, turn=k), (m + k) / den, c)`,
    only: ["prime-gradient", "same-on-both-rulers"],
  },
  // A turn about (0, 0) by a Pythagorean angle (tan = 3/4, 4/3, 5/12, 12/5, by |k|): the distance from (0, 0) stays, so
  // Ruler's rung stays and its tie-breaker (the y-intercept) moves.
  turnOrigin: {
    comment: "turn the line about (0, 0) by the angle whose tangent is t/u (its distance from (0, 0) stays)",
    pre: {
      ts: "const [t0, u, r] = [[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13]][(Math.abs(k) - 1) % 4], t = k > 0 ? t0 : -t0, du = Q.sub(u, Q.mul(m, t));",
      py: "t0, u, r = [(3, 4, 5), (4, 3, 5), (5, 12, 13), (12, 5, 13)][(abs(k) - 1) % 4]; t = t0 if k > 0 else -t0; du = u - m * t",
    },
    when: { ts: "!Q.isZero(du)", py: "du != 0" },   // a turn that would stand the line upright
    ts: `[move("rot.turn", { centre: "origin", turn: Q.of(t, u) }), Q.div(Q.add(Q.mul(m, u), t), du), Q.div(Q.mul(c, r), du)]`,
    py: `(move("rot.turn", centre="origin", turn=Fraction(t, u)), (m * u + t) / du, c * r / du)`,
    only: ["ruler"],
  },
} satisfies Record<string, Lens>;
export type LensId = keyof typeof LENSES;

/** Code lines, in each language: compute values from m, c and the rule's numbers p. */
export interface Lines { readonly ts: readonly string[]; readonly py: readonly string[] }

export interface TieBreakerEntry {
  /** Lines to compute first (they may return null/None: no score). */
  readonly pre?: Lines;
  /** The tie-breaker's part of the score: one expression in each language, using the main part's values. */
  readonly ts: string;
  readonly py: string;
  /** In plain words, for the comment beside it. */
  readonly says: string;
  /** The moves that can raise this tie-breaker while the main part stays at its best. */
  readonly lenses: readonly LensId[];
  /** How far one change may go (k from 1 to steps, both ways). */
  readonly steps: number;
  /** The example's one "Try this:" change. */
  readonly tryThis: string;
}

export interface FamilyEntry {
  readonly family: string;
  /** Lines computing `main` (and the values the tie-breakers use); they may return null/None: no score. */
  readonly main: Lines;
  readonly mainSays: string;
  readonly tieBreakers: Readonly<Record<string, TieBreakerEntry>>;
  /** The Simple starter's moves (default: shift and tilt). */
  readonly simple?: readonly LensId[];
  /** The Thorough starter's moves (default: every lens offered to the family), where they would not fit the starting energy. */
  readonly thorough?: readonly LensId[];
  /** The score is written for whole-number lines only (line-z: y = mx + c with whole m and c). */
  readonly wholeLines?: boolean;
  /**
   * How the rule reads a vertical line x = c: lines computing `main` from `c` (the vertical line is x = c) (and the values the defined tie-breakers
   * use); `defined` lists the tie-breakers that still mean something there (the rest are undefined: the worst).
   * Without it, a vertical line scores nothing and a starter only tips it.
   */
  readonly vertical?: { readonly main: Lines; readonly defined?: readonly string[] };
  /**
   * A ladder with no top (design-principles.md 1 and 2): lines that add the step to the next rung up to `tries`, one
   * jump through the valley between rungs, priced by its size. Every starter but the naive one takes them.
   */
  readonly rungs?: Lines;
  /** Functions the score and the rungs share, written once above score() (top level: they take the rule's numbers as arguments). */
  readonly helpers?: Lines;
  /** The score is dear (the tuple targets): Simple too scores its tries with scoreEach, stopping when 30% of the act's steps are used. */
  readonly boundedSimple?: boolean;
}

/** The line families' agents: the dynamic families only (dynamic-catalogue.ts; the old families left on 17 Nov). */
export const CATALOGUE: readonly FamilyEntry[] = DYNAMIC_CATALOGUE;
