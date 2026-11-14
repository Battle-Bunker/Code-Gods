// Exact Change · Example: the bill
// Main part: ways to pay close to the target. Tie-breaker: the bill.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: remove the "stretch" line: can adding alone grow the bill and keep the ways?

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  const a = Q.neg(m), N = c;                      // y = mx + c read as a·x + 1·y = N
  if (Q.cmp(a, 0) <= 0) return null;              // coins must be worth more than 0
  if (!Q.isInteger(m) || !Q.isInteger(c)) return null;   // this agent reads whole-number lines only
  if (Q.cmp(N, 0) >= 0 && whole(Q.sub(Q.div(N, a), Q.of(1, 2))) > 100000) return null;   // too many ways to count
  const ways = Q.cmp(N, 0) < 0 ? 0 : whole(Q.sub(Q.div(N, a), Q.of(1, 2))) + 1;   // x = 0, 1, ... while a·x ≤ N
  const main = Q.neg(Q.abs(Q.sub(ways, p.ways)));
  return [main, N];   // main: how far the number of ways to pay N with coins a and 1 is from the target (closer is better); tie-breaker: a bigger bill is better
}

const FAR = 3;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    const f = k > 0 ? k + 1 : k - 1;
    tries.push([move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);   // multiply every output by f (m and c both)
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
