// Smooth Intercept · Thorough
// Main part: the y-intercept made of as many of the dealt primes as possible. Tie-breaker: whichever you were dealt (the factor that number plus 1 shares with the gradient's whole part).
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
  const a = Q.abs(c), s = nearMadeOf(a, p.primes);   // the nearest rung: made only of the rule's primes
  let main = Q.neg(Q.abs(Q.sub(a, s)));           // off every rung: below them all
  if (Q.eq(a, s)) {                               // on a rung: the dealt primes multiplied (omega), in levels
    const omega = factors(s).length; let level = 0;
    while (((level + 1) * (level + 2)) / 2 <= omega) level++;   // level L needs L(L + 1)/2 of them
    main = Q.add(level, Q.div(Q.add(omega - (level * (level + 1)) / 2, Q.div(1, Q.add(2, s))), level + 1));
  }
  // main: how many of the rule's primes the y-intercept (ignoring sign) is made of, in levels that each need one more than the last (more is better: a ladder with no top; of two with as many, the smaller), else minus how far it is from the nearest such number
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each tie-breaker, in order
    if (t === "shared-factor") {   // take the number just after that number: a bigger number dividing both it and the gradient's whole part is better
      const wm = whole(Q.div(Q.sub(Q.mul(2, m), 1), 2));   // the gradient's whole part (rounded down)
      return common(Q.add(s, 1), wm);
    }
    return null;
  })];
}

const FAR = 3;      // how far one change may go
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
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    tries.push([move("seq.step", { k }), Q.add(m, k), Q.sub(c, k)]);   // change the pattern's step, keeping y(1)
    tries.push([move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]);   // turn the line about its point at x = -1 (m and c both change by k)
    const f = k > 0 ? k + 1 : k - 1;
    tries.push([move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);   // multiply every output by f (m and c both)
  }
  // The next level up (the ladder has no top): one more of the dealt primes multiplied in, by a shift.
  if (Q.isInteger(c) && !Q.isZero(c)) for (const pr of p.primes) tries.push([move("si.shift", { k: Q.mul(c, pr - 1) }), m, Q.mul(c, pr)]);
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  tries.push(...shortcuts(m, c, rule.mutators));   // other views the game offers: mirrors, a slide, turns, one intercept moved
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  const one = climb(offer, options, score(m, c, p, tie), QUOTES);
  if (one || PROTECT.includes(offer.object)) return one;
  // No single step helps: look two steps ahead (each step, then a shift or tilt by 1) and take the first
  // step of the best pair, though it may lower your points for a moment. It weighs the 4 best pairs: a few more small reads.
  // The first steps: the 6 best for your rule (options are tries with their scores, in the same order).
  const firsts = tries.map((t, i) => [t, options[i][1]]).filter(([[, m1]]) => Q.isQ(m1))
    .sort((a, b) => (better(a[1], b[1]) ? -1 : better(b[1], a[1]) ? 1 : 0)).slice(0, 6).map(([t]) => t);
  const pairs = [];
  for (const [plan, m1, c1] of firsts) {
    const first = Array.isArray(plan) ? plan : [plan];
    for (const k of [-1, 1]) {
      pairs.push([[...first, move("si.shift", { k })], score(m1, Q.add(c1, k), p, tie)]);
      pairs.push([[...first, move("si.tilt", { k })], score(Q.add(m1, k), c1, p, tie)]);
    }
  }
  const two = climb(offer, pairs, score(m, c, p, tie), 4);
  return two ? two.slice(0, -1) : null;
}
