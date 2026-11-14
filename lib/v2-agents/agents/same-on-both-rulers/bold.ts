// Same on Both Rulers · Bold
// Main part: the unchanged number close to T. Tie-breaker: whichever you were dealt (the gradient far from 1; |c| close to a prime; different whole numbers among y(−5) … y(5); the lamp's height close to whole; the gradient's smallest prime factor; the gradient's largest prime factor).
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
  if (Q.eq(m, 1)) return null;                    // × 1: no number stays unchanged
  const fixed = Q.div(c, Q.sub(1, m));            // where y = mx + c meets y = x
  const main = Q.neg(Q.abs(Q.sub(fixed, p.T)));
  // main: how far the number the machine leaves unchanged is from T (closer is better)
  if (tie === "steep") return [main, Q.abs(Q.sub(m, 1))];   // a gradient far from 1 is better
  if (tie === "prime-start") {   // a y-intercept (ignoring sign) close to a prime is better
    const start = Q.abs(c);                        // the y-intercept, ignoring its sign
    return [main, Q.neg(Q.abs(Q.sub(start, near(start, prime))))];
  }
  if (tie === "whole-values") {   // more different whole numbers among y(-5) ... y(5) is better
    const wholes = new Set(Array.from({ length: 11 }, (_, i) => Q.add(Q.mul(m, i - 5), c)).filter(Q.isInteger).map(Q.toString));   // y(-5) ... y(5)
    return [main, wholes.size];
  }
  if (tie === "whole-lamp") {   // a lamp height close to a whole number is better
    const lamp = Q.div(m, Q.sub(m, 1));            // the lamp's height m/(m - 1)
    return [main, Q.neg(Q.abs(Q.sub(lamp, whole(lamp))))];
  }
  if (tie === "m-spf") {   // the gradient's smallest prime factor big is better
    const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fm[0] ?? 1];
  }
  if (tie === "m-gpf") {   // the gradient's largest prime factor big is better
    const fm = factors(m) ?? [];             // prime factors, smallest first ([] for 0, 1, -1 and fractions)
    return [main, fm.at(-1) ?? 1];
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
  // A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
  if (!Q.isQ(m)) return climb(offer, tips(offer).map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]), null, QUOTES);
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
