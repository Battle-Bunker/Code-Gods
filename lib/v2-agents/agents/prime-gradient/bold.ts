// Prime Gradient · Bold
// Main part: gradient close to a prime. Tie-breaker: whichever you were dealt (the size of that prime; the y-intercept close to a prime too; the y-intercept's smallest prime factor; the y-intercept's largest prime factor).
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
  const nearest = near(m, prime);                 // the prime nearest the gradient
  if (nearest === null) return null;              // none within 10,000: hopeless
  const main = Q.neg(Q.abs(Q.sub(m, nearest)));
  // main: how far the gradient is from the nearest prime (closer is better)
  if (tie === "prime") return [main, nearest];   // a bigger prime is better
  if (tie === "cPrime") {   // a y-intercept close to a prime too is better
    const cp = near(c, prime);                  // the prime nearest the y-intercept
    return [main, Q.neg(Q.abs(Q.sub(c, cp)))];
  }
  if (tie === "c-spf") {   // the y-intercept's smallest prime factor big is better
    const fc = factors(c) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fc[0] ?? 1];
  }
  if (tie === "c-gpf") {   // the y-intercept's largest prime factor big is better
    const fc = factors(c) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fc.at(-1) ?? 1];
  }
  return [main];
}

const FAR = 4;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

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
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);     // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);      // make it steeper or flatter
    for (let j = -FAR; j <= FAR; j++) {                          // both at once
      if (j !== 0) tries.push([[move("si.shift", { k }), move("si.tilt", { k: j })], Q.add(m, j), Q.add(c, k)]);
    }
  }
  tries.push(...rounding(m, c));   // on a line with fractions: to a whole number, by one part, or stretched
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
