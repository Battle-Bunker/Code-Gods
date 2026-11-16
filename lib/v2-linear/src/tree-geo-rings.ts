/**
 * Tangent Rings (geometry tree family; undealt; docs/engine-v2/tree-families/tangent-rings.md). The reading is how far
 * the line is from (0, 0), in the "line seen from the origin" lens.
 *
 * (1) Rings are circles round (0, 0) of radius 1/d, 2/d, 3/d, …; the ring nearest the line (in squared distance, which
 *     is a fraction for every line), the bigger the better. (2) How close the line's squared distance is to that ring's
 *     squared radius: 0 when the line touches the ring. (3) One of three parts against the ring's direction point, the
 *     point on it at u across for every v up (u² + v² = w², so the point has fraction coordinates: radius × u/w and
 *     radius × v/w): the line's nearest point to the origin close to it, in any quarter (touch); the y-intercept's size
 *     close to where the tangent there meets the y-axis (axis); the line passing through it, in the first quarter
 *     (through: the one third that cares about signs).
 *
 * Parameters: d (the rings' spacing 1/d) and a primitive Pythagorean direction (u, v). Every member has targets: the
 * ladder of rings has no end and every line has a squared distance.
 */
import { Qn, q, ref, type Q } from "@workspace/v2-core";
import type { L, Shape } from "./layers.ts";
import { isqrt } from "./numbers.ts";
import { citer, dist, firstFew, frac, gcdN, geoFamily, nearestRung, W, wholeSpace } from "./tree-geo-kit.ts";

export type Rings = { d: number; u: number; v: number };
const hyp = (p: Rings): number => Number(isqrt(BigInt(p.u * p.u + p.v * p.v)));
const point = (p: Rings) => `radius × ${frac(p.u, hyp(p))} across and radius × ${frac(p.v, hyp(p))} up`;

const shape: Shape<Rings> = {
  main: { id: "ring", title: "the ring nearest the line, the bigger the better", rep: "norm", sense: "max",
    sentence: p => `Rings are circles round (0, 0) with radius ${firstFew(n => q(n, p.d))} (${p.d === 1 ? "every whole number" : `every multiple of ${frac(1, p.d)}`}). `
      + `Square the distance from (0, 0) to the line, square each ring's radius, and find the ring whose squared radius is nearest (the bigger ring on a tie). The bigger that ring's radius, the better. `
      + `Each ring has a direction point: ${point(p)} (it is on the ring because ${p.u}² + ${p.v}² = ${hyp(p)}²).` },
  tieBreakers: [
    { id: "closeness", title: "how close the line's squared distance is to that ring's squared radius", rep: "norm", sense: "min",
      sentence: () => "The line's squared distance from (0, 0) should be as close as possible to that ring's squared radius (it is 0 away when the line just touches the ring)." },
    { id: "touch", title: "the line's nearest point to (0, 0) close to the ring's direction point, in any quarter", rep: "norm", sense: "min",
      sentence: () => "Find the point of the line nearest to (0, 0), and flip that ring's direction point over the axes into the same quarter. Count how far apart the two points are, across plus up: less is better." },
    { id: "axis", title: "the y-intercept close to where the tangent at the direction point meets the y-axis", rep: "si", sense: "min",
      sentence: p => `A line touching that ring at its direction point meets the y-axis at radius × ${frac(hyp(p), p.v)}. The line's y-intercept (ignoring a minus sign) should be as close to that as possible.` },
    { id: "through", title: "the line passing through the ring's direction point", rep: "cart", sense: "min",
      sentence: () => "The line should pass through that ring's direction point (not flipped: across and up are both positive). Measure straight up or down from the point to the line: less is better." },
  ] as L<Rings>[],
};

const generators = (max: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let s = 2; s <= max; s++) for (let t = 1; t < s; t++) if ((s - t) % 2 === 1 && gcdN(s, t) === 1) out.push([s * s - t * t, 2 * s * t], [2 * s * t, s * s - t * t]);
  return out;
};
const DIRECTIONS = generators(9), MAX_D = 12, DEPENDS = ["norm", "si"];
function check(p: Rings): string | null {
  if (![p.d, p.u, p.v].every(Number.isInteger)) return "whole numbers only";
  if (p.d < 1 || p.d > 60) return "d is 1 to 60 (rings every 1/d)";
  if (p.u < 1 || p.v < 1 || p.u > 5000 || p.v > 5000) return "u and v are whole numbers from 1 to 5000";
  if (gcdN(p.u, p.v) !== 1) return `${p.u} and ${p.v} share a factor: write the direction in lowest terms`;
  const w = hyp(p);
  if (w * w !== p.u * p.u + p.v * p.v) return `${p.u}² + ${p.v}² = ${p.u * p.u + p.v * p.v} is not a square number, so the direction point would not have fraction coordinates (try 3, 4 or 5, 12 or 8, 15)`;
  return null;
}

export const tangentRings = geoFamily<Rings>({
  id: "tree-geo-rings", title: "Tangent Rings", depends: DEPENDS, shape,
  showcase: [{ d: 2, u: 3, v: 4 }, { d: 1, u: 4, v: 3 }, { d: 3, u: 5, v: 12 }, { d: 5, u: 15, v: 8 }, { d: 4, u: 21, v: 20 }, { d: 7, u: 7, v: 24 }, { d: 10, u: 12, v: 35 }, { d: 12, u: 77, v: 36 }],
  space: wholeSpace<Rings>({
    fields: ["d", "u", "v"], size: DIRECTIONS.length * MAX_D, check,
    says: `Drawn: rings every 1/d for d from 1 to ${MAX_D}, and one of ${DIRECTIONS.length} directions (u, v) with u² + v² a square number. Typed: any d up to 60 and any such direction in lowest terms.`,
    draw: r => { const [u, v] = DIRECTIONS[r.below(DIRECTIONS.length)]!; return { d: 1 + r.below(MAX_D), u, v }; },
  }),
  evaluate(ctx, p) {
    const d2Ref = ref("norm", "dist2"), footRef = ref("norm", "foot"), cRef = ref("si", "c"), mRef = ref("si", "m");
    const d2v = ctx.read(d2Ref), fv = ctx.read(footRef);
    if (d2v.kind !== "number" || fv.kind !== "point") throw new Error("every line has a distance from the origin");
    const D = BigInt(p.d), w = BigInt(hyp(p)), U = BigInt(p.u), V = BigInt(p.v);
    const ring = nearestRung(d2v.q, n => q(n * n, D * D));
    const radius = q(ring.n, D), next = q(ring.n + 1n, D);
    ctx.term("ring", `the ring nearest squared distance ${W(d2v.q)} has radius ${W(radius)} (squared: ${W(ring.at)})`, radius, [d2Ref]);
    const gap = dist(d2v.q, ring.at);
    ctx.term("closeness", Qn.isZero(gap) ? `the line touches the ring of radius ${W(radius)}` : `squared distance ${W(d2v.q)} is ${W(gap)} from ${W(ring.at)}`, gap, [d2Ref]);

    // The ring's direction point, and the same point flipped into the quarter of the line's nearest point to (0, 0).
    const tx = Qn.mul(radius, q(U, w)), ty = Qn.mul(radius, q(V, w));
    const flip = (v: Q, like: Q): Q => (Qn.sign(like) < 0 ? Qn.neg(v) : v);
    const fx = flip(tx, fv.x), fy = flip(ty, fv.y);
    const apart = Qn.add(dist(fv.x, fx), dist(fv.y, fy));
    ctx.term("touch", `the nearest point (${W(fv.x)}, ${W(fv.y)}) is ${W(apart)} (across plus up) from (${W(fx)}, ${W(fy)})`, apart, [footRef]);

    const cv = ctx.read(cRef), mv = ctx.read(mRef);
    const c = cv.kind === "number" ? cv.q : null, m = mv.kind === "number" ? mv.q : null;
    const axisAt = Qn.mul(radius, q(w, V));
    const VERTICAL = { undefined: "a vertical line has no y-intercept and no height at a point" };
    ctx.term("axis", c === null ? VERTICAL.undefined : `the y-intercept's size ${W(Qn.abs(c))} is ${W(dist(Qn.abs(c), axisAt))} from ${W(axisAt)}`, c === null ? VERTICAL : dist(Qn.abs(c), axisAt), [cRef]);
    const height = c === null || m === null ? null : Qn.add(Qn.mul(m, tx), c);
    ctx.term("through", height === null ? VERTICAL.undefined : `at x = ${W(tx)} the line is at ${W(height)}, ${W(dist(height, ty))} from the point's ${W(ty)}`, height === null ? VERTICAL : dist(height, ty), [mRef, cRef]);

    // Marks (drawn, never read: the plane is not in depends).
    const foot = ref("norm", "foot"), mark = (x: Q, y: Q) => ref("cart", "mark", { x, y });
    ctx.mark({ kind: "focus", ref: d2Ref, term: "ring" });
    const cite = citer(ctx, DEPENDS);
    ctx.mark({ kind: "candidate", ref: cite(ref("norm", "circle", { r2: ring.at })), term: "ring" });
    ctx.mark({ kind: "candidate", ref: cite(ref("norm", "circle", { r2: Qn.mul(next, next) })), term: "ring" });
    ctx.mark({ kind: "note", ref: foot, term: "closeness", text: Qn.isZero(gap) ? `touches the ring of radius ${W(radius)}` : `distance² ${W(d2v.q)}: ${W(gap)} from ${W(radius)}² = ${W(ring.at)}` });
    ctx.mark({ kind: "candidate", ref: mark(fx, fy), term: "touch" });
    ctx.mark({ kind: "measure", from: foot, to: mark(fx, fy), term: "touch" });
    if (c !== null) {
      const yMark = ref("cart", "yAxisMark", { y: flip(axisAt, c) });
      ctx.mark({ kind: "candidate", ref: yMark, term: "axis" });
      ctx.mark({ kind: "measure", from: ref("cart", "yInt"), to: yMark, term: "axis" });
      ctx.mark({ kind: "candidate", ref: mark(tx, ty), term: "through" });
      ctx.mark({ kind: "measure", from: ref("cart", "pointAtX", { q: tx }), to: mark(tx, ty), term: "through" });
    }
  },
});
