// Divisibility Ladder · Example: the gradient's smallest prime factor
// Main part: a run of n dividing y(n). Tie-breaker: the gradient's smallest prime factor.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
// back again and again) scores nothing for either of you: it walks away from one and leaves you a note so you can
// talk to that player. It never spends more than a quarter of its energy on one move.
// Try this: change FAR = 6 to 12: the run needs c a multiple of 27720, so big jumps help.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  if (Q.isZero(c)) return null;                   // through (0, 0): the rule wants a line that is not
  let main = 0;
  for (let n = 1; n <= 12; n++) {                 // the run of n dividing y(n)
    const y = Q.add(Q.mul(m, n), c);
    if (!Q.isInteger(y) || !Q.isInteger(Q.div(y, n))) break;
    main++;
  }
  const fm = factors(m) ?? [];                    // the gradient's prime factors ([] for 0, 1, -1)
  return [Math.min(main, 11), fm[0] ?? 1];   // main: how many of y(1), y(2), y(3), ... in a row are multiples of 1, 2, 3, ... (more is better); tie-breaker: the gradient's smallest prime factor big is better
}

const FAR = 6;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const SPEND = 0.25;    // never spend more than a quarter of your energy on one move

function agent(offer) {
  // A tug-of-war (another player taking back your gains on this line, 3 times lately) only burns energy on
  // both sides: leave the line, with a note telling your owner to talk to that player.
  if (contested(offer, 3)) return null;
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  if (!plans.length) return null;
  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
  if (!plan || price(offer, plan) > energy(offer) * SPEND) return null;   // too dear: keep the energy for more turns
  return plan;
}
