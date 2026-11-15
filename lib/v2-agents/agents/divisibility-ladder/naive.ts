// Divisibility Ladder · Naive (for learning)
// Main part: a run of y-values each divisible by its position: y(1) by 1, y(2) by 2, …. Tie-breaker: whichever you were dealt (the gradient's smallest prime factor; the gradient's largest prime factor; how steep the line is; the gradient close to a prime).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.isZero(c)) return null;                   // through (0, 0): the rule wants a line that is not
  let main = 0;
  for (let n = 1; n <= 12; n++) {                 // the run of n dividing y(n)
    const y = Q.add(Q.mul(m, n), c);
    if (!Q.isInteger(y) || !Q.isInteger(Q.div(y, n))) break;
    main++;
  }
  const fm = factors(m) ?? [];                    // the gradient's prime factors ([] for 0, 1, -1)
  // main: how many of y(1), y(2), y(3), ... in a row are multiples of 1, 2, 3, ... (more is better)
  if (tie === "m-spf") return [main, fm[0] ?? 1];   // the gradient's smallest prime factor big is better
  if (tie === "m-gpf") return [main, fm.at(-1) ?? 1];   // the gradient's largest prime factor big is better
  if (tie === "steep") return [main, Q.abs(m)];   // a steeper gradient is better
  if (tie === "m-prime") {   // a gradient close to a prime is better
    const mp = near(m, prime);
    return [main, Q.neg(Q.abs(Q.sub(m, mp)))];
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
