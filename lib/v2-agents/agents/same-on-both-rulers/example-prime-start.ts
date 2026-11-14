// Same on Both Rulers · Example: |c| close to a prime
// Main part: the unchanged number close to T. Tie-breaker: |c| close to a prime.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: change FAR = 4 to 8 and see which primes it finds.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  if (Q.eq(m, 1)) return null;                    // × 1: no number stays unchanged
  const fixed = Q.div(c, Q.sub(1, m));            // where y = mx + c meets y = x
  const main = Q.neg(Q.abs(Q.sub(fixed, p.T)));
  const start = Q.abs(c);
  return [main, Q.neg(Q.abs(Q.sub(start, near(start, prime))))];   // main: how far the number the machine leaves unchanged is from T (closer is better); tie-breaker: |c| close to a prime is better
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
    tries.push([move("cart.pivot", { x0: p.T, k }), Q.add(m, k), Q.sub(c, Q.mul(k, p.T))]);   // turn the line about its point at x = T (if it crosses y = x there, it still does)
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
