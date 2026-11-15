// Square Area · Naive (for learning)
// Main part: the triangle's area on as big a square ending in d as possible. Tie-breaker: whichever you were dealt (the factor that square's root plus 1 shares with the x-crossing's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score
  const legX = Q.abs(Q.div(c, m)), legY = Q.abs(c); // the triangle's base and height
  const area = Q.div(Q.mul(legX, legY), 2);
  const fl = BigInt(p.round ? whole(area) : whole(Q.div(Q.sub(Q.mul(2, area), 1), 2)));   // the area rounded down (to the nearest, for near)
  const s = BigInt(root(fl)), K = BigInt(p.ends);   // its whole square root, rounded down
  let lo = s, hi = s + 1n;                         // the nearest roots at or below s, and above, whose squares end in p.ends
  while (lo >= 1n && (lo * lo) % 10n !== K) lo--;
  while ((hi * hi) % 10n !== K) hi++;
  const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const a = p.round ? Q.div(-1, 2) : 0;               // the window of r² is [r² + a, r² + a + 1)
  const below = Q.sub(area, Q.add(Q.of(lo * lo + 1n), a)), above = Q.sub(Q.add(Q.of(hi * hi), a), area);   // past the window below, up to the one above
  const on = lo === s && s >= 1n && s * s === fl;  // the area rounds to s², a square ending in p.ends: a rung
  const r = on || (lo >= 1n && Q.cmp(below, above) <= 0) ? lo : hi;   // that number (on a rung), else the nearest window's
  const main = on ? level(Q.of(fl)) : Q.neg(r === lo ? below : above);
  // main: the square ending in the rule's digit that the triangle's area rounds down (or to the nearest) to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from rounding to one
  if (tie === "shared-factor") {   // that square's root plus 1 and the x-crossing's whole part: a bigger factor shared is better
    const wx = whole(Q.div(Q.sub(Q.mul(2, legX), 1), 2));   // the x-crossing's whole part, ignoring its sign
    return [main, common(Q.of(r + 1n), wx)];
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
    tries.push([move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]);   // turn the line about its point at x = -1 (m and c both change by k)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
