// Ruler (tuple) · Naive (for learning)
// Main part: the nearest target's size, the bigger the better. Secondary preference: whichever you were dealt (how close to that target; the y-intercept near a whole number; the gradient times the prime near 1).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const x = Q.div(Q.mul(c, c), Q.add(1, Q.mul(m, m)));   // the distance from (0, 0) to the line, squared
  const n = near(x, prime, p.ends), main = n;      // the prime ending in p.ends nearest it: bigger is better
  // main: the prime ending in the rule's digit nearest the squared distance from (0, 0), the bigger the better
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "closeness") return Q.neg(Q.abs(Q.sub(x, n)));   // how close the reading is to that target: nearer is better
    if (t === "intercept-multiple") return Q.neg(toMultiple(Q.abs(c), Q.of(1)));   // the y-intercept's size should be near a whole number
    if (t === "gradient-log") return Q.isZero(m) ? null : Q.neg(doublings(m, n));   // the gradient's size times the target should be near 1, counted in doublings
    return null;
  })];
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
