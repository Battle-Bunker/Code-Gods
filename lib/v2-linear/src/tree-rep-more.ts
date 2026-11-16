/**
 * Two representations-lens tree families (UNDEALT; docs/engine-v2/tree-families/).
 *
 * Borrowed Bottom: one number of the line is measured on a ruler whose bottom number B is the gradient's bottom (in
 * lowest terms; a whole gradient has B = 1). The targets are the fractions t/B in lowest terms whose top t ends in a
 * drawn suffix. (1) The VALUE of the target nearest the reading (the y-intercept's or the x-crossing's size), the
 * bigger the better: the repair of the stopped session's draft, whose primary was the top t, which one tilt by 1/1000
 * multiplied by about 1000 (tree-rep.md item 3; true by construction). TreeReading a size, a nudge moves the primary by
 * about its own size. (2) How close. (3) The gradient's top near the target's top / the other reading's bottom near B
 * / the gradient times the target near 1, in doublings.
 *
 * Part Way: (1) the gap n of a drawn ladder (squares, triangle numbers, cubes, powers of 2 or 3) whose point u/v of the
 * way from L(n) to L(n + 1) is nearest the reading (y-intercept, x-crossing, area or gradient, sizes), leaving out
 * points that are whole; (2) how close; (3) the partner (the gradient, or the y-intercept when the gradient is read)
 * times the gap's width near 1, in doublings / the partner's size near n / the other intercept near L(n).
 */
import { gcd, Qn, q, readFields, ref, writeFields, type ParamSpace, type Q } from "@workspace/v2-core";
import { drawSuffix, isSuffix } from "./numbers.ts";
import { crossingOf, crossingOrHeight, doublingsFrom1, further, interceptReading, mixed, nearestOn, siReading, treeFamily, wholeField, type Target } from "./tree-nt-shared.ts";

// ---------------------------------------------------------------- Borrowed Bottom

export type Borrowed = { ends: string; reads: "c" | "x" };
type BT = Target & { top: bigint; B: bigint };
/** The tops t ≡ suffix (as written digits) with gcd(t, B) = 1 nearest x·B: by the Chinese remainder theorem one exists. */
export function borrowedNear(x: Q, B: bigint, ends: string): BT {
  const M = 10n ** BigInt(ends.length), v = BigInt(ends), k0 = ends.length > 1 && ends[0] === "0" ? 1n : 0n;
  const at = (i: bigint) => q(v + (k0 + i - 1n) * M, B);
  const r = nearestOn(x, at, i => gcd(v + (k0 + i - 1n) * M, B) !== 1n);
  const top = Qn.mul(r.at, q(B)).n;
  return { top, B, level: r.at, at: r.at, near: [r.up, ...(r.down ? [r.down] : [])], why: `on the ruler of ${B}${B === 1n ? "" : "ths"}, the target nearest ${mixed(x)} is ${top}/${B}${B === 1n ? "" : ` = ${mixed(r.at)}`}` };
}
const BFIELDS = ["ends", "reads"] as const;
const borrowedSpace: ParamSpace<Borrowed> = {
  size: 444 * 2,
  hint: "ends = the top's last digits (1 to 3, ending in 1, 3, 7 or 9), reads = c (the y-intercept) or x (the x-crossing); e.g. ends = 37, reads = c",
  draw: r => ({ ends: drawSuffix(r), reads: r.bit() ? "c" : "x" }),
  parse(text) {
    const t = readFields(text, BFIELDS);
    if ("invalid" in t) return t as { invalid: string };
    if (!isSuffix(t.ends)) return { invalid: "ends: 1 to 3 digits, the last one 1, 3, 7 or 9" };
    return t.reads === "c" || t.reads === "x" ? { ends: t.ends!, reads: t.reads } : { invalid: "reads: c or x" };
  },
  label: p => writeFields(p, BFIELDS),
};
const readsName = (p: Borrowed) => (p.reads === "c" ? "the y-intercept" : "where the line crosses the x-axis");
export const borrowedBottom = treeFamily<Borrowed, BT>({
  id: "tree-rep-borrowed", title: "Borrowed Bottom", depends: ["si", "crossing"], rep: "si", space: borrowedSpace,
  featured: [{ ends: "37", reads: "c" }, { ends: "1", reads: "x" }, { ends: "9", reads: "c" }, { ends: "113", reads: "x" }],
  mainTitle: "the size of the nearest fraction on the gradient's ruler with the drawn top ending, the bigger the better",
  main: p => `Write the gradient as a fraction in lowest terms and call its bottom number B (a whole-number gradient has B = 1). The targets are the fractions with bottom B, in lowest terms, whose top ends in ${p.ends} (for B = 4: ${p.ends}/4 and on, every top ending in ${p.ends} that shares no factor with 4). Find the target nearest ${readsName(p)}, ignoring a minus sign. The bigger that target, the better.`,
  closeTitle: "how close the reading is to that target",
  close: p => `${readsName(p)[0]!.toUpperCase()}${readsName(p).slice(1)} (ignoring a minus sign) should be as close as possible to that target.`,
  read: (ctx, p) => (p.reads === "c" ? interceptReading(ctx) : crossingOrHeight(ctx)),
  nearest: (x, p, r) => borrowedNear(x, r.m === null ? 1n : r.m.d, p.ends),
  draw: (r, p) => (p.reads === "c" || r.flat ? { from: ref("cart", "yInt"), target: at => ref("cart", "yAxisMark", { y: at }) } : { from: ref("cart", "xInt"), target: at => ref("cart", "xAxisMark", { x: at }) }),
  thirds: [
    {
      layer: { id: "echo", title: "the gradient's top near the target's top", rep: "si", sense: "min",
        sentence: () => "The gradient's top number (ignoring a minus sign) should be as close as possible to the target's top." },
      evaluate: (ctx, r, t) => {
        if (r.m === null) return further(ctx, "echo", null, "a vertical line has no gradient", r.from[0]!, r.from);
        const top = r.m.n < 0n ? -r.m.n : r.m.n, d = Qn.abs(Qn.sub(q(top), q(t.top)));
        further(ctx, "echo", d, `the gradient's top ${top} is ${d.n} from ${t.top}`, ref("si", "m"), r.from);
      },
    },
    {
      layer: { id: "bottom", title: "the other reading's bottom near B", rep: "si", sense: "min",
        sentence: p => `Write ${p.reads === "c" ? "where the line crosses the x-axis" : "the y-intercept"} as a fraction in lowest terms. Its bottom number should be as close as possible to B.` },
      evaluate: (ctx, r, t, p) => {
        const other = r.m === null || r.c === null ? null : p.reads === "c" ? crossingOf(r.m, r.c) : r.c;
        if (other === null) return further(ctx, "bottom", null, "that number does not exist for this line", r.from[0]!, r.from);
        const d = Qn.abs(Qn.sub(q(other.d), q(t.B)));
        further(ctx, "bottom", d, `${Qn.toWire(other)} has bottom ${other.d}: ${d.n} from ${t.B}`, r.from[0]!, r.from);
      },
    },
    {
      layer: { id: "flip", title: "the gradient times the target near 1, in doublings", rep: "si", sense: "min",
        sentence: () => "The gradient's size times the target should be as close as possible to 1, counted in doublings: 2 and 1/2 are both one doubling away, 4 and 1/4 two." },
      evaluate: (ctx, r, t) => {
        const v = r.m === null ? null : doublingsFrom1(Qn.mul(Qn.abs(r.m), t.at));
        further(ctx, "flip", v, v === null ? "a flat or vertical line" : `${mixed(Qn.abs(r.m!))} × ${mixed(t.at)}: ${Qn.toNumber(v).toFixed(2)} doublings from 1`, ref("si", "m"), r.from);
      },
    },
  ],
});

// ---------------------------------------------------------------- Part Way

export type PartWay = { reads: "c" | "x" | "area" | "m"; ladder: "square" | "triangle" | "cube" | "pow2" | "pow3"; u: number; v: number };
const LADDERS = { square: (n: bigint) => n * n, triangle: (n: bigint) => (n * (n + 1n)) / 2n, cube: (n: bigint) => n * n * n, pow2: (n: bigint) => 2n ** n, pow3: (n: bigint) => 3n ** n } as const;
const LADDER_WORDS = { square: "square numbers", triangle: "triangle numbers (1, 3, 6, 10, …)", cube: "cube numbers", pow2: "powers of 2", pow3: "powers of 3" } as const;
const READS = { c: "the y-intercept", x: "where the line crosses the x-axis", area: "the area of the triangle the line makes with the axes", m: "the gradient" } as const;
/** Every large target of a powers-of-k ladder is whole unless v has a prime factor dividing neither k nor k − 1. */
function powersOk(k: number, v: number): boolean {
  for (let p = 2, n = v; n > 1; p++) if (n % p === 0) { if (k % p !== 0 && (k - 1) % p !== 0) return true; while (n % p === 0) n /= p; }
  return false;
}
const allowed = (p: PartWay) => (p.ladder === "pow2" ? powersOk(2, p.v) : p.ladder === "pow3" ? powersOk(3, p.v) : true);
type PW = Target & { n: bigint; low: bigint; width: bigint };
export function partWayNear(x: Q, p: PartWay): PW {
  const L = LADDERS[p.ladder], f = q(p.u, p.v);
  const at = (n: bigint) => Qn.add(q(L(n)), Qn.mul(f, q(L(n + 1n) - L(n))));
  const r = nearestOn(x, at, n => at(n).d === 1n), n = r.n;
  return { n, low: L(n), width: L(n + 1n) - L(n), level: q(n), at: r.at, near: [r.up, ...(r.down ? [r.down] : [])], why: `the target nearest ${mixed(x)} is ${mixed(r.at)}, ${p.u}/${p.v} of the way from ${L(n)} to ${L(n + 1n)} (gap ${n})` };
}
const PFIELDS = ["reads", "ladder", "u", "v"] as const;
const partSpace: ParamSpace<PartWay> = {
  size: (() => { let n = 0; for (const ladder of Object.keys(LADDERS) as PartWay["ladder"][]) for (let v = 2; v <= 12; v++) for (let u = 1; u < v; u++) if (gcd(BigInt(u), BigInt(v)) === 1n && allowed({ reads: "c", ladder, u, v })) n++; return 4 * n; })(),
  hint: "reads = c, x, area or m; ladder = square, triangle, cube, pow2 or pow3; u, v = the fraction u/v of the way (lowest terms, v 2 to 12); e.g. reads = c, ladder = square, u = 2, v = 5",
  draw: r => { for (;;) { const v = 2 + r.below(11), u = 1 + r.below(v - 1), p: PartWay = { reads: (["c", "x", "area", "m"] as const)[r.below(4)]!, ladder: (Object.keys(LADDERS) as PartWay["ladder"][])[r.below(5)]!, u, v }; if (gcd(BigInt(u), BigInt(v)) === 1n && allowed(p)) return p; } },
  parse(text) {
    const t = readFields(text, PFIELDS);
    if ("invalid" in t) return t as { invalid: string };
    if (!(t.reads! in READS)) return { invalid: "reads: c, x, area or m" };
    if (!(t.ladder! in LADDERS)) return { invalid: "ladder: square, triangle, cube, pow2 or pow3" };
    const v = wholeField(t.v, "v", 2, 99);
    if (typeof v !== "number") return v;
    const u = wholeField(t.u, "u", 1, v - 1);
    if (typeof u !== "number") return u;
    const p = { reads: t.reads, ladder: t.ladder, u, v } as PartWay;
    if (gcd(BigInt(u), BigInt(v)) !== 1n) return { invalid: `${u}/${v} is not in lowest terms` };
    return allowed(p) ? p : { invalid: `on ${p.ladder} every far target ${u}/${v} of the way is whole: choose another v` };
  },
  label: p => writeFields(p, PFIELDS),
};
const partner = (r: { m: Q | null; c: Q | null }, p: PartWay): Q | null => (p.reads === "m" ? r.c : r.m);
export const partWay = treeFamily<PartWay, PW>({
  id: "tree-rep-partway", title: "Part Way", depends: ["si", "crossing"], rep: "si", space: partSpace,
  featured: [{ reads: "c", ladder: "square", u: 2, v: 5 }, { reads: "x", ladder: "triangle", u: 1, v: 3 }, { reads: "area", ladder: "pow2", u: 1, v: 3 }, { reads: "m", ladder: "cube", u: 1, v: 2 }],
  mainTitle: "the gap of the drawn ladder whose part-way point is nearest the reading, the higher the better",
  main: p => {
    const L = LADDERS[p.ladder], eg = [1n, 2n, 3n, 4n].map(n => Qn.add(q(L(n)), Qn.mul(q(p.u, p.v), q(L(n + 1n) - L(n))))).filter(x => x.d !== 1n).slice(0, 3);
    return `Take two ${LADDER_WORDS[p.ladder]} next to each other. The targets are the numbers ${p.u}/${p.v} of the way from one to the next (${eg.map(mixed).join(", ")}, …), leaving out any that are whole. Find the target nearest ${READS[p.reads]}, ignoring a minus sign. The higher its gap (gap 1 is from the first to the second), the better.`;
  },
  closeTitle: "how close the reading is to that target",
  close: () => "The reading should be as close as possible to that target.",
  read: (ctx, p) => p.reads === "c" ? interceptReading(ctx) : p.reads === "x" ? crossingOrHeight(ctx)
    : siReading(ctx, (m, c) => p.reads === "m" ? m : (() => { const X = crossingOf(m, c); return X === null || Qn.sign(c) === 0 ? null : Qn.abs(Qn.div(Qn.mul(X, c), q(2))); })(), "a flat line makes no triangle with the axes"),
  nearest: partWayNear,
  draw: (r, p) => (p.reads === "c" || r.flat ? { from: ref("cart", "yInt"), target: at => ref("cart", "yAxisMark", { y: at }) }
    : p.reads === "x" ? { from: ref("cart", "xInt"), target: at => ref("cart", "xAxisMark", { x: at }) } : null),
  thirds: [
    {
      layer: { id: "flip", title: "the partner times the gap's width near 1, in doublings", rep: "si", sense: "min",
        sentence: p => `Take ${p.reads === "m" ? "the y-intercept" : "the gradient"} (ignoring a minus sign) times the gap's width (the second ladder number minus the first). It should be as close as possible to 1, counted in doublings: 2 and 1/2 are one doubling away.` },
      evaluate: (ctx, r, t, p) => {
        const w = partner(r, p), v = w === null ? null : doublingsFrom1(Qn.mul(Qn.abs(w), q(t.width)));
        further(ctx, "flip", v, v === null ? "nothing to multiply" : `${mixed(Qn.abs(w!))} × ${t.width}: ${Qn.toNumber(v).toFixed(2)} doublings from 1`, ref("si", p.reads === "m" ? "c" : "m"), r.from);
      },
    },
    {
      layer: { id: "index", title: "the partner's size near the gap number", rep: "si", sense: "min",
        sentence: p => `${p.reads === "m" ? "The y-intercept" : "The gradient"} (ignoring a minus sign) should be as close as possible to the gap number.` },
      evaluate: (ctx, r, t, p) => {
        const w = partner(r, p);
        if (w === null) return further(ctx, "index", null, "a vertical line", r.from[0]!, r.from);
        const d = Qn.abs(Qn.sub(Qn.abs(w), q(t.n)));
        further(ctx, "index", d, `${mixed(Qn.abs(w))} is ${mixed(d)} from gap ${t.n}`, ref("si", p.reads === "m" ? "c" : "m"), r.from);
      },
    },
    {
      layer: { id: "lower", title: "the other intercept near the gap's lower ladder number", rep: "si", sense: "min",
        sentence: p => `${p.reads === "c" ? "Where the line crosses the x-axis" : "The y-intercept"} (ignoring a minus sign) should be as close as possible to the lower ${LADDER_WORDS[p.ladder].split(" (")[0]!.replace(/s$/, "").replace(/numbers$/, "number")} of the gap.` },
      evaluate: (ctx, r, t, p) => {
        const o = r.m === null || r.c === null ? null : p.reads === "c" ? crossingOf(r.m, r.c) : r.c;
        if (o === null) return further(ctx, "lower", null, "that intercept does not exist for this line", r.from[0]!, r.from);
        const d = Qn.abs(Qn.sub(Qn.abs(o), q(t.low)));
        further(ctx, "lower", d, `${mixed(Qn.abs(o))} is ${mixed(d)} from ${t.low}`, r.from[0]!, r.from);
      },
    },
  ],
});
