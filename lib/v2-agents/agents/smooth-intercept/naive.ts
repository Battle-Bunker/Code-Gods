// Smooth Intercept · Naive (for learning)
// Main part: the y-intercept made of as many of the dealt primes as possible. Tie-breaker: whichever you were dealt (the factor that number plus 1 shares with the gradient's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const a = Q.abs(c), s = near(a, n => n >= 2 && factors(n).every(f => p.primes.includes(Number(f))));   // the nearest rung
  if (s === null) return null;                    // none within 10,000: hopeless
  let main = Q.neg(Q.abs(Q.sub(a, s)));           // off every rung: below them all
  if (Q.eq(a, s)) {                               // on a rung: the dealt primes multiplied (omega), in levels
    const omega = factors(s).length; let level = 0;
    while (((level + 1) * (level + 2)) / 2 <= omega) level++;   // level L needs L(L + 1)/2 of them
    main = Q.add(level, Q.div(Q.add(omega - (level * (level + 1)) / 2, Q.div(1, Q.add(2, s))), level + 1));
  }
  // main: how many of the rule's primes the y-intercept (ignoring sign) is made of, in levels that each need one more than the last (more is better: a ladder with no top; of two with as many, the smaller), else minus how far it is from the nearest such number
  if (tie === "shared-factor") {   // take the number just after that number: a bigger number dividing both it and the gradient's whole part is better
    const wm = whole(Q.div(Q.sub(Q.mul(2, m), 1), 2));   // the gradient's whole part (rounded down)
    return [main, common(Q.add(s, 1), wm)];
  }
  return [main];
}

const FAR = 3;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    const f = k > 0 ? k + 1 : k - 1;
    tries.push([move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);   // multiply every output by f (m and c both)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
