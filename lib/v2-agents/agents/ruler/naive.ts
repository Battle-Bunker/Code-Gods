// Ruler · Naive (for learning)
// Main part: distance² from (0, 0) close to a square. Tie-breaker: whichever you were dealt (that whole distance; the gradient close to a prime; the triangle's area close to a square).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.isZero(m)) return null;                   // a flat line: the rule wants a sloping one
  const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared: c² / (m² + 1)
  const sq = near(d2, square) || 1;               // the square number nearest it (1 at the least)
  const main = Q.neg(Q.abs(Q.sub(d2, sq)));
  const far = root(sq);                           // that square's root: a whole distance
  // main: how far the distance from (0, 0), squared, is from a square number (closer is better)
  if (tie === "far") return [main, far];   // a bigger whole distance is better
  if (tie === "prime-gradient") {   // a gradient close to a prime is better
    const mp = near(m, prime);                  // the prime nearest the gradient
    return [main, Q.neg(Q.abs(Q.sub(m, mp)))];
  }
  if (tie === "square-area") {   // a triangle whose area is close to a square number is better
    const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));   // the triangle cut off the axes (none when c = 0)
    return [main, Q.isZero(c) ? null : Q.neg(Q.abs(Q.sub(area, near(area, square))))];
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
