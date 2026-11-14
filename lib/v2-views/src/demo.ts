/**
 * A storyboard rule for the views (integration plan §3.4): "Empty Tank, beginner", two graded parts. It is not in
 * v2-linear's pool; the gallery and the tests use it to show a main part and a tie-breaker until W1 ships two-part
 * families. It follows the rule contract exactly, so it is evaluated by v2-core like any family.
 */
import { Qn, q, ref, type EvalContext, type Q, type RuleFamily, type Rung } from "@workspace/v2-core";
import { distanceLadder, isPrime, nearbyPrimes, type LineState } from "@workspace/v2-linear";
import type { PartLadders } from "./annotate.ts";
import { fmtQ } from "./format.ts";

const Q_STEPS = [q(8), q(4), q(2), q(1), q(1, 2), q(1, 4), q(1, 8), q(0)];
const PRIME_STEPS = [q(3), q(2), q(1), q(0)];

const steps = (ds: readonly Q[], near: string, exact: string): readonly Rung[] => [
  { score: null, label: "anything" },
  ...ds.map(d => ({ score: [Qn.neg(d)], label: Qn.isZero(d) ? exact : `${near} ${fmtQ(d)}` })),
];

/** The nearest whole minute at or after the first: 1 below 1, else the nearer integer, ties to the smaller. */
function nearestMinute(t: Q): bigint {
  if (Qn.cmp(t, Qn.ONE) < 0) return 1n;
  const f = Qn.floor(t);
  return Qn.cmp(Qn.sub(t, q(f)), q(1, 2)) <= 0 ? f : f + 1n;
}

export const emptyTank: RuleFamily<LineState, Record<string, never>> & PartLadders<Record<string, never>> = {
  id: "empty-tank-demo", title: "Empty Tank", curve: "distance",
  card: () => "Your line is a draining water tank: it starts with c litres and loses −m litres a minute. Make it run out at a whole minute; a prime minute is even better.",
  params: [], dealable: () => [{}],
  depends: ["cart", "si", "seq"], primary: "cart",
  ladder: () => steps(Q_STEPS, "runs out within", "runs out at a whole minute"),
  partLadders: () => [
    steps(Q_STEPS, "runs out within", "runs out at a whole minute"),
    steps(PRIME_STEPS, "that minute is within", "that minute is a prime"),
  ],
  evaluate(ctx: EvalContext<LineState>) {
    const mRef = ref("si", "m"), cRef = ref("si", "c"), xRef = ref("cart", "xInt");
    const m = ctx.read(mRef), c = ctx.read(cRef);
    const x = ctx.read(xRef);
    const draining = m.kind === "number" && c.kind === "number" && Qn.sign(m.q) < 0 && Qn.sign(c.q) > 0;
    if (!draining || x.kind !== "point") {
      const why = { undefined: "this tank is not draining (it needs c above 0 and m below 0)" };
      ctx.term("gap", "gap between the emptying time and the nearest whole minute", why, [mRef, cRef]);
      ctx.term("pgap", "gap between that minute and a prime", why, [mRef, cRef]);
      ctx.score([{ term: "gap", sense: "min" }, { term: "pgap", sense: "min" }]);
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
    ctx.score([{ term: "gap", sense: "min" }, { term: "pgap", sense: "min" }]);
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
