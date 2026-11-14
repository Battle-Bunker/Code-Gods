// Triangle Area · Thorough
// Main part: triangle area close to A. Tie-breaker: whichever you were dealt (legs nearly whole; legs nearly equal).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and change the agent to keep it. It never spends more than a quarter of its energy on one move.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score
  const legX = Q.abs(Q.div(c, m)), legY = Q.abs(c); // the triangle's base and height
  const area = Q.div(Q.mul(legX, legY), 2);
  const main = Q.neg(Q.abs(Q.sub(area, p.A)));
  // main: how far the triangle's area is from A (closer is better)
  if (tie === "legs") return [main, -(legX.d + legY.d - 2n)];   // legs that are whole numbers are best
  if (tie === "even") return [main, Q.neg(Q.abs(Q.sub(legX, legY)))];   // legs of equal length are best
  return [main];
}

const FAR = 5;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
const SPEND = 0.25;    // never spend more than a quarter of your energy on one move
const LEAVE = [];      // lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this line alone
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
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    tries.push([move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]);   // change the pattern's step, keeping y(1)
    tries.push([move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]);   // turn the line about its point at x = -1 (m and c both change by k)
    const f = k > 0 ? k + 1 : k - 1;
    tries.push([move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);   // multiply every output by f (m and c both)
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
