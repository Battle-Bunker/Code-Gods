/**
 * Drawn Step (representations lens; UNDEALT; docs/engine-v2/tree-families/drawn-step.md). The targets are the whole
 * multiples of a drawn fraction u/v that are not whole numbers (3/7, 6/7, 9/7, …; 21/7 = 3 is left out).
 *
 * (1) The multiple N of the target nearest the y-intercept's size, the bigger the better (a size: a fractional nudge
 *     moves the y-intercept by its own size, so it cannot inflate N). (2) How close. (3) One of: the x-crossing's size
 *     near N (then the axis triangle is a scale copy of the v-by-u one); the gradient's bottom number near v; the
 *     line's height at x = v near a whole number (y(v) = m·v + c is whole when m's bottom divides v and c is whole …).
 */
import { gcd, Qn, q, readFields, ref, writeFields, type ParamSpace, type Q } from "@workspace/v2-core";
import { crossingOf, further, interceptReading, mixed, nearestOn, treeFamily, wholeField, type Target } from "./tree-nt-shared.ts";

export type Step = { u: number; v: number };
const FIELDS = ["u", "v"] as const, VMAX = 30;
type ST = Target & { N: bigint };
/** N·u/v is whole exactly when v divides N (u and v share no factor). */
export function stepNear(x: Q, p: Step): ST {
  const s = q(p.u, p.v), V = BigInt(p.v);
  const r = nearestOn(x, n => Qn.mul(s, q(n)), n => n % V === 0n);
  const N = Qn.div(r.at, s).n;
  return { N, level: q(N), at: r.at, near: [r.up, ...(r.down ? [r.down] : [])], why: `the multiple of ${p.u}/${p.v} nearest ${mixed(x)} is ${N} × ${p.u}/${p.v} = ${mixed(r.at)}` };
}
const space: ParamSpace<Step> = {
  size: (() => { let n = 0; for (let v = 2; v <= VMAX; v++) for (let u = 1; u < 2 * v; u++) if (gcd(BigInt(u), BigInt(v)) === 1n) n++; return n; })(),
  hint: `u = …, v = …: the step u/v in lowest terms, v from 2 to ${VMAX}, u from 1 to 2v − 1; e.g. u = 3, v = 7`,
  draw: r => { for (;;) { const v = 2 + r.below(VMAX - 1), u = 1 + r.below(2 * v - 1); if (gcd(BigInt(u), BigInt(v)) === 1n) return { u, v }; } },
  parse(text) {
    const t = readFields(text, FIELDS);
    if ("invalid" in t) return t as { invalid: string };
    const v = wholeField(t.v, "v", 2, 1000);
    if (typeof v !== "number") return v;
    const u = wholeField(t.u, "u", 1, 2 * v - 1);
    if (typeof u !== "number") return u;
    return gcd(BigInt(u), BigInt(v)) === 1n ? { u, v } : { invalid: `${u}/${v} is not in lowest terms` };
  },
  label: p => writeFields(p, FIELDS),
};

export const drawnStep = treeFamily<Step, ST>({
  id: "tree-rep-step", title: "Drawn Step", depends: ["si", "crossing"], rep: "si", space,
  featured: [{ u: 3, v: 7 }, { u: 1, v: 2 }, { u: 5, v: 3 }, { u: 11, v: 12 }],
  mainTitle: "the multiple of the drawn step nearest the y-intercept, the bigger the better",
  main: p => `The targets are the whole-number multiples of ${p.u}/${p.v} that are not whole numbers: ${[1, 2, 3, 4].map(n => q(n * p.u, p.v)).filter(x => x.d !== 1n).slice(0, 3).map(mixed).join(", ")}, … (multiples of ${p.v} × ${p.u}/${p.v} = ${p.u} are left out). Find the target nearest the y-intercept, ignoring a minus sign. Count how many steps of ${p.u}/${p.v} it is: the more, the better.`,
  closeTitle: "how close the y-intercept is to that target",
  close: () => "The y-intercept (ignoring a minus sign) should be as close as possible to that target.",
  read: interceptReading,
  nearest: stepNear,
  draw: () => ({ from: ref("cart", "yInt"), target: at => ref("cart", "yAxisMark", { y: at }) }),
  thirds: [
    {
      layer: { id: "crossing", title: "the x-crossing's size near the number of steps", rep: "crossing", sense: "min",
        sentence: () => "Where the line crosses the x-axis (ignoring a minus sign) should be as close as possible to that number of steps." },
      evaluate: (ctx, r, t) => {
        const xr = ref("crossing", "x0"); ctx.read(xr);
        const X = r.m === null || r.c === null ? null : crossingOf(r.m, r.c);
        if (X === null) return further(ctx, "crossing", null, "a flat or vertical line has no x-crossing here", r.from[0]!, r.from);
        const d = Qn.abs(Qn.sub(Qn.abs(X), q(t.N)));
        further(ctx, "crossing", d, `the crossing's size ${mixed(Qn.abs(X))} is ${mixed(d)} from ${t.N}`, xr, [xr, ...r.from]);
      },
    },
    {
      layer: { id: "bottom", title: "the gradient's bottom number near v", rep: "si", sense: "min",
        sentence: p => `Write the gradient as a fraction in lowest terms. Its bottom number should be as close as possible to ${p.v} (a whole-number gradient has bottom number 1).` },
      evaluate: (ctx, r, _t, p) => {
        const mr = ref("si", "m");
        if (r.m === null) return further(ctx, "bottom", null, "a vertical line has no gradient", r.from[0]!, r.from);
        const d = Qn.abs(Qn.sub(q(r.m.d), q(p.v)));
        further(ctx, "bottom", d, `the gradient ${Qn.toWire(r.m)} has bottom number ${r.m.d}: ${mixed(d)} from ${p.v}`, mr, [mr]);
      },
    },
    {
      layer: { id: "whole-at-v", title: "the height at x = v near a whole number", rep: "si", sense: "min",
        sentence: p => `The line's height at x = ${p.v} should be as close as possible to a whole number.` },
      evaluate: (ctx, r, _t, p) => {
        if (r.m === null || r.c === null) return further(ctx, "whole-at-v", null, "a vertical line has no height at a point", r.from[0]!, r.from);
        const y = Qn.add(Qn.mul(r.m, q(p.v)), r.c), f = Qn.sub(y, q(Qn.floor(y))), d = Qn.cmp(f, q(1, 2)) <= 0 ? f : Qn.sub(Qn.ONE, f);
        const at = ref("cart", "pointAtX", { q: q(p.v) });
        ctx.term("whole-at-v", `at x = ${p.v} the height is ${mixed(y)}: ${mixed(d)} from a whole number`, d, [ref("si", "m"), ref("si", "c")]);
        ctx.mark({ kind: "focus", ref: at, term: "whole-at-v" });
      },
    },
  ],
});
