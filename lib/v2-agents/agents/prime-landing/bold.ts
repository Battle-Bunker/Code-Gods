// Prime Landing · Bold
// Main part: the y-intercept close to the dealt prime. Tie-breaker: whichever you were dealt (that prime; the gradient close to such a prime too; y(1) close to such a prime too; the gradient's smallest prime factor; the gradient's largest prime factor).
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
    const landing = near(c, prime, p.ends);         // it lands on the x-axis: the prime ending in p.ends nearest
    const main = Q.neg(Q.abs(Q.sub(c, landing)));
    return [main, null];
  }
  const s = p.side ?? 1;                           // 1, or −1 on the mirror: minus a prime
  const landing = Q.mul(s, near(Q.mul(s, c), prime, p.ends));   // the (minus) prime ending in p.ends nearest
  const main = Q.neg(Q.abs(Q.sub(c, landing)));
  // main: how far the y-intercept is from the nearest prime ending in the rule's digit, or minus one on the mirror (closer is better)
  if (tie === "big-prime") return [main, Q.abs(landing)];   // a bigger prime is better
  if (tie === "prime-gradient") {   // a gradient close to such a prime too is better
    const mp = Q.mul(p.side ?? 1, near(Q.mul(p.side ?? 1, m), prime, p.ends));   // the (minus) prime ending in p.ends nearest the gradient
    return [main, Q.neg(Q.abs(Q.sub(m, mp)))];
  }
  if (tie === "next-prime") {   // y(1) (ignoring sign) close to such a prime too is better
    const y1 = Q.abs(Q.add(m, c));                 // y(1) = m + c, ignoring its sign
    return [main, Q.neg(Q.abs(Q.sub(y1, near(y1, prime, p.ends))))];
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
    tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  }
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
