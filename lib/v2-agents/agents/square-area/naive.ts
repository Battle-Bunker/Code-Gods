// Square Area · Naive (for learning)
// Main part: the triangle's area on as big a square ending in d as possible. Secondary preference: whichever you were dealt (the factor that square's root plus 1 shares with the x-crossing's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score
  const legX = Q.abs(Q.div(c, m)), area = Q.div(Q.mul(legX, Q.abs(c)), 2);   // the triangle's base, and its area
  const a = p.round ? Q.div(-1, 2) : 0;            // the window of r² is [r² + a, r² + a + 1)
  const fl = BigInt(whole(Q.sub(area, Q.add(a, Q.div(1, 2)))));   // the area, rounded down (or off)
  const s = BigInt(root(fl));                      // its whole square root
  const r = BigInt(near(s, n => n > 1 && String(BigInt(n) ** 2n).endsWith(p.ends)));   // the nearest root above 1 whose square ends in p.ends
  const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const w = Q.add(Q.of(r * r), a);                 // its window [w, w + 1)
  const main = r === s && s * s === fl ? level(Q.of(fl)) : Q.neg(Q.cmp(area, w) < 0 ? Q.sub(w, area) : Q.sub(area, Q.add(w, 1)));
  // main: the square above 1 ending in the rule's digit that the triangle's area rounds down (or off) to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from the window of the nearest such square's root
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "shared-factor") {   // that square's root plus 1 and the x-crossing's whole part: a bigger factor shared is better
      const wx = whole(Q.div(Q.sub(Q.mul(2, legX), 1), 2));   // the x-crossing's whole part, ignoring its sign
      return common(Q.of(r + 1n), wx);
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
