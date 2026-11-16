/** The line's representations (spec §12.3): si, gen, cart, tri, seq, mach, table, crossing, norm, coins. Still to come: int, peg (the pegboard scene). */
import { gcd, Qn, q, ref, type ArgValues, type ElementDecl, type ElementRef, type ElementValue, type Q, type Representation, type SceneData } from "@workspace/v2-core";
import { intercept, isVertical, slope, xAt, yAt, type Line, type LineState } from "./line.ts";
import { distanceToWhole, nearestInteger, nearestResidue } from "./numbers.ts";

/** Text and the representation's own elements in reading order: "y = ", {el: "m"}, "x + ", {el: "c"}. */
export type EquationTemplate = Extract<SceneData, { kind: "equation" }>["template"];
/**
 * An equation scene that is worked out (the crossing: 0 = 3x − 7, 3x = 7, x = 7/3): `steps` are the lines after the
 * template, and `caption` a line of words under them ("nearest whole number 2, off by ⅓"). Both optional, so every
 * equation scene is one; v2-views' equation renderer draws them. (They belong in v2-core's SceneData once its owner
 * takes them; until then they ride on the equation kind.)
 */
export type EquationScene = Extract<SceneData, { kind: "equation" }> & {
  readonly steps?: readonly EquationTemplate[];
  readonly caption?: EquationTemplate;
  /** How many of the lines (the template, then the steps) are given side by side (a system's equations), not worked:
   *  they read "and" rather than "so", are never dropped as repeats, and a compact face shows them all. */
  readonly given?: number;
};
/**
 * A row under a table's values, one cell per column (null: nothing there). `check: "whole"` ticks whole numbers and
 * marks the first cell from the left that is not one: a run of multiples and where it stops.
 */
export interface TableRow {
  readonly label: string;
  readonly cells: readonly (ElementRef | null)[];
  readonly check?: "whole";
}
/** A table scene with the label of its value row ("y") and rows under the values; both optional. */
export type TableScene = Extract<SceneData, { kind: "table" }> & { readonly valueLabel?: string; readonly rows?: readonly TableRow[] };

const num = (x: Q): ElementValue => ({ kind: "number", q: x });
const pt = (x: Q, y: Q): ElementValue => ({ kind: "point", x, y });
const undef = (reason: string): ElementValue => ({ kind: "undefined", reason });
const lineOf = (s: LineState, site: number): Line => {
  const l = s.lines[site];
  if (!l) throw new RangeError(`no line ${site + 1}`);
  return l;
};

const VERTICAL = "a vertical line has no gradient or y-intercept";
const HORIZONTAL_X = "a horizontal line never meets the x-axis (or lies along it)";
const WINDOW = 12n;

type Decl = ElementDecl<LineState>;
type Fn = (l: Line, args: ArgValues) => ElementValue;
const el = (name: string, label: string, kind: Decl["kind"], role: Decl["role"], f: Fn, extra: Partial<Decl> = {}): Decl =>
  ({ name, label, kind, role, ...extra, value: (s, site, args) => f(lineOf(s, site), args) });
const nonVertical = (f: (l: Line, args: ArgValues) => ElementValue): Fn => (l, a) => (isVertical(l) ? undef(VERTICAL) : f(l, a));
const arg = (a: ArgValues, k: string): Q => a[k]!;

/**
 * The line a·x + b·y + c = 0 as a segment between two of its points (x = 0 and x = 1, or y = 0 and y = 1 on a vertical
 * line). It names the line, not a drawing window: the plane fits its window to what the rule reads (lib/v2-views).
 */
export function through(A: bigint, B: bigint, C: bigint): ElementValue {
  if (B !== 0n) return { kind: "segment", from: { x: Qn.ZERO, y: q(-C, B) }, to: { x: Qn.ONE, y: q(-A - C, B) } };
  if (A !== 0n) return { kind: "segment", from: { x: q(-C, A), y: Qn.ZERO }, to: { x: q(-C, A), y: Qn.ONE } };
  return undef("not a line");
}

// ---------------------------------------------------------------- si: y = mx + c

export const si: Representation<LineState> = {
  id: "si", title: "slope-intercept: y = mx + c", scene: "equation", perSite: true,
  elements: [
    el("m", "gradient", "number", "coordinate", nonVertical(l => num(slope(l))), { meaning: "gradient" }),
    el("c", "y-intercept", "number", "coordinate", nonVertical(l => num(intercept(l))), { meaning: "yIntercept" }),
    el("sign", "uphill or downhill", "symbol", "derived", nonVertical(l => ({ kind: "symbol", text: ["downhill", "flat", "uphill"][Qn.sign(slope(l)) + 1]! }))),
    el("y", "y at x = q", "number", "dynamic", nonVertical((l, a) => num(yAt(l, arg(a, "q")))), { params: [{ name: "q", domain: "Q" }], meaning: "valueAt" }),
  ],
  layout: () => ({ kind: "equation", template: ["y = ", { el: "m" }, "x + ", { el: "c" }] }),
};

// ---------------------------------------------------------------- gen: ax + by + c = 0

export const gen: Representation<LineState> = {
  id: "gen", title: "general form: ax + by + c = 0", scene: "equation", perSite: true,
  elements: [
    el("a", "a", "number", "coordinate", l => num(q(l.a))),
    el("b", "b", "number", "coordinate", l => num(q(l.b))),
    el("c", "c", "number", "coordinate", l => num(q(l.c))),
    el("sum", "a + b + c", "number", "derived", l => num(q(l.a + l.b + l.c))),
    el("normal", "normal (a, b)", "point", "derived", l => pt(q(l.a), q(l.b))),
    el("value", "a·px + b·py + c", "number", "dynamic",
      (l, a) => num(Qn.add(Qn.add(Qn.mul(q(l.a), arg(a, "px")), Qn.mul(q(l.b), arg(a, "py"))), q(l.c))),
      { params: [{ name: "px", domain: "Q" }, { name: "py", domain: "Q" }] }),
  ],
  layout: () => ({ kind: "equation", template: [{ el: "a" }, "x + ", { el: "b" }, "y + ", { el: "c" }, " = 0"] }),
};

// ---------------------------------------------------------------- cart: the plane

function xInt(l: Line): ElementValue {
  return l.a === 0n ? undef(HORIZONTAL_X) : pt(q(-l.c, l.a), Qn.ZERO);
}
function yInt(l: Line): ElementValue {
  return l.b === 0n ? undef("a vertical line never meets the y-axis (or lies along it)") : pt(Qn.ZERO, intercept(l));
}

export const cart: Representation<LineState> = {
  id: "cart", title: "the line on the plane", scene: "plane", perSite: true,
  elements: [
    el("line", "the line", "segment", "coordinate", l => through(l.a, l.b, l.c)),
    el("xInt", "x-intercept", "point", "derived", xInt, { meaning: "xIntercept" }),
    el("yInt", "y-intercept", "point", "derived", yInt, { meaning: "yIntercept" }),
    el("slope", "rise over run", "number", "derived", nonVertical(l => num(slope(l))), { meaning: "gradient" }),
    el("pointAtX", "the point at x = q", "point", "dynamic", nonVertical((l, a) => pt(arg(a, "q"), yAt(l, arg(a, "q")))),
      { params: [{ name: "q", domain: "Q" }], meaning: "valueAt" }),
    el("pointAtY", "the point at y = q", "point", "dynamic",
      (l, a) => (l.a === 0n ? undef("a horizontal line has the same height everywhere") : pt(xAt(l, arg(a, "q")), arg(a, "q"))),
      { params: [{ name: "q", domain: "Q" }] }),
    el("yAxisMark", "a mark on the y-axis", "point", "dynamic", (_l, a) => pt(Qn.ZERO, arg(a, "y")), { params: [{ name: "y", domain: "Q" }] }),
    el("xAxisMark", "a mark on the x-axis", "point", "dynamic", (_l, a) => pt(arg(a, "x"), Qn.ZERO), { params: [{ name: "x", domain: "Q" }] }),
    // A point a rule compares the line with (a target the line should touch or pass through): drawn, never part of the line.
    el("mark", "a marked point", "point", "dynamic", (_l, a) => pt(arg(a, "x"), arg(a, "y")), { params: [{ name: "x", domain: "Q" }, { name: "y", domain: "Q" }] }),
    el("ghost", "the line of gradient g through the same y-intercept", "segment", "dynamic",
      nonVertical((l, a) => { const g = arg(a, "g"), c = intercept(l); return through(-g.n * c.d, g.d * c.d, -c.n * g.d); }),
      { params: [{ name: "g", domain: "Q" }] }),
  ],
  layout: (_s, site) => ({
    kind: "plane", window: [q(-WINDOW), q(-WINDOW), q(WINDOW), q(WINDOW)],
    items: [
      { draw: "line", el: ref("cart", "line", undefined, site) },
      { draw: "point", el: ref("cart", "xInt", undefined, site) },
      { draw: "point", el: ref("cart", "yInt", undefined, site) },
    ],
  }),
};

// ---------------------------------------------------------------- tri: the intercept triangle

const NO_TRIANGLE = "the line and the axes make no triangle (it passes through the origin or runs parallel to an axis)";
const triangle = (f: (lx: Q, ly: Q) => Q): Fn => l => {
  if (l.a === 0n || l.b === 0n || l.c === 0n) return undef(NO_TRIANGLE);
  return num(f(Qn.abs(q(-l.c, l.a)), Qn.abs(q(-l.c, l.b))));
};

export const tri: Representation<LineState> = {
  id: "tri", title: "the triangle with the axes", scene: "plane", perSite: true,
  elements: [
    el("legX", "base (along the x-axis)", "number", "derived", triangle(lx => lx)),
    el("legY", "height (along the y-axis)", "number", "derived", triangle((_lx, ly) => ly)),
    el("area", "area", "number", "derived", triangle((lx, ly) => Qn.div(Qn.mul(lx, ly), q(2)))),
    el("hyp2", "slanted side, squared", "number", "derived", triangle((lx, ly) => Qn.add(Qn.mul(lx, lx), Qn.mul(ly, ly)))),
    // A square of side s (its area): what an area is compared with ("close to a square number"); drawn beside the triangle.
    el("square", "a square of side s", "number", "dynamic", (_l, a) => num(Qn.mul(arg(a, "s"), arg(a, "s"))), { params: [{ name: "s", domain: "Q" }], meaning: "squareOfSide" }),
  ],
  layout: (_s, site) => ({
    kind: "plane", window: [q(-WINDOW), q(-WINDOW), q(WINDOW), q(WINDOW)],
    items: [{ draw: "line", el: ref("cart", "line", undefined, site) }, { draw: "region", el: ref("tri", "area", undefined, site) }],
  }),
};

// ---------------------------------------------------------------- seq: the growth pattern

export const seq: Representation<LineState> = {
  id: "seq", title: "growth pattern: start, then add the step", scene: "sequence", perSite: true,
  elements: [
    el("first", "term 1", "number", "coordinate", nonVertical(l => num(yAt(l, Qn.ONE)))),
    el("step", "step", "number", "coordinate", nonVertical(l => num(slope(l))), { meaning: "gradient" }),
    el("zeroth", "term 0", "number", "derived", nonVertical(l => num(intercept(l))), { meaning: "yIntercept" }),
    el("term", "term n", "number", "dynamic", nonVertical((l, a) => num(yAt(l, arg(a, "n")))), { params: [{ name: "n", domain: "Z" }], meaning: "valueAt" }),
  ],
  layout: (_s, site) => ({ kind: "sequence", picture: "tiles", terms: [1, 2, 3, 4].map(n => ({ n, el: ref("seq", "term", { n }, site) })) }),
};

// ---------------------------------------------------------------- mach: the function machine

export const mach: Representation<LineState> = {
  id: "mach", title: "function machine: × m, then + c", scene: "machine", perSite: true,
  elements: [
    el("in", "the input q", "number", "dynamic", (_l, a) => num(arg(a, "q")), { params: [{ name: "q", domain: "Q" }] }),
    el("times", "× m", "number", "coordinate", nonVertical(l => num(slope(l))), { meaning: "gradient" }),
    el("plus", "+ c", "number", "coordinate", nonVertical(l => num(intercept(l))), { meaning: "yIntercept" }),
    el("out", "the output for input q", "number", "dynamic", nonVertical((l, a) => num(yAt(l, arg(a, "q")))), { params: [{ name: "q", domain: "Q" }], meaning: "valueAt" }),
    el("reverse", "the input that gives output q", "number", "dynamic",
      nonVertical((l, a) => (l.a === 0n ? undef("a flat machine (× 0) gives the same output for every input, so it cannot be run backwards") : num(xAt(l, arg(a, "q"))))),
      { params: [{ name: "q", domain: "Q" }] }),
    el("twice", "q through the machine twice", "number", "dynamic", nonVertical((l, a) => num(yAt(l, yAt(l, arg(a, "q"))))), { params: [{ name: "q", domain: "Q" }] }),
    el("fixed", "the number the machine leaves unchanged", "number", "derived",
      nonVertical(l => (Qn.eq(slope(l), Qn.ONE) ? undef("a machine that multiplies by 1 changes every number by the same amount") : num(Qn.div(intercept(l), Qn.sub(Qn.ONE, slope(l))))))),
    el("lamp", "the lamp's height m/(m − 1) (the nomogram)", "number", "derived",
      nonVertical(l => (Qn.eq(slope(l), Qn.ONE) ? undef("with a gradient of 1 the lamp is infinitely high") : num(Qn.div(slope(l), Qn.sub(slope(l), Qn.ONE)))))),
  ],
  layout: (_s, site) => ({
    kind: "machine", stages: [{ label: "×", el: "times" }, { label: "+", el: "plus" }],
    input: ref("mach", "in", { q: 1 }, site), output: ref("mach", "out", { q: 1 }, site),
  }),
};

// ---------------------------------------------------------------- table: a table of values

/** x = 0 … 12: Divisibility Ladder reads a run up to 12 (its rungs go to 11), so the first miss is in the table. */
const TABLE_XS = Array.from({ length: 13 }, (_, x) => x);
export const table: Representation<LineState> = {
  id: "table", title: "table of values", scene: "table", perSite: true,
  elements: [
    el("y", "y when x is k", "number", "dynamic", nonVertical((l, a) => num(yAt(l, arg(a, "x")))), { params: [{ name: "x", domain: "Z" }], meaning: "valueAt" }),
    el("q", "y ÷ x", "number", "dynamic",
      nonVertical((l, a) => { const x = arg(a, "x"); return Qn.isZero(x) ? undef("y ÷ x has no value at x = 0: nothing can be divided by 0") : num(Qn.div(yAt(l, x), x)); }),
      { params: [{ name: "x", domain: "Z" }] }),
  ],
  layout: (_s, site): TableScene => ({
    kind: "table",
    valueLabel: "y",
    columns: TABLE_XS.map(x => ({ header: `x = ${x}`, el: ref("table", "y", { x }, site) })),
    // Drawn when a rule cites one of its cells (a run of multiples): other rules read the table as plain values.
    rows: [{ label: "y ÷ x", check: "whole", cells: TABLE_XS.map(x => (x === 0 ? null : ref("table", "q", { x }, site))) }],
  }),
};

// ---------------------------------------------------------------- crossing: where the line crosses the x-axis (solve y = 0)

const FLAT = "a flat line (gradient 0) never crosses the x-axis, or lies right along it";
/** Where a·x + b·y + c = 0 meets y = 0, or null for a flat line. A vertical line crosses too, at x = −c/a. */
const crossingOr = (f: (x0: Q) => ElementValue): Fn => l => (l.a === 0n ? undef(FLAT) : f(q(-l.c, l.a)));

export const crossing: Representation<LineState> = {
  id: "crossing", title: "where it crosses the x-axis: solve y = 0", scene: "equation", perSite: true,
  elements: [
    el("m", "gradient", "number", "derived", nonVertical(l => num(slope(l))), { meaning: "gradient" }),
    el("c", "y-intercept", "number", "derived", nonVertical(l => num(intercept(l))), { meaning: "yIntercept" }),
    el("rhs", "the y-intercept moved across the equals sign (−c)", "number", "derived", nonVertical(l => num(Qn.neg(intercept(l))))),
    el("x0", "where it crosses the x-axis", "number", "derived", crossingOr(num), { meaning: "xIntercept" }),
    el("near", "nearest whole number", "number", "derived", crossingOr(x => num(q(nearestInteger(x))))),
    el("off", "off by", "number", "derived", crossingOr(x => num(distanceToWhole(x)))),
    // The whole number leaving r when divided by q nearest the crossing (Whole Crossing's dealt residue).
    el("dealt", "whole number leaving r when divided by q", "number", "dynamic", (l, a) => crossingOr(x => num(q(nearestResidue(x, { q: Number(arg(a, "q").n), r: Number(arg(a, "r").n) }))))(l, a),
      { params: [{ name: "q", domain: "Z" }, { name: "r", domain: "Z" }] }),
  ],
  // 0 = 3x − 7, then 3x = 7, then x = 7/3; under it the nearest whole number and how far off it is, or "on −3" when it
  // crosses on a whole number (never "off by 0": the wording rules, annotations-design.md §10).
  layout: (s, site): EquationScene => {
    const l = s.lines[site];
    const on = !!l && l.a !== 0n && Qn.isZero(distanceToWhole(q(-l.c, l.a)));
    return {
      kind: "equation",
      template: ["0 = ", { el: "m" }, "x + ", { el: "c" }],
      steps: [[{ el: "m" }, "x = ", { el: "rhs" }], ["x = ", { el: "x0" }]],
      caption: on ? ["on the whole number ", { el: "near" }] : ["nearest whole number ", { el: "near" }, ", off by ", { el: "off" }],
    };
  },
};

// ---------------------------------------------------------------- norm: the line seen from the origin

/** The squared distance from (0, 0) to a·x + b·y + c = 0, and the foot of the perpendicular. */
const h2 = (l: Line): bigint => l.a * l.a + l.b * l.b;
export const norm: Representation<LineState> = {
  id: "norm", title: "the line seen from the origin", scene: "plane", perSite: true,
  elements: [
    el("dist2", "distance from (0, 0), squared", "number", "derived", l => num(q(l.c * l.c, h2(l)))),
    el("foot", "the foot of the perpendicular from (0, 0)", "point", "derived", l => pt(q(-l.a * l.c, h2(l)), q(-l.b * l.c, h2(l)))),
    // A circle round (0, 0) by its radius squared (its value): what a distance² is compared with; drawn round the origin.
    el("circle", "the circle round (0, 0) of radius² r2", "number", "dynamic", (_l, a) => num(arg(a, "r2")), { params: [{ name: "r2", domain: "Q" }], meaning: "circleOfRadius2" }),
  ],
  layout: (_s, site) => ({
    kind: "plane", window: [q(-WINDOW), q(-WINDOW), q(WINDOW), q(WINDOW)],
    items: [{ draw: "line", el: ref("cart", "line", undefined, site) }, { draw: "point", el: ref("norm", "foot", undefined, site) }],
  }),
};

// ---------------------------------------------------------------- coins: a·x + b·y = N as paying N with coins a and b

const NOT_COINS = "the line reads as coins only when a and b (in a·x + b·y = N) are both positive";
/** The inverse of a modulo m (gcd(a, m) = 1, m ≥ 1), by the extended Euclidean algorithm. */
function inverseMod(a: bigint, m: bigint): bigint {
  let [r0, r1, s0, s1] = [((a % m) + m) % m, m, 1n, 0n];
  while (r1 !== 0n) { const t = r0 / r1; [r0, r1, s0, s1] = [r1, r0 - t * r1, s1, s0 - t * s1]; }
  return ((s0 % m) + m) % m;
}
/**
 * The ways to pay N with coins worth a and b (whole x, y ≥ 0 with a·x + b·y = N), in closed form at any size (owner
 * decision 26: no limit on the numbers): the ways are x = x0, x0 + b/g, …, so their count and the extreme ways come
 * from one modular inverse. The smaller pile, min(x, y), is concave along the ways, so it is smallest at an end.
 */
export function waysToPay(l: Line): { count: bigint; first: { x: bigint; y: bigint }; last: { x: bigint; y: bigint } } | { count: 0n } | null {
  const a = l.a, b = l.b, N = -l.c;
  if (!(a > 0n && b > 0n)) return null;
  const g = gcd(a, b);
  if (N < 0n || N % g !== 0n) return { count: 0n };
  const [a1, b1, n1] = [a / g, b / g, N / g];
  const x0 = b1 === 1n ? 0n : ((n1 % b1) * inverseMod(a1, b1)) % b1;
  if (a1 * x0 > n1) return { count: 0n };
  const k = (n1 - a1 * x0) / (a1 * b1);
  const way = (x: bigint) => ({ x, y: (n1 - a1 * x) / b1 });
  return { count: k + 1n, first: way(x0), last: way(x0 + k * b1) };
}
const coinsOr = (f: (w: NonNullable<ReturnType<typeof waysToPay>>, l: Line) => ElementValue): Fn => l => {
  const w = waysToPay(l);
  return w === null ? undef(NOT_COINS) : f(w, l);
};
const smaller = (w: { x: bigint; y: bigint }) => (w.x < w.y ? w.x : w.y);
export const coins: Representation<LineState> = {
  id: "coins", title: "exact change: a·x + b·y = N", scene: "pegboard", perSite: true,
  elements: [
    el("bill", "the bill N", "number", "derived", coinsOr((_w, l) => num(q(-l.c)))),
    el("ways", "ways to pay", "number", "derived", coinsOr(w => num(q(w.count)))),
    el("smallestPile", "the smaller pile, in the way where it is smallest", "number", "derived",
      coinsOr(w => ("first" in w ? num(q(smaller(w.first) < smaller(w.last) ? smaller(w.first) : smaller(w.last))) : undef("there is no way to pay")))),
  ],
  layout: (_s, site) => ({ kind: "pegboard", window: [0, 12], on: ref("cart", "line", undefined, site) }),
};

export const representations: readonly Representation<LineState>[] = [si, gen, cart, tri, seq, mach, table, crossing, norm, coins];
