/** The line's nine mutators (spec §12.4). Prices are the call's code length; v2-core adds "which", "where" and the surcharge. */
import {
  choiceBits, gcd, nonzeroRatBits, Qn, q, sampleNonzeroRat, sampleStepsInt, sampleStepsNonzero, sampleStepsNonzeroRat, sampleStepsRat,
  stepsIntBits, stepsNonzeroBits, stepsNonzeroRatBits, stepsRatBits,
  type ArgCode, type Invalid, type Mutator, type Q, type Rng, type Variant,
} from "@workspace/v2-core";
import { fromMC, inDomain, intercept, isVertical, lineParams, normalise, slope, type Domain, type Line, type LineState } from "./line.ts";

export type Args = Readonly<Record<string, Q | string>>;

// ---------------------------------------------------------------- argument codes

interface Field {
  /** Every value priced at most maxBits (any order). */
  values(maxBits: number): (Q | string)[];
  bits(v: Q | string): number;
  sample(rng: Rng): Q | string | null;
  decode(w: unknown): Q | string;
}

function toQ(w: unknown): Q {
  if (typeof w === "number" || typeof w === "string" || typeof w === "bigint") return Qn.from(w);
  if (typeof w === "object" && w !== null) return Qn.from(w as Q);
  throw new TypeError("expected a number");
}
function inArgDomain(x: Q, d: Domain): Q {
  if (d === "Z" && x.d !== 1n) throw new RangeError("arguments on this board are whole numbers");
  return x;
}

/** Nonzero rationals p/q in lowest terms (or integers when d is "Z") whose price under `bits` is at most maxBits. */
function rationalsUpTo(d: Domain, bits: (x: Q) => number, maxBits: number): Q[] {
  const out: Q[] = [];
  for (let qq = 1n; qq <= (d === "Z" ? 1n : 64n); qq++) {
    let grew = false;
    for (let p = 1n; p <= 4096n; p++) {
      if (gcd(p, qq) !== 1n) continue;
      const x = q(p, qq);
      if (bits(x) > maxBits) break;
      grew = true;
      out.push(x, Qn.neg(x));
    }
    if (!grew && qq > 1n) break;
  }
  return out;
}

/** An amount added (owner decision 17: priced by steps, in proportion to its size): Z → steps on n, Q → on p and q. */
const nzBits = (d: Domain) => (v: Q): number => (d === "Z" ? stepsNonzeroBits(v.n) : stepsNonzeroRatBits(v));
const nz = (d: Domain): Field => ({
  values: max => rationalsUpTo(d, nzBits(d), max),
  bits: v => nzBits(d)(v as Q),
  sample: rng => (d === "Z" ? q(sampleStepsNonzero(rng)) : sampleStepsNonzeroRat(rng)),
  decode: w => { const x = inArgDomain(toQ(w), d); if (x.n === 0n) throw new RangeError("must not be 0"); return x; },
});
/** A position or displacement, possibly 0 (an anchor x0, a slide), priced by steps like an amount added. */
const anyNum = (d: Domain): Field => ({
  values: max => (max >= 1 ? [q(0), ...rationalsUpTo(d, x => 1 + nzBits(d)(x), max)] : []),
  bits: v => (d === "Z" ? stepsIntBits((v as Q).n) : stepsRatBits(v as Q)),
  sample: rng => (d === "Z" ? q(sampleStepsInt(rng)) : sampleStepsRat(rng)),
  decode: w => inArgDomain(toQ(w), d),
});
/** One of a few named choices. */
const oneOf = (values: readonly string[]): Field => ({
  values: max => (choiceBits(values.length) <= max ? [...values] : []),
  bits: () => choiceBits(values.length),
  sample: rng => values[rng.below(values.length)]!,
  decode: w => { if (typeof w !== "string" || !values.includes(w)) throw new RangeError(`must be one of ${values.join(", ")}`); return w; },
});
/** A multiplicative factor (priced by digits: its gamma code), any nonzero rational other than ±1. */
const factor = (_d: Domain): Field => ({
  values: max => rationalsUpTo("Q", nonzeroRatBits, max).filter(x => !(x.d === 1n && (x.n === 1n || x.n === -1n))),
  bits: v => nonzeroRatBits(v as Q),
  // ±1 are not factors: their code mass is left over (the walk stays put), not offered as a call.
  sample: rng => { const x = sampleNonzeroRat(rng); return x === null || (x.d === 1n && (x.n === 1n || x.n === -1n)) ? null : x; },
  decode: w => { const x = toQ(w); if (x.n === 0n || (x.d === 1n && (x.n === 1n || x.n === -1n))) throw new RangeError("must not be 0, 1 or −1"); return x; },
});

function fields(spec: Readonly<Record<string, Field>>): ArgCode<Args> {
  const names = Object.keys(spec);
  return {
    enumerate: maxBits => {
      // Every combination of field values whose prices add up to at most maxBits, cheapest first.
      let partial: { a: Record<string, Q | string>; bits: number }[] = [{ a: {}, bits: 0 }];
      for (const k of names) {
        const f = spec[k]!;
        const vals = f.values(maxBits).map(v => ({ v, bits: f.bits(v) }));
        const next: typeof partial = [];
        for (const p of partial) for (const { v, bits } of vals) if (p.bits + bits <= maxBits + 1e-9) next.push({ a: { ...p.a, [k]: v }, bits: p.bits + bits });
        partial = next;
      }
      return partial.sort((x, y) => x.bits - y.bits).map(x => x.a);
    },
    bits: a => names.reduce((t, k) => t + spec[k]!.bits(a[k]!), 0),
    sample: rng => {
      const out: Record<string, Q | string> = {};
      for (const k of names) { const v = spec[k]!.sample(rng); if (v === null) return null; out[k] = v; }
      return out;
    },
    encode: a => Object.fromEntries(names.map(k => [k, typeof a[k] === "string" ? (a[k] as string) : Qn.toWire(a[k] as Q)])),
    decode: w => {
      if (typeof w !== "object" || w === null) throw new TypeError("arguments must be an object");
      const rec = w as Record<string, unknown>;
      const extra = Object.keys(rec).filter(k => !names.includes(k));
      if (extra.length) throw new RangeError(`unknown argument ${extra[0]}`);
      const out: Record<string, Q | string> = {};
      for (const k of names) {
        if (!(k in rec)) throw new RangeError(`missing argument ${k}`);
        try { out[k] = spec[k]!.decode(rec[k]); } catch (e) { throw new RangeError(`${k} ${(e as Error).message}`); }
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------- helpers

const VERTICAL: Invalid = { invalid: "this move needs a line with a gradient (not a vertical line)" };
const argD = (v: Variant): Domain => lineParams(v).argDomain;
const Qa = (a: Args, k: string): Q => a[k] as Q;
const S = (a: Args, k: string): string => a[k] as string;

function replace(state: LineState, site: number, next: Line | Invalid, v: Variant): LineState | Invalid {
  const l = inDomain(next, lineParams(v));
  if ("invalid" in l) return l;
  const lines = state.lines.slice();
  lines[site] = l;
  return { lines };
}
/** The triple of a rational-coefficient equation A·x + B·y + C = 0. */
function fromRational(A: Q, B: Q, C: Q): Line | Invalid {
  const L = A.d * B.d * C.d;
  return normalise(A.n * (L / A.d), B.n * (L / B.d), C.n * (L / C.d));
}
const viaMC = (f: (m: Q, c: Q, a: Args) => [Q, Q]) =>
  (state: LineState, site: number, args: Args, v: Variant): LineState | Invalid => {
    const l = state.lines[site]!;
    if (isVertical(l)) return VERTICAL;
    const [m, c] = f(slope(l), intercept(l), args);
    return replace(state, site, fromMC(m, c), v);
  };

type M = Mutator<LineState, Args>;
const k = (a: Args) => Qa(a, "k");
const w = (x: Q) => Qn.toWire(x);

// ---------------------------------------------------------------- the nine

export const shift: M = {
  id: "si.shift", reps: ["si", "cart"], title: "move the line up or down", perSite: true,
  describe: a => `move the line ${Qn.sign(k(a)) > 0 ? "up" : "down"} ${w(Qn.abs(k(a)))}`,
  args: v => fields({ k: nz(argD(v)) }),
  apply: viaMC((m, c, a) => [m, Qn.add(c, k(a))]),
  inverse: { kind: "mutator", id: "si.shift", args: a => ({ k: Qn.neg(k(a)) }) },
};

export const tilt: M = {
  id: "si.tilt", reps: ["si", "mach"], title: "change the gradient, keeping the y-intercept", perSite: true,
  describe: a => `add ${w(k(a))} to the gradient`,
  args: v => fields({ k: nz(argD(v)) }),
  apply: viaMC((m, c, a) => [Qn.add(m, k(a)), c]),
  inverse: { kind: "mutator", id: "si.tilt", args: a => ({ k: Qn.neg(k(a)) }) },
};

export const step: M = {
  id: "seq.step", reps: ["seq"], title: "change the pattern's step, keeping term 1", perSite: true,
  describe: a => `add ${w(k(a))} to the step`,
  args: v => fields({ k: nz(argD(v)) }),
  apply: viaMC((m, c, a) => [Qn.add(m, k(a)), Qn.sub(c, k(a))]),
  inverse: { kind: "mutator", id: "seq.step", args: a => ({ k: Qn.neg(k(a)) }) },
};

export const pivot: M = {
  id: "cart.pivot", reps: ["cart"], title: "turn the line about its point at x = x0", perSite: true,
  describe: a => `turn about the point at x = ${w(Qa(a, "x0"))}, gradient ${Qn.sign(k(a)) > 0 ? "+" : "−"}${w(Qn.abs(k(a)))}`,
  args: v => fields({ x0: anyNum(argD(v)), k: nz(argD(v)) }),
  apply: viaMC((m, c, a) => [Qn.add(m, k(a)), Qn.sub(c, Qn.mul(k(a), Qa(a, "x0")))]),
  inverse: { kind: "mutator", id: "cart.pivot", args: a => ({ x0: Qa(a, "x0"), k: Qn.neg(k(a)) }) },
};

export const slide: M = {
  id: "cart.slide", reps: ["cart"], title: "slide the line across the plane", perSite: true,
  describe: a => `slide by (${w(Qa(a, "u"))}, ${w(Qa(a, "v"))})`,
  args: v => fields({ u: anyNum(argD(v)), v: anyNum(argD(v)) }),
  apply: (state, site, a, v) => {
    const l = state.lines[site]!;
    // a(x − u) + b(y − v) + c = 0
    const C = Qn.sub(Qn.sub(q(l.c), Qn.mul(q(l.a), Qa(a, "u"))), Qn.mul(q(l.b), Qa(a, "v")));
    return replace(state, site, fromRational(q(l.a), q(l.b), C), v);
  },
  inverse: { kind: "mutator", id: "cart.slide", args: a => ({ u: Qn.neg(Qa(a, "u")), v: Qn.neg(Qa(a, "v")) }) },
};

const AXES = ["x", "y", "origin", "diagonal"] as const;
export const mirror: M = {
  id: "cart.mirror", reps: ["cart"], title: "reflect the line", perSite: true,
  describe: a => ({ x: "reflect in the x-axis", y: "reflect in the y-axis", origin: "turn half a turn about the origin", diagonal: "reflect in y = x (swap x and y)" })[S(a, "axis") as (typeof AXES)[number]],
  args: () => fields({ axis: oneOf(AXES) }),
  apply: (state, site, a, v) => {
    const { a: A, b: B, c: C } = state.lines[site]!;
    const t = ({ x: [A, -B, C], y: [-A, B, C], origin: [-A, -B, C], diagonal: [B, A, C] } as const)[S(a, "axis") as (typeof AXES)[number]];
    return replace(state, site, normalise(t[0], t[1], t[2]), v);
  },
  inverse: { kind: "self" },
};

const COEFS = ["a", "b", "c"] as const;
export const nudge: M = {
  id: "gen.nudge", reps: ["gen"], title: "add to one number of ax + by + c = 0", perSite: true,
  describe: a => `add ${w(k(a))} to ${S(a, "which")}`,
  args: () => fields({ which: oneOf(COEFS), k: nz("Z") }),
  apply: (state, site, a, v) => {
    const l = state.lines[site]!;
    const d = k(a).n, which = S(a, "which");
    const na = l.a + (which === "a" ? d : 0n), nb = l.b + (which === "b" ? d : 0n), nc = l.c + (which === "c" ? d : 0n);
    // A result with a common factor would be divided through: a one-way division with no inverse nudge, which breaks
    // the exact potential (owner decision 19; analytic-calibration.md §2). Such a nudge is refused.
    if (gcd(gcd(na < 0n ? -na : na, nb < 0n ? -nb : nb), nc < 0n ? -nc : nc) !== 1n) return { invalid: `adding ${d} leaves ${na}, ${nb}, ${nc} with a common factor` };
    // Likewise a result whose sign would be flipped (b < 0, or b = 0 and a < 0): its undoing nudge would not be −k.
    if (nb < 0n || (nb === 0n && na < 0n)) return { invalid: `adding ${d} would turn the line's equation over` };
    return replace(state, site, normalise(na, nb, nc), v);
  },
  inverse: { kind: "partial", id: "gen.nudge", args: a => ({ ...a, k: Qn.neg(k(a)) }), note: "refused where the result would leave the domain" },
};

export const move: M = {
  id: "int.move", reps: ["int"], title: "move one intercept, keeping the other", perSite: true,
  describe: a => `move the ${S(a, "axis")}-intercept by ${w(k(a))}`,
  args: v => fields({ axis: oneOf(["x", "y"]), k: nz(argD(v)) }),
  apply: (state, site, a, v) => {
    const l = state.lines[site]!;
    if (l.a === 0n || l.b === 0n || l.c === 0n) return { invalid: "this move needs a line that crosses both axes away from the origin" };
    let p = q(-l.c, l.a), r = q(-l.c, l.b);
    if (S(a, "axis") === "x") p = Qn.add(p, k(a)); else r = Qn.add(r, k(a));
    if (Qn.isZero(p) || Qn.isZero(r)) return { invalid: "an intercept of 0 would put the line through the origin" };
    // x/p + y/r − 1 = 0
    return replace(state, site, fromRational(Qn.inv(p), Qn.inv(r), q(-1)), v);
  },
  inverse: { kind: "partial", id: "int.move", args: a => ({ axis: S(a, "axis"), k: Qn.neg(k(a)) }), note: "undone wherever the line still crosses both axes" },
};

export const stretch: M = {
  id: "mach.stretch", reps: ["mach"], title: "multiply every output by a factor", perSite: true,
  describe: a => `multiply every output by ${w(Qa(a, "f"))}`,
  args: v => fields({ f: factor(argD(v)) }),
  apply: viaMC((m, c, a) => [Qn.mul(m, Qa(a, "f")), Qn.mul(c, Qa(a, "f"))]),
  inverse: { kind: "partial", id: "mach.stretch", args: a => ({ f: Qn.inv(Qa(a, "f")) }), note: "undone by the reciprocal factor, at the same price, wherever it keeps the line on the board" },
};

export const mutators: readonly M[] = [shift, tilt, step, pivot, slide, mirror, nudge, move, stretch];
