// Exact Change · Naive (for learning)
// Main part: ways to pay close to the target. Tie-breaker: whichever you were dealt (the smaller pile in every way; the bill; both coins close to primes).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.cmp(m, 0) >= 0) return null;              // a coin worth -m·b: the line must go downhill
  const X = Q.neg(Q.div(c, m));                   // where the line meets y = 0: x goes no further
  if (Q.cmp(X, 100001) >= 0) return null;         // too many ways to count: no score
  const b = m.d * Q.of(m.d, c.d).d;               // the coin b: the smallest whole number making b·m and b·c whole
  const ways = [];                                // each way to pay, as its x: the line's whole points with x, y ≥ 0
  for (let x = 0; Q.cmp(x, X) <= 0; x++) if (Q.isInteger(Q.add(Q.mul(m, x), c))) ways.push(x);
  const main = Q.neg(Q.abs(ways.length - p.ways));
  // main: how far the number of ways to pay is from the target (closer is better)
  if (tie === "big-piles") {   // a bigger smaller pile, in every way to pay, is better
    if (!ways.length) return [main, null];      // no way to pay: no piles
    const y = Q.add(Q.mul(m, ways.at(-1)), c);  // the fewest coins of b
    return [main, Q.cmp(ways[0], y) < 0 ? ways[0] : y];
  }
  if (tie === "big-bill") return [main, Q.mul(c, b)];   // a bigger bill N = b·c is better
  if (tie === "prime-coins") {   // both coins (a = -b·m and b) close to primes is better
    const off = x => Q.abs(Q.sub(x, near(x, prime)));   // how far x is from the nearest prime
    return [main, Q.neg(Q.add(off(Q.mul(m, -b)), off(b)))];
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
