/**
 * The system's sixteen mutators (docs/engine-v2/two-line-systems.md §2): line-q's nine on either line, and seven that
 * use the two lines together. Every call names the line it moves ("line": 1 or 2, a choice of one bit, the place a line
 * object's "where" would take), and amounts are priced against the rest of the call exactly as on a line (v2-linear's
 * argument codes: a size σ costs rate(o)·σ in all, so a far move costs exactly its path of unit moves). Representation
 * shortcuts (reflect in the other line, a quarter turn about the crossing) are choices, never priced by a path (owner
 * decision 25). Every move's reverse is proposed with the same weight, so the price list is an exact potential (owner
 * decision 19; test/potential.test.ts).
 */
import { isInvalid, Qn, q, whichBits, type ArgCode, type ArgHelp, type Invalid, type Mutator, type Q, type Rng, type Variant } from "@workspace/v2-core";
import { fromMC, inDomain, lineArgCodes, lineParams, mutators as lineMutators, normalise, type Args, type Line } from "@workspace/v2-linear";
import { canonicalPair, facts, pairLineBits, type PairState } from "./pair.ts";

const { fields, amount, displacement, factor, oneOf } = lineArgCodes;
const LINES = ["1", "2"] as const;
/** The line argument said for a person (round 23). */
const LINE_HELP: ArgHelp = { label: "Which line", hint: "the one that changes; the other stays", example: "1", choices: { "1": "line 1", "2": "line 2" } };
const NUM = "a number such as 2, −3 or 1/2";

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
    argHelp: v => ({ line: LINE_HELP, ...m.argHelp?.(v) }),
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
  argHelp: () => ({ line: LINE_HELP, k: { label: "How many times the other", hint: "a whole number such as 1 or −2: that many times the other equation is added to this one", example: "1" } }),
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
  argHelp: () => ({ line: LINE_HELP, k: { label: "Add to the gradient", hint: `${NUM}; the crossing stays put`, example: "1" } }),
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
  argHelp: () => ({ line: LINE_HELP }),
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
  argHelp: () => ({ line: LINE_HELP }),
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
  argHelp: () => ({ line: LINE_HELP, k: { label: "How many steps along", hint: "a whole number such as 1 or −2: how far the crossing moves along the other line", example: "1" } }),
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
  argHelp: () => ({ u: { label: "How far right", hint: `${NUM} (below 0 goes left)`, example: "1" }, v: { label: "How far up", hint: `${NUM} (below 0 goes down)`, example: "1" } }),
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

/**
 * Zoom the whole picture about the origin by a factor (trial 34: the shortcut that joins a rung to the next). Every
 * point (x, y) goes to (f·x, f·y): angles and gradients stay, intercepts, gaps and the crossing are multiplied by f.
 * With a slide of the plane by the dealt remainder it takes a residue ladder's number N to f·N + r, and q·N + r is on
 * the next level whenever N is on this one (its base-q digits gain one r). A representation shortcut (owner decision
 * 25): the factor is priced by its digits, and the fee grows with the size of the lines rewritten (zoomFloor).
 */
export const zoom: M = {
  id: "sys.zoom", reps: ["pair"], title: "zoom both lines about (0, 0)", perSite: false,
  argHelp: () => ({ f: { label: "Zoom by", hint: "2 doubles every distance from (0, 0), 1/2 halves it", example: "2" } }),
  describe: a => `zoom both lines by ${w(Qa(a, "f"))} about (0, 0)`,
  args: v => fields(base(v, "sys.zoom"), {}, factor),
  apply: (s, _site, a, v) => {
    const f = Qa(a, "f"), lines: Line[] = [];
    for (const l of s.lines) {
      // a(x / f) + b(y / f) + c = 0, that is a·x + b·y + f·c = 0.
      const C = Qn.mul(q(l.c), f), n = normalise(l.a * C.d, l.b * C.d, C.n);
      if ("invalid" in n) return n;
      const d = inDomain(n, lineParams(v));
      if ("invalid" in d) return d;
      lines.push(d);
    }
    return canonicalPair(lines, v);
  },
  inverse: { kind: "mutator", id: "sys.zoom", args: a => ({ f: Qn.inv(Qa(a, "f")) }) },
};

/**
 * Shortcut fees grow with the size of the line rewritten (the coordinator's trial 29, adopted for pairs, 15 Nov): a
 * stretch, a reflection or a quarter turn pays at least its usual fee × 2^((Φ − PAIR_SHORTCUT_PHI)/3.5), Φ the larger
 * code length of the moved line before or after (so prices stay symmetric, an exact potential), held at 2^60.
 * PAIR_SHORTCUT_PHI is the pair law's 90th percentile of one line's code length (21.2 bits). Additive moves are unchanged.
 */
export const PAIR_SHORTCUT_PHI = 21, PAIR_SHORTCUT_DOUBLING = 3.5;
export const pairShortcutFactor = (phi: number): number => Math.min(2 ** 60, Math.max(1, 2 ** ((phi - PAIR_SHORTCUT_PHI) / PAIR_SHORTCUT_DOUBLING)));
/** The moved line in `after`: the one that is not the unmoved line of `before` (the pair may have re-sorted). */
const movedAfter = (before: PairState, after: PairState, i: 0 | 1) => {
  const kept = before.lines[other(i)]!;
  return after.lines.find(l => l.a !== kept.a || l.b !== kept.b || l.c !== kept.c) ?? after.lines[i]!;
};
function shortcutFloor(m: M): M {
  return {
    ...m,
    floor: (before, after, _site, a, v) => {
      const i = idx(a), phi = Math.max(pairLineBits(before.lines[i]!), pairLineBits(movedAfter(before, after, i)));
      return (whichBits(v, m.id) + m.args(v).bits(a)) * (Number.isFinite(phi) ? pairShortcutFactor(phi) : 1);   // the whole usual fee, scaled
    },
  };
}
/** The zoom rewrites both lines: its floor reads the larger of their code lengths, before or after. */
function zoomFloor(m: M): M {
  return {
    ...m,
    floor: (before, after, _site, a, v) => {
      const phi = Math.max(...before.lines.map(pairLineBits), ...after.lines.map(pairLineBits));
      return (whichBits(v, m.id) + m.args(v).bits(a)) * (Number.isFinite(phi) ? pairShortcutFactor(phi) : 1);
    },
  };
}
const SHORTCUTS = new Set(["mach.stretch"]);
export const lineMoves: readonly M[] = lineMutators.map(m => perLine(m as unknown as M)).map(m => (SHORTCUTS.has(m.id) ? shortcutFloor(m) : m));
export const pairMoves: readonly M[] = [combine, turn, shortcutFloor(reflect), shortcutFloor(quarter), slideAlong, translate, zoomFloor(zoom)];
export const pairMutators: readonly M[] = [...lineMoves, ...pairMoves];
