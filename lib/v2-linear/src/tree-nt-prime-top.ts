/**
 * Prime Top (docs/engine-v2/tree-families/prime-top.md): a tree family whose targets are fractions with a prime top.
 * UNDEALT.
 *
 * (1) Where the line crosses the x-axis (its size) is read against the fractions p/d: d a drawn bottom, p a prime whose
 *     final digits are a drawn ending (the owner's example of a large parameter set: any ending of several digits whose
 *     last digit is 1, 3, 7 or 9, so such primes never run out). The nearest one's top p is the primary.
 * (2) How close the crossing is to that fraction.
 * (3) One of three, each from the fraction's mixed-number form w r/d (113/7 = 16 1/7): the y-intercept near the leftover
 *     top r; the gradient near a whole number plus r/d; the line passing near the point (d, p) (bottom along, top up).
 */
import { Qn, q, readFields, ref, writeFields, type ParamSpace, type Q } from "@workspace/v2-core";
import { drawSuffix, isSuffix } from "./numbers.ts";
import { crossingOrHeight, further, mixed, suffixPrimesNear, toStep, treeFamily, wholeField, type Target } from "./tree-nt-shared.ts";

export type PrimeTop = { ends: string; over: number };
const BOTTOMS = { lo: 2, hi: 12 } as const;
/** A top is skipped when it divides the bottom: the fraction would not be in lowest terms (7/7, 3/12). */
const skip = (p: PrimeTop) => (n: bigint) => BigInt(p.over) % n === 0n;
type PT = Target & { p: bigint; whole: bigint; left: bigint };
export function primeTopNear(x: Q, p: PrimeTop): PT {
  const d = BigInt(p.over), n = suffixPrimesNear(Qn.mul(x, q(d)), p.ends, skip(p));
  return {
    p: n.at, whole: n.at / d, left: n.at % d, level: q(n.at), at: q(n.at, d),
    why: `the target nearest ${mixed(x)} is ${n.at}/${d}${n.at > d ? ` = ${mixed(q(n.at, d))}` : ""}: its top is ${n.at}`,
    near: [q(n.up, d), ...(n.down === null ? [] : [q(n.down, d)])],
  };
}
/** The first few targets, for the card. */
const firstTops = (p: PrimeTop, n = 3): bigint[] => { const out: bigint[] = []; let x = Qn.ZERO; while (out.length < n) { const t = suffixPrimesNear(x, p.ends, skip(p)); const next = out.length && t.at <= out[out.length - 1]! ? t.up : t.at; out.push(next); x = q(next + 1n); } return out; };

const FIELDS = ["ends", "over"] as const;
const space: ParamSpace<PrimeTop> = {
  size: 444 * (BOTTOMS.hi - BOTTOMS.lo + 1),
  hint: "ends = the top's final digits (1 to 3 digits, the last one 1, 3, 7 or 9), over = the bottom (2 to 12); e.g. ends = 13, over = 7",
  draw: r => ({ ends: drawSuffix(r), over: BOTTOMS.lo + r.below(BOTTOMS.hi - BOTTOMS.lo + 1) }),
  parse: text => {
    const t = readFields(text, FIELDS);
    if ("invalid" in t) return t as { invalid: string };
    if (!isSuffix(t.ends)) return { invalid: "ends: the top's final digits, 1 to 3 digits, the last one 1, 3, 7 or 9" };
    const over = wholeField(t.over, "over (the bottom)", BOTTOMS.lo, BOTTOMS.hi);
    return typeof over === "number" ? { ends: t.ends!, over } : over;
  },
  label: p => writeFields(p, FIELDS),
};

export const primeTop = treeFamily<PrimeTop, PT>({
  id: "tree-nt-prime-top", title: "Prime Top", depends: ["crossing", "si"], rep: "crossing", space,
  featured: [{ ends: "3", over: 2 }, { ends: "13", over: 7 }, { ends: "7", over: 5 }, { ends: "1", over: 12 }],
  mainTitle: "the top of the nearest fraction with a prime top, the bigger the better",
  main: p => {
    const tops = firstTops(p);
    return `Find where the line crosses the x-axis, ignoring a minus sign (a flat line never crosses it: use its height instead). The targets are the fractions with bottom ${p.over} whose top is a prime number ending in ${p.ends} (${tops.map(t => `${t}/${p.over}`).join(", ")}, …). Find the target nearest the crossing. The bigger that target's top, the better.`;
  },
  closeTitle: "how close the crossing is to that fraction",
  close: () => "The crossing should be as close as possible to that target.",
  read: crossingOrHeight,
  nearest: primeTopNear,
  draw: r => (r.flat
    ? { from: ref("cart", "yInt"), target: at => ref("cart", "yAxisMark", { y: at }) }
    : { from: ref("cart", "xInt"), target: at => ref("cart", "xAxisMark", { x: at }) }),
  thirds: [
    {
      layer: { id: "leftover", title: "the y-intercept near the target's leftover top", rep: "si", sense: "min",
        sentence: p => { const t = firstTops(p, 2)[1]!, d = BigInt(p.over); return `Write the target as a mixed number: divide its top by ${p.over} and keep what is left over (${t}/${p.over} = ${mixed(q(t, d))}: ${t / d} whole ones and ${t % d} left over). The y-intercept, ignoring a minus sign, should be as close as possible to that leftover.`; } },
      evaluate: (ctx, r, t, p) => {
        const cRef = ref("si", "c");
        if (r.c === null) return further(ctx, "leftover", null, "a vertical line has no y-intercept", r.from[0]!, r.from);
        const d = Qn.abs(Qn.sub(Qn.abs(r.c), q(t.left)));
        further(ctx, "leftover", d, `${t.p} ÷ ${p.over} = ${t.whole} and ${t.left} left over; the y-intercept's size ${mixed(Qn.abs(r.c))} is ${mixed(d)} from ${t.left}`, cRef, [cRef, ...r.from]);
      },
    },
    {
      layer: { id: "part", title: "the gradient near a whole number plus the target's fraction part", rep: "si", sense: "min",
        sentence: p => { const t = firstTops(p, 2)[1]!, d = BigInt(p.over), fr = q(t % d, d); return `Take the target's fraction part (for ${t}/${p.over} = ${mixed(q(t, d))} it is ${Qn.toWire(fr)}). The gradient, ignoring a minus sign, should be as close as possible to that fraction, or to it plus a whole number (${Qn.toWire(fr)}, ${mixed(Qn.add(fr, q(1)))}, ${mixed(Qn.add(fr, q(2)))}, …).`; } },
      evaluate: (ctx, r, t, p) => {
        const mRef = ref("si", "m");
        if (r.m === null) return further(ctx, "part", null, "a vertical line has no gradient", r.from[0]!, r.from);
        const fr = q(t.left, BigInt(p.over)), a = Qn.abs(r.m);
        // The nearest of fr, 1 + fr, 2 + fr, …: below fr itself there is none (the size is never negative).
        const d = Qn.cmp(a, fr) < 0 ? Qn.sub(fr, a) : toStep(a, fr, Qn.ONE);
        further(ctx, "part", d, `the target's fraction part is ${Qn.toWire(fr)}; the gradient's size ${mixed(a)} is ${mixed(d)} from a whole number plus ${Qn.toWire(fr)}`, mRef, [mRef, ...r.from]);
      },
    },
    {
      layer: { id: "point", title: "the line's height at x = the bottom near the target's top", rep: "cart", sense: "min",
        sentence: p => `Go along to x = ${p.over} (the bottom; to x = −${p.over} if the line crosses the x-axis on the left). The line's height there, ignoring a minus sign, should be as close as possible to the target's top.` },
      evaluate: (ctx, r, t, p) => {
        if (r.m === null || r.c === null) return further(ctx, "point", null, "a vertical line has no height at that x", r.from[0]!, r.from);
        const x = q(r.flat ? p.over : r.sign * p.over), y = Qn.add(Qn.mul(r.m, x), r.c), d = Qn.abs(Qn.sub(Qn.abs(y), q(t.p)));
        const here = ref("cart", "pointAtX", { q: x }), there = ref("cart", "mark", { x, y: Qn.sign(y) < 0 ? q(-t.p) : q(t.p) });
        ctx.term("point", `at x = ${Qn.toWire(x)} the line's height is ${mixed(y)}: ${mixed(d)} from the top ${t.p}`, d, [ref("si", "m"), ref("si", "c"), ...r.from]);
        ctx.mark({ kind: "focus", ref: here, term: "point" });
        ctx.mark({ kind: "candidate", ref: there, term: "point" });
        ctx.mark({ kind: "measure", from: here, to: there, term: "point" });
      },
    },
  ],
});
