// Right Angle · Naive (for learning)
// Main part: a right angle at whole x and y, y on your pattern. Secondary preference: whichever you were dealt (the corner's |x| + |y| has a big smallest prime factor; the corner's |x| + |y| shares a factor with the steeper gradient).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  const floor = v => whole(Q.sub(v, Q.of(1, 2)));   // rounded down
  if (f.offRight === null || f.x === null) return null;   // parallel lines never cross: no score
  const { score: main, n: Yc } = ladder(f.y, p.q, p.r, Q.add(f.offRight, dist(f.x)));   // a right angle at a grid point, y on your ladder
  const t = Q.add(Q.abs(f.X), Q.abs(Yc));   // the corner's |x| + |y|
  // main: the corner's level: a right angle at a grid point, y on your ladder (higher is better)
  if (tie === "corner-prime") return [main, spf(t)];   // a corner whose |x| + |y| has a big smallest prime factor is better
  if (tie === "corner-steep") return [main, f.ms === null ? 0 : common(t, floor(Q.abs(f.ms)))];   // a corner whose |x| + |y| shares a big factor with the steeper gradient is better
  return [main];
}

const FAR = 4;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["turn","slide","translate"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate

function agent(offer) {
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule and secondary preference (free)
  const tries = pairSteps(L, FAR, KINDS);   // [plan, lines after]: moves tried in the agent's own head
  let top = score(L, p, tie), plans = [];
  for (const [plan, L2] of tries) {
    const s = score(L2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
