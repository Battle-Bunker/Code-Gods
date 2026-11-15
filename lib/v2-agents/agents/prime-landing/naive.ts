// Prime Landing · Naive (for learning)
// Main part: the y-intercept on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the factor that prime minus 1 shares with the gradient's whole part; how long y(1), y(2), … go on being such primes).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const landing = near(c, prime, p.ends);         // it lands on the x-axis: the rung nearest there
    const main = Q.eq(c, landing) ? landing : Q.neg(Q.abs(Q.sub(c, landing)));
    return [main, null];
  }
  const landing = near(c, prime, p.ends);         // the prime ending in p.ends nearest the y-intercept: the rung
  const main = Q.eq(c, landing) ? landing : Q.neg(Q.abs(Q.sub(c, landing)));   // on a rung: the rung; else below every rung
  // main: the y-intercept itself when it is a prime ending in the rule's digit (bigger is better: a ladder with no top), else minus how far it is from the nearest one
  if (tie === "shared-factor") {   // that prime minus 1 sharing a bigger factor with the gradient's whole part is better
    const wm = whole(Q.div(Q.sub(Q.mul(2, m), 1), 2));   // the gradient's whole part (rounded down)
    return [main, common(Q.sub(landing, 1), wm)];
  }
  if (tie === "climb-on") {   // y(1), y(2), ... going on longer as primes ending in the rule's digit is better
    let on = 0;                                     // y(1), y(2), ... new primes ending in p.ends, in a row
    for (let n = 1; n <= 12; n++) { const t = Q.add(Q.mul(m, n), c); if (Q.eq(m, 0) || Q.eq(t, landing) || !prime(t) || !Q.toString(t).endsWith(String(p.ends))) break; on++; }
    return [main, on];
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
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
