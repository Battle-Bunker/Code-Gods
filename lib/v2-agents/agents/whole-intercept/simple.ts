// Whole Intercept · Simple
// Main part: y-intercept close to a whole number. Secondary preference: whichever you were dealt (smallest prime factor of that whole number; prime factors of that whole number).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const up = whole(c);                            // the whole number nearest the y-intercept (a half rounds up)
  const spf = k => (Q.isZero(k) ? 2 : (factors(k)[0] ?? 1));   // smallest prime factor: 2 for 0, 1 for 1 and -1
  const half = Q.eq(Q.sub(up, c), Q.of(1, 2));   // exactly halfway between two whole numbers?
  const n = half && spf(Q.sub(up, 1)) > spf(up) ? Q.sub(up, 1) : up;   // halfway: the one with the bigger smallest prime factor
  const main = Q.neg(Q.abs(Q.sub(c, n)));
  const f = factors(n);                           // its prime factors, smallest first
  // main: how far the y-intercept is from a whole number (closer is better)
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "spf") return spf(n);   // a bigger smallest prime factor is better (a big prime is best)
    if (t === "omega") return f.length;   // more prime factors are better
    return null;
  })];
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
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  // A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
  if (!Q.isQ(m)) return climb(offer, tips(offer).filter(([plan]) => !PROTECT.includes(offer.object) || fair(offer, plan)).map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]), null, QUOTES);
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
  }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  tries.push(...shortcuts(m, c, rule.mutators));   // other views the game offers: mirrors, a slide, turns, one intercept moved
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
