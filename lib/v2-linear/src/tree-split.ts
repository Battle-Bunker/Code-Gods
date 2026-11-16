/**
 * Cabal-splitting tree families (UNDEALT; docs/engine-v2/tree-families/splitters.md). The interaction census found the
 * pool's cooperation was mostly one shared direction, bigger (every "size of the nearest target" primary rewards a big
 * reading). These read differently:
 *
 * - Root Tilt: the gradient's size should agree with √D (D drawn, not a square) in as many leading digits as possible.
 *   A pull toward a finite value: it fights both steepening and flattening climbs. Unbounded by construction: √D is
 *   irrational, so a closer fraction always exists and each further digit needs about ten times the precision.
 * - Surd Intercept: the y-intercept's size should agree with (a + √D)/b (the golden ratio is a = 1, D = 5, b = 2) in as
 *   many leading digits as possible. A pin against every rule that wants a big y-intercept.
 * - Near Origin: one over the x-crossing's distance from (0, 0), |m| / |c|, against the whole numbers leaving r when
 *   divided by q, the bigger the better: a reading that grows only as the crossing shrinks (against Prime Landing, Whole
 *   Crossing and the areas), the census's missing adversary, coupled through the gradient as well as the intercept.
 *
 * Digits are counted on the decimal expansions, 80 places after the point (a cap no line in a game nears).
 */
import { Qn, q, readFields, ref, writeFields, type ParamSpace, type Q } from "@workspace/v2-core";
import { isqrt } from "./numbers.ts";
import { crossingOf, further, interceptReading, mixed, nearestOn, siReading, treeFamily, wholeField, type Target } from "./tree-nt-shared.ts";

const PLACES = 80n, SCALE = 10n ** PLACES;
/** ⌊(a + √D)/b × 10^80⌋, exactly. */
const surdScaled = (a: number, D: number, b: number): bigint => (BigInt(a) * SCALE + isqrt(BigInt(D) * SCALE * SCALE)) / BigInt(b);
/** ⌊x × 10^80⌋ for x ≥ 0. */
const scaled = (x: Q): bigint => (x.n < 0n ? -x.n : x.n) * SCALE / x.d;
/** The decimal expansion to 80 places, as a string of digits with the point dropped, and where the point was. */
const digitsOf = (v: bigint): { s: string; int: number } => { const s = v.toString().padStart(Number(PLACES) + 1, "0"); return { s, int: s.length - Number(PLACES) }; };
/**
 * How many leading digits x and t agree in (both written in decimals; leading zeros of a number below 1 count as digits
 * only after the point: 0.0712 against 0.0745 agree in "0.07", two digits after the 0). 0 when their whole parts have
 * different lengths.
 */
export function agreeingDigits(x: Q, tScaled: bigint): number {
  const a = digitsOf(scaled(x)), b = digitsOf(tScaled);
  if (a.int !== b.int) return 0;
  let k = 0, started = false;
  for (let i = 0; i < a.s.length; i++) {
    if (a.s[i] !== b.s[i]) break;
    if (a.s[i] !== "0" || started || i >= a.int) { started = true; k++; }
  }
  return k;
}
const fromScaled = (v: bigint): Q => q(v, SCALE);
const show = (v: bigint, places = 8): string => { const { s, int } = digitsOf(v); return `${s.slice(0, int).replace(/^0+(?=\d)/, "")}.${s.slice(int, int + places)}…`; };
const isSquare = (n: number) => { const r = Math.round(Math.sqrt(n)); return r * r === n; };

// ---------------------------------------------------------------- digit families (Root Tilt, Surd Intercept)

type DT = Target & { k: number; t: bigint };
/** The second layer of a digit family: how far apart the first digits that differ are (0 to 9). */
function digitGap(x: Q, t: DT): { d: Q; why: string } {
  const a = digitsOf(scaled(x)), b = digitsOf(t.t);
  if (a.int !== b.int) return { d: q(9), why: "the whole parts have different lengths" };
  for (let i = 0; i < a.s.length; i++) if (a.s[i] !== b.s[i]) { const g = Math.abs(Number(a.s[i]) - Number(b.s[i])); return { d: q(g), why: `the first digits that differ are ${a.s[i]} and ${b.s[i]}: ${g} apart` }; }
  return { d: q(0), why: "every digit agrees" };
}
const digitTarget = (x: Q, t: bigint, name: string): DT => {
  const k = agreeingDigits(x, t);
  return { k, t, level: q(k), at: fromScaled(t), near: [], why: `${mixed(x)} agrees with ${name} = ${show(t)} in ${k} digit${k === 1 ? "" : "s"}` };
};

export type RootTilt = { D: number };
const DMAX = 999;
const rootSpace: ParamSpace<RootTilt> = {
  size: DMAX - 1 - (Math.floor(Math.sqrt(DMAX)) - 1),
  hint: `D = a whole number from 2 to ${DMAX} that is not a square; e.g. D = 7`,
  draw: r => { for (;;) { const D = 2 + r.below(DMAX - 1); if (!isSquare(D)) return { D }; } },
  parse(text) {
    const t = readFields(text, ["D"]);
    if ("invalid" in t) return t as { invalid: string };
    const D = wholeField(t.D, "D", 2, 99_999);
    return typeof D !== "number" ? D : isSquare(D) ? { invalid: `${D} is a square: its root is whole` } : { D };
  },
  label: p => writeFields(p, ["D"]),
};
export const rootTilt = treeFamily<RootTilt, DT>({
  id: "tree-split-root-tilt", title: "Root Tilt", depends: ["si", "crossing"], rep: "si", space: rootSpace,
  featured: [{ D: 2 }, { D: 7 }, { D: 13 }, { D: 150 }],
  mainTitle: "how many leading digits the gradient's size shares with √D",
  main: p => `The gradient, ignoring its sign, should agree with √${p.D} = ${show(surdScaled(0, p.D, 1))} in as many leading digits as possible (the whole part counts: 2.65 agrees with 2.6457… in 3 digits). More digits are better.`,
  closeTitle: "how near the first differing digits are",
  close: () => "At the first digit that differs, the two digits should be as near as possible (a 4 against a 5 is 1 apart).",
  closeness: digitGap,
  read: ctx => siReading(ctx, m => m, "a vertical line has no gradient"),
  nearest: (x, p) => digitTarget(x, surdScaled(0, p.D, 1), `√${p.D}`),
  draw: () => null,
  thirds: [
    {
      layer: { id: "intercept-D", title: "the y-intercept's size near D", rep: "si", sense: "min",
        sentence: p => `The y-intercept (ignoring its sign) should be as close as possible to ${p.D}: with the gradient near √${p.D}, the line then crosses the x-axis near √${p.D} too.` },
      evaluate: (ctx, r, _t, p) => { const d = Qn.abs(Qn.sub(Qn.abs(r.c!), q(p.D))); further(ctx, "intercept-D", d, `the y-intercept's size ${mixed(Qn.abs(r.c!))} is ${mixed(d)} from ${p.D}`, ref("si", "c"), r.from); },
    },
    {
      layer: { id: "east", title: "the x-crossing on the right, near √D", rep: "crossing", sense: "min",
        sentence: p => `The line should cross the x-axis on the right of (0, 0), as close as possible to √${p.D} (a crossing on the left counts its whole distance).` },
      evaluate: (ctx, r, t) => {
        const xr = ref("crossing", "x0"); ctx.read(xr);
        const X = crossingOf(r.m!, r.c!);
        if (X === null) return further(ctx, "east", null, "a flat line never crosses the x-axis", xr, r.from);
        // Against √D to six places after the point: a readable number (a millionth is far below any game's moves).
        const near6 = q(t.t / 10n ** (PLACES - 6n), 1_000_000n), d = Qn.abs(Qn.sub(X, near6));
        further(ctx, "east", d, `the crossing ${mixed(X)} is about ${Qn.toNumber(d).toPrecision(4)} from +${show(t.t, 6)}`, xr, [xr, ...r.from]);
      },
    },
    {
      layer: { id: "matched", title: "the y-intercept's whole part near the number of digits shared", rep: "si", sense: "min",
        sentence: () => "The y-intercept's whole part (ignoring its sign) should be as close as possible to the number of digits the gradient shares." },
      evaluate: (ctx, r, t) => { const w = Qn.floor(Qn.abs(r.c!)), d = Qn.abs(Qn.sub(q(w), q(t.k))); further(ctx, "matched", d, `the y-intercept's whole part ${w} is ${d.n} from ${t.k}`, ref("si", "c"), r.from); },
    },
  ],
});

export type Surd = { a: number; D: number; b: number };
const SFIELDS = ["a", "D", "b"] as const;
const surdSpace: ParamSpace<Surd> = {
  size: 10 * 9 * (99 - 1 - 8),
  hint: "a = 0 to 9, D = 2 to 99 not a square, b = 1 to 9: the target (a + √D) / b; e.g. a = 1, D = 5, b = 2 (the golden ratio)",
  draw: r => { for (;;) { const D = 2 + r.below(98); if (!isSquare(D)) return { a: r.below(10), D, b: 1 + r.below(9) }; } },
  parse(text) {
    const t = readFields(text, SFIELDS);
    if ("invalid" in t) return t as { invalid: string };
    const a = wholeField(t.a, "a", 0, 99), D = wholeField(t.D, "D", 2, 9_999), b = wholeField(t.b, "b", 1, 99);
    for (const x of [a, D, b]) if (typeof x !== "number") return x;
    return isSquare(D as number) ? { invalid: `${D} is a square` } : { a: a as number, D: D as number, b: b as number };
  },
  label: p => writeFields(p, SFIELDS),
};
const surdName = (p: Surd) => (p.a === 0 && p.b === 1 ? `√${p.D}` : `(${p.a} + √${p.D}) / ${p.b}`);
export const surdIntercept = treeFamily<Surd, DT>({
  id: "tree-split-surd-intercept", title: "Surd Intercept", depends: ["si"], rep: "si", space: surdSpace,
  featured: [{ a: 1, D: 5, b: 2 }, { a: 0, D: 2, b: 1 }, { a: 3, D: 13, b: 2 }, { a: 7, D: 61, b: 5 }],
  mainTitle: "how many leading digits the y-intercept's size shares with the drawn surd",
  main: p => `The y-intercept, ignoring its sign, should agree with ${surdName(p)} = ${show(surdScaled(p.a, p.D, p.b))} in as many leading digits as possible (the whole part counts). More digits are better.`,
  closeTitle: "how near the first differing digits are",
  close: () => "At the first digit that differs, the two digits should be as near as possible (a 4 against a 5 is 1 apart).",
  closeness: digitGap,
  read: interceptReading,
  nearest: (x, p) => digitTarget(x, surdScaled(p.a, p.D, p.b), surdName(p)),
  draw: () => ({ from: ref("cart", "yInt"), target: at => ref("cart", "yAxisMark", { y: at }) }),
  thirds: [
    {
      layer: { id: "gradient-b", title: "the gradient's size near b", rep: "si", sense: "min",
        sentence: p => `The gradient (ignoring its sign) should be as close as possible to ${p.b}.` },
      evaluate: (ctx, r, _t, p) => {
        if (r.m === null) return further(ctx, "gradient-b", null, "a vertical line has no gradient", r.from[0]!, r.from);
        const d = Qn.abs(Qn.sub(Qn.abs(r.m), q(p.b))); further(ctx, "gradient-b", d, `the gradient's size ${mixed(Qn.abs(r.m))} is ${mixed(d)} from ${p.b}`, ref("si", "m"), r.from);
      },
    },
    {
      layer: { id: "rising", title: "a rising line", rep: "si", sense: "min",
        sentence: () => "The line should rise from left to right: a falling line counts the size of its gradient, a flat one 1." },
      evaluate: (ctx, r) => {
        if (r.m === null) return further(ctx, "rising", null, "a vertical line has no gradient", r.from[0]!, r.from);
        const d = Qn.sign(r.m) > 0 ? Qn.ZERO : Qn.sign(r.m) === 0 ? Qn.ONE : Qn.abs(r.m);
        further(ctx, "rising", d, Qn.sign(r.m) > 0 ? "the line rises" : `the line ${Qn.sign(r.m) === 0 ? "is flat" : "falls"}: ${mixed(d)}`, ref("si", "m"), r.from);
      },
    },
    {
      layer: { id: "next-digit", title: "the gradient's whole part near the next digit of the surd", rep: "si", sense: "min",
        sentence: () => "Take the first digit of the surd the y-intercept does not yet share. The gradient's whole part (ignoring its sign) should be as close as possible to it." },
      evaluate: (ctx, r, t) => {
        if (r.m === null) return further(ctx, "next-digit", null, "a vertical line has no gradient", r.from[0]!, r.from);
        const ds = digitsOf(t.t).s.replace(/^0+/, ""), next = Number(ds[t.k] ?? "0"), w = Qn.floor(Qn.abs(r.m)), d = Qn.abs(Qn.sub(q(w), q(next)));
        further(ctx, "next-digit", d, `the next digit is ${next}; the gradient's whole part ${w} is ${d.n} from it`, ref("si", "m"), r.from);
      },
    },
  ],
});

// ---------------------------------------------------------------- Near Origin

export type NearOrigin = { q: number; r: number };
type NT = Target & { n: bigint };
export function nearOriginNear(x: Q, p: NearOrigin): NT {
  const Q0 = BigInt(p.q), R = BigInt(p.r), first = R === 0n ? Q0 : R;
  const at = (i: bigint) => q(first + (i - 1n) * Q0);
  const t = nearestOn(x, at), n = t.at.n;
  return { n, level: q(n), at: t.at, near: [t.up, ...(t.down ? [t.down] : [])], why: `1 over the crossing's distance is ${mixed(x)}; the nearest whole number leaving ${p.r} when divided by ${p.q} is ${n}` };
}
const NFIELDS = ["q", "r"] as const;
const nearSpace: ParamSpace<NearOrigin> = {
  size: (() => { let n = 0; for (let Q0 = 2; Q0 <= 30; Q0++) n += Q0; return n; })(),
  hint: "q = 2 to 30, r = 0 to q − 1: the targets are the whole numbers leaving r when divided by q; e.g. q = 7, r = 3",
  draw: r => { const Q0 = 2 + r.below(29); return { q: Q0, r: r.below(Q0) }; },
  parse(text) {
    const t = readFields(text, NFIELDS);
    if ("invalid" in t) return t as { invalid: string };
    const Q0 = wholeField(t.q, "q", 2, 999);
    if (typeof Q0 !== "number") return Q0;
    const R = wholeField(t.r, "r", 0, Q0 - 1);
    return typeof R === "number" ? { q: Q0, r: R } : R;
  },
  label: p => writeFields(p, NFIELDS),
};
const examples = (p: NearOrigin) => [1, 2, 3].map(i => (p.r === 0 ? p.q * i : p.r + (i - 1) * p.q)).join(", ");
export const nearOrigin = treeFamily<NearOrigin, NT>({
  id: "tree-split-near-origin", title: "Near Origin", depends: ["si", "crossing"], rep: "crossing", space: nearSpace,
  featured: [{ q: 7, r: 3 }, { q: 2, r: 1 }, { q: 10, r: 0 }, { q: 13, r: 5 }],
  mainTitle: "the target nearest one over the crossing's distance from (0, 0), the bigger the better",
  main: p => `Find where the line crosses the x-axis and take 1 over its distance from (0, 0) (a crossing at 1/4 or −1/4 gives 4). The targets are the whole numbers leaving ${p.r} when divided by ${p.q} (${examples(p)}, …). Find the target nearest that number: the bigger it is, the better (so the closer the crossing to (0, 0)).`,
  closeTitle: "how close one over the crossing's distance is to that target",
  close: () => "One over the crossing's distance should be as close as possible to that target.",
  read: ctx => siReading(ctx, (m, c) => (Qn.sign(c) === 0 ? null : Qn.div(m, c)), "a line through (0, 0) crosses there: 1 over 0 is not a number"),
  nearest: nearOriginNear,
  draw: () => null,
  thirds: [
    {
      layer: { id: "steep", title: "the gradient's size near the target", rep: "si", sense: "min",
        sentence: () => "The gradient (ignoring its sign) should be as close as possible to that target (then the y-intercept is about 1)." },
      evaluate: (ctx, r, t) => { const d = Qn.abs(Qn.sub(Qn.abs(r.m!), q(t.n))); further(ctx, "steep", d, `the gradient's size ${mixed(Qn.abs(r.m!))} is ${mixed(d)} from ${t.n}`, ref("si", "m"), r.from); },
    },
    {
      layer: { id: "whole-c", title: "the y-intercept near a whole number other than 0", rep: "si", sense: "min",
        sentence: () => "The y-intercept should be as close as possible to a whole number other than 0." },
      evaluate: (ctx, r) => {
        const a = Qn.abs(r.c!), f = Qn.sub(a, q(Qn.floor(a))), lo = Qn.floor(a) === 0n ? Qn.sub(Qn.ONE, a) : f, d = Qn.cmp(lo, Qn.sub(Qn.ONE, f)) <= 0 ? lo : Qn.sub(Qn.ONE, f);
        further(ctx, "whole-c", d, `the y-intercept ${mixed(r.c!)} is ${mixed(d)} from a whole number other than 0`, ref("si", "c"), r.from);
      },
    },
    {
      layer: { id: "west", title: "the crossing on the left", rep: "crossing", sense: "min",
        sentence: () => "The line should cross the x-axis on the left of (0, 0): a crossing on the right counts its distance, times the target." },
      evaluate: (ctx, r, t) => {
        const xr = ref("crossing", "x0"); ctx.read(xr);
        const X = crossingOf(r.m!, r.c!);
        if (X === null) return further(ctx, "west", null, "a flat line never crosses the x-axis", xr, r.from);
        const d = Qn.sign(X) < 0 ? Qn.ZERO : Qn.mul(X, q(t.n));
        further(ctx, "west", d, Qn.sign(X) < 0 ? "it crosses on the left" : `it crosses on the right at ${mixed(X)}: ${mixed(d)}`, xr, [xr, ...r.from]);
      },
    },
  ],
});

export const treeSplitFamilies = [rootTilt, surdIntercept, nearOrigin] as const;
