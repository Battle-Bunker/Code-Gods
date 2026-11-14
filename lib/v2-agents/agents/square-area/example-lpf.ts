// Square Area · Example: that square's root's largest prime factor
// Main part: area close to a square number. Tie-breaker: that square's root's largest prime factor.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: add the "stretch" lens from the Thorough starter.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score
  const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));
  const sq = near(area, square);                  // the square number nearest the area
  if (sq === null) return null;                   // none within 10,000: hopeless
  const main = Q.neg(Q.abs(Q.sub(area, sq)));
  const f = factors(root(sq));                    // the prime factors of that square's root
  return [main, f.at(-1) ?? 1];   // main: how far the triangle's area is from a square number (closer is better); tie-breaker: a root whose largest prime factor is big is better
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
    tries.push([move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]);   // turn the line about its point at x = -1 (m and c both change by k)
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
