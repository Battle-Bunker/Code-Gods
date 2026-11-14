/** Rule families (spec §12.5). Implemented: the owner's four (1–4). */
import { Qn, q, ref, type ElementRef, type ElementValue, type EvalContext, type Q, type RuleFamily, type Rung, type Variant } from "@workspace/v2-core";
import { lineParams, type LineState } from "./line.ts";
import { nearbyPrimes } from "./numbers.ts";

type Ctx = EvalContext<LineState>;

const Z_LADDER = [13, 8, 5, 3, 2, 1, 0].map(d => q(d));
const Q_LADDER = [q(8), q(4), q(2), q(1), q(1, 2), q(1, 4), q(1, 8), q(0)];

/** Rungs "gap ≤ d" for a distance rule, on the variant's domain. */
export function distanceLadder(v: Variant, what: string): readonly Rung[] {
  const ds = lineParams(v).domain === "Z" ? Z_LADDER : Q_LADDER;
  return [{ score: null, label: "anything" }, ...ds.map(d => ({ score: [Qn.neg(d)], label: Qn.isZero(d) ? `${what} exactly` : `${what} within ${Qn.toWire(d)}` }))];
}

const undefinedTerm = (v: ElementValue): { undefined: string } => ({ undefined: v.kind === "undefined" ? v.reason : "not a number" });
const numberOf = (v: ElementValue): Q | null => (v.kind === "number" ? v.q : null);
const gap = (a: Q, b: Q): Q => Qn.abs(Qn.sub(a, b));

/** Record the gap term and score "smaller is better"; undefined inputs make the score WORST. */
function scoreGap(ctx: Ctx, label: string, a: ElementValue, b: Q | ElementValue, from: readonly ElementRef[]): Q | null {
  const x = numberOf(a);
  const y = "kind" in b ? numberOf(b) : b;
  const value = x === null ? undefinedTerm(a) : y === null ? undefinedTerm(b as ElementValue) : gap(x, y);
  ctx.term("gap", label, value, from);
  ctx.score([{ term: "gap", sense: "min" }]);
  return "undefined" in value ? null : value;
}

// ---------------------------------------------------------------- 1. Prime Gradient (owner)

export const primeGradient: RuleFamily<LineState, Record<string, never>> = {
  id: "prime-gradient", title: "Prime Gradient", curve: "distance",
  card: () => "Make the gradient as close as possible to a prime number.",
  params: [], dealable: () => [{}],
  depends: ["si", "cart"], primary: "si",
  ladder: (_p, v) => distanceLadder(v, "a prime"),
  evaluate(ctx) {
    const mRef = ref("si", "m");
    const mv = ctx.read(mRef);
    if (mv.kind !== "number") {
      ctx.term("gap", "distance from the gradient to the nearest prime", undefinedTerm(mv), [mRef]);
      ctx.score([{ term: "gap", sense: "min" }]);
      ctx.mark({ kind: "note", ref: mRef, text: undefinedTerm(mv).undefined });
      return;
    }
    const m = mv.q;
    const primes = nearbyPrimes(m);
    for (const p of primes) {
      const g = ref("cart", "ghost", { g: p });
      ctx.read(g);
      ctx.term(`d${p}`, `distance to ${p}`, gap(m, q(p)), [mRef]);
      ctx.mark({ kind: "candidate", ref: g, term: `d${p}` });
    }
    ctx.term("gap", "distance from the gradient to the nearest prime", gap(m, q(primes[0]!)), [mRef]);
    ctx.score([{ term: "gap", sense: "min" }]);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "note", ref: mRef, text: `nearest prime ${primes[0]}` });
  },
};

// ---------------------------------------------------------------- 2. Triangle Area (owner)

export const triangleArea: RuleFamily<LineState, { A: number }> = {
  id: "triangle-area", title: "Triangle Area", curve: "distance",
  card: p => `The line and the two axes make a triangle; make its area as close as possible to ${p.A}.`,
  params: [{ name: "A", domain: "Z" }], dealable: () => [4, 6, 8, 12, 18].map(A => ({ A })),
  depends: ["tri", "cart", "si"], primary: "tri",
  ladder: (_p, v) => distanceLadder(v, "the area"),
  evaluate(ctx, p) {
    const area = ref("tri", "area"), lx = ref("tri", "legX"), ly = ref("tri", "legY");
    const av = ctx.read(area);
    ctx.read(lx); ctx.read(ly);
    const g = scoreGap(ctx, `distance from the area to ${p.A}`, av, q(p.A), [area]);
    if (g === null) { ctx.mark({ kind: "note", ref: area, text: undefinedTerm(av).undefined }); return; }
    ctx.mark({ kind: "focus", ref: lx });
    ctx.mark({ kind: "focus", ref: ly });
    ctx.mark({ kind: "note", ref: area, text: `area ${Qn.toWire((av as { q: Q }).q)}, target ${p.A}` });
  },
};

// ---------------------------------------------------------------- 3. m Meets c (owner)

export const mMeetsC: RuleFamily<LineState, Record<string, never>> = {
  id: "m-meets-c", title: "m Meets c", curve: "distance",
  card: () => "Make the gradient and the y-intercept as close as possible to each other.",
  params: [], dealable: () => [{}],
  depends: ["si", "cart"], primary: "si",
  ladder: (_p, v) => distanceLadder(v, "m and c"),
  evaluate(ctx) {
    const mRef = ref("si", "m"), cRef = ref("si", "c");
    const mv = ctx.read(mRef), cv = ctx.read(cRef);
    const g = scoreGap(ctx, "distance between m and c", mv, cv, [mRef, cRef]);
    if (g === null) { ctx.mark({ kind: "note", ref: mRef, text: undefinedTerm(mv).undefined }); return; }
    // |m − c| is the line's height at x = −1: every perfect line passes through (−1, 0).
    const at = ref("cart", "pointAtX", { q: -1 });
    ctx.read(at);
    ctx.mark({ kind: "focus", ref: mRef });
    ctx.mark({ kind: "focus", ref: cRef });
    ctx.mark({ kind: "candidate", ref: at, term: "gap" });
    ctx.mark({ kind: "note", ref: at, text: "m − c is the line's height at x = −1" });
  },
};

// ---------------------------------------------------------------- 4. Crossing Check (owner)

export const crossingCheck: RuleFamily<LineState, { k: number; q: number }> = {
  id: "crossing-check", title: "Crossing Check", curve: "distance",
  card: p => `Make y(${p.k}) and x(${p.q}) as close as possible: y(${p.k}) is the height at x = ${p.k}, x(${p.q}) is where the line reaches height ${p.q}.`,
  params: [{ name: "k", domain: "Z" }, { name: "q", domain: "Z" }],
  dealable: () => [1, 2, 3].flatMap(k => [2, 4, 6].map(qq => ({ k, q: qq }))),
  depends: ["mach", "cart"], primary: "mach",
  ladder: (_p, v) => distanceLadder(v, "y(k) and x(q)"),
  evaluate(ctx, p) {
    const out = ref("mach", "out", { q: p.k }), rev = ref("mach", "reverse", { q: p.q });
    const ov = ctx.read(out), rv = ctx.read(rev);
    const g = scoreGap(ctx, `distance between y(${p.k}) and x(${p.q})`, ov, rv, [out, rev]);
    if (g === null) { ctx.mark({ kind: "note", ref: ov.kind === "undefined" ? out : rev, text: undefinedTerm(ov.kind === "undefined" ? ov : rv).undefined }); return; }
    const atX = ref("cart", "pointAtX", { q: p.k }), atY = ref("cart", "pointAtY", { q: p.q });
    ctx.read(atX); ctx.read(atY);
    ctx.mark({ kind: "focus", ref: out });
    ctx.mark({ kind: "focus", ref: rev });
    ctx.mark({ kind: "candidate", ref: atX });
    ctx.mark({ kind: "candidate", ref: atY });
  },
};

export const families = [primeGradient, triangleArea, mMeetsC, crossingCheck] as const;
