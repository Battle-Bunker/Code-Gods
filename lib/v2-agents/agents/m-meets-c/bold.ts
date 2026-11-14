// m Meets c · Bold
// Main part: gradient close to the y-intercept. Tie-breaker: whichever you were dealt (they meet at a big number; they meet at a prime).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and change the agent to keep it. It never spends more than a quarter of its energy on one move.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const main = Q.neg(Q.abs(Q.sub(m, c)));
  // main: how far apart the gradient and the y-intercept are (closer is better)
  if (tie === "size") return [main, Q.abs(c)];   // a bigger y-intercept is better
  if (tie === "meetPrime") {   // meeting at a prime is best
    const cp = near(c, prime);
    if (cp === null) return null;
    return [main, Q.neg(Q.abs(Q.sub(c, cp)))];
  }
  return [main];
}

const FAR = 6;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
const SPEND = 0.25;    // never spend more than a quarter of your energy on one move

function agent(offer) {
  // A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
  contested(offer, 3);
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
  if (!plans.length) return null;
  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
  if (!plan || price(offer, plan) > energy(offer) * SPEND) return null;   // too dear: keep the energy for more turns
  return plan;
}
