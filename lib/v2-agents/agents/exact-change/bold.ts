// Exact Change · Bold
// Main part: ways to pay close to the target. Tie-breaker: whichever you were dealt (the smaller pile in every way; the bill; both coins close to primes).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const a = Q.neg(m), N = c;                      // y = mx + c read as a·x + 1·y = N
  if (Q.cmp(a, 0) <= 0) return null;              // coins must be worth more than 0
  if (!Q.isInteger(m) || !Q.isInteger(c)) return null;   // this agent reads whole-number lines only
  if (Q.cmp(N, 0) >= 0 && whole(Q.sub(Q.div(N, a), Q.of(1, 2))) > 100000) return null;   // too many ways to count
  const ways = Q.cmp(N, 0) < 0 ? 0 : whole(Q.sub(Q.div(N, a), Q.of(1, 2))) + 1;   // x = 0, 1, ... while a·x ≤ N
  const main = Q.neg(Q.abs(Q.sub(ways, p.ways)));
  // main: how far the number of ways to pay N with coins a and 1 is from the target (closer is better)
  if (tie === "big-piles") return [main, ways > 0 ? 0 : null];   // with a coin worth 1, paying all in ones always has an empty pile
  if (tie === "big-bill") return [main, N];   // a bigger bill is better
  if (tie === "prime-coins") return [main, Q.sub(Q.neg(Q.abs(Q.sub(a, near(a, prime)))), 1)];   // coins close to primes are better (the 1 is always 1 from 2)
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
