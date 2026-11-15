/** The line's nine mutators (spec §12.4). Prices are the call's code length; v2-core adds "which", "where" and the surcharge. */
import {
  amountCode, amountSize, choiceBits, whichBits, factorCode, factorSize, gcd, mixedIntBits, mixedPosBits, nonzeroRatBits, Qn, q, ratBits, sampleAmount,
  sampleDisplacement, sampleFactor, sampleMixedInt, sampleNonzeroRat, sampleRat, sampleStepsInt, sampleStepsRat, stepsIntBits, stepsRatBits,
  type ArgCode, type Invalid, type Mutator, type Q, type Rng, type Variant,
} from "@workspace/v2-core";
import { isqrt as isqrtBig } from "./numbers.ts";
import { decodeLine, describeLine, encodeLine, fromMC, inDomain, LINE_Q_CODES, intercept, isVertical, lineParams, normalise, slope, yAt, type Domain, type Line, type LineState } from "./line.ts";

export type Args = Readonly<Record<string, Q | string>>;

// ---------------------------------------------------------------- argument codes
//
// A call's arguments are choices (which coefficient, which axis, a pivot's x0), priced as before, and at most one size
// (how far: an amount added, a slide, a factor), priced against everything else in the call (v2-core codes.ts, "far
// moves are dear"): with o the bits of which + where + the choices, a size σ costs rate(o)·σ − o, so the call's whole
// fee is rate(o)·σ, and a move of size n costs exactly n unit moves.

export interface Field {
  /** Every value priced at most maxBits (any order). */
  values(maxBits: number): (Q | string)[];
  bits(v: Q | string): number;
  sample(rng: Rng): Q | string | null;
  decode(w: unknown): Q | string;
}

/** The size part of a call: one or two named numbers, priced given o, the bits of the rest of the call. */
export interface Size {
  readonly names: readonly string[];
  bits(vals: readonly Q[], o: number): number;
  /** Every value priced at most maxBits given o. */
  values(o: number, maxBits: number): Q[][];
  sample(rng: Rng, o: number): Q[] | null;
  decode(ws: readonly unknown[]): Q[];
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
      if (bits(x) > maxBits + 1e-9) break;
      grew = true;
      out.push(x, Qn.neg(x));
    }
    if (!grew && qq > 1n) break;
  }
  return out;
}

const decodeNonzero = (w: unknown, d: Domain): Q => { const x = inArgDomain(toQ(w), d); if (x.n === 0n) throw new RangeError("must not be 0"); return x; };

/** An amount added (an amount code: size |p| + q − 1, a whole number's size its absolute value). */
const amount = (d: Domain): Size => ({
  names: ["k"],
  bits: ([x], o) => amountCode(o, 1, d === "Q").bits(amountSize(x!)),
  values: (o, max) => { const c = amountCode(o, 1, d === "Q"); return rationalsUpTo(d, x => c.bits(amountSize(x)), max).map(x => [x]); },
  sample: (rng, o) => { const x = sampleAmount(rng, o, d === "Q"); return x && [x]; },
  decode: ([w]) => [decodeNonzero(w, d)],
});
/** A slide (u, v), not both 0: size σ(u) + σ(v). */
const displacement = (d: Domain): Size => ({
  names: ["u", "v"],
  bits: ([u, v], o) => amountCode(o, 2, d === "Q").bits(amountSize(u!) + amountSize(v!)),
  values: (o, max) => {
    const c = amountCode(o, 2, d === "Q");
    const xs = [q(0), ...rationalsUpTo(d, x => c.bits(amountSize(x)), max)];
    return xs.flatMap(u => xs.map(v => [u, v])).filter(([u, v]) => !(Qn.isZero(u!) && Qn.isZero(v!)) && c.bits(amountSize(u!) + amountSize(v!)) <= max + 1e-9);
  },
  sample: (rng, o) => sampleDisplacement(rng, o, d === "Q"),
  decode: ([wu, wv]) => {
    const u = inArgDomain(toQ(wu), d), v = inArgDomain(toQ(wv), d);
    if (Qn.isZero(u) && Qn.isZero(v)) throw new RangeError("must not both be 0");
    return [u, v];
  },
});
/** A multiplicative factor, any nonzero rational other than ±1, priced by its digits: size log2(|p|·q). */
const isUnit = (x: Q) => x.d === 1n && (x.n === 1n || x.n === -1n);
const factor: Size = {
  names: ["f"],
  bits: ([x], o) => factorCode(o).bits(factorSize(x!)),
  values: (o, max) => { const c = factorCode(o); return rationalsUpTo("Q", x => c.bits(factorSize(x)), max).filter(x => !isUnit(x)).map(x => [x]); },
  sample: (rng, o) => { const x = sampleFactor(rng, o); return x && [x]; },
  decode: ([w]) => { const x = toQ(w); if (x.n === 0n || isUnit(x)) throw new RangeError("must not be 0, 1 or −1"); return [x]; },
};
/** A position (a pivot's x0), possibly 0: a choice, priced by steps (owner decision 17). */
const position = (d: Domain): Field => ({
  values: max => (max >= 1 ? [q(0), ...rationalsUpTo(d, x => (d === "Z" ? stepsIntBits(x.n) : stepsRatBits(x)), max)] : []),
  bits: v => (d === "Z" ? stepsIntBits((v as Q).n) : stepsRatBits(v as Q)),
  sample: rng => (d === "Z" ? q(sampleStepsInt(rng)) : sampleStepsRat(rng)),
  decode: w => inArgDomain(toQ(w), d),
});
/** One of a few named choices. */
const oneOf = (values: readonly string[]): Field => ({
  values: max => (choiceBits(values.length) <= max + 1e-9 ? [...values] : []),
  bits: () => choiceBits(values.length),
  sample: rng => values[rng.below(values.length)]!,
  decode: w => { if (typeof w !== "string" || !values.includes(w)) throw new RangeError(`must be one of ${values.join(", ")}`); return w; },
});

/** The bits every call of a mutator pays before its arguments: which (the variant's which code) and where. */
const baseBits = (v: Variant, perSite: boolean, id: string): number => whichBits(v, id) + (perSite ? Math.log2(lineParams(v).linesPerObject) : 0);

/** The argument code of choices `spec` and an optional size, for a call whose which + where cost `base` bits. */
function fields(base: number, spec: Readonly<Record<string, Field>>, size?: Size): ArgCode<Args> {
  const choiceNames = Object.keys(spec);
  const sizeNames = size?.names ?? [];
  const names = [...choiceNames, ...sizeNames];
  const choiceBitsOf = (a: Args) => choiceNames.reduce((t, k) => t + spec[k]!.bits(a[k]!), 0);
  return {
    enumerate: maxBits => {
      // Every combination of argument values whose prices add up to at most maxBits, cheapest first.
      let partial: { a: Record<string, Q | string>; bits: number }[] = [{ a: {}, bits: 0 }];
      for (const k of choiceNames) {
        const f = spec[k]!;
        const vals = f.values(maxBits).map(v => ({ v, bits: f.bits(v) }));
        const next: typeof partial = [];
        for (const p of partial) for (const { v, bits } of vals) if (p.bits + bits <= maxBits + 1e-9) next.push({ a: { ...p.a, [k]: v }, bits: p.bits + bits });
        partial = next;
      }
      if (size) {
        partial = partial.flatMap(p => {
          const o = base + p.bits;
          return size.values(o, maxBits - p.bits).map(vs => ({ a: { ...p.a, ...Object.fromEntries(size.names.map((n, i) => [n, vs[i]!])) }, bits: p.bits + size.bits(vs, o) }));
        });
      }
      return partial.sort((x, y) => x.bits - y.bits).map(x => x.a);
    },
    bits: a => {
      const c = choiceBitsOf(a);
      return size ? c + size.bits(size.names.map(n => a[n] as Q), base + c) : c;
    },
    sample: rng => {
      const out: Record<string, Q | string> = {};
      for (const k of choiceNames) { const v = spec[k]!.sample(rng); if (v === null) return null; out[k] = v; }
      if (size) {
        const vs = size.sample(rng, base + choiceBitsOf(out));
        if (vs === null) return null;
        size.names.forEach((n, i) => { out[n] = vs[i]!; });
      }
      return out;
    },
    encode: a => Object.fromEntries(names.map(k => [k, typeof a[k] === "string" ? (a[k] as string) : Qn.toWire(a[k] as Q)])),
    decode: w => {
      if (typeof w !== "object" || w === null) throw new TypeError("arguments must be an object");
      const rec = w as Record<string, unknown>;
      const extra = Object.keys(rec).filter(k => !names.includes(k));
      if (extra.length) throw new RangeError(`unknown argument ${extra[0]}`);
      const out: Record<string, Q | string> = {};
      for (const k of names) if (!(k in rec)) throw new RangeError(`missing argument ${k}`);
      for (const k of choiceNames) {
        try { out[k] = spec[k]!.decode(rec[k]); } catch (e) { throw new RangeError(`${k} ${(e as Error).message}`); }
      }
      if (size) {
        let vs: Q[];
        try { vs = size.decode(size.names.map(n => rec[n])); } catch (e) { throw new RangeError(`${size.names.join(" and ")} ${(e as Error).message}`); }
        size.names.forEach((n, i) => { out[n] = vs[i]!; });
      }
      return out;
    },
  };
}

/**
 * The argument codes, for object types made of lines (lib/v2-pair): the same choices, sizes and pricing against the
 * rest of the call, so a move on one line of a system is priced exactly as on a line.
 */
export const lineArgCodes = { fields, amount, displacement, factor, position, oneOf } as const;

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
  args: v => fields(baseBits(v, true, "si.shift"), {}, amount(argD(v))),
  apply: viaMC((m, c, a) => [m, Qn.add(c, k(a))]),
  inverse: { kind: "mutator", id: "si.shift", args: a => ({ k: Qn.neg(k(a)) }) },
};

export const tilt: M = {
  id: "si.tilt", reps: ["si", "mach"], title: "change the gradient, keeping the y-intercept", perSite: true,
  describe: a => `add ${w(k(a))} to the gradient`,
  args: v => fields(baseBits(v, true, "si.tilt"), {}, amount(argD(v))),
  apply: viaMC((m, c, a) => [Qn.add(m, k(a)), c]),
  inverse: { kind: "mutator", id: "si.tilt", args: a => ({ k: Qn.neg(k(a)) }) },
};

export const step: M = {
  id: "seq.step", reps: ["seq"], title: "change the pattern's step, keeping term 1", perSite: true,
  describe: a => `add ${w(k(a))} to the step`,
  args: v => fields(baseBits(v, true, "seq.step"), {}, amount(argD(v))),
  apply: viaMC((m, c, a) => [Qn.add(m, k(a)), Qn.sub(c, k(a))]),
  inverse: { kind: "mutator", id: "seq.step", args: a => ({ k: Qn.neg(k(a)) }) },
};

export const pivot: M = {
  id: "cart.pivot", reps: ["cart"], title: "turn the line about its point at x = x0", perSite: true,
  describe: a => `turn about the point at x = ${w(Qa(a, "x0"))}, gradient ${Qn.sign(k(a)) > 0 ? "+" : "−"}${w(Qn.abs(k(a)))}`,
  args: v => fields(baseBits(v, true, "cart.pivot"), { x0: position(argD(v)) }, amount(argD(v))),
  apply: viaMC((m, c, a) => [Qn.add(m, k(a)), Qn.sub(c, Qn.mul(k(a), Qa(a, "x0")))]),
  inverse: { kind: "mutator", id: "cart.pivot", args: a => ({ x0: Qa(a, "x0"), k: Qn.neg(k(a)) }) },
};

export const slide: M = {
  id: "cart.slide", reps: ["cart"], title: "slide the line across the plane", perSite: true,
  describe: a => `slide by (${w(Qa(a, "u"))}, ${w(Qa(a, "v"))})`,
  args: v => fields(baseBits(v, true, "cart.slide"), {}, displacement(argD(v))),
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
  args: v => fields(baseBits(v, true, "cart.mirror"), { axis: oneOf(AXES) }),
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
  args: v => fields(baseBits(v, true, "gen.nudge"), { which: oneOf(COEFS) }, amount("Z")),
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
  args: v => fields(baseBits(v, true, "int.move"), { axis: oneOf(["x", "y"]) }, amount(argD(v))),
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
  args: v => fields(baseBits(v, true, "mach.stretch"), {}, factor),
  apply: viaMC((m, c, a) => [Qn.mul(m, Qa(a, "f")), Qn.mul(c, Qa(a, "f"))]),
  inverse: { kind: "partial", id: "mach.stretch", args: a => ({ f: Qn.inv(Qa(a, "f")) }), note: "undone by the reciprocal factor, at the same price, wherever it keeps the line on the board" },
};

export const mutators: readonly M[] = [shift, tilt, step, pivot, slide, mirror, nudge, move, stretch];

// ---------------------------------------------------------------- the lens mutators (lenses-and-mutators.md §5)
//
// Five moves through other lenses on the line (owner decisions 25 and 28): a turn about a pin of the line or about the
// origin, a swap of two numbers of the equation, a lean (the tilt's twin that keeps the x-intercept), a zoom about the
// origin, and a fold in a crease through a pin or in any mirror line paid for in full. Representation moves (turn, swap,
// fold) are priced as choices and digits, never by the unit path; the lean adds an amount and is priced by its size; the
// zoom is a factor, priced by its digits. Each has an inverse of the same mutator at the same fee, so every price list
// stays an exact potential (owner decision 19). They are offered only by the line-q-lenses variant until its collapse
// and balance checks are done.

type Pt = readonly [Q, Q];
/** Two distinct points of a line. */
function twoPoints(l: Line): [Pt, Pt] {
  if (l.b !== 0n) return [[q(0), q(-l.c, l.b)], [q(1), q(-l.a - l.c, l.b)]];
  const x = q(-l.c, l.a);
  return [[x, q(0)], [x, q(1)]];
}
/** The line through two distinct points. */
function throughPoints(p: Pt, r: Pt): Line | Invalid {
  const dx = Qn.sub(r[0], p[0]), dy = Qn.sub(r[1], p[1]);
  // dy·x − dx·y + (dx·py − dy·px) = 0
  return fromRational(dy, Qn.neg(dx), Qn.sub(Qn.mul(dx, p[1]), Qn.mul(dy, p[0])));
}
/** The reflection of a line in the mirror A·x + B·y + C = 0. */
function reflectLine(l: Line, A: Q, B: Q, C: Q): Line | Invalid {
  const n2 = Qn.add(Qn.mul(A, A), Qn.mul(B, B));
  const two = q(2);
  const reflect = (p: Pt): Pt => {
    const s = Qn.div(Qn.add(Qn.add(Qn.mul(A, p[0]), Qn.mul(B, p[1])), C), n2);
    return [Qn.sub(p[0], Qn.mul(two, Qn.mul(A, s))), Qn.sub(p[1], Qn.mul(two, Qn.mul(B, s)))];
  };
  const [p, r] = twoPoints(l);
  return throughPoints(reflect(p), reflect(r));
}
/** A rational with no sign: "1/2" for ½. */
const unsigned = (x: Q) => w(Qn.abs(x));
/** The pin of a turn or a fold, said plainly: where the line crosses the y-axis, or its point above or below x0. */
const pinWords = (x0: Q) => (Qn.isZero(x0) ? "the point where it crosses the y-axis" : `its point straight above or below ${w(x0)} on the x-axis`);
/**
 * A turn's angle as a child would say it (playtest round 23): degrees, with the fraction of a whole turn when there is a
 * plain one ("90° (one quarter turn)", "45° (one eighth turn)"), else "about 37°" for tan θ = 3/4. No article "a" (the
 * move lists keep single letters for names).
 */
export function turnAngleWords(t: Q | string): string {
  if (typeof t === "string") return "90° (one quarter turn)";
  const a = Qn.abs(t);
  if (Qn.eq(a, Qn.ONE)) return "45° (one eighth turn)";
  const deg = (Math.atan(Number(a.n) / Number(a.d)) * 180) / Math.PI;
  return `about ${Math.round(deg)}°`;
}

/** A turn's centre: the origin, or the pin of the line at x = x0 (1 bit, then x0 by steps). */
const centre = (d: Domain): Field => {
  const pos = position(d);
  return {
    values: max => (max >= 1 ? ["origin", ...pos.values(max - 1)] : []),
    bits: x => (x === "origin" ? 1 : 1 + pos.bits(x)),
    sample: rng => (rng.bit() ? "origin" : pos.sample(rng)),
    decode: x => (x === "origin" ? "origin" : pos.decode(x)),
  };
};
/** A turn: a quarter turn either way (1 + 1 bit), or the angle whose tangent is t ≠ 0, a fraction priced by its digits. */
const QUARTERS = ["left", "right"] as const;
const turnField: Field = {
  values: max => [...(max >= 2 ? QUARTERS : []), ...rationalsUpTo("Q", t => 1 + nonzeroRatBits(t), max)],
  bits: t => (typeof t === "string" ? 2 : 1 + nonzeroRatBits(t)),
  sample: rng => (rng.bit() ? QUARTERS[rng.bit()]! : sampleNonzeroRat(rng)),
  decode: t => {
    if (t === "left" || t === "right") return t;
    const x = toQ(t);
    if (x.n === 0n) throw new RangeError("must not be 0 (a turn of nothing)");
    return x;
  },
};
// About a pin, a quarter turn either way gives the same line (the perpendicular through the pin), so no direction is said.
const turnWords = (t: Q | string, aboutPin: boolean): string =>
  // About a pin either quarter turn gives the same line, so its sense is not said.
  typeof t === "string" ? (aboutPin ? turnAngleWords(t) : `${turnAngleWords(t)} ${t === "left" ? "anticlockwise" : "clockwise"}`)
    : `${turnAngleWords(t)} ${Qn.sign(t) > 0 ? "anticlockwise" : "clockwise"}`;

export const turn: M = {
  id: "rot.turn", reps: ["cart", "norm"], title: "turn the line around a pin, like a clock hand", perSite: true,
  describe: a => `turn the line ${turnWords(a.turn!, a.centre !== "origin")} around ${a.centre === "origin" ? "the origin (0, 0)" : pinWords(Qa(a, "centre"))}`,
  args: v => fields(baseBits(v, true, "rot.turn"), { centre: centre(argD(v)), turn: turnField }),
  apply: (state, site, a, v) => {
    const l = state.lines[site]!;
    const t = a.turn!;
    if (a.centre === "origin") {
      // Turn the normal (a, b) by θ; the distance from the origin stays. A quarter turn sends (a, b) to (−b, a).
      if (typeof t === "string") { const s = t === "left" ? 1n : -1n; return replace(state, site, normalise(-l.b * s, l.a * s, l.c), v); }
      // tan θ = p/q with cos θ = q/r, sin θ = p/r: rational only when p² + q² = r² (a Pythagorean angle).
      const p = t.n, d = t.d, r2 = p * p + d * d, r = isqrtBig(r2);
      if (r * r !== r2) return { invalid: `about the origin a line can only turn by a Pythagorean angle (3/4, 4/3, 5/12, …), not ${unsigned(t)}` };
      return replace(state, site, normalise(l.a * d - l.b * p, l.a * p + l.b * d, l.c * r), v);
    }
    // About the pin at x = x0: only the direction turns, so any rational tangent keeps the line rational.
    if (isVertical(l)) return VERTICAL;
    const x0 = Qa(a, "centre"), m = slope(l), y0 = yAt(l, x0);
    let m2: Q;
    if (typeof t === "string") {
      if (Qn.isZero(m)) return { invalid: "a quarter turn about a point would stand a level line upright; turn it about the origin instead" };
      m2 = Qn.neg(Qn.inv(m));
    } else {
      const den = Qn.sub(Qn.ONE, Qn.mul(m, t));
      if (Qn.isZero(den)) return { invalid: "that turn would stand the line upright (vertical), with no point at x = x0 to turn back about" };
      m2 = Qn.div(Qn.add(m, t), den);
    }
    return replace(state, site, fromMC(m2, Qn.sub(y0, Qn.mul(m2, x0))), v);
  },
  inverse: { kind: "mutator", id: "rot.turn", args: a => ({ centre: a.centre!, turn: typeof a.turn === "string" ? (a.turn === "left" ? "right" : "left") : Qn.neg(a.turn!) }) },
};

const PAIRS = ["m-c", "b-c"] as const;
export const swap: M = {
  id: "coef.swap", reps: ["si", "gen"], title: "swap two numbers of the equation (it costs at least what the dearer of the two costs to write)", perSite: true,
  describe: a => (S(a, "pair") === "m-c" ? "swap the gradient and the y-intercept (y = mx + c becomes y = cx + m)" : "swap b and c in ax + by + c = 0"),
  args: v => fields(baseBits(v, true, "coef.swap"), { pair: oneOf(PAIRS) }),
  apply: (state, site, a, v) => {
    const { a: A, b: B, c: C } = state.lines[site]!;
    // m ↔ c is a ↔ c in ax + by + c = 0 (−a/b ↔ −c/b): the lines cross at x = 1 and a + b + c stays.
    return replace(state, site, S(a, "pair") === "m-c" ? normalise(C, B, A) : normalise(A, C, B), v);
  },
  inverse: { kind: "self" },
  // Swapping two numbers keeps every digit, so Δφ is about 0 and a swap was nearly free: in play two swaps in three gained
  // more than their fee (coordinator's call 23, 15 Nov). Its fee is at least φ of the dearer number it swaps, each read
  // with line-q's code for a and c (the mixed code, LINE_Q_CODES.c), from both lines (the same pair, so the same floor
  // for the swap back).
  floor: (before, after, site, a) => Math.max(...[before, after].flatMap(s => {
    const l = s.lines[site]!;
    return (S(a, "pair") === "m-c" ? [l.a, l.c] : [l.b, l.c]).map(n => LINE_Q_CODES.c.bits(n));
  })),
};

export const lean: M = {
  id: "basis.lean", reps: ["crossing", "cart"], title: "lean the line, keeping where it crosses the x-axis", perSite: true,
  describe: a => `lean the line ${w(Qn.abs(k(a)))} ${Qn.sign(k(a)) > 0 ? "further left" : "further right"} for every 1 up, keeping its x-axis crossing`,
  args: v => fields(baseBits(v, true, "basis.lean"), {}, amount(argD(v))),
  apply: (state, site, a, v) => {
    const l = state.lines[site]!;
    if (l.a === 0n) return { invalid: "a level line never crosses the x-axis, so it has nothing to lean about" };
    // The run per unit rise, −b/a, goes down by k: (a, b + a·k, c).
    return replace(state, site, fromRational(q(l.a), Qn.add(q(l.b), Qn.mul(q(l.a), k(a))), q(l.c)), v);
  },
  inverse: { kind: "mutator", id: "basis.lean", args: a => ({ k: Qn.neg(k(a)) }) },
};

export const zoom: M = {
  id: "basis.zoom", reps: ["tri", "norm"], title: "zoom the line away from the origin or towards it, keeping its steepness", perSite: true,
  describe: a => `zoom by ${w(Qa(a, "f"))} from the origin: where the line crosses each axis moves × ${w(Qa(a, "f"))}, and it keeps its steepness`,
  args: v => fields(baseBits(v, true, "basis.zoom"), {}, factor),
  apply: (state, site, a, v) => {
    const l = state.lines[site]!;
    if (l.c === 0n) return { invalid: "a line through the origin looks the same at every zoom" };
    return replace(state, site, fromRational(q(l.a), q(l.b), Qn.mul(q(l.c), Qa(a, "f"))), v);
  },
  inverse: { kind: "mutator", id: "basis.zoom", args: a => ({ f: Qn.inv(Qa(a, "f")) }) },
};

/** Positive whole numbers whose mixed code is at most maxBits (mixedPosBits), smallest first. */
function smoothUpTo(maxBits: number): bigint[] {
  const budget = maxBits - mixedPosBits(1n);
  const out: bigint[] = [];
  const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n];
  const walk = (n: bigint, from: number, left: number) => {
    out.push(n);
    for (let i = from; i < primes.length; i++) { const cost = Number(primes[i]!) / 2; if (cost > left + 1e-9) break; walk(n * primes[i]!, i, left - cost); }
  };
  if (budget >= -1e-9) walk(1n, 0, budget);
  return out.sort((x, y) => (x < y ? -1 : 1));
}
/** A mirror line's price: its read length on fraction lines, φ = mixed(a) + mixed(b) + mixed(c), paid from scratch. */
const mirrorBits = (M: Line) => mixedIntBits(M.a) + mixedIntBits(M.b) + mixedIntBits(M.c);
function parseMirror(x: unknown): Line {
  if (typeof x !== "string") throw new TypeError("mirror must be a line a,b,c (a·x + b·y + c = 0)");
  const parts = x.split(",").map(s => s.trim());
  if (parts.length !== 3 || !parts.every(s => /^-?\d+$/.test(s))) throw new RangeError(`mirror must be a line a,b,c (a·x + b·y + c = 0), not ${x}`);
  const n = normalise(BigInt(parts[0]!), BigInt(parts[1]!), BigInt(parts[2]!));
  if ("invalid" in n) throw new RangeError(n.invalid);
  return n;
}

/** The fold's argument: a crease {x0, s} through the line's point at x = x0 with gradient s, or a mirror line {mirror}. */
function foldArgs(v: Variant): ArgCode<Args> {
  const pos = position(argD(v));
  const creaseBits = (a: Args) => 1 + pos.bits(a.x0!) + ratBits(Qa(a, "s"));
  const isMirror = (a: Args) => typeof a.mirror === "string";
  const bits = (a: Args) => (isMirror(a) ? 1 + mirrorBits(decodeLine(S(a, "mirror"))) : creaseBits(a));
  return {
    bits,
    sample: rng => {
      if (rng.bit()) {
        const x0 = pos.sample(rng), s = sampleRat(rng);
        return x0 === null || s === null ? null : ({ x0, s } as Args);
      }
      const A = sampleMixedInt(rng), B = sampleMixedInt(rng), C = sampleMixedInt(rng);
      const n = normalise(A, B, C);
      // A triple that is not a line's own canonical form is the code's leftover mass.
      return "invalid" in n || n.a !== A || n.b !== B || n.c !== C ? null : ({ mirror: encodeLine(n) } as Args);
    },
    encode: (a): Record<string, string> => (isMirror(a) ? { mirror: S(a, "mirror") } : { x0: Qn.toWire(Qa(a, "x0")), s: Qn.toWire(Qa(a, "s")) }),
    decode: (wire): Args => {
      if (typeof wire !== "object" || wire === null) throw new TypeError("arguments must be an object");
      const rec = wire as Record<string, unknown>, keys = Object.keys(rec).sort().join(",");
      if (keys === "mirror") return { mirror: encodeLine(parseMirror(rec.mirror)) };
      if (keys !== "s,x0") throw new RangeError("give either a crease (x0 and its gradient s) or a mirror line (mirror: a,b,c)");
      let x0: Q, s: Q;
      try { x0 = pos.decode(rec.x0) as Q; } catch (e) { throw new RangeError(`x0 ${(e as Error).message}`); }
      try { s = toQ(rec.s); } catch (e) { throw new RangeError(`s ${(e as Error).message}`); }
      return { x0, s };
    },
    enumerate: maxBits => {
      const out: Args[] = [];
      const ss = [q(0), ...rationalsUpTo("Q", ratBits, maxBits)];
      for (const x0 of pos.values(maxBits - 1)) for (const s of ss) { const a = { x0, s }; if (creaseBits(a) <= maxBits + 1e-9) out.push(a); }
      // Mirror lines: integers by their mixed code, three at a time, canonical triples only.
      const room = maxBits - 1;
      const ints: { n: bigint; bits: number }[] = [{ n: 0n, bits: 1 }];
      for (const n of smoothUpTo(room - 2 - 2)) { const b = mixedIntBits(n); if (b <= room) ints.push({ n, bits: b }, { n: -n, bits: b }); }
      for (const A of ints) for (const B of ints) {
        if (A.bits + B.bits + 1 > room + 1e-9) continue;
        for (const C of ints) {
          if (A.bits + B.bits + C.bits > room + 1e-9) continue;
          const n = normalise(A.n, B.n, C.n);
          if ("invalid" in n || n.a !== A.n || n.b !== B.n || n.c !== C.n) continue;
          out.push({ mirror: encodeLine(n) });
        }
      }
      return out.map(a => ({ a, b: bits(a) })).sort((x, y) => x.b - y.b).map(x => x.a);
    },
  };
}

export const fold: M = {
  id: "fold", reps: ["cart"], title: "fold the line in a mirror", perSite: true,
  describe: a => {
    if (typeof a.mirror === "string") return `reflect the line in the mirror ${describeLine(decodeLine(S(a, "mirror")))}`;
    const s = Qa(a, "s");
    return `fold the line along ${Qn.isZero(s) ? "the level crease" : `the crease of gradient ${w(s)}`} through ${pinWords(Qa(a, "x0"))}`;
  },
  args: foldArgs,
  apply: (state, site, a, v) => {
    const l = state.lines[site]!;
    if (typeof a.mirror === "string") {
      const M = decodeLine(S(a, "mirror"));
      return replace(state, site, reflectLine(l, q(M.a), q(M.b), q(M.c)), v);
    }
    if (isVertical(l)) return VERTICAL;
    // The crease s·x − y + (y0 − s·x0) = 0 through the pin (x0, y0).
    const x0 = Qa(a, "x0"), s = Qa(a, "s"), y0 = yAt(l, x0);
    const r = reflectLine(l, s, q(-1), Qn.sub(y0, Qn.mul(s, x0)));
    // A vertical result has no point at x = x0 to fold back about: refused, so the fold stays its own inverse.
    if (!("invalid" in r) && isVertical(r)) return { invalid: "that fold would stand the line upright (vertical), with no point at x = x0 to fold back about" };
    return replace(state, site, r, v);
  },
  inverse: { kind: "self" },
};

/** The five lens mutators, offered by line-q-lenses. */
export const lensMutators: readonly M[] = [turn, swap, lean, zoom, fold];
/** Every mutator of the line type. */
export const allMutators: readonly M[] = [...mutators, ...lensMutators];
