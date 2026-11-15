// Smooth Intercept · Example: the factor that number plus 1 shares with the gradient's whole part
// Main part: the y-intercept on as big a number of the dealt primes as possible. Tie-breaker: the factor that number plus 1 shares with the gradient's whole part.
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 3 to 2: tilting never moves the y-intercept, so the rung stays.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  const a = Q.abs(c), s = near(a, n => n >= 2 && factors(n).every(f => p.primes.includes(Number(f))));   // the nearest rung
  if (s === null) return null;                    // none within 10,000: hopeless
  const main = Q.eq(a, s) ? a : Q.neg(Q.abs(Q.sub(a, s)));   // on a rung: the rung; else below every rung
  const wm = whole(Q.div(Q.sub(Q.mul(2, m), 1), 2));   // the gradient's whole part (rounded down)
  return [main, common(Q.add(s, 1), wm)];   // main: the y-intercept's size itself when it is made only of the rule's primes (bigger is better: a ladder with no top), else minus how far it is from the nearest such number; tie-breaker: take the number just after that number: a bigger number dividing both it and the gradient's whole part is better
}

const FAR = 3;      // how far one change may go
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
  const m = v.m, c = v.c, p = rule.params;
  // A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
  if (!Q.isQ(m)) return climb(offer, tips(offer).filter(([plan]) => !PROTECT.includes(offer.object) || fair(offer, plan)).map(([plan, m2, c2]) => [plan, score(m2, c2, p)]), null, QUOTES);
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
  }
  // The next rung up (the ladder has no top): one jump away from 0 through the valley between, priced by its size.
  const rung = Q.abs(c), up = Q.cmp(c, 0) < 0 ? -1 : 1, onRung = n => factors(n).every(f => p.primes.includes(Number(f)));
  const below = near(rung, n => n >= 2 && onRung(n));
  if (below !== null) for (let t = Q.add(below, 1), i = 0; i < 3000; t = Q.add(t, 1), i++) if (onRung(t)) { tries.push([move("si.shift", { k: Q.sub(Q.mul(up, t), c) }), m, Q.mul(up, t)]); break; }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p), QUOTES);
}
