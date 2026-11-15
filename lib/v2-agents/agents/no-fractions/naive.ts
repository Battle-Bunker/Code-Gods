// Divide By · Naive (for learning)
// Main part: the number you divide by on your powers. Tie-breaker: whichever you were dealt (x times the number you divide by near a multiple of your next power; y times the number you divide by near a multiple of your next power).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  if (f.x === null) return null;   // parallel lines never cross: no score
  const main = powerLadder(p.k, t => Q.abs(Q.sub(Q.abs(f.D), t)));   // the number you divide by on k, k³, k⁶, …
  const nx = Q.mul(f.x, f.D), ny = Q.mul(f.y, f.D);   // the answer's numerators
  const lv = levelOf(main, p.k), N = BigInt(p.k) ** BigInt((lv * (lv + 1)) / 2 + 1);   // your power reached, times k
  // main: the level of the number you divide by on k, k³, k⁶, … (higher is better)
  if (tie === "numerator-step") return [main, Q.neg(Q.div(offMultiple(nx, N), Q.of(N)))];   // x times the number you divide by near a multiple of k times your power reached (not 0) is better
  if (tie === "numerator-power") return [main, Q.neg(Q.div(offMultiple(ny, N), Q.of(N)))];   // y times the number you divide by near a multiple of k times your power reached (not 0) is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["combine","turn","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom

function agent(offer) {
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule and tie-breaker (free)
  // Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
  const tries = pairSteps(L, FAR, KINDS, [p.q ?? p.k].filter(Boolean));   // [plan, lines after]: moves tried in the agent's own head
  let top = score(L, p, tie), plans = [];
  for (const [plan, L2] of tries) {
    const s = score(L2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
