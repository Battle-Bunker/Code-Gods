// Exact Change · Example: both coins close to primes
// Main part: ways to pay close to the target. Tie-breaker: both coins close to primes.
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 4 to 6 so the coins can jump to primes further away.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  if (Q.cmp(m, 0) >= 0) return null;              // a coin worth -m·b: the line must go downhill
  const X = Q.neg(Q.div(c, m));                   // where the line meets y = 0: x goes no further
  if (Q.cmp(X, 100001) >= 0) return null;         // too many ways to count: no score
  const b = m.d * Q.of(m.d, c.d).d;               // the coin b: the smallest whole number making b·m and b·c whole
  const ways = [];                                // each way to pay, as its x: the line's whole points with x, y ≥ 0
  for (let x = 0; Q.cmp(x, X) <= 0; x++) if (Q.isInteger(Q.add(Q.mul(m, x), c))) ways.push(x);
  const main = Q.neg(Q.abs(ways.length - p.ways));
  const off = x => Q.abs(Q.sub(x, near(x, prime)));   // how far x is from the nearest prime
  return [main, Q.neg(Q.add(off(Q.mul(m, -b)), off(b)))];   // main: how far the number of ways to pay is from the target (closer is better); tie-breaker: both coins (a = -b·m and b) close to primes is better
}

const FAR = 4;      // how far one change may go
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
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
  }
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p), QUOTES);
}
