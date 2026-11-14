// Prime Staircase · Example: the first prime
// Main part: a run of different primes from y(0). Tie-breaker: the first prime.
// What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
// no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
// Your points on a line are your rarity times the others' rarity, so a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 6 to 10 so it can jump to bigger primes.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  const run = [];                                 // the different primes it starts with
  let stopped = false, miss = null;               // miss: the first term that is not prime
  for (let n = 0; n < 12; n++) {                  // y(0) ... y(11)
    const t = Q.add(Q.mul(m, n), c), isPrime = prime(t);
    if (!stopped && isPrime && !run.some(r => Q.eq(r, t))) run.push(t); else stopped = true;
    if (!isPrime && miss === null) miss = t;
  }
  const main = run.length;
  return [main, run.length ? run[0] : 0];   // main: how many different primes the pattern y(0), y(1), ... starts with (more is better); tie-breaker: a bigger first prime is better
}

const FAR = 6;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this line alone
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
    tries.push([move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]);   // change the pattern's step, keeping y(1)
  }
  let top = score(m, c, p), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  // A promise: on these lines, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) plans = plans.slice(0, QUOTES).filter(plan => fair(offer, plan));
  // Contested (another player's move lowered your points here): only moves that raise your own points.
  if (hurt(offer)) plans = plans.slice(0, QUOTES).filter(plan => pays(offer, plan, top));
  if (!plans.length) return null;
  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
  return plan;
}
