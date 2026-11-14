// Prime Staircase · Simple
// Main part: a run of different primes from y(0). Tie-breaker: whichever you were dealt (the first prime; the last prime of the run; the first non-prime term close to a prime; y(−1) close to a prime).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const run = [];                                 // the different primes it starts with
  let stopped = false, miss = null;               // miss: the first term that is not prime
  for (let n = 0; n < 12; n++) {                  // y(0) ... y(11)
    const t = Q.add(Q.mul(m, n), c), isPrime = prime(t);
    if (!stopped && isPrime && !run.some(r => Q.eq(r, t))) run.push(t); else stopped = true;
    if (!isPrime && miss === null) miss = t;
  }
  const main = run.length;
  // main: how many different primes the pattern y(0), y(1), ... starts with (more is better)
  if (tie === "first-prime") return [Math.min(main, 6), run.length ? run[0] : 0];   // a bigger first prime is better
  if (tie === "last-prime") return [Math.min(main, 6), run.length ? run[run.length - 1] : 0];   // a bigger last prime is better
  if (tie === "near-miss") {   // the first term that is not prime should be close to a prime
    const far = miss === null ? null : Q.abs(miss);
    return [Math.min(main, 6), far === null ? null : Q.neg(Q.abs(Q.sub(far, near(far, prime))))];
  }
  if (tie === "step-back") {   // y(-1) close to a prime is better
    const back = Q.abs(Q.sub(c, m));                // y(-1), ignoring its sign
    return [Math.min(main, 6), Q.neg(Q.abs(Q.sub(back, near(back, prime))))];
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
