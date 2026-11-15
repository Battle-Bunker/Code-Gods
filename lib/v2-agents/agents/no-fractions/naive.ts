// Divide By · Naive (for learning)
// Main part: the number you divide by on the dealt powers. Tie-breaker: whichever you were dealt (the answer's numerators add up to a number with many prime factors; the answer's numerators share a big factor).
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
  // main: the level of the number you divide by on k, k³, k⁶, … (higher is better)
  if (tie === "numerator-smooth") return [main, omega(Q.add(Q.abs(nx), Q.abs(ny)))];   // numerators adding up to a number with many prime factors are better
  if (tie === "numerator-shared") return [main, common(nx, ny)];   // numerators sharing a big factor are better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["combine","turn","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate

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
