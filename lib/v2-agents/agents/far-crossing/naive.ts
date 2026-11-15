// Far Crossing · Naive (for learning)
// Main part: the steeper line crosses the x-axis at a whole number on the dealt ladder. Tie-breaker: whichever you were dealt (the gap between the x-intercepts a multiple of q to your level; the lines cross at a height that is a multiple of q to your level).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  if (f.rs === null) return null;   // the steeper line is flat: no score
  const { score: main, n: R } = ladder(f.rs, p.q, p.r);   // the x-intercept on your ladder
  // main: the level of the steeper line's x-intercept on your ladder (higher is better)
  if (tie === "far-gap") return [main, f.xgap === null ? null : Q.neg(offMultiple(f.xgap, BigInt(p.q) ** BigInt(levelOf(main, p.q) + 1)))];   // the gap between the x-intercepts near a multiple of q to the power one above your level is better
  if (tie === "far-height") return [main, f.y === null ? null : Q.neg(offMultiple(f.y, BigInt(p.q) ** BigInt(levelOf(main, p.q) + 1)))];   // a crossing height near a multiple of q to the power one above your level is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["shift","tilt"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate

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
