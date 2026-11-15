/**
 * Ruler, Square Area and Pythagorean Area: the beginner families that read the line's distances and areas (moved out of
 * beginner.ts unchanged, 15 Nov, so their redesign against design-principles.md does not collide with the others').
 */
import { Qn, q, ref } from "@workspace/v2-core";
import { allUndefined, distance, factorLabel, family, gap, more, notOnWhole, num, prime, squareGap, undef, undealt, verticalAt, VERTICAL_NO, type Shape } from "./layers.ts";
import { distanceToPrime, distanceToWhole, largestPrimeFactor, nearestSquareRoot, primeFactorCount, smallestPrimeFactor } from "./numbers.ts";

// ---------------------------------------------------------------- Square Area (the owner's example 2)

const squareShape: Shape<object> = {
  main: distance("square", "area close to a square number", "The triangle the line cuts off the axes should have an area as close as possible to a square number.", "tri"),
  tieBreakers: [
    prime(more("spf", "that square's root's smallest prime factor", "The smallest prime factor of that square's root should be as big as possible.", "tri")),
    prime(more("lpf", "that square's root's largest prime factor", "The largest prime factor of that square's root should be as big as possible.", "tri")),
    // Undealt (the coordinator's no-straight-hill check, 15 Nov): a stretch by 2, 3 or 5 adds a prime factor to the root
    // at every size, the same bits per fee all the way (artifacts/engine test v2-no-straight-hill). For the grids session.
    undealt(more("omega", "prime factors of that square's root", "That square's root should have as many prime factors as possible (12 = 2·2·3 has three).", "tri")),
  ],
};
export const squareArea = family("square-area", "Square Area", ["tri", "cart"], squareShape, [{}], ctx => {
  const area = ref("tri", "area");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, squareShape, av, area);
  const sq = squareGap(a);
  ctx.term("square", `distance from the area to ${sq.root * sq.root}`, sq.d, [area]);
  ctx.term("spf", factorLabel("smallest", "the root", q(sq.root)), q(smallestPrimeFactor(sq.root)), [area]);
  ctx.term("lpf", factorLabel("largest", "the root", q(sq.root)), q(largestPrimeFactor(sq.root)), [area]);
  ctx.term("omega", `prime factors of ${sq.root}`, q(primeFactorCount(sq.root)), [area]);
  ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire(a)}, nearest square ${sq.root * sq.root} = ${sq.root}²` });
  // The nearest square itself, as a shape the plane draws beside the triangle (marks only: no term changes).
  const sqRef = ref("tri", "square", { s: sq.root });
  ctx.read(sqRef);
  ctx.mark({ kind: "candidate", ref: sqRef, term: "square" });
});

// ---------------------------------------------------------------- Ruler, Exact Change, Pythagorean Area (restored, decision 22)
// Deleted on 14 November because no exact sum valued them; owner decision 22 keeps rules whose values are sampled.

const rulerShape: Shape<object> = {
  main: distance("ruler", "distance² from (0, 0) close to a square", "The shortest distance from (0, 0) to the line, squared, should be as close as possible to a square number.", "norm"),
  tieBreakers: [
    notOnWhole(more("far", "that whole distance", "That distance should be as big as possible.", "norm")),
    distance("prime-gradient", "the gradient close to a prime", "The gradient should be as close as possible to a prime.", "si"),
    distance("square-area", "the triangle's area close to a square", "The triangle cut off the axes should have an area as close as possible to a square number.", "tri"),
  ],
};
export const ruler = family("ruler", "Ruler", ["norm", "si", "tri", "gen"], rulerShape, [{}], ctx => {
  const mRef = ref("si", "m"), d2Ref = ref("norm", "dist2"), area = ref("tri", "area");
  // A vertical line x = k is |k| from (0, 0): its distance² reads honestly; the gradient and the triangle do not exist.
  const vx = verticalAt(ctx);
  if (vx) {
    const d2 = num(ctx.read(d2Ref))!;
    let kv = nearestSquareRoot(d2);
    if (kv === 0n) kv = 1n;
    ctx.term("ruler", `distance from distance² to ${kv * kv}`, gap(d2, q(kv * kv)), [d2Ref]);
    ctx.term("far", "the whole distance nearest", q(kv), [d2Ref]);
    for (const id of ["prime-gradient", "square-area"]) ctx.term(id, id, { undefined: VERTICAL_NO }, vx.from);
    ctx.mark({ kind: "note", ref: d2Ref, text: `a vertical line: distance² ${Qn.toWire(d2)}, nearest square ${kv * kv}` });
    return;
  }
  const mv = ctx.read(mRef);
  const m = num(mv);
  if (m === null || Qn.isZero(m)) return allUndefined(ctx, rulerShape, m === null ? mv : { kind: "undefined", reason: "a flat line's distance is its height: the rule wants a sloping line" }, mRef);
  const d2 = num(ctx.read(d2Ref))!;
  ctx.read(ref("norm", "foot"));
  // The nearest square k² with k ≥ 1.
  let k = nearestSquareRoot(d2);
  if (k === 0n) k = 1n;
  const av = ctx.read(area);
  ctx.term("ruler", `distance from distance² to ${k * k}`, gap(d2, q(k * k)), [d2Ref]);
  ctx.term("far", "the whole distance nearest", q(k), [d2Ref]);
  ctx.term("prime-gradient", "distance from the gradient to a prime", distanceToPrime(m), [mRef]);
  ctx.term("square-area", "distance from the area to a square", num(av) === null ? undef(av) : squareGap(num(av)!).d, [area]);
  ctx.mark({ kind: "focus", ref: ref("norm", "foot") });
  ctx.mark({ kind: "note", ref: d2Ref, text: `distance² ${Qn.toWire(d2)}, nearest square ${k * k}` });
});

type A = { A: number };
const pythShape: Shape<A> = {
  main: { ...distance<A>("area", "the area close to A", "", "tri"),
    sentence: p => `The triangle the line cuts off the axes should have an area as close as possible to ${p.A}.` },
  tieBreakers: [
    distance("slanted-square", "the slanted side squared close to a square", "The slanted side, squared, should be as close as possible to a square number.", "tri"),
    distance("prime-height", "|c| close to a prime", "The y-intercept should be as close as possible to a prime (ignoring sign).", "si"),
    distance("whole-legs", "both legs close to whole numbers", "Both legs should be as close as possible to whole numbers (distances added).", "tri"),
  ],
};
export const pythagoreanArea = family<A>("pythagorean-area", "Pythagorean Area", ["tri", "si"], pythShape, [{ A: 6 }], (ctx, p) => {
  const area = ref("tri", "area");
  const av = ctx.read(area);
  const a = num(av);
  if (a === null) return allUndefined(ctx, pythShape, av, area);
  const hyp = ref("tri", "hyp2"), lx = ref("tri", "legX"), ly = ref("tri", "legY"), cRef = ref("si", "c");
  const h = num(ctx.read(hyp))!, x = num(ctx.read(lx))!, y = num(ctx.read(ly))!, c = num(ctx.read(cRef))!;
  ctx.term("area", `distance from the area to ${p.A}`, gap(a, q(p.A)), [area]);
  ctx.term("slanted-square", "distance from side² to a square", squareGap(h).d, [hyp]);
  ctx.term("prime-height", "distance from |c| to a prime", distanceToPrime(Qn.abs(c)), [cRef]);
  ctx.term("whole-legs", "distance of the legs from whole numbers", Qn.add(distanceToWhole(x), distanceToWhole(y)), [lx, ly]);
  ctx.mark({ kind: "focus", ref: lx });
  ctx.mark({ kind: "focus", ref: ly });
});
