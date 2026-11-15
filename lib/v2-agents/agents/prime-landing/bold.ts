// Prime Landing · Bold
// Main part: where the line lands on the x-axis, on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the factor that prime minus 1 shares with the y-intercept's whole part).
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
  if (m === null) {               // the vertical line x = c
    const x = Q.mul(p.side ?? 1, c);                // it stands on the x-axis at x = c (minus that, on the mirror)
    const landing = near(x, prime, p.ends);         // the rung nearest there
    const gap = Q.abs(Q.sub(x, landing));
    const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? landing : Q.neg(Q.sub(gap, Q.div(1, 2)));
    return [main, null];
  }
  if (Q.isZero(m)) return null;                   // a flat line never lands: the worst score
  const x = Q.mul(p.side ?? 1, Q.neg(Q.div(c, m)));   // where y = mx + c lands on the x-axis (minus that, on the mirror)
  const landing = near(x, prime, p.ends);         // the prime ending in p.ends nearest there: the rung
  const gap = Q.abs(Q.sub(x, landing));            // on the rung when it rounds there (within 1/2, ties up)
  const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(landing, x), Q.div(1, 2)) ? landing : Q.neg(Q.sub(gap, Q.div(1, 2)));
  // main: the prime ending in the rule's digit that where the line lands on the x-axis rounds to (bigger is better: a ladder with no top), else minus how far it is from rounding to one
  if (tie === "shared-factor") {   // take the number just before that prime: a bigger number dividing both it and the y-intercept's whole part is better
    const wc = whole(Q.div(Q.sub(Q.mul(2, c), 1), 2));   // the y-intercept's whole part (rounded down)
    return [main, common(Q.sub(landing, 1), wc)];
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
  let m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  if (!Q.isQ(m)) {                  // a vertical line (x = k): tip it into y = mx + c, or slide it sideways
    m = null, c = look(offer, "crossing").x0;   // where it stands: score(null, k) reads the line x = k
    tries.push(...vertical(offer, FAR));   // its tips into y = mx + c and its slides sideways
  } else {
    for (let k = -FAR; k <= FAR; k++) {
      if (k === 0) continue;
      tries.push([move("si.shift", { k }), m, Q.add(c, k)]);     // move the line up or down
      tries.push([move("si.tilt", { k }), Q.add(m, k), c]);      // make it steeper or flatter
      for (let j = -FAR; j <= FAR; j++) {                          // both at once
        if (j !== 0) tries.push([[move("si.shift", { k }), move("si.tilt", { k: j })], Q.add(m, j), Q.add(c, k)]);
      }
    }
    // Rungs (the ladder has no top): the nearest prime ending in p.ends, if the line does not round there yet, and
    // the next one beyond it. For each, the simplest gradient that lands there keeping c, and the simplest
    // y-intercept that lands there keeping m: anywhere that rounds to the rung will do.
    if (!Q.isZero(m) && !Q.isZero(c)) {
      const s = p.side ?? 1, x = Q.mul(s, Q.neg(Q.div(c, m))), here = near(x, prime, p.ends);
      let next = null;
      for (let t = Q.add(here, 10), i = 0; i < 100 && next === null; t = Q.add(t, 10), i++) if (prime(t)) next = t;
      for (const r of [here, next]) {
        if (r === null) continue;
        const a = Q.mul(s, Q.sub(r, Q.of(49, 100))), b = Q.mul(s, Q.add(r, Q.of(49, 100)));   // landings that round to r
        const m2 = simplest(Q.neg(Q.div(c, a)), Q.neg(Q.div(c, b))), c2 = simplest(Q.neg(Q.mul(m, a)), Q.neg(Q.mul(m, b)));
        if (!Q.eq(m2, m)) tries.push([move("si.tilt", { k: Q.sub(m2, m) }), m2, c]);
        if (!Q.eq(c2, c)) tries.push([move("si.shift", { k: Q.sub(c2, c) }), m, c2]);
      }
    }
    tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  }
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
