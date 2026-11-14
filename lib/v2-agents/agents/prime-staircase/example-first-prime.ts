// Prime Staircase · Example: the first prime
// Main part: a run of different primes from y(0). Tie-breaker: the first prime.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: change FAR = 6 to 10 so it can jump to bigger primes.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  const run = [];                                 // the different primes it starts with
  let stopped = false, miss = null;               // miss: the first term that is not prime
  for (let n = 0; n < 12; n++) {                  // y(0) ... y(11)
    const t = Q.add(Q.mul(m, n), c), isPrime = prime(t);
    if (!stopped && isPrime && !run.some(r => Q.eq(r, t))) run.push(t); else stopped = true;
    if (!isPrime && miss === null) miss = t;
  }
  const main = run.length;
  return [Math.min(main, 6), run.length ? run[0] : 0];   // main: how many different primes the pattern y(0), y(1), ... starts with (more is better); tie-breaker: a bigger first prime is better
}

const FAR = 6;      // how far one change may go
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
    tries.push([move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]);   // change the pattern's step, keeping y(1)
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
