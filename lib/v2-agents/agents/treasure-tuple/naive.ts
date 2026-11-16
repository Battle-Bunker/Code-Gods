// Treasure (tuple) · Naive (for learning)
// Main part: the nearest target's size, the bigger the better. Secondary preference: whichever you were dealt (how close to that target; the gradient near the triangle's row count; the y-intercept near a multiple of the row count).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const x = Q.abs(Q.add(Q.mul(m, p.k), c));       // y at x = k, ignoring a minus sign
  const w = Q.cmp(x, 0) <= 0 ? 0n : BigInt(whole(Q.sub(x, Q.div(1, 2)))), r0 = w < 1n ? 1n : (BigInt(root(Q.add(Q.mul(8, Q.of(w)), 1))) - 1n) / 2n;   // w: x rounded down
  const pile = r => (r * (r + 1n)) / 2n;          // the triangle number with r rows: 1 + 2 + ... + r
  const rows = Q.cmp(Q.abs(Q.sub(x, Q.of(pile(r0 + 1n)))), Q.abs(Q.sub(x, Q.of(pile(r0))))) < 0 ? r0 + 1n : r0;   // the nearer (the fewer rows on a tie)
  const n = pile(rows), main = n;                  // the triangle number nearest y: bigger is better
  // main: the triangle number (1, 3, 6, 10, ...) nearest y at x = k, the bigger the better
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "closeness") return Q.neg(Q.abs(Q.sub(x, n)));   // how close the reading is to that target: nearer is better
    if (t === "gradient-rows") return Q.neg(Q.abs(Q.sub(Q.abs(m), Q.of(rows))));   // the gradient's size should be near the triangle's number of rows
    if (t === "intercept-multiple") return Q.neg(toMultiple(Q.abs(c), Q.of(rows)));   // the y-intercept's size should be near a multiple of the number of rows
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
