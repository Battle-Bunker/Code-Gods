/**
 * A storyboard rule for the views (integration plan §3.4): "Empty Tank, beginner", two graded parts. It is not in
 * v2-linear's pool; the gallery and the tests use it to show a main part and a tie-breaker until W1 ships two-part
 * families. It follows the rule contract exactly, so it is evaluated by v2-core like any family.
 */
import { Qn, q, ref, type EvalContext, type Layer, type Q, type RuleFamily } from "@workspace/v2-core";
import { distanceToWhole, isPrime, nearbyPrimes, nearestInteger, smallestPrimeFactor, type LineState } from "@workspace/v2-linear";
import { fmtQ } from "./format.ts";

const Q_STEPS = [q(8), q(4), q(2), q(1), q(1, 2), q(1, 4), q(1, 8), q(0)];
const PRIME_STEPS = [q(3), q(2), q(1), q(0)];
const label = (near: string, exact: string) => (d: Q) => (Qn.isZero(d) ? exact : `${near} ${fmtQ(d)}`);

/** The nearest whole minute at or after the first: 1 below 1, else the nearer integer, ties to the smaller. */
function nearestMinute(t: Q): bigint {
  if (Qn.cmp(t, Qn.ONE) < 0) return 1n;
  const f = Qn.floor(t);
  return Qn.cmp(Qn.sub(t, q(f)), q(1, 2)) <= 0 ? f : f + 1n;
}

type NoParams = Record<string, never>;
const main: Layer<NoParams> = {
  id: "gap", title: "runs out at a whole minute", sentence: () => "Make it run out at a whole minute.", rep: "cart",
  sense: "min", measure: "distance", thresholds: () => Q_STEPS, rungLabel: label("runs out within", "runs out at a whole minute"),
};
const prime: Layer<NoParams> = {
  id: "pgap", title: "that minute is a prime", sentence: () => "Tie-breaker: a prime minute is even better.", rep: "cart",
  sense: "min", measure: "distance", thresholds: () => PRIME_STEPS, rungLabel: label("that minute is within", "that minute is a prime"),
};

export const emptyTank: RuleFamily<LineState, NoParams> = {
  id: "empty-tank-demo", title: "Empty Tank",
  card: () => "Your line is a draining water tank: it starts with c litres and loses −m litres a minute. Make it run out at a whole minute; a prime minute is even better.",
  params: [], dealable: () => [{}],
  depends: ["cart", "si", "seq"], main, tieBreakers: [prime],
  evaluate(ctx: EvalContext<LineState>) {
    const mRef = ref("si", "m"), cRef = ref("si", "c"), xRef = ref("cart", "xInt");
    const m = ctx.read(mRef), c = ctx.read(cRef);
    const x = ctx.read(xRef);
    const draining = m.kind === "number" && c.kind === "number" && Qn.sign(m.q) < 0 && Qn.sign(c.q) > 0;
    if (!draining || x.kind !== "point") {
      const why = { undefined: "this tank is not draining (it needs c above 0 and m below 0)" };
      ctx.term("gap", "gap between the emptying time and the nearest whole minute", why, [mRef, cRef]);
      ctx.term("pgap", "gap between that minute and a prime", why, [mRef, cRef]);
      ctx.mark({ kind: "note", ref: xRef, text: "not draining" });
      return;
    }
    const T = x.x, N = nearestMinute(T);
    ctx.term("T", "emptying time (minutes)", T, [xRef]);
    const tick = ref("cart", "xAxisMark", { x: q(N) });
    ctx.read(tick);
    ctx.term("gap", `gap between the emptying time and minute ${N}`, Qn.abs(Qn.sub(T, q(N))), [xRef]);
    const P = nearbyPrimes(q(N))[0]!;
    ctx.term("pgap", isPrime(N) ? `distance from minute ${N} to a prime (${N} is one)` : `distance from minute ${N} to the prime ${P}`, Qn.abs(q(N - P)), [xRef]);
    ctx.mark({ kind: "focus", ref: xRef });
    ctx.mark({ kind: "candidate", ref: tick, term: "gap" });
    ctx.mark({ kind: "measure", from: xRef, to: tick, term: "gap" });
    if (P !== N) {
      const ptick = ref("cart", "xAxisMark", { x: q(P) });
      ctx.read(ptick);
      ctx.mark({ kind: "candidate", ref: ptick, term: "pgap" });
    } else {
      ctx.mark({ kind: "candidate", ref: tick, term: "pgap" });
    }
  },
};

// ---------------------------------------------------------------- the lenses of the new beginner families

/*
 * Two more storyboard rules, for the lenses of layered-line-rules §10.5 rows 3 and 4 before v2-linear's real families
 * (Whole Crossing, Divisibility Ladder) arrive: each cites the elements those families read, with the marks a family
 * should give them. Not dealt anywhere; the gallery and the tests use them.
 */
const card2 = (main: Layer<NoParams>, tb: Layer<NoParams>) => (_p: NoParams, t: string | null) =>
  t === tb.id ? `${main.sentence({})} Tie-breaker: ${tb.sentence({})}` : main.sentence({});
const PRIMES_2_31 = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31].map(p => q(p));

const crossingMain: Layer<NoParams> = {
  id: "whole", title: "crosses the x-axis near a whole number", rep: "crossing", sense: "min", measure: "distance",
  sentence: () => "The line should cross the x-axis as close as possible to a whole number.",
  thresholds: () => [q(1, 2), q(1, 3), q(1, 4), q(1, 6), q(1, 8), q(1, 12), q(0)], rungLabel: label("crosses within", "crosses at a whole number"),
};
const crossingSpf: Layer<NoParams> = {
  id: "spf", title: "that whole number's smallest prime factor", rep: "crossing", sense: "max", measure: "size",
  sentence: () => "That whole number's smallest prime factor should be as big as possible.",
  thresholds: () => PRIMES_2_31, rungLabel: t => `smallest prime factor at least ${fmtQ(t)}`,
};

export const wholeCrossingDemo: RuleFamily<LineState, NoParams> = {
  id: "whole-crossing-demo", title: "Whole Crossing (lens demo)",
  card: card2(crossingMain, crossingSpf), params: [], dealable: () => [{}],
  depends: ["crossing", "cart"], main: crossingMain, tieBreakers: [crossingSpf],
  evaluate(ctx: EvalContext<LineState>) {
    const x0 = ref("crossing", "x0"), near = ref("crossing", "near"), xInt = ref("cart", "xInt");
    const v = ctx.read(x0);
    if (v.kind !== "number") {
      const why = { undefined: v.kind === "undefined" ? v.reason : "no crossing" };
      ctx.term("whole", "distance from the crossing to a whole number", why, [x0]);
      ctx.term("spf", "that whole number's smallest prime factor", why, [x0]);
      ctx.mark({ kind: "note", ref: x0, text: why.undefined });
      return;
    }
    const N = nearestInteger(v.q);
    ctx.read(near);
    ctx.read(xInt);
    const tick = ref("cart", "xAxisMark", { x: q(N) });
    ctx.read(tick);
    ctx.term("whole", `distance from the crossing to ${N}`, distanceToWhole(v.q), [x0, near]);
    ctx.term("spf", `smallest prime factor of ${N}`, q(smallestPrimeFactor(N)), [near]);
    ctx.mark({ kind: "focus", ref: x0 });
    ctx.mark({ kind: "candidate", ref: near, term: "whole" });
    ctx.mark({ kind: "focus", ref: xInt });
    ctx.mark({ kind: "candidate", ref: tick, term: "whole" });
    ctx.mark({ kind: "measure", from: xInt, to: tick, term: "whole" });
  },
};

const ladderMain: Layer<NoParams> = {
  id: "run", title: "a run of multiples from y(1)", rep: "table", sense: "max", measure: "count",
  sentence: () => "y(1) should be a multiple of 1, y(2) a multiple of 2, y(3) of 3, and so on: the run should be as long as possible.",
  thresholds: () => [1, 2, 3, 4, 5, 6, 7, 8].map(n => q(n)), rungLabel: t => `a run of at least ${fmtQ(t)}`,
};
const ladderSteep: Layer<NoParams> = {
  id: "steep", title: "a steep gradient", rep: "si", sense: "max", measure: "size",
  sentence: () => "The gradient should be as steep as possible.",
  thresholds: () => [1, 2, 3, 4, 6, 8].map(n => q(n)), rungLabel: t => `gradient at least ${fmtQ(t)} steep`,
};

export const divisibilityLadderDemo: RuleFamily<LineState, NoParams> = {
  id: "divisibility-ladder-demo", title: "Divisibility Ladder (lens demo)",
  card: card2(ladderMain, ladderSteep), params: [], dealable: () => [{}],
  depends: ["table", "si"], main: ladderMain, tieBreakers: [ladderSteep],
  evaluate(ctx: EvalContext<LineState>) {
    const run = ref("table", "run"), m = ref("si", "m");
    const v = ctx.read(run), mv = ctx.read(m);
    ctx.term("steep", "how steep the gradient is", mv.kind === "number" ? Qn.abs(mv.q) : { undefined: mv.kind === "undefined" ? mv.reason : "no gradient" }, [m]);
    if (v.kind !== "number") {
      const why = { undefined: v.kind === "undefined" ? v.reason : "no run" };
      ctx.term("run", "multiples in a row from y(1)", why, [run]);
      ctx.mark({ kind: "note", ref: run, text: why.undefined });
      return;
    }
    const k = Number(v.q.n);
    // The run: each y(n) ÷ n that is whole, from n = 1; then the first miss.
    const cells = Array.from({ length: k }, (_, i) => ref("table", "q", { x: i + 1 }));
    for (const c of cells) { ctx.read(c); ctx.mark({ kind: "focus", ref: c }); }
    const miss = ref("table", "q", { x: k + 1 });
    ctx.read(miss);
    ctx.mark({ kind: "note", ref: miss, text: `y(${k + 1}) is not a multiple of ${k + 1}` });
    ctx.term("run", "multiples in a row from y(1)", q(k), cells.length ? cells : [run]);
  },
};
