// Prime Gradient · Naive (for learning)
// Main part: gradient close to the dealt prime. Tie-breaker: whichever you were dealt (the size of that prime; the y-intercept close to such a prime too; the y-intercept's smallest prime factor; the y-intercept's largest prime factor).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const s = p.side ?? 1;                          // 1, or −1 on the mirror: minus a prime
  const nearest = near(Q.mul(s, m), prime, p.ends);   // the prime ending in p.ends nearest the gradient (times s)
  if (nearest === null) return null;              // none within 10,000: hopeless
  const main = Q.neg(Q.abs(Q.sub(Q.mul(s, m), nearest)));
  // main: how far the gradient is from the nearest prime ending in the rule's digit (closer is better)
  if (tie === "prime") return [main, nearest];   // a bigger prime is better
  if (tie === "cPrime") {   // a y-intercept close to such a prime too is better
    const cp = near(Q.mul(s, c), prime, p.ends);   // the prime ending in p.ends nearest the y-intercept (times s)
    return [main, Q.neg(Q.abs(Q.sub(Q.mul(s, c), cp)))];
  }
  if (tie === "c-spf") {   // the y-intercept's smallest prime factor big is better
    const fc = factors(c) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fc[0] ?? 1];
  }
  if (tie === "c-gpf") {   // the y-intercept's largest prime factor big is better
    const fc = factors(c) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fc.at(-1) ?? 1];
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
    const den = Q.sub(1, Q.mul(m, k));
    tries.push(Q.isZero(den) ? [move("si.tilt", { k }), Q.add(m, k), c] : [move("rot.turn", { centre: 0, turn: k }), Q.div(Q.add(m, k), den), c]);   // turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
