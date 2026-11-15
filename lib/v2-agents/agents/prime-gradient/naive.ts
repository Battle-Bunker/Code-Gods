// Prime Gradient · Naive (for learning)
// Main part: the gradient rounding to as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both that prime plus 1 and the y-intercept's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const level = r => { const D = Q.toString(r).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(r, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const s = p.side ?? 1, x = Q.mul(s, m);          // the gradient, or minus it on the mirror
  const rung = near(x, prime, p.ends);             // the prime ending in p.ends nearest: the rung
  if (rung === null) return null;                 // none within 10,000: hopeless
  const gap = Q.abs(Q.sub(x, rung));               // on the rung when it rounds there (within 1/2, ties up)
  const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, x), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));
  // main: the prime ending in the rule's digit the gradient rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
  if (tie === "shared-factor") {   // take the number just after that prime: a bigger number dividing both it and the y-intercept's whole part is better
    const wc = whole(Q.sub(Q.abs(c), Q.div(1, 2)));   // the y-intercept's whole part, ignoring sign
    return [main, common(Q.add(rung, 1), wc)];
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
    if (!Q.isZero(den)) tries.push([move("rot.turn", { centre: 0, turn: k }), Q.div(Q.add(m, k), den), c]);   // turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
