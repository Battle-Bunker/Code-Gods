// Ruler · Bold
// Main part: distance² from (0, 0) on as big a dealt prime as possible. Secondary preference: whichever you were dealt (the factor that prime minus 1 shares with the y-intercept's whole part).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 4 to 2: shorter steps, cheaper moves.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const d2 = Q.mul(c, c);                         // its distance from (0, 0), squared
    const x = Q.sub(d2, Q.div(1, 2));
    const rung = near(x, prime, p.ends);
    const gap = Q.abs(Q.sub(x, rung));
    const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
    const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, x), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));
    return [main, ...(tie ? tie.split(">") : []).map(t => null)];
  }
  const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared: c² / (m² + 1)
  const x = Q.sub(d2, Q.div(1, 2));               // d2 rounds down to n when x rounds to n (ties up)
  const rung = near(x, prime, p.ends);            // the prime ending in p.ends nearest there: the rung
  const gap = Q.abs(Q.sub(x, rung));              // on the rung when d2 rounds down to it
  const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, x), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));
  // main: the prime ending in the rule's digit that the distance from (0, 0), squared, rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far it is from rounding down to one
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "shared-factor") {   // that prime minus 1 and the y-intercept's whole part: a bigger factor shared is better
      const wc = whole(Q.div(Q.sub(Q.mul(2, Q.abs(c)), 1), 2));   // the y-intercept's whole part, ignoring its sign
      return common(Q.sub(rung, 1), wc);
    }
    return null;
  })];
}

const FAR = 4;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines your agent skips, e.g. [19] or [4, 9]: it does not act on them (others still may)
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
    // The next rung up (the ladder has no top): the next prime ending in p.ends above the distance², aiming at the middle
    // of its window (t + 1/2), by a shift that keeps the gradient (c² = (m² + 1)·d², to the nearest half) or a tilt that
    // keeps the y-intercept (m² = c²/d² − 1, to the nearest half, third or quarter): the climb keeps whichever lands.
    {
      const m1 = Q.add(Q.mul(m, m), 1), d2 = Q.div(Q.mul(c, c), m1);
      for (let t = Q.add(near(d2, prime, p.ends), 10), i = 0; i < 100; t = Q.add(t, 10), i++) if (prime(t)) {
        const mid = Q.add(t, Q.div(1, 2));             // the middle of its window
        const h0 = root(whole(Q.mul(4, Q.mul(m1, mid))));   // 2·√((m² + 1)·mid), rounded down: c to the nearest half
        for (const h of [h0, Q.add(h0, 1)]) {
          const c2 = Q.mul(Q.cmp(c, 0) < 0 ? -1 : 1, Q.div(h, 2));
          tries.push([move("si.shift", { k: Q.sub(c2, c) }), m, c2]);
        }
        const s2 = Q.sub(Q.div(Q.mul(c, c), mid), 1);   // the gradient squared that puts the line there, keeping c
        if (Q.cmp(s2, 0) > 0) for (const d of [2, 3, 4]) {
          const m2 = Q.mul(Q.cmp(m, 0) < 0 ? -1 : 1, Q.div(root(whole(Q.mul(d * d, s2))), d));
          if (!Q.eq(m2, m)) tries.push([move("si.tilt", { k: Q.sub(m2, m) }), m2, c]);
        }
        break;
      }
    }
    tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  }
  let options = scoreEach(tries, ([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches (fewer on a big line)
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
