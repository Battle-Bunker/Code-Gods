/**
 * Two number-theory tree families (UNDEALT; docs/engine-v2/tree-families/).
 *
 * Smooth Mixed: (1) the whole part w of the target w + r/s nearest the line's height at a drawn x = k (ignoring a minus
 * sign), w built only from a drawn set of primes (1 counts: no primes at all), the bigger the better; (2) how close;
 * (3) the gradient's size near w's count of prime factors / the x-crossing's size near the divisor of w nearest it /
 * the y-intercept's size near a multiple of w's largest prime factor. Whole and fractional targets: the part r/s is
 * drawn, 0 included.
 *
 * Tower: (1) n of the target n + u/(n + v) nearest where the line meets the drawn line y = g·x (a parallel line reads
 * its y-intercept), the bigger the better; (2) how close; (3) the y-intercept's size near the target's top as one
 * fraction (n² + v·n + u) / the gradient's fraction part near u/(n + v) / the gradient's bottom number near n + v.
 */
import { gcd, Qn, q, readFields, ref, writeFields, type ParamSpace, type Q } from "@workspace/v2-core";
import { isPrime, largestPrimeFactor, primeFactorCount } from "./numbers.ts";
import { crossingOf, further, mixed, nearestOn, siReading, treeFamily, wholeField, type Target } from "./tree-nt-shared.ts";

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19];

// ---------------------------------------------------------------- Smooth Mixed

export type Smooth = { k: number; primes: number[]; top: number; bottom: number };
/** The whole numbers built only from these primes (1 included), in order, up to `max`. */
export function smoothUpTo(primes: readonly number[], max: bigint): bigint[] {
  let out = [1n];
  for (const p of primes) {
    const P = BigInt(p), next: bigint[] = [];
    for (const x of out) for (let y = x; y <= max; y *= P) next.push(y);
    out = next;
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
type SM = Target & { w: bigint };
export function smoothNear(x: Q, p: Smooth): SM {
  const f = q(p.top, p.bottom), min = BigInt(Math.min(...p.primes));
  // Up to the smooth number past the one above x (the next smooth number after w is at most w × the smallest prime).
  const list = smoothUpTo(p.primes, ((Qn.floor(x) + 2n) * min + min) * min), last = list[list.length - 1]!;
  // Past the list the ladder only needs to keep rising (the search never picks there).
  const w = (n: bigint) => (n <= BigInt(list.length) ? list[Number(n) - 1]! : last * 2n ** (n - BigInt(list.length)));
  const r = nearestOn(x, n => Qn.add(q(w(n)), f));
  const wh = Qn.floor(r.at);
  return { w: wh, level: q(wh), at: r.at, near: [r.up, ...(r.down ? [r.down] : [])], why: `the target nearest ${mixed(x)} is ${mixed(r.at)}: its whole part ${wh}${wh === 1n ? "" : ` = ${factorText(wh)}`}` };
}
const factorText = (w: bigint): string => { const out: string[] = []; let n = w; for (let p = 2n; n > 1n; p++) while (n % p === 0n) { out.push(String(p)); n /= p; } return out.join(" × "); };
const SFIELDS = ["k", "primes", "part"] as const;
const parts = (() => { const out: [number, number][] = [[0, 1]]; for (let s = 2; s <= 8; s++) for (let r = 1; r < s; r++) if (gcd(BigInt(r), BigInt(s)) === 1n) out.push([r, s]); return out; })();
const sets = (() => { const out: number[][] = []; for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) { out.push([PRIMES[a]!, PRIMES[b]!]); for (let c = b + 1; c < 8; c++) out.push([PRIMES[a]!, PRIMES[b]!, PRIMES[c]!]); } return out; })();
const smoothSpace: ParamSpace<Smooth> = {
  size: 18 * sets.length * parts.length,
  hint: "k = …, primes = …, part = …: the x to read (±1 to ±9), 2 or 3 primes up to 19 joined by dots, and the fraction part (0, or a fraction below 1 with bottom up to 8); e.g. k = 2, primes = 2.3, part = 1/4",
  draw: r => { const k = (1 + r.below(9)) * (r.bit() ? 1 : -1), [t, b] = parts[r.below(parts.length)]!; return { k, primes: sets[r.below(sets.length)]!, top: t, bottom: b }; },
  parse(text) {
    const t = readFields(text, SFIELDS);
    if ("invalid" in t) return t as { invalid: string };
    const k = wholeField(t.k, "k", -9, 9);
    if (typeof k !== "number" || k === 0) return typeof k === "number" ? { invalid: "k: ±1 to ±9" } : k;
    const ps = t.primes!.split(/[.·*x]/).map(Number);
    if (ps.length < 1 || ps.length > 4 || ps.some(n => !Number.isInteger(n) || n > 97 || !isPrime(BigInt(n))) || new Set(ps).size !== ps.length) return { invalid: "primes: 1 to 4 different primes below 100, joined by dots (2.3.7)" };
    const m = /^(\d+)(?:\/(\d+))?$/.exec(t.part!);
    if (!m) return { invalid: "part: 0 or a fraction below 1 (1/4)" };
    const top = Number(m[1]), bottom = Number(m[2] ?? "1");
    if (!(top === 0 && bottom === 1) && !(bottom >= 2 && top >= 1 && top < bottom && gcd(BigInt(top), BigInt(bottom)) === 1n)) return { invalid: "part: 0 or a fraction below 1 in lowest terms" };
    return { k, primes: [...ps].sort((a, b) => a - b), top, bottom };
  },
  label: p => writeFields({ k: p.k, primes: p.primes.join("."), part: p.top === 0 ? "0" : `${p.top}/${p.bottom}` }, SFIELDS),
};
export const smoothMixed = treeFamily<Smooth, SM>({
  id: "tree-nt-smooth-mixed", title: "Smooth Mixed", depends: ["si", "crossing"], rep: "si", space: smoothSpace,
  featured: [{ k: 2, primes: [2, 3], top: 1, bottom: 4 }, { k: -1, primes: [3, 17], top: 0, bottom: 1 }, { k: 3, primes: [2, 5, 7], top: 2, bottom: 3 }, { k: 1, primes: [5, 11], top: 1, bottom: 2 }],
  mainTitle: "the whole part of the smooth target nearest the height at x = k, the bigger the better",
  main: p => {
    const f = p.top === 0 ? "" : ` plus ${p.top}/${p.bottom}`, eg = smoothUpTo(p.primes, 100n).slice(0, 5).map(w => mixed(Qn.add(q(w), q(p.top, p.bottom))));
    return `Find the line's height at x = ${p.k}, ignoring a minus sign. The targets are the whole numbers made by multiplying only ${p.primes.join(", ")} (any number of times; 1 counts)${f}: ${eg.join(", ")}, … Find the target nearest that height. The bigger its whole part, the better.`;
  },
  closeTitle: "how close the height is to that target",
  close: () => "The height should be as close as possible to that target.",
  read: (ctx, p) => siReading(ctx, (m, c) => Qn.add(Qn.mul(m, q(p.k)), c), "a vertical line has no height at a point"),
  nearest: smoothNear,
  draw: (_r, p) => ({ from: ref("cart", "pointAtX", { q: q(p.k) }), target: at => ref("cart", "mark", { x: q(p.k), y: at }) }),
  thirds: [
    {
      layer: { id: "count", title: "the gradient's size near the target's count of prime factors", rep: "si", sense: "min",
        sentence: () => "Count the prime factors of the target's whole part (12 = 2 × 2 × 3 has three). The gradient (ignoring a minus sign) should be as close as possible to that count." },
      evaluate: (ctx, r, t) => {
        const n = primeFactorCount(t.w), d = Qn.abs(Qn.sub(Qn.abs(r.m!), q(n)));
        further(ctx, "count", d, `${t.w} has ${n} prime factors; the gradient's size ${mixed(Qn.abs(r.m!))} is ${mixed(d)} from ${n}`, ref("si", "m"), r.from);
      },
    },
    {
      layer: { id: "divisor", title: "the x-crossing's size near a divisor of the target's whole part", rep: "crossing", sense: "min",
        sentence: () => "Where the line crosses the x-axis (ignoring a minus sign) should be as close as possible to a number that divides the target's whole part exactly." },
      evaluate: (ctx, r, t) => {
        const xr = ref("crossing", "x0"); ctx.read(xr);
        const X = crossingOf(r.m!, r.c!);
        if (X === null) return further(ctx, "divisor", null, "a flat line never crosses the x-axis", xr, r.from);
        const a = Qn.abs(X);
        let best = Qn.abs(Qn.sub(a, Qn.ONE));
        for (let e = 1n; e * e <= t.w; e++) if (t.w % e === 0n) for (const dv of [e, t.w / e]) { const d = Qn.abs(Qn.sub(a, q(dv))); if (Qn.cmp(d, best) < 0) best = d; }
        further(ctx, "divisor", best, `the crossing's size ${mixed(a)} is ${mixed(best)} from a divisor of ${t.w}`, xr, [xr, ...r.from]);
      },
    },
    {
      layer: { id: "multiple", title: "the y-intercept's size near a multiple of the target's largest prime factor", rep: "si", sense: "min",
        sentence: () => "Take the largest prime factor of the target's whole part (1 has none: use 1). The y-intercept (ignoring a minus sign) should be as close as possible to a multiple of it." },
      evaluate: (ctx, r, t) => {
        const g = t.w === 1n ? 1n : largestPrimeFactor(t.w), a = Qn.abs(r.c!), k = Qn.floor(Qn.div(a, q(g))), lo = Qn.sub(a, q(k * g)), d = Qn.cmp(lo, Qn.sub(q(g), lo)) <= 0 ? lo : Qn.sub(q(g), lo);
        further(ctx, "multiple", d, `the y-intercept's size ${mixed(a)} is ${mixed(d)} from a multiple of ${g}`, ref("si", "c"), r.from);
      },
    },
  ],
});

// ---------------------------------------------------------------- Tower

export type Tower = { g: string; u: number; v: number };
const GS = ["1", "-1", "2", "-2", "3", "-3", "1/2", "-1/2", "1/3", "-1/3", "2/3", "-2/3", "3/2", "-3/2"];
const gOf = (p: Tower): Q => Qn.parse(p.g);
type TT = Target & { n: bigint };
const first = (p: Tower) => BigInt(Math.max(1, p.u - p.v + 1));
export function towerNear(x: Q, p: Tower): TT {
  const n0 = first(p) - 1n, at = (i: bigint) => { const n = n0 + i; return Qn.add(q(n), q(p.u, n + BigInt(p.v))); };
  const r = nearestOn(x, at), n = Qn.floor(r.at);
  return { n, level: q(n), at: r.at, near: [r.up, ...(r.down ? [r.down] : [])], why: `the target nearest ${mixed(x)} is ${n} + ${p.u}/${n + BigInt(p.v)} = ${mixed(r.at)}` };
}
const TFIELDS = ["g", "u", "v"] as const;
const towerSpace: ParamSpace<Tower> = {
  size: GS.length * 9 * 10,
  hint: `g = …, u = …, v = …: the line y = g·x (g one of ${GS.join(", ")}), and the targets n + u/(n + v), u 1 to 9, v 0 to 9; e.g. g = 2, u = 1, v = 0`,
  draw: r => ({ g: GS[r.below(GS.length)]!, u: 1 + r.below(9), v: r.below(10) }),
  parse(text) {
    const t = readFields(text.replace(/−/g, "-"), TFIELDS);
    if ("invalid" in t) return t as { invalid: string };
    if (!GS.includes(t.g!)) return { invalid: `g: one of ${GS.join(", ")}` };
    const u = wholeField(t.u, "u", 1, 9), v = wholeField(t.v, "v", 0, 9);
    if (typeof u !== "number") return u;
    if (typeof v !== "number") return v;
    return { g: t.g!, u, v };
  },
  label: p => writeFields(p, TFIELDS),
};
export const tower = treeFamily<Tower, TT>({
  id: "tree-nt-tower", title: "Tower", depends: ["si"], rep: "cart", space: towerSpace,
  featured: [{ g: "2", u: 1, v: 0 }, { g: "-1/2", u: 3, v: 1 }, { g: "3/2", u: 2, v: 5 }, { g: "-3", u: 7, v: 0 }],
  mainTitle: "n of the target n + u/(n + v) nearest where the line meets y = g·x, the bigger the better",
  main: p => `Find where the line meets the line y = ${p.g}·x, and read its x, ignoring a minus sign (a line parallel to it never meets it: read its y-intercept instead). The targets are a whole number n plus ${p.u}/(n + ${p.v}): ${[0n, 1n, 2n].map(i => mixed(Qn.add(q(first(p) + i), q(p.u, first(p) + i + BigInt(p.v))))).join(", ")}, … Find the target nearest. The bigger its n, the better.`,
  closeTitle: "how close the meeting point's x is to that target",
  close: () => "The meeting point's x (ignoring a minus sign) should be as close as possible to that target.",
  read: (ctx, p) => {
    const r = siReading(ctx, (m, c) => { const g = gOf(p); return Qn.cmp(m, g) === 0 ? c : Qn.div(c, Qn.sub(g, m)); }, "");
    if (!("none" in r) && r.m !== null && Qn.cmp(r.m, gOf(p)) === 0) return { ...r, flat: true };
    return r;
  },
  nearest: towerNear,
  draw: (r, p) => (r.flat ? { from: ref("cart", "yInt"), target: at => ref("cart", "yAxisMark", { y: at }) }
    : { from: ref("cart", "pointAtX", { q: Qn.div(r.c!, Qn.sub(gOf(p), r.m!)) }), target: at => ref("cart", "mark", { x: at, y: Qn.mul(gOf(p), at) }) }),
  thirds: [
    {
      layer: { id: "top", title: "the y-intercept's size near the target's top as one fraction", rep: "si", sense: "min",
        sentence: p => `Write the target as one fraction: (n × (n + ${p.v}) + ${p.u}) / (n + ${p.v}). The y-intercept (ignoring a minus sign) should be as close as possible to its top.` },
      evaluate: (ctx, r, t, p) => {
        const top = t.n * (t.n + BigInt(p.v)) + BigInt(p.u), d = Qn.abs(Qn.sub(Qn.abs(r.c!), q(top)));
        further(ctx, "top", d, `the target is ${top}/${t.n + BigInt(p.v)}; the y-intercept's size ${mixed(Qn.abs(r.c!))} is ${mixed(d)} from ${top}`, ref("si", "c"), r.from);
      },
    },
    {
      layer: { id: "part", title: "the gradient's fraction part near the target's", rep: "si", sense: "min",
        sentence: p => `The gradient's fraction part (ignoring a minus sign: 7/3 has 1/3) should be as close as possible to the target's, ${p.u}/(n + ${p.v}).` },
      evaluate: (ctx, r, t, p) => {
        const a = Qn.abs(r.m!), f = Qn.sub(a, q(Qn.floor(a))), want = q(p.u, t.n + BigInt(p.v)), d = Qn.abs(Qn.sub(f, want));
        further(ctx, "part", d, `the gradient's fraction part ${mixed(f)} is ${mixed(d)} from ${mixed(want)}`, ref("si", "m"), r.from);
      },
    },
    {
      layer: { id: "bottom", title: "the gradient's bottom number near the target's", rep: "si", sense: "min",
        sentence: p => `Write the gradient as a fraction in lowest terms. Its bottom number should be as close as possible to the target's bottom, n + ${p.v}.` },
      evaluate: (ctx, r, t, p) => {
        const want = t.n + BigInt(p.v), d = Qn.abs(Qn.sub(q(r.m!.d), q(want)));
        further(ctx, "bottom", d, `the gradient's bottom number ${r.m!.d} is ${mixed(d)} from ${want}`, ref("si", "m"), r.from);
      },
    },
  ],
});
