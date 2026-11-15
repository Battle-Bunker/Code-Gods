// Forty-Five · Naive (for learning)
// Main part: the lines cross at 45°. Tie-breaker: whichever you were dealt (the number you divide by has many prime factors; the number you divide by shares a factor with the y-intercepts' gap).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  if (Q.isZero(f.D)) return null;   // parallel lines never cross: no score
  const main = Q.neg(f.off45);
  // main: how far the lines are from crossing at 45 degrees (closer is better)
  if (tie === "smooth-divisor") return [main, omega(f.D)];   // a number you divide by with many prime factors is better
  if (tie === "divisor-gap") return [main, f.ygap === null ? null : common(f.D, whole(f.ygap))];   // the number you divide by sharing a big factor with the y-intercepts' gap is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["turn","quarter","reflect"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter

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
