// Prime Staircase · Bold
// Main part: a run of different dealt primes from y(0). Tie-breaker: whichever you were dealt (the first prime; the last prime of the run; the first term that breaks the run, close to such a prime; y(−1) close to such a prime).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 4 to 2: shorter steps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const run = [];                                 // the different primes ending in p.ends it starts with
  let stopped = false, miss = null;               // miss: the size of the first term that is not such a prime
  for (let n = 0; n < 12; n++) {                  // y(0) ... y(11)
    const t = Q.mul(p.side ?? 1, Q.add(Q.mul(m, n), c));   // y(n), or −y(n) on the mirror (minus primes)
    const isPrime = prime(t) && Q.toString(t).endsWith(String(p.ends));
    if (!stopped && isPrime && !run.some(r => Q.eq(r, t))) run.push(t); else stopped = true;
    if (!isPrime && miss === null) miss = Q.abs(t);
  }
  const main = run.length;
  // main: how many different primes ending in the rule's digit the pattern y(0), y(1), ... starts with (more is better)
  if (tie === "first-prime") return [main, run.length ? run[0] : 0];   // a bigger first prime is better
  if (tie === "last-prime") return [main, run.length ? run.at(-1) : 0];   // a bigger last prime of the run is better
  if (tie === "near-miss") return [main, miss === null ? null : Q.neg(Q.abs(Q.sub(miss, near(miss, prime, p.ends))))];   // a first term that breaks the run (ignoring sign) close to such a prime is better (none in twelve terms: no tie-breaker)
  if (tie === "step-back") {   // y(-1) (ignoring sign) close to such a prime is better
    const back = Q.abs(Q.sub(c, m));               // y(-1), ignoring its sign
    return [main, Q.neg(Q.abs(Q.sub(back, near(back, prime, p.ends))))];
  }
  return [main];
}

const FAR = 4;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this line alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the line)
  // A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
  contested(offer, 3);
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  // A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
  if (!Q.isQ(m)) return climb(offer, tips(offer).filter(([plan]) => !PROTECT.includes(offer.object) || fair(offer, plan)).map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]), null, QUOTES);
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);     // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);      // make it steeper or flatter
    for (let j = -FAR; j <= FAR; j++) {                          // both at once
      if (j !== 0) tries.push([[move("si.shift", { k }), move("si.tilt", { k: j })], Q.add(m, j), Q.add(c, k)]);
    }
  }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
