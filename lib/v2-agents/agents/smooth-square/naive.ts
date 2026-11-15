// Smooth Square · Naive (for learning)
// Main part: area close to a square number. Tie-breaker: whichever you were dealt (prime factors shared by that square's root and the x-intercept's nearest whole number).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score
  const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));
  const sq = near(area, square);                  // the square number nearest the area
  const main = Q.neg(Q.abs(Q.sub(area, sq)));
  // main: how far the triangle's area is from a square number (closer is better)
  if (tie === "shared") return [main, shared(root(sq), whole(Q.neg(Q.div(c, m))))];   // that square's root sharing many prime factors with the whole number nearest the x-axis crossing is better
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
    tries.push([move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]);   // turn the line about its point at x = -1 (m and c both change by k)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
