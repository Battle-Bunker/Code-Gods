// Prime Landing · Bold
// Main part: the y-intercept close to a prime. Tie-breaker: whichever you were dealt (that prime; the gradient close to a prime too; y(1) close to a prime too).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
// back again and again) scores nothing for either of you: it walks away from one and leaves you a note so you can
// talk to that player. It never spends more than a quarter of its energy on one move.
// Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const landing = near(c, prime);                 // the prime nearest the y-intercept
  const main = Q.neg(Q.abs(Q.sub(c, landing)));
  // main: how far the y-intercept is from the nearest prime (closer is better)
  if (tie === "big-prime") return [main, landing];   // a bigger prime is better
  if (tie === "prime-gradient") return [main, Q.neg(Q.abs(Q.sub(m, near(m, prime))))];   // a gradient close to a prime too is better
  if (tie === "next-prime") {   // y(1) close to a prime too is better
    const y1 = Q.abs(Q.add(m, c));                  // y(1) = m + c, ignoring its sign
    return [main, Q.neg(Q.abs(Q.sub(y1, near(y1, prime))))];
  }
  return [main];
}

const FAR = 6;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
const SPEND = 0.25;    // never spend more than a quarter of your energy on one move

function agent(offer) {
  // A tug-of-war (another player taking back your gains on this line, 3 times lately) only burns energy on
  // both sides: leave the line, with a note telling your owner to talk to that player.
  if (contested(offer, 3)) return null;
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
