// Treasure · Bold
// Main part: y(k) close to T. Tie-breaker: whichever you were dealt (different primes among y(1) … y(8); the gradient close to a prime; the y-intercept close to a square).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const main = Q.neg(Q.abs(Q.sub(Q.add(Q.mul(m, p.k), c), p.T)));   // y(k) = m·k + c
  // main: how far y(k) is from T (closer is better)
  if (tie === "prime-terms") {   // more different primes among y(1) ... y(8) is better
    const primes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(x => Q.add(Q.mul(m, x), c)).filter(prime).map(Q.toString));   // y(1) ... y(8)
    return [main, primes.size];
  }
  if (tie === "prime-gradient") return [main, Q.neg(Q.abs(Q.sub(m, near(m, prime))))];   // a gradient close to a prime is better
  if (tie === "square-start") return [main, Q.neg(Q.abs(Q.sub(c, near(c, square))))];   // a y-intercept close to a square number is better
  return [main];
}

const FAR = 6;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);     // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);      // make it steeper or flatter
    for (let j = -FAR; j <= FAR; j++) {                          // both at once
      if (j !== 0) tries.push([[move("si.shift", { k }), move("si.tilt", { k: j })], Q.add(m, j), Q.add(c, k)]);
    }
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
