// Prime Landing · Example: that prime
// Main part: the y-intercept close to a prime. Tie-breaker: that prime.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 8 to 12 so it can jump past wider gaps between primes.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  const landing = near(c, prime);                 // the prime nearest the y-intercept
  const main = Q.neg(Q.abs(Q.sub(c, landing)));
  return [main, landing];   // main: how far the y-intercept is from the nearest prime (closer is better); tie-breaker: a bigger prime is better
}

const FAR = 8;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
const TARGET = null;   // a line every player agreed on, e.g. { m: -1, c: 59 } for y = -x + 59: lines go there and stay
const SETTLE = [];     // the lines to settle at TARGET, e.g. [2, 5]; [] means every line

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this line alone
  if (TARGET && (!SETTLE.length || SETTLE.includes(offer.object))) return settle(offer, TARGET);   // a deal: bring the line to TARGET, then hold it
  // A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
  contested(offer, 3);
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  // A promise: on these lines, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) plans = plans.slice(0, QUOTES).filter(plan => fair(offer, plan));
  if (!plans.length) return null;
  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
  return plan;
}
