// Same on Both Rulers (tuple) · Thorough
// Main part: the nearest target's size, the bigger the better. Secondary preference: whichever you were dealt (how close to that target; the gradient near the palindrome's digit sum; the y-intercept near a multiple of 11).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.eq(m, p.meets)) return null;               // parallel to y = meets·x: they never meet
  const x = Q.abs(Q.div(c, Q.sub(p.meets, m)));   // where the line meets y = meets·x, ignoring a minus sign
  const n = nearestPalindrome(x, p.digits === "odd"), main = n;   // the palindrome nearest it: bigger is better
  // main: the palindrome with the rule's count of digits nearest where the line meets y = x (or y = -x), the bigger the better
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "closeness") return Q.neg(Q.abs(Q.sub(x, n)));   // how close the reading is to that target: nearer is better
    if (t === "gradient-digits") return Q.neg(Q.abs(Q.sub(Q.abs(m), Q.of([...String(n)].reduce((a, d) => a + Number(d), 0)))));   // the gradient's size should be near the palindrome's digits added up
    if (t === "intercept-multiple") return Q.neg(toMultiple(Q.abs(c), Q.of(11)));   // the y-intercept's size should be near a multiple of 11
    return null;
  })];
}

const FAR = 3;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines your agent skips, e.g. [19] or [4, 9]: others may still move them
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
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  tries.push(...shortcuts(m, c, rule.mutators));   // other views the game offers: mirrors, a slide, turns, one intercept moved
  let options = scoreEach(tries, ([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches (fewer on a big line)
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  const one = climb(offer, options, score(m, c, p, tie), QUOTES);
  if (one || PROTECT.includes(offer.object)) return one;
  // No single step helps: look two steps ahead (each step, then a shift or tilt by 1) and take the first
  // step of the best pair, though it may lower your points for a moment. It weighs the 4 best pairs: a few more small reads.
  // The first steps: the 6 best for your rule (options are tries with their scores, in the same order).
  const firsts = tries.slice(0, options.length).map((t, i) => [t, options[i][1]]).filter(([[, m1]]) => Q.isQ(m1))
    .sort((a, b) => (better(a[1], b[1]) ? -1 : better(b[1], a[1]) ? 1 : 0)).slice(0, 6).map(([t]) => t);
  const pairs = [];
  for (const [plan, m1, c1] of firsts) {
    if (stepsLeft() < 0.45 * stepBudget()) break;   // a big line: weigh fewer pairs rather than fail
    const first = Array.isArray(plan) ? plan : [plan];
    for (const k of [-1, 1]) {
      pairs.push([[...first, move("si.shift", { k })], score(m1, Q.add(c1, k), p, tie)]);
      pairs.push([[...first, move("si.tilt", { k })], score(Q.add(m1, k), c1, p, tie)]);
    }
  }
  const two = climb(offer, pairs, score(m, c, p, tie), 4);
  return two ? two.slice(0, -1) : null;
}
