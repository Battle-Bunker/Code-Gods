// Whole Answer · Naive (for learning)
// Main part: the answer is whole numbers. Tie-breaker: whichever you were dealt (the answer shares a factor with the number you divide by; the answer far down and to the left).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  if (f.x === null) return null;   // parallel lines never cross: no score
  const X = nearestLeaving(f.x, p.q, p.r);   // x's whole number that leaves your remainder
  const main = Q.neg(Q.add(Q.abs(Q.sub(f.x, X)), dist(f.y)));
  // main: how far the answer (x, y) is from whole numbers, x with your remainder (closer is better)
  if (tie === "peg-divisor") return [main, common(Q.add(Q.abs(X), Q.abs(f.Y)), f.D)];   // |X| + |Y| sharing a big factor with the number you divide by is better
  if (tie === "south-west") return [main, Q.neg(Q.add(X, f.Y))];   // an answer far down and to the left is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["slide","turn"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter

function agent(offer) {
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule and tie-breaker (free)
  const tries = pairSteps(L, FAR, KINDS);   // [plan, lines after]: moves tried in the agent's own head
  let top = score(L, p, tie), plans = [];
  for (const [plan, L2] of tries) {
    const s = score(L2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
