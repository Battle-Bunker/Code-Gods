// Prime Landing · Simple
// Main part: the y-intercept on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the factor that prime minus 1 shares with the gradient's whole part; how long y(1), y(2), … go on being such primes).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const landing = near(c, prime, p.ends);         // it lands on the x-axis: the rung nearest there
    const main = Q.eq(c, landing) ? landing : Q.neg(Q.abs(Q.sub(c, landing)));
    return [main, null];
  }
  const landing = near(c, prime, p.ends);         // the prime ending in p.ends nearest the y-intercept: the rung
  const main = Q.eq(c, landing) ? landing : Q.neg(Q.abs(Q.sub(c, landing)));   // on a rung: the rung; else below every rung
  // main: the y-intercept itself when it is a prime ending in the rule's digit (bigger is better: a ladder with no top), else minus how far it is from the nearest one
  if (tie === "shared-factor") {   // that prime minus 1 sharing a bigger factor with the gradient's whole part is better
    const wm = whole(Q.div(Q.sub(Q.mul(2, m), 1), 2));   // the gradient's whole part (rounded down)
    return [main, common(Q.sub(landing, 1), wm)];
  }
  if (tie === "climb-on") {   // y(1), y(2), ... going on longer as primes ending in the rule's digit is better
    let on = 0;                                     // y(1), y(2), ... new primes ending in p.ends, in a row
    for (let n = 1; n <= 12; n++) { const t = Q.add(Q.mul(m, n), c); if (Q.eq(m, 0) || Q.eq(t, landing) || !prime(t) || !Q.toString(t).endsWith(String(p.ends))) break; on++; }
    return [main, on];
  }
  return [main];
}

const FAR = 2;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
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
  let m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  if (!Q.isQ(m)) {                  // a vertical line (x = k): tip it into y = mx + c, or slide it sideways
    m = null, c = look(offer, "crossing").x0;   // where it stands: score(null, k) reads the line x = k
    tries.push(...vertical(offer, FAR));   // its tips into y = mx + c and its slides sideways
  } else {
    for (let k = -FAR; k <= FAR; k++) {
      if (k === 0) continue;
      tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
      tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    }
    // The next rung up (the ladder has no top): one jump through the valley between, priced by its size.
    for (let t = Q.add(near(c, prime, p.ends), 10), i = 0; i < 100; t = Q.add(t, 10), i++) if (prime(t)) { tries.push([move("si.shift", { k: Q.sub(t, c) }), m, t]); break; }
    tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  }
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
