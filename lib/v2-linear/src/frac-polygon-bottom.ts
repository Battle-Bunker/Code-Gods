/**
 * Polygon Bottom: a fraction-native family in the nearest-target shape (design-principles.md principle 3b). It is in
 * no pool until the coordinator has read its walk-through.
 *
 * Reading: the smaller of the two bottom numbers of the gradient and the y-intercept in lowest terms (5/6 and 3/4: 4; a
 * whole number n is n/1). Targets: the dealt s-sided polygon numbers, the dots in a growing s-sided shape (s = 3: 1, 3,
 * 6, 10, 15, …; s = 5: 1, 5, 12, 22, …), P(n) = ((s − 2)n² − (s − 4)n)/2. Every line has a nearest one (a tie goes to the
 * bigger), so there is no cliff.
 *
 * Layers: (main) the side n of the nearest polygon number, bigger better; (secondary) how far the smaller bottom is from
 * it; and three thirds, each a relation between the polygon and another dimension of the line: the gradient's top
 * against the side n, the size of the x-intercept in proportion to the polygon number (the bigger divided by the
 * smaller), and the y-intercept's whole part against the side n.
 */
import { Qn, q, ref } from "@workspace/v2-core";
import { allUndefined, distance, family, ladder, more, num, type Shape } from "./layers.ts";
import { fromMC, type LineState } from "./line.ts";
import { isqrt } from "./numbers.ts";
import { onRationals } from "./rational.ts";

export const POLYGON_SIDES = [3, 5, 6, 7, 8] as const;
export type PolygonParams = { s: (typeof POLYGON_SIDES)[number] };

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
/** The n-th s-sided polygon number. */
export const polygonNumber = (s: number, n: bigint): bigint => ((BigInt(s) - 2n) * n * n - (BigInt(s) - 4n) * n) / 2n;
/** The s-sided polygon number nearest L ≥ 1 (a tie goes to the bigger), and its side n ≥ 1. */
export function nearestPolygon(L: bigint, s: number): { n: bigint; P: bigint } {
  // P(n) ≤ L at n ≤ ((s − 4) + √((s − 4)² + 8(s − 2)L)) / (2(s − 2)); check the neighbours of that estimate.
  const S = BigInt(s), est = ((S - 4n) + isqrt((S - 4n) * (S - 4n) + 8n * (S - 2n) * L)) / (2n * (S - 2n));
  let best = { n: 1n, P: 1n, d: abs(L - 1n) };
  for (let n = est - 1n; n <= est + 2n; n++) {
    if (n < 1n) continue;
    const P = polygonNumber(s, n), d = abs(L - P);
    if (d < best.d || (d === best.d && n > best.n)) best = { n, P, d };
  }
  return { n: best.n, P: best.P };
}

const NAMES: Record<number, string> = { 3: "triangle", 5: "pentagon", 6: "hexagon", 7: "heptagon", 8: "octagon" };
const list = (s: number) => [1n, 2n, 3n, 4n, 5n].map(n => polygonNumber(s, n)).join(", ");
const BOTTOMS = "Write the gradient and the y-intercept as fractions in lowest terms (a whole number 4 is 4/1) and take the smaller of their two bottom numbers (5/6 and 3/4: 4).";
const shape: Shape<PolygonParams> = {
  main: {
    ...more<PolygonParams>("side", "the side of the polygon number nearest the smaller bottom", "", "si"),
    sentence: p => `${BOTTOMS} The targets are the ${NAMES[p.s]} numbers ${list(p.s)}, …: the dots in ${NAMES[p.s]}s of side 1, 2, 3, … (each adds ${p.s - 2} more dots to every new side than the last). Find the ${NAMES[p.s]} number nearest the smaller bottom (halfway between two goes to the bigger). Score: its side (${polygonNumber(p.s, 3n)} has side 3); bigger is better.`,
  },
  tieBreakers: [
    distance<PolygonParams>("near", "the smaller bottom close to its polygon number",
      "Then: how far the smaller bottom is from that polygon number; smaller is better.", "si"),
    distance<PolygonParams>("top-side", "the gradient's top close to the side",
      "Then: how far the gradient's top number (ignoring its sign) is from the polygon's side; smaller is better.", "si"),
    distance<PolygonParams>("crossing-ratio", "the x-intercept's size in proportion to the polygon number",
      "Then: take the x-intercept's size (where the line crosses the x-axis, ignoring its sign) and the polygon number; divide the bigger by the smaller. Smaller is better (a flat line, or one through the origin, counts as worst).", "si"),
    distance<PolygonParams>("whole-side", "the y-intercept's whole part close to the side",
      "Then: how far the y-intercept's whole part (the whole number at or below its size) is from the polygon's side; smaller is better.", "si"),
  ],
};

/** Witnesses for the ladder's tail cap (value.ts ladderCaps): lines whose bottoms are both the n-th polygon number. */
export const polygonWitness = (p: PolygonParams, n: number): LineState[] => {
  const P = polygonNumber(p.s, BigInt(n));
  return [q(1, P), q(-1, P)].flatMap(m => [{ lines: [fromMC(m, q(1, P))] }, { lines: [fromMC(m, q(-1, P))] }]);
};

export const polygonBottom = ladder(family<PolygonParams>("polygon-bottom", "Polygon Bottom", ["si"], shape,
  onRationals(POLYGON_SIDES.map(s => ({ s }))), (ctx, p) => {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), m = num(mv);
    if (m === null) return allUndefined(ctx, shape, mv, mRef);   // a vertical line has no gradient
    const c = num(ctx.read(cRef))!;
    const L = m.d < c.d ? m.d : c.d;
    const { n, P } = nearestPolygon(L, p.s);
    ctx.term("side", `smaller bottom ${L}: nearest ${NAMES[p.s]} number ${P}, side ${n}`, q(n), [mRef, cRef]);
    ctx.term("near", `${L} is ${abs(L - P)} from ${P}`, q(abs(L - P)), [mRef, cRef]);
    ctx.term("top-side", `the gradient's top ${abs(m.n)} against side ${n}`, q(abs(abs(m.n) - n)), [mRef]);
    if (m.n === 0n || c.n === 0n) ctx.term("crossing-ratio", "no x-intercept to compare", { undefined: "a flat line or a line through the origin" }, [mRef, cRef]);
    else {
      const X = Qn.abs(Qn.div(c, m)), T = q(P);
      ctx.term("crossing-ratio", `x-intercept size ${Qn.toWire(X)} against ${P}`, Qn.cmp(X, T) >= 0 ? Qn.div(X, T) : Qn.div(T, X), [mRef, cRef]);
    }
    const W = Qn.floor(Qn.abs(c));
    ctx.term("whole-side", `the y-intercept's whole part ${W} against side ${n}`, q(abs(W - n)), [cRef]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "focus", ref: cRef });
  }), polygonWitness);
