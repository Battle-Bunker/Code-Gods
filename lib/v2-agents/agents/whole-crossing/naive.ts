// Whole Crossing · Naive (for learning)
// Main part: the x-axis crossing on a ladder of 5s. Tie-breaker: whichever you were dealt (the biggest number dividing both that number after its 5s, plus 1, and the gradient's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

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
    const f = k > 0 ? k + 1 : k - 1;
    tries.push([move("mach.stretch", { f }), Q.mul(m, f), Q.mul(c, f)]);   // multiply every output by f (m and c both)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
