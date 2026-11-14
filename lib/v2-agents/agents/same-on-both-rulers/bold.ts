// Same on Both Rulers · Bold
// Main part: the unchanged number close to T. Tie-breaker: whichever you were dealt (the gradient far from 1).
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
// back again and again) scores nothing for either of you: it walks away from one and leaves you a note so you can
// talk to that player. It never spends more than a quarter of its energy on one move.
// Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.eq(m, 1)) return null;                    // × 1: no number stays unchanged
  const fixed = Q.div(c, Q.sub(1, m));            // where y = mx + c meets y = x
  const main = Q.neg(Q.abs(Q.sub(fixed, p.T)));
  // main: how far the number the machine leaves unchanged is from T (closer is better)
  if (tie === "steep") return [main, Q.abs(Q.sub(m, 1))];   // a gradient far from 1 is better
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
