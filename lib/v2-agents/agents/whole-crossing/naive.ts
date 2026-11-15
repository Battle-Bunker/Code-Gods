// Whole Crossing · Naive (for learning)
// Main part: the x-axis crossing close to a whole number. Tie-breaker: whichever you were dealt (that whole number's smallest prime factor; that whole number's largest prime factor; the gradient's smallest prime factor).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const k = whole(c);                             // the whole number nearest where it stands (x = c)
    const main = Q.neg(Q.abs(Q.sub(c, k)));
    const fk = factors(k);                          // its prime factors, smallest first
    return [main, tie === "k-spf" ? (fk[0] ?? 1) : tie === "k-gpf" ? (fk.at(-1) ?? 1) : null];
  }
  if (Q.isZero(m)) return null;                   // a flat line never crosses: the worst score
  const x = Q.neg(Q.div(c, m));                   // where y = mx + c crosses the x-axis
  const k = whole(x);                             // the whole number nearest the crossing
  const main = Q.neg(Q.abs(Q.sub(x, k)));
  const fk = factors(k), fm = factors(m) ?? [];   // prime factors, smallest first ([] for 0, 1, -1)
  // main: how far the line's x-axis crossing is from a whole number (closer is better)
  if (tie === "k-spf") return [main, fk[0] ?? 1];   // that whole number's smallest prime factor big is better
  if (tie === "k-gpf") return [main, fk.at(-1) ?? 1];   // that whole number's largest prime factor big is better
  if (tie === "m-spf") return [main, fm[0] ?? 1];   // the gradient's smallest prime factor big is better
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
