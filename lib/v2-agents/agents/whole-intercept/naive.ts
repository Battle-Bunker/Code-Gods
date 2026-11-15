// Whole Intercept · Naive (for learning)
// Main part: y-intercept close to a whole number. Tie-breaker: whichever you were dealt (smallest prime factor of that whole number; prime factors of that whole number).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const up = whole(c);                            // the whole number nearest the y-intercept (a half rounds up)
  const spf = k => (Q.isZero(k) ? 2 : (factors(k)[0] ?? 1));   // smallest prime factor: 2 for 0, 1 for 1 and -1
  const half = Q.eq(Q.sub(up, c), Q.of(1, 2));   // exactly halfway between two whole numbers?
  const n = half && spf(Q.sub(up, 1)) > spf(up) ? Q.sub(up, 1) : up;   // halfway: the one with the bigger smallest prime factor
  const main = Q.neg(Q.abs(Q.sub(c, n)));
  const f = factors(n);                           // its prime factors, smallest first
  // main: how far the y-intercept is from a whole number (closer is better)
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each tie-breaker, in order
    if (t === "spf") return spf(n);   // a bigger smallest prime factor is better (a big prime is best)
    if (t === "omega") return f.length;   // more prime factors are better
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
