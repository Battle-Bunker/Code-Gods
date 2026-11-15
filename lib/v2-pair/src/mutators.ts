/**
 * The system's fifteen mutators (docs/engine-v2/two-line-systems.md §2): line-q's nine on either line, and six that
 * use the two lines together. Every call names the line it moves ("line": 1 or 2, a choice of one bit, the place a line
 * object's "where" would take), and amounts are priced against the rest of the call exactly as on a line (v2-linear's
 * argument codes: a size σ costs rate(o)·σ in all, so a far move costs exactly its path of unit moves). Representation
 * shortcuts (reflect in the other line, a quarter turn about the crossing) are choices, never priced by a path (owner
 * decision 25). Every move's reverse is proposed with the same weight, so the price list is an exact potential (owner
 * decision 19; test/potential.test.ts).
 */
import { isInvalid, Qn, q, whichBits, type ArgCode, type Invalid, type Mutator, type Q, type Rng, type Variant } from "@workspace/v2-core";
import { fromMC, inDomain, lineArgCodes, lineParams, mutators as lineMutators, normalise, type Args, type Line } from "@workspace/v2-linear";
import { canonicalPair, facts, type PairState } from "./pair.ts";

const { fields, amount, displacement, oneOf } = lineArgCodes;
const LINES = ["1", "2"] as const;
type M = Mutator<PairState, Args>;
const idx = (a: Args): 0 | 1 => (a.line === "2" ? 1 : 0);
const Qa = (a: Args, k: string): Q => a[k] as Q;
const w = (x: Q) => Qn.toWire(x);
function gcdBig(x: bigint, y: bigint): bigint {
  let a = x < 0n ? -x : x, b = y < 0n ? -y : y;
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Replace line i, then put the pair in canonical order (or refuse equal lines). */
function withLine(s: PairState, i: 0 | 1, next: Line | Invalid, v: Variant): PairState | Invalid {
  if ("invalid" in next) return next;
  const l = inDomain(next, lineParams(v));
  if ("invalid" in l) return l;
  const lines = s.lines.slice();
  lines[i] = l;
  return canonicalPair(lines, v);
}

/** A code with the moved line in front of another code's arguments: one bit more. */
function lineFirst(code: ArgCode<Args>): ArgCode<Args> {
  const rest = (a: Args): Args => { const { line: _l, ...r } = a; return r; };
  return {
    bits: a => 1 + code.bits(rest(a)),
    sample: (r: Rng) => { const a = code.sample(r); return a === null ? null : { line: LINES[r.below(2)]!, ...a }; },
    encode: a => ({ line: a.line as string, ...code.encode(rest(a)) }),
    decode: wire => {
      if (typeof wire !== "object" || wire === null) throw new TypeError("arguments must be an object");
      const { line, ...r } = wire as Record<string, unknown>;
      if (line !== "1" && line !== "2") throw new RangeError("line must be 1 or 2");
      return { line, ...code.decode(r) };
    },
    enumerate: max => {
      if (!code.enumerate || max < 1) return [];
      const inner = [...code.enumerate(max - 1)];
      return LINES.flatMap(line => inner.map(a => ({ line, ...a })));
    },
  };
}

/**
 * One of line-q's nine, on the line the call names. Its own code already prices "where" as one bit of two lines
 * (v2-linear's baseBits reads linesPerObject = 2): that bit is the "line" choice here.
 */
function perLine(m: Mutator<PairState, Args>): M {
  const rest = (a: Args): Args => { const { line: _l, ...r } = a; return r; };
  return {
    id: m.id, reps: ["eqs", "pair"], title: `${m.title} (one line)`, perSite: false,
    describe: a => `line ${a.line}: ${m.describe(rest(a))}`,
    args: v => lineFirst(m.args(v)),
    apply: (s, _site, a, v) => {
      const r = m.apply(s, idx(a), rest(a), v);
      return isInvalid(r) ? r : canonicalPair(r.lines, v);
    },
    inverse: { kind: "partial", id: m.id, args: a => a, note: "the same move's inverse on the moved line, which may now be listed first or second" },
  };
}

const base = (v: Variant, id: string): number => whichBits(v, id);
const lineChoice = { line: oneOf(LINES) };
const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);
const PARALLEL: Invalid = { invalid: "the two lines are parallel: they have no crossing" };

/** Elimination: add k times the other equation to this one. The answer and the number you divide by stay. */
export const combine: M = {
  id: "pair.combine", reps: ["solve", "eqs"], title: "add a whole number of times the other equation to this one", perSite: false,
  describe: a => `line ${a.line} += ${w(Qa(a, "k"))} × the other line's equation`,
  args: v => fields(base(v, "pair.combine"), lineChoice, amount("Z")),
  apply: (s, _site, a, v) => {
    const i = idx(a), L = s.lines[i]!, J = s.lines[other(i)]!, k = Qa(a, "k").n;
    const A = L.a + k * J.a, B = L.b + k * J.b, C = L.c + k * J.c;
    if (A === 0n && B === 0n) return { invalid: "that would leave no line" };
    // A result with a common factor would be divided through: one-way, so it is refused (both ways).
    if (gcdBig(gcdBig(A, B), C) !== 1n) return { invalid: `the result ${A}, ${B}, ${C} has a common factor` };
    return withLine(s, i, normalise(A, B, C), v);
  },
  inverse: { kind: "partial", id: "pair.combine", args: a => ({ ...a, k: Qn.neg(Qa(a, "k")) }), note: "k → −k, or k again when the result was written the other way up (the same price)" },
};

/** Turn this line about the crossing: its gradient grows by k, the answer stays. */
export const turn: M = {
  id: "pair.turn", reps: ["pair", "angle"], title: "turn this line about the crossing", perSite: false,
  describe: a => `turn line ${a.line} about the crossing, gradient ${Qn.sign(Qa(a, "k")) > 0 ? "+" : "−"}${w(Qn.abs(Qa(a, "k")))}`,
  args: v => fields(base(v, "pair.turn"), lineChoice, amount(lineParams(v).argDomain)),
  apply: (s, _site, a, v) => {
    const i = idx(a), L = s.lines[i]!, P = facts(s).P;
    if (!P) return PARALLEL;
    if (L.b === 0n) return { invalid: "a vertical line has no gradient to change" };
    const m = Qn.add(q(-L.a, L.b), Qa(a, "k"));
    return withLine(s, i, fromMC(m, Qn.sub(P.y, Qn.mul(m, P.x))), v);
  },
  inverse: { kind: "mutator", id: "pair.turn", args: a => ({ ...a, k: Qn.neg(Qa(a, "k")) }) },
};

/** Fold this line over the other: the mirror is already in the system, so the move is a choice. */
export const reflect: M = {
  id: "pair.reflect", reps: ["pair", "angle"], title: "reflect this line in the other line", perSite: false,
  describe: a => `reflect line ${a.line} in the other line`,
  args: v => fields(base(v, "pair.reflect"), lineChoice),
  apply: (s, _site, a, v) => {
    const i = idx(a), L = s.lines[i]!, J = s.lines[other(i)]!;
    const n2 = J.a * J.a + J.b * J.b, d = L.a * J.a + L.b * J.b;
    return withLine(s, i, normalise(n2 * L.a - 2n * d * J.a, n2 * L.b - 2n * d * J.b, n2 * L.c - 2n * d * J.c), v);
  },
  inverse: { kind: "self" },
};

/** A quarter turn about the crossing: the perpendicular to this line through the answer. */
export const quarter: M = {
  id: "pair.quarter", reps: ["pair", "angle"], title: "turn this line a quarter turn about the crossing", perSite: false,
  describe: a => `turn line ${a.line} a quarter turn about the crossing`,
  args: v => fields(base(v, "pair.quarter"), lineChoice),
  apply: (s, _site, a, v) => {
    const i = idx(a), L = s.lines[i]!, f = facts(s);
    if (f.D === 0n) return PARALLEL;
    // Normal (−b, a) through (nx/D, ny/D), scaled by D.
    return withLine(s, i, normalise(-L.b * f.D, L.a * f.D, L.b * f.nx - L.a * f.ny), v);
  },
  inverse: { kind: "self" },
};

/** Slide this line parallel to itself so the crossing moves k steps along the other line. */
export const slideAlong: M = {
  id: "pair.slide", reps: ["pair"], title: "slide this line so the crossing moves along the other line", perSite: false,
  describe: a => `slide line ${a.line} so the crossing moves ${w(Qa(a, "k"))} step${Qn.eq(Qn.abs(Qa(a, "k")), Qn.ONE) ? "" : "s"} along the other line`,
  args: v => fields(base(v, "pair.slide"), lineChoice, amount("Z")),
  apply: (s, _site, a, v) => {
    const i = idx(a), L = s.lines[i]!, J = s.lines[other(i)]!, k = Qa(a, "k").n;
    if (facts(s).D === 0n) return PARALLEL;
    // One step along J: its direction (b, −a) divided by gcd(a, b). c changes by a multiple of gcd(a_i, b_i), so the
    // triple stays primitive.
    const g = gcdBig(J.a, J.b);
    const dx = (k * J.b) / g, dy = (-k * J.a) / g;
    return withLine(s, i, normalise(L.a, L.b, L.c - L.a * dx - L.b * dy), v);
  },
  inverse: { kind: "mutator", id: "pair.slide", args: a => ({ ...a, k: Qn.neg(Qa(a, "k")) }) },
};

/** Slide the whole picture: both lines by (u, v). */
export const translate: M = {
  id: "sys.translate", reps: ["pair"], title: "slide both lines across the plane", perSite: false,
  describe: a => `slide both lines by (${w(Qa(a, "u"))}, ${w(Qa(a, "v"))})`,
  args: v => fields(base(v, "sys.translate"), {}, displacement(lineParams(v).argDomain)),
  apply: (s, _site, a, v) => {
    const u = Qa(a, "u"), vv = Qa(a, "v");
    const lines: Line[] = [];
    for (const l of s.lines) {
      // a(x − u) + b(y − v) + c = 0, scaled by the denominators.
      const C = Qn.sub(Qn.sub(q(l.c), Qn.mul(q(l.a), u)), Qn.mul(q(l.b), vv));
      const n = normalise(l.a * C.d, l.b * C.d, C.n);
      if ("invalid" in n) return n;
      const d = inDomain(n, lineParams(v));
      if ("invalid" in d) return d;
      lines.push(d);
    }
    return canonicalPair(lines, v);
  },
  inverse: { kind: "mutator", id: "sys.translate", args: a => ({ u: Qn.neg(Qa(a, "u")), v: Qn.neg(Qa(a, "v")) }) },
};

export const lineMoves: readonly M[] = lineMutators.map(m => perLine(m as unknown as M));
export const pairMoves: readonly M[] = [combine, turn, reflect, quarter, slideAlong, translate];
export const pairMutators: readonly M[] = [...lineMoves, ...pairMoves];
