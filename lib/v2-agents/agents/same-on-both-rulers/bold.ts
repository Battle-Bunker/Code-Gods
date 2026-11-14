// Same on Both Rulers · Bold
// Main part: the unchanged number close to T. Tie-breaker: whichever you were dealt (the gradient far from 1; |c| close to a prime; different whole numbers among y(−5) … y(5); the lamp's height close to whole).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.eq(m, 1)) return null;                    // × 1: no number stays unchanged
  const fixed = Q.div(c, Q.sub(1, m));            // where y = mx + c meets y = x
  const main = Q.neg(Q.abs(Q.sub(fixed, p.T)));
  // main: how far the number the machine leaves unchanged is from T (closer is better)
  if (tie === "steep") return [main, Q.abs(Q.sub(m, 1))];   // a gradient far from 1 is better
  if (tie === "prime-start") {   // |c| close to a prime is better
    const start = Q.abs(c);
    return [main, Q.neg(Q.abs(Q.sub(start, near(start, prime))))];
  }
  if (tie === "whole-values") {   // more different whole numbers among y(-5) ... y(5) is better
    const values = new Set([...Array(11).keys()].map(i => Q.add(Q.mul(m, i - 5), c)).filter(Q.isInteger).map(Q.toString));   // y(-5) ... y(5)
    return [main, values.size];
  }
  if (tie === "whole-lamp") {   // a lamp at a whole height is better
    const lamp = Q.div(m, Q.sub(m, 1));             // the lamp's height m/(m - 1)
    return [main, Q.neg(Q.abs(Q.sub(lamp, whole(lamp))))];
  }
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
