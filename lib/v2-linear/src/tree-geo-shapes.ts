/**
 * Two geometry tree families on the triangle the line cuts off the axes (UNDEALT; docs/engine-v2/tree-families/).
 * X is where the line crosses the x-axis and Y the y-intercept, both signed.
 *
 * Leg Ratio: (1) the size s of the drawn p : q triangle whose base plus height, (p + q)·s, is nearest |X| + |Y|
 * (sizes n/d), the bigger the better; (2) how close; (3) the gradient's bottom near d / the height at x = s near a
 * whole number / the crossing on the right, X near +p·s (the sign-caring ally).
 *
 * Quadrant Square: (1) the n whose p/q of a square, (p/q)·n², is nearest the triangle's area, the bigger the better;
 * (2) how close; (3) one of four quarters, each a sign preference (the owner, 16 Nov: the sign "decided by allies that
 * care"): X near +n, X near −n, Y near +n, Y near −n. The primary reads the area's size, so a reflection keeps it
 * (true by construction); only the third cares which quarter the triangle is in.
 */
import { gcd, Qn, q, readFields, ref, writeFields, type ParamSpace, type Q } from "@workspace/v2-core";
import { crossingOf, further, mixed, nearestOn, siReading, treeFamily, wholeField, type Further, type Target } from "./tree-nt-shared.ts";

const coprime = (a: number, b: number) => gcd(BigInt(a), BigInt(b)) === 1n;
const triangleWhy = "a flat line, or one through (0, 0) or along an axis, makes no triangle with the axes";
/** X and Y of y = mx + c, or null when there is no triangle (flat, vertical, through the origin). */
const legs = (m: Q | null, c: Q | null): { X: Q; Y: Q } | null => {
  if (m === null || c === null || Qn.sign(c) === 0) return null;
  const X = crossingOf(m, c);
  return X === null ? null : { X, Y: c };
};

// ---------------------------------------------------------------- Leg Ratio

export type Legs = { p: number; q: number; d: number };
type LT = Target & { s: Q };
export function legsNear(x: Q, p: Legs): LT {
  const r = nearestOn(x, n => q(BigInt(p.p + p.q) * n, p.d));
  const s = Qn.div(r.at, q(p.p + p.q));
  return { s, level: s, at: r.at, near: [r.up, ...(r.down ? [r.down] : [])], why: `the ${p.p} : ${p.q} triangle of size ${mixed(s)} has base plus height ${mixed(r.at)}, the nearest to ${mixed(x)}` };
}
const LEG_FIELDS = ["p", "q", "d"] as const;
const legSpace: ParamSpace<Legs> = {
  size: (() => { let n = 0; for (let a = 1; a <= 12; a++) for (let b = 1; b <= 12; b++) if (coprime(a, b)) n++; return n * 6; })(),
  hint: "p = …, q = …, d = …: the shape p : q (whole numbers 1 to 12 sharing no factor) and sizes in steps of 1/d (d 1 to 6); e.g. p = 3, q = 2, d = 2",
  draw: r => { for (;;) { const a = 1 + r.below(12), b = 1 + r.below(12); if (coprime(a, b)) return { p: a, q: b, d: 1 + r.below(6) }; } },
  parse(text) {
    const t = readFields(text, LEG_FIELDS);
    if ("invalid" in t) return t as { invalid: string };
    const a = wholeField(t.p, "p", 1, 99), b = wholeField(t.q, "q", 1, 99), d = wholeField(t.d, "d", 1, 60);
    for (const x of [a, b, d]) if (typeof x !== "number") return x;
    return coprime(a as number, b as number) ? { p: a as number, q: b as number, d: d as number } : { invalid: `${a} : ${b}: write the shape with no shared factor` };
  },
  label: p => writeFields(p, LEG_FIELDS),
};
const legThird = (id: string, title: string, sentence: (p: Legs) => string, value: (X: Q, Y: Q, s: Q, p: Legs) => { d: Q; working: string }): Further<Legs, LT> => ({
  layer: { id, title, rep: "tri", sense: "min", sentence },
  evaluate: (ctx, r, t, p) => {
    const g = legs(r.m, r.c);
    if (!g) return further(ctx, id, null, triangleWhy, r.from[0]!, r.from);
    const v = value(g.X, g.Y, t.s, p);
    further(ctx, id, v.d, v.working, ref("cart", "xInt"), r.from);
  },
});
export const legRatio = treeFamily<Legs, LT>({
  id: "tree-geo-legs", title: "Leg Ratio", depends: ["si"], rep: "tri", space: legSpace,
  featured: [{ p: 3, q: 2, d: 2 }, { p: 1, q: 1, d: 1 }, { p: 5, q: 12, d: 3 }, { p: 7, q: 4, d: 6 }],
  mainTitle: "the size of the drawn triangle shape nearest the line's base plus height, the bigger the better",
  main: p => `The line and the two axes make a triangle; add its base and its height (ignoring minus signs). A ${p.p} : ${p.q} triangle of size s has base ${p.p} × s and height ${p.q} × s, so base plus height ${p.p + p.q} × s; the sizes are ${[1, 2, 3].map(n => mixed(q(n, p.d))).join(", ")}, … Find the size whose base plus height is nearest the line's. The bigger that size, the better.`,
  closeTitle: "how close the line's base plus height is to that size's",
  close: () => "The line's base plus height should be as close as possible to that size's.",
  read: ctx => siReading(ctx, (m, c) => { const g = legs(m, c); return g ? Qn.add(Qn.abs(g.X), Qn.abs(g.Y)) : null; }, triangleWhy),
  nearest: legsNear,
  draw: () => null,
  thirds: [
    // Thirds that the drawn shape does not imply (a line of gradient −q/p meets base = p·s and area = p·q·s²/2 for free,
    // seen in the walk-through, so those were dropped): the gradient's bottom number near d, and the height at x = s.
    legThird("bottom", "the gradient's bottom number near d", p => `Write the gradient as a fraction in lowest terms. Its bottom number should be as close as possible to ${p.d}.`,
      (X, Y, _s, p) => { const m = Qn.neg(Qn.div(Y, X)), d = Qn.abs(Qn.sub(q(m.d), q(p.d))); return { d, working: `the gradient ${Qn.toWire(m)} has bottom ${m.d}: ${d.n} from ${p.d}` }; }),
    legThird("height-at-size", "the line's height at x = the size near a whole number", () => "Go along to x = that size. The line's height there should be as close as possible to a whole number.",
      (X, Y, s) => { const y = Qn.add(Qn.mul(Qn.neg(Qn.div(Y, X)), s), Y), f = Qn.sub(y, q(Qn.floor(y))), d = Qn.cmp(f, q(1, 2)) <= 0 ? f : Qn.sub(Qn.ONE, f); return { d, working: `at x = ${mixed(s)} the height is ${mixed(y)}: ${mixed(d)} from a whole number` }; }),
    legThird("east", "the crossing on the right, at p times the size", p => `The line should cross the x-axis on the right of (0, 0), as close as possible to ${p.p} times that size (a crossing on the left counts its whole distance).`,
      (X, _Y, s, p) => { const w = Qn.mul(q(p.p), s), d = Qn.abs(Qn.sub(X, w)); return { d, working: `crossing ${mixed(X)}, ${mixed(d)} from +${mixed(w)}` }; }),
  ],
});

// ---------------------------------------------------------------- Quadrant Square

export type Quadrant = { p: number; q: number };
type QT = Target & { n: bigint };
export function quadrantNear(x: Q, p: Quadrant): QT {
  const f = q(p.p, p.q), r = nearestOn(x, n => Qn.mul(f, q(n * n)));
  const n = Qn.div(r.at, f), root = BigInt(Math.round(Math.sqrt(Qn.toNumber(n))));
  return { n: root, level: q(root), at: r.at, near: [r.up, ...(r.down ? [r.down] : [])], why: `${p.p}/${p.q} of the square of side ${root} is ${mixed(r.at)}, the nearest to the area ${mixed(x)}` };
}
const QMAX = 24, QFIELDS = ["p", "q"] as const;
const quadrantSpace: ParamSpace<Quadrant> = {
  size: (() => { let n = 0; for (let b = 1; b <= QMAX; b++) for (let a = 1; a <= 2 * b; a++) if (coprime(a, b)) n++; return n; })(),
  hint: `p = …, q = …: the share p/q of a square, in lowest terms, q from 1 to ${QMAX}, p from 1 to 2q; e.g. p = 3, q = 2`,
  draw: r => { for (;;) { const b = 1 + r.below(QMAX), a = 1 + r.below(2 * b); if (coprime(a, b)) return { p: a, q: b }; } },
  parse(text) {
    const t = readFields(text, QFIELDS);
    if ("invalid" in t) return t as { invalid: string };
    const b = wholeField(t.q, "q", 1, 999);
    if (typeof b !== "number") return b;
    const a = wholeField(t.p, "p", 1, 2 * b);
    if (typeof a !== "number") return a;
    return coprime(a, b) ? { p: a, q: b } : { invalid: `${a}/${b} is not in lowest terms` };
  },
  label: p => writeFields(p, QFIELDS),
};
const quarter = (id: string, axis: "X" | "Y", sign: 1 | -1, where: string): Further<Quadrant, QT> => ({
  layer: { id, title: `${axis === "X" ? "the x-crossing" : "the y-intercept"} near ${sign > 0 ? "+" : "−"}n`, rep: axis === "X" ? "crossing" : "si", sense: "min",
    sentence: () => `${axis === "X" ? "Where the line crosses the x-axis" : "The y-intercept"} should be as close as possible to ${sign > 0 ? "" : "minus "}that side length (${where}; the wrong side counts its whole distance).` },
  evaluate: (ctx, r, t) => {
    const g = legs(r.m, r.c);
    if (!g) return further(ctx, id, null, triangleWhy, r.from[0]!, r.from);
    const v = axis === "X" ? g.X : g.Y, w = q(BigInt(sign) * t.n), d = Qn.abs(Qn.sub(v, w));
    further(ctx, id, d, `${axis === "X" ? "crossing" : "y-intercept"} ${mixed(v)}, ${mixed(d)} from ${mixed(w)}`, ref("cart", axis === "X" ? "xInt" : "yInt"), r.from);
  },
});
export const quadrantSquare = treeFamily<Quadrant, QT>({
  id: "tree-geo-quadrant", title: "Quadrant Square", depends: ["si"], rep: "tri", space: quadrantSpace,
  featured: [{ p: 3, q: 2 }, { p: 1, q: 1 }, { p: 1, q: 2 }, { p: 5, q: 12 }],
  mainTitle: "the side n whose drawn share of a square is nearest the area, the bigger the better",
  main: p => `The line and the two axes make a triangle. The targets are ${p.p}/${p.q} of a square of side n: ${[1, 2, 3].map(n => mixed(q(p.p * n * n, p.q))).join(", ")}, … Find the target nearest the triangle's area. The bigger its side n, the better.`,
  closeTitle: "how close the area is to that target",
  close: () => "The triangle's area should be as close as possible to that target.",
  read: ctx => siReading(ctx, (m, c) => { const g = legs(m, c); return g ? Qn.abs(Qn.div(Qn.mul(g.X, g.Y), q(2))) : null; }, triangleWhy),
  nearest: quadrantNear,
  draw: () => null,
  thirds: [
    quarter("east", "X", 1, "a triangle on the right"), quarter("west", "X", -1, "a triangle on the left"),
    quarter("north", "Y", 1, "a triangle above"), quarter("south", "Y", -1, "a triangle below"),
  ],
});
