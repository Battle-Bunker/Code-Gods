// Forty-Five · Naive (for learning)
// Main part: 45° at whole x and y, |x| + |y| on your pattern. Tie-breaker: whichever you were dealt (that |x| + |y| has many prime factors; that |x| + |y| shares a factor with the y-intercepts' gap).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  if (Q.isZero(f.D)) return null;   // parallel lines never cross: no score
  const { score: main, n: S } = ladder(Q.add(Q.abs(f.x), Q.abs(f.y)), p.q, p.r, Q.add(f.off45, dist(f.x)));   // 45 degrees at a grid point, |x| + |y| on your ladder
  // main: the corner's level: 45 degrees at a grid point, |x| + |y| on your ladder (higher is better)
  if (tie === "corner-smooth") return [main, omega(S)];   // a corner whose |x| + |y| has many prime factors is better
  if (tie === "corner-gap") return [main, f.ygap === null ? null : common(S, whole(f.ygap))];   // a corner whose |x| + |y| shares a big factor with the y-intercepts' gap is better
  return [main];
}

const FAR = 4;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["turn","slide","translate"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate

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
