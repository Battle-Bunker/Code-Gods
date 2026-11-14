/** The line's representations (spec §12.3). Implemented: si, gen, cart, tri, seq, mach. Still to come: int, table, peg. */
import { Qn, q, ref, type ArgValues, type ElementDecl, type ElementValue, type Point, type Q, type Representation } from "@workspace/v2-core";
import { intercept, isVertical, slope, xAt, yAt, type Line, type LineState } from "./line.ts";

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

/** The part of a line a·x + b·y + c = 0 inside [−W, W]², or undefined. */
export function clip(A: bigint, B: bigint, C: bigint, w: bigint = WINDOW): ElementValue {
  const W = q(w), nW = q(-w);
  const inBox = (v: Q) => Qn.cmp(v, nW) >= 0 && Qn.cmp(v, W) <= 0;
  const pts: Point[] = [];
  const push = (x: Q, y: Q) => {
    if (inBox(x) && inBox(y) && !pts.some(p => Qn.eq(p.x, x) && Qn.eq(p.y, y))) pts.push({ x, y });
  };
  for (const X of [nW, W]) if (B !== 0n) push(X, q(-A * X.n - C, B));
  for (const Y of [nW, W]) if (A !== 0n) push(q(-B * Y.n - C, A), Y);
  if (pts.length < 2) return undef("the line does not cross the drawing window");
  pts.sort((p, r) => Qn.cmp(p.x, r.x) || Qn.cmp(p.y, r.y));
  return { kind: "segment", from: pts[0]!, to: pts[pts.length - 1]! };
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
    el("line", "the line", "segment", "coordinate", l => clip(l.a, l.b, l.c)),
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
    el("ghost", "the line of gradient g through the same y-intercept", "segment", "dynamic",
      nonVertical((l, a) => { const g = arg(a, "g"), c = intercept(l); return clip(-g.n * c.d, g.d * c.d, -c.n * g.d); }),
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
  ],
  layout: (_s, site) => ({
    kind: "machine", stages: [{ label: "×", el: "times" }, { label: "+", el: "plus" }],
    input: ref("mach", "in", { q: 1 }, site), output: ref("mach", "out", { q: 1 }, site),
  }),
};

export const representations: readonly Representation<LineState>[] = [si, gen, cart, tri, seq, mach];
