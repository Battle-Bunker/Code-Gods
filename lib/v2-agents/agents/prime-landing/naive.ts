// Prime Landing · Naive (for learning)
// Main part: the y-intercept close to the dealt prime. Tie-breaker: whichever you were dealt (that prime; the gradient close to such a prime too; y(1) close to such a prime too; the gradient's smallest prime factor; the gradient's largest prime factor).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const landing = near(c, prime, p.ends);         // it lands on the x-axis: the prime ending in p.ends nearest
    const main = Q.neg(Q.abs(Q.sub(c, landing)));
    return [main, null];
  }
  const landing = near(c, prime, p.ends);         // the prime ending in p.ends nearest the y-intercept
  const main = Q.neg(Q.abs(Q.sub(c, landing)));
  // main: how far the y-intercept is from the nearest prime ending in the rule's digit (closer is better)
  if (tie === "big-prime") return [main, landing];   // a bigger prime is better
  if (tie === "prime-gradient") {   // a gradient close to such a prime too is better
    const mp = near(m, prime, p.ends);          // the prime ending in p.ends nearest the gradient
    return [main, Q.neg(Q.abs(Q.sub(m, mp)))];
  }
  if (tie === "next-prime") {   // y(1) (ignoring sign) close to such a prime too is better
    const y1 = Q.abs(Q.add(m, c));                 // y(1) = m + c, ignoring its sign
    return [main, Q.neg(Q.abs(Q.sub(y1, near(y1, prime, p.ends))))];
  }
  if (tie === "m-spf") {   // the gradient's smallest prime factor big is better
    const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fm[0] ?? 1];
  }
  if (tie === "m-gpf") {   // the gradient's largest prime factor big is better
    const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fm.at(-1) ?? 1];
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
