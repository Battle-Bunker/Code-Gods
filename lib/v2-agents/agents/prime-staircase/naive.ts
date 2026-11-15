// Prime Staircase · Naive (for learning)
// Main part: a run of different dealt primes from y(0). Secondary preference: whichever you were dealt (the factor the run's last prime minus 1 shares with its first prime minus 1; y(−1) close to such a prime).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const run = [];                                 // the different primes ending in p.ends it starts with
  let t = c;                                      // ends as the first term that breaks the run
  for (let n = 0; n < 256; n++) {                 // y(0), y(1), ...
    t = Q.add(Q.mul(m, n), c);
    if (Q.eq(t, near(t, prime, p.ends)) && !run.some(r => Q.eq(r, t))) run.push(t); else break;
  }
  const miss = Q.abs(t);                          // the breaking term, ignoring its sign
  const d = Q.abs(Q.sub(miss, near(miss, prime, p.ends)));
  const main = Q.add(run.length, Q.div(1, Q.add(2, d)));   // a longer run always wins; a near miss beats a far one
  // main: how many different primes ending in the rule's digit the pattern y(0), y(1), ... starts with (more is better: a ladder with no top), plus a little for the term that breaks the run being near such a prime
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "shared-factor") return run.length >= 2 ? common(Q.sub(run.at(-1), 1), Q.sub(run[0], 1)) : 0;   // the run's last prime minus 1 sharing a bigger factor with its first prime minus 1 is better (it starts again when the run grows)
    if (t === "step-back") {   // y(-1) (ignoring sign) close to such a prime is better
      const back = Q.abs(Q.sub(c, m));               // y(-1), ignoring its sign
      return Q.neg(Q.abs(Q.sub(back, near(back, prime, p.ends))));
    }
    return null;
  })];
}

const FAR = 3;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
