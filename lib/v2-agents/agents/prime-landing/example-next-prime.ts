// Prime Landing · Example: y(1) close to a prime too
// Main part: the y-intercept close to a prime. Tie-breaker: y(1) close to a prime too.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: change FAR = 4 to 2: cheaper moves, but does it still get there?

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  const landing = near(c, prime);                 // the prime nearest the y-intercept
  const main = Q.neg(Q.abs(Q.sub(c, landing)));
  const y1 = Q.abs(Q.add(m, c));                  // y(1) = m + c, ignoring its sign
  return [main, Q.neg(Q.abs(Q.sub(y1, near(y1, prime))))];   // main: how far the y-intercept is from the nearest prime (closer is better); tie-breaker: y(1) close to a prime too is better
}

const FAR = 4;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
