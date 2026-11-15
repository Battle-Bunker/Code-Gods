// Whole Crossing · Simple
// Main part: the x-axis crossing on a ladder of 5s. Tie-breaker: whichever you were dealt (the biggest number dividing both that number after its 5s, plus 1, and the gradient's whole part).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const x = c                                          // it stands on the x-axis at x = c;
    // The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, … times t). The nearest such number, any level,
    // in whole numbers: x = n/dd, and every distance is counted in 1/dd.
    const n = x.n, dd = x.d, r = BigInt(p.r), ab = v => (v < 0n ? -v : v), fl = (a, b) => (a - (((a % b) + b) % b)) / b;   // fl: rounded down
    let best = null;
    for (let j = 0, s = 1n; ; j++, s *= 5n) {
      const D = dd * s;
      let t = r + 5n * fl(2n * (n - r * D) + 5n * D, 10n * D);   // the nearest t leaving r at this level (halfway: up)
      if (2n * (t * D - n) === 5n * D && ab(t - 5n) <= ab(t)) t -= 5n;   // halfway: the smaller
      const dist = ab(n - s * t * dd);                 // the nearer wins; on a tie the higher level
      if (best === null || dist <= best.dist) best = { j, t, dist };
      if (s * dd - ab(n) > best.dist) break;           // every further level is farther
    }
    let L = 0; while (((L + 1) * (L + 2)) / 2 <= best.j) L++;   // level L needs L(L + 1)/2 fives (1, 3, 6, 10, …)
    const main = best.dist === 0n ? Q.add(L, Q.of(best.j - (L * (L + 1)) / 2, L + 1)) : Q.neg(Q.of(best.dist, dd));   // on the ladder: its level; else below them all
    return [main, null];
  }
  if (Q.isZero(m)) return null;                   // a flat line never crosses: the worst score
  const x = Q.neg(Q.div(c, m))                         // where y = mx + c crosses the x-axis;
  // The ladder: x = 5^j × t with t leaving r when divided by 5 (1, 5, 25, … times t). The nearest such number, any level,
  // in whole numbers: x = n/dd, and every distance is counted in 1/dd.
  const n = x.n, dd = x.d, r = BigInt(p.r), ab = v => (v < 0n ? -v : v), fl = (a, b) => (a - (((a % b) + b) % b)) / b;   // fl: rounded down
  let best = null;
  for (let j = 0, s = 1n; ; j++, s *= 5n) {
    const D = dd * s;
    let t = r + 5n * fl(2n * (n - r * D) + 5n * D, 10n * D);   // the nearest t leaving r at this level (halfway: up)
    if (2n * (t * D - n) === 5n * D && ab(t - 5n) <= ab(t)) t -= 5n;   // halfway: the smaller
    const dist = ab(n - s * t * dd);                 // the nearer wins; on a tie the higher level
    if (best === null || dist <= best.dist) best = { j, t, dist };
    if (s * dd - ab(n) > best.dist) break;           // every further level is farther
  }
  let L = 0; while (((L + 1) * (L + 2)) / 2 <= best.j) L++;   // level L needs L(L + 1)/2 fives (1, 3, 6, 10, …)
  const main = best.dist === 0n ? Q.add(L, Q.of(best.j - (L * (L + 1)) / 2, L + 1)) : Q.neg(Q.of(best.dist, dd));   // on the ladder: its level; else below them all
  // main: the level of 5s the line's x-axis crossing holds when it is a whole number leaving r after its 5s are divided out (level L needs L(L + 1)/2 fives; more is better: a ladder with no top), else minus how far it is from the nearest such number
  if (tie === "shared-factor") {   // take that number with its 5s divided out, ignore its sign and add 1: a bigger number dividing both it and the gradient's whole part is better
    const t1 = (best.t < 0n ? -best.t : best.t) + 1n, wm = whole(Q.sub(Q.abs(m), Q.div(1, 2)));   // |t| + 1, and the gradient's whole part ignoring sign
    return [main, common(t1, wm)];
  }
  return [main];
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
  let m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  if (!Q.isQ(m)) {                  // a vertical line (x = k): tip it into y = mx + c, or slide it sideways
    m = null, c = look(offer, "crossing").x0;   // where it stands: score(null, k) reads the line x = k
    tries.push(...vertical(offer, FAR));   // its tips into y = mx + c and its slides sideways
  } else {
    for (let k = -FAR; k <= FAR; k++) {
      if (k === 0) continue;
      tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
      tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
      const f = k > 0 ? k + 1 : k - 1;
      tries.push([move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);   // multiply every output by f (m and c both)
    }
    // The next level up (the ladder has no top): the nearest number with one more 5, by a shift that keeps the gradient.
    if (!Q.isZero(m)) {
      const x = Q.neg(Q.div(c, m));
      let s = Q.of(5); while (Q.cmp(Q.abs(Q.div(x, s)), 1) > 0 && Q.isInteger(Q.div(x, s))) s = Q.mul(s, 5);   // one more 5 than x holds
      const t = Q.add(p.r, Q.mul(5, whole(Q.div(Q.sub(Q.div(x, s), p.r), 5)))), to = Q.mul(s, t);
      tries.push([move("si.shift", { k: Q.sub(Q.neg(Q.mul(m, to)), c) }), m, Q.neg(Q.mul(m, to))]);
    }
    tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  }
  tries.push(...shortcuts(m, c));   // other views: mirrors, a slide, turns, one intercept moved
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
