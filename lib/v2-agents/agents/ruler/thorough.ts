// Ruler · Thorough
// Main part: distance² from (0, 0) close to a square. Tie-breaker: whichever you were dealt (that whole distance; the gradient close to a prime; the triangle's area close to a square).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.isZero(m)) return null;                   // a flat line: the rule wants a sloping one
  const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared: c² / (m² + 1)
  const sq = near(d2, square) || 1;               // the square number nearest it (1 at the least)
  const main = Q.neg(Q.abs(Q.sub(d2, sq)));
  const far = root(sq);                           // that square's root: a whole distance
  // main: how far the distance from (0, 0), squared, is from a square number (closer is better)
  if (tie === "far") return [main, far];   // a bigger whole distance is better
  if (tie === "prime-gradient") {   // a gradient close to a prime is better
    const mp = near(m, prime);                  // the prime nearest the gradient
    return [main, Q.neg(Q.abs(Q.sub(m, mp)))];
  }
  if (tie === "square-area") {   // a triangle whose area is close to a square number is better
    const area = Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)));   // the triangle cut off the axes (none when c = 0)
    return [main, Q.isZero(c) ? null : Q.neg(Q.abs(Q.sub(area, near(area, square))))];
  }
  return [main];
}

const FAR = 3;      // how far one change may go
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
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    tries.push([move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]);   // change the pattern's step, keeping y(1)
    tries.push([move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]);   // turn the line about its point at x = -1 (m and c both change by k)
    const f = k > 0 ? k + 1 : k - 1;
    tries.push([move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);   // multiply every output by f (m and c both)
  }
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
