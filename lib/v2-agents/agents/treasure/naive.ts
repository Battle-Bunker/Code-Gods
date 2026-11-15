// Treasure · Naive (for learning)
// Main part: y(k) on as big a coin pile as possible. Secondary preference: whichever you were dealt (the biggest number dividing both the pile's height and the gradient's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const level = r => { const D = Q.toString(r).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(r, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const s = p.side ?? 1, y = Q.mul(s, Q.add(Q.mul(m, p.k), c));   // y(k) = m·k + c, or minus it on the mirror
  const T = h => Q.div(Q.mul(h, Q.add(h, 1)), 2);   // the coin pile h coins high: h(h + 1)/2
  const hf = Q.cmp(y, 1) < 0 ? 1 : whole(Q.sub(Q.div(Q.sub(root(Q.add(Q.mul(8, whole(Q.sub(y, Q.div(1, 2)))), 1)), 1), 2), Q.div(1, 2)));   // the biggest pile's height up to y(k)
  const lo = T(hf), hi = T(Q.add(hf, 1)), up = Q.cmp(Q.sub(hi, y), Q.sub(y, lo)) < 0;
  const rung = up ? hi : lo, height = up ? Q.add(hf, 1) : hf;   // the coin pile nearest y(k) (the smaller on a tie): the rung
  const gap = Q.abs(Q.sub(y, rung));               // on the rung when it rounds there (within 1/2, ties up)
  const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, y), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));
  // main: the coin pile (1, 3, 6, 10, ...) y(k) rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    if (t === "shared-factor") {   // the pile is n coins high: a bigger number dividing both n and the gradient's whole part is better
      const wm = whole(Q.sub(Q.abs(m), Q.div(1, 2)));   // the whole part of the gradient's size
      return common(height, wm);
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
