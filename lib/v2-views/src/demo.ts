/**
 * A storyboard rule for the views (integration plan §3.4): "Empty Tank, beginner", two graded parts. It is not in
 * v2-linear's pool; the gallery and the tests use it to show a main part and a tie-breaker until W1 ships two-part
 * families. It follows the rule contract exactly, so it is evaluated by v2-core like any family.
 */
import { cardText, Qn, q, ref, type EvalContext, type Layer, type Q, type RuleFamily } from "@workspace/v2-core";
import { isPrime, isPrimeEnding, nearbyPrimes, type LineState } from "@workspace/v2-linear";

/** The nearest whole minute at or after the first: 1 below 1, else the nearer integer, ties to the smaller. */
function nearestMinute(t: Q): bigint {
  if (Qn.cmp(t, Qn.ONE) < 0) return 1n;
  const f = Qn.floor(t);
  return Qn.cmp(Qn.sub(t, q(f)), q(1, 2)) <= 0 ? f : f + 1n;
}

type NoParams = Record<string, never>;
const main: Layer<NoParams> = {
  id: "gap", title: "runs out at a whole minute", sentence: () => "Make it run out at a whole minute.", rep: "cart",
  sense: "min",
};
const prime: Layer<NoParams> = {
  id: "pgap", title: "that minute is a prime", sentence: () => "Secondary: a prime minute is even better.", rep: "cart",
  sense: "min",
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

// ---------------------------------------------------------------- the tree shape (pool-plan v2)

type EndsP = { ends: number };
/** The primes ending in k around x: the nearest, the next below and the next above. */
function around(x: number, k: number): { below: number | null; nearest: number; above: number } {
  const ok = (n: number) => n > 1 && isPrimeEnding(BigInt(n), k);
  let up = Math.max(2, Math.ceil(x)); while (!ok(up)) up++;
  let down = Math.floor(x); while (down > 1 && !ok(down)) down--;
  const lo = down > 1 ? down : null;
  const nearest = lo !== null && x - lo <= up - x ? lo : up;
  let above = nearest + 1; while (!ok(above)) above++;
  let below = nearest - 1; while (below > 1 && !ok(below)) below--;
  return { below: below > 1 ? below : null, nearest, above };
}
const tMain = { id: "target", title: "the prime ending in 1 nearest the y-intercept", sentence: () => "Find the prime ending in 1 nearest the y-intercept: the bigger that prime, the better.", rep: "si", sense: "max" as const };
const tNear = { id: "close", title: "how far the y-intercept is from it", sentence: () => "Secondary: the y-intercept as close to that prime as possible.", rep: "si", sense: "min" as const };
const tThird = { id: "times", title: "the gradient times the prime, in doublings from 1", sentence: () => "Third: the gradient times that prime as close to 1 as possible, counted in doublings.", rep: "si", sense: "min" as const };

/**
 * Prime Intercept in the tree shape (pool-plan v2's example), following the annotation contract exactly: each mark
 * labelled with its layer's term. Not in any pool; the gallery and the tests use it until the recast families land.
 */
export const treePrimeIntercept: RuleFamily<LineState, EndsP> = {
  id: "test-prime-intercept", title: "Prime Intercept", params: [], dealable: () => [{ ends: 1 }], depends: ["si", "cart"],
  card: (p, tb) => cardText(tMain, [tNear, tThird], p, tb),
  main: tMain, tieBreakers: [tNear, tThird],
  evaluate(ctx, p) {
    const reading = ref("si", "c"), m = ref("si", "m");
    const c = ctx.read(reading), g = ctx.read(m);
    if (c.kind !== "number" || g.kind !== "number") {
      for (const l of [tMain, tNear, tThird]) ctx.term(l.id, l.title, { undefined: "a vertical line has no y-intercept" }, [reading]);
      return;
    }
    const size = Qn.abs(c.q), t = around(Qn.toNumber(size), p.ends), target = q(t.nearest);
    // Every element a mark cites is read first (the engine checks it).
    const at = (y: number) => { const r = ref("cart", "yAxisMark", { y: String(Qn.sign(c.q) < 0 ? -y : y) }); ctx.read(r); return r; };
    ctx.read(ref("cart", "yInt"));
    ctx.term(tMain.id, tMain.title, target, [reading]);
    ctx.mark({ kind: "focus", ref: reading, term: tMain.id });
    ctx.mark({ kind: "candidate", ref: at(t.nearest), term: tMain.id });
    ctx.mark({ kind: "candidate", ref: at(t.above), term: tMain.id });
    if (t.below !== null) ctx.mark({ kind: "candidate", ref: at(t.below), term: tMain.id });
    ctx.term(tNear.id, tNear.title, Qn.abs(Qn.sub(size, target)), [reading]);
    ctx.mark({ kind: "measure", from: ref("cart", "yInt"), to: at(t.nearest), term: tNear.id });
    const product = Qn.mul(Qn.abs(g.q), target);
    const doublings = Qn.isZero(product) ? q(99) : q(Math.round(Math.abs(Math.log2(Qn.toNumber(product))) * 100), 100);
    ctx.term(tThird.id, tThird.title, doublings, [m]);
    ctx.mark({ kind: "focus", ref: m, term: tThird.id });
    ctx.mark({ kind: "note", ref: m, term: tThird.id, text: `${t.nearest} × ${Qn.toWire(Qn.abs(g.q))} = ${Qn.toWire(product)}` });
  },
};
