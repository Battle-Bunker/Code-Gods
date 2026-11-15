/**
 * The system's representations (docs/engine-v2/two-line-systems.md §1.2). The system is one site; its two lines are
 * "line 1" and "line 2" in canonical order (the views keep each line's colour across moves). Each lens is a way a
 * 12-year-old meets two lines at school: the stacked equations, the graph with the crossing, the worked elimination,
 * the angle between the lines, the four intercepts.
 */
import { Qn, q, ref, type ElementDecl, type ElementValue, type Q, type Representation } from "@workspace/v2-core";
import { nearestInteger, through, type Line } from "@workspace/v2-linear";
import { facts, gradient, xIntercept, yIntercept, type PairState } from "./pair.ts";

type Decl = ElementDecl<PairState>;
const num = (x: Q): ElementValue => ({ kind: "number", q: x });
const undef = (reason: string): ElementValue => ({ kind: "undefined", reason });
const PARALLEL = "the lines are parallel: they never cross";
const el = (name: string, label: string, kind: Decl["kind"], role: Decl["role"], f: (s: PairState) => ElementValue, meaning?: string): Decl =>
  ({ name, label, kind, role, ...(meaning ? { meaning } : {}), value: s => f(s) });
const L = (s: PairState, i: number): Line => s.lines[i]!;
const orUndef = (x: Q | null, reason: string): ElementValue => (x === null ? undef(reason) : num(x));
const WINDOW = 12n;

// ---------------------------------------------------------------- pair: the graph with the crossing

const crossing = (s: PairState): ElementValue => { const P = facts(s).P; return P ? { kind: "point", x: P.x, y: P.y } : undef(PARALLEL); };
const peg = (s: PairState): ElementValue => {
  const P = facts(s).P;
  return P ? { kind: "point", x: q(nearestInteger(P.x)), y: q(nearestInteger(P.y)) } : undef(PARALLEL);
};
export const pairRep: Representation<PairState> = {
  id: "pair", title: "the two lines and where they cross", scene: "plane", perSite: false,
  elements: [
    el("L1", "line 1", "segment", "coordinate", s => through(L(s, 0).a, L(s, 0).b, L(s, 0).c)),
    el("L2", "line 2", "segment", "coordinate", s => through(L(s, 1).a, L(s, 1).b, L(s, 1).c)),
    el("P", "the answer: where the lines cross", "point", "derived", crossing, "crossing"),
    el("x", "the answer's x", "number", "derived", s => { const P = facts(s).P; return P ? num(P.x) : undef(PARALLEL); }, "crossingX"),
    el("y", "the answer's y", "number", "derived", s => { const P = facts(s).P; return P ? num(P.y) : undef(PARALLEL); }, "crossingY"),
    el("peg", "the grid point nearest the answer", "point", "derived", peg),
    el("X", "the whole number nearest the answer's x", "number", "derived", s => { const P = facts(s).P; return P ? num(q(nearestInteger(P.x))) : undef(PARALLEL); }),
    el("Y", "the whole number nearest the answer's y", "number", "derived", s => { const P = facts(s).P; return P ? num(q(nearestInteger(P.y))) : undef(PARALLEL); }),
  ],
  layout: () => ({
    kind: "plane", window: [q(-WINDOW), q(-WINDOW), q(WINDOW), q(WINDOW)],
    items: [
      { draw: "line", el: ref("pair", "L1") }, { draw: "line", el: ref("pair", "L2") },
      { draw: "point", el: ref("pair", "P") }, { draw: "point", el: ref("pair", "peg") },
    ],
  }),
};

// ---------------------------------------------------------------- eqs: the two equations, stacked (ax + by = e)

const coef = (i: number, k: "a" | "b" | "e", label: string): Decl =>
  el(`${k}${i + 1}`, `line ${i + 1}: ${label}`, "number", "coordinate", s => num(q(k === "e" ? -L(s, i).c : L(s, i)[k])));
export const eqs: Representation<PairState> = {
  id: "eqs", title: "the two equations: ax + by = e", scene: "equation", perSite: false,
  elements: [0, 1].flatMap(i => [coef(i, "a", "the number of x"), coef(i, "b", "the number of y"), coef(i, "e", "the right-hand side")]),
  layout: () => ({
    kind: "equation", template: [{ el: "a1" }, "x + ", { el: "b1" }, "y = ", { el: "e1" }],
    steps: [[{ el: "a2" }, "x + ", { el: "b2" }, "y = ", { el: "e2" }]],
  }) as never,
};

// ---------------------------------------------------------------- si: y = mx + c for each line, and the steeper line

const VERTICAL = "a vertical line has no gradient or y-intercept";
const HORIZONTAL = "a horizontal line never meets the x-axis (or lies along it)";
/** "line 2 is upright: x = 3", "line 1 is flat: y = −2": the reason names the line. */
const upright = (s: PairState, i: number) => { const l = L(s, i); return `line ${i + 1} is upright: x = ${Qn.toWire(q(-l.c, l.a))}`; };
const flat = (s: PairState, i: number) => { const l = L(s, i); return `line ${i + 1} is flat: y = ${Qn.toWire(q(-l.c, l.b))}`; };
const steeper = (s: PairState) => L(s, facts(s).s), gentler = (s: PairState) => L(s, facts(s).o);
/** The steeper gradient over the gentler one. */
const ratioOf = (s: PairState): Q | null => {
  const ms = gradient(steeper(s)), mo = gradient(gentler(s));
  return ms === null || mo === null || Qn.isZero(mo) ? null : Qn.div(ms, mo);
};
const gapOf = (a: Q | null, b: Q | null): Q | null => (a === null || b === null ? null : Qn.abs(Qn.sub(a, b)));
export const si: Representation<PairState> = {
  id: "si", title: "each line as y = mx + c", scene: "equation", perSite: false,
  elements: [
    ...[0, 1].flatMap(i => [
      el(`m${i + 1}`, `line ${i + 1}'s gradient`, "number", "coordinate", s => orUndef(gradient(L(s, i)), L(s, i).b === 0n ? upright(s, i) : VERTICAL)),
      el(`c${i + 1}`, `line ${i + 1}'s y-intercept`, "number", "coordinate", s => orUndef(yIntercept(L(s, i)), L(s, i).b === 0n ? upright(s, i) : VERTICAL)),
      el(`r${i + 1}`, `line ${i + 1}'s x-intercept`, "number", "derived", s => orUndef(xIntercept(L(s, i)), L(s, i).a === 0n ? flat(s, i) : HORIZONTAL)),
    ]),
    el("ms", "the steeper line's gradient", "number", "derived", s => orUndef(gradient(steeper(s)), VERTICAL)),
    el("cs", "the steeper line's y-intercept", "number", "derived", s => orUndef(yIntercept(steeper(s)), VERTICAL)),
    el("rs", "the steeper line's x-intercept", "number", "derived", s => orUndef(xIntercept(steeper(s)), HORIZONTAL)),
    el("ratio", "how many times as steep the steeper line is", "number", "derived",
      s => orUndef(ratioOf(s), "a ratio needs two lines with gradients, the gentler not flat")),
    el("ygap", "the gap between the y-intercepts", "number", "derived", s => orUndef(gapOf(yIntercept(L(s, 0)), yIntercept(L(s, 1))), "a vertical line has no y-intercept")),
    el("xgap", "the gap between the x-intercepts", "number", "derived", s => orUndef(gapOf(xIntercept(L(s, 0)), xIntercept(L(s, 1))), "a horizontal line has no x-intercept")),
  ],
  layout: () => ({ kind: "equation", template: ["y = ", { el: "m1" }, "x + ", { el: "c1" }], steps: [["y = ", { el: "m2" }, "x + ", { el: "c2" }]] }) as never,
};

// ---------------------------------------------------------------- solve: elimination worked out (Cramer's rule)

export const solve: Representation<PairState> = {
  id: "solve", title: "solving the pair: the number you divide by", scene: "equation", perSite: false,
  elements: [
    el("D", "the number you divide by (a1·b2 − a2·b1)", "number", "derived", s => num(q(facts(s).D)), "divisor"),
    el("nx", "x's top number (b1·c2 − b2·c1)", "number", "derived", s => num(q(facts(s).nx))),
    el("ny", "y's top number (c1·a2 − c2·a1)", "number", "derived", s => num(q(facts(s).ny))),
    el("x", "x = top ÷ D", "number", "derived", s => { const P = facts(s).P; return P ? num(P.x) : undef(PARALLEL); }, "crossingX"),
    el("y", "y = top ÷ D", "number", "derived", s => { const P = facts(s).P; return P ? num(P.y) : undef(PARALLEL); }, "crossingY"),
  ],
  layout: () => ({
    kind: "equation", template: ["x = ", { el: "nx" }, " ÷ ", { el: "D" }, " = ", { el: "x" }],
    steps: [["y = ", { el: "ny" }, " ÷ ", { el: "D" }, " = ", { el: "y" }]],
  }) as never,
};

// ---------------------------------------------------------------- angle: how the lines cross

export const angle: Representation<PairState> = {
  id: "angle", title: "the angle where the lines cross", scene: "plane", perSite: false,
  elements: [
    el("dot", "the normals' dot product (a1·a2 + b1·b2): 0 at a right angle", "number", "derived", s => num(q(facts(s).dot))),
    el("D", "the number you divide by: 0 for parallel lines", "number", "derived", s => num(q(facts(s).D)), "divisor"),
    el("offRight", "how far from a right angle (|dot ÷ D|)", "number", "derived",
      s => { const f = facts(s); return f.D === 0n ? undef(PARALLEL) : num(Qn.abs(q(f.dot, f.D))); }),
    el("off45", "how far from 45° (the gap between |D| and |dot|, over their total)", "number", "derived",
      s => { const f = facts(s); const d = f.D < 0n ? -f.D : f.D, t = f.dot < 0n ? -f.dot : f.dot; return num(q(d > t ? d - t : t - d, d + t)); }),
  ],
  layout: () => ({
    kind: "plane", window: [q(-WINDOW), q(-WINDOW), q(WINDOW), q(WINDOW)],
    items: [{ draw: "line", el: ref("pair", "L1") }, { draw: "line", el: ref("pair", "L2") }, { draw: "point", el: ref("pair", "P") }],
  }),
};

export const pairRepresentations: readonly Representation<PairState>[] = [pairRep, eqs, si, solve, angle];
