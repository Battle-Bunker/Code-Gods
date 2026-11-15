// Prime Landing · Naive (for learning)
// Main part: where the line lands on the x-axis, on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the factor that prime minus 1 shares with the y-intercept's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
    const x = Q.mul(p.side ?? 1, c);                // it stands on the x-axis at x = c (minus that, on the mirror)
    const landing = near(x, prime, p.ends);         // the rung nearest there
    const gap = Q.abs(Q.sub(x, landing));
    const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? level(landing) : Q.neg(Q.sub(gap, Q.div(1, 2)));
    return [main, ...(tie ? tie.split(">") : []).map(t => null)];
  }
  const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  if (Q.isZero(m)) return null;                   // a flat line never lands: the worst score
  const x = Q.mul(p.side ?? 1, Q.neg(Q.div(c, m)));   // where y = mx + c lands on the x-axis (minus that, on the mirror)
  const landing = near(x, prime, p.ends);         // the prime ending in p.ends nearest there: the rung
  const gap = Q.abs(Q.sub(x, landing));            // on the rung when it rounds there (within 1/2, ties up)
  const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? level(landing) : Q.neg(Q.sub(gap, Q.div(1, 2)));
  // main: the prime ending in the rule's digit that where the line lands on the x-axis rounds to (bigger is better: a ladder with no top), else minus how far it is from rounding to one
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each tie-breaker, in order
    if (t === "shared-factor") {   // take the number just before that prime: a bigger number dividing both it and the y-intercept's whole part is better
      const wc = whole(Q.div(Q.sub(Q.mul(2, c), 1), 2));   // the y-intercept's whole part (rounded down)
      return common(Q.sub(landing, 1), wc);
    }
    return null;
  })];
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
