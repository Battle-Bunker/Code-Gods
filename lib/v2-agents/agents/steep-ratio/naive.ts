// Steep Ratio · Naive (for learning)
// Main part: one line a whole number of times as steep as the other. Tie-breaker: whichever you were dealt (that number shares a factor with the y-intercepts' gap; that number is a big prime).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  if (f.ratio === null) return null;   // no ratio of gradients: no score
  let k = whole(f.ratio);   // the whole number of times nearest (at least 2 either way)
  if (Q.cmp(Q.abs(k), 2) < 0) k = Q.cmp(f.ratio, 0) < 0 ? -2 : 2;
  const main = Q.neg(Q.abs(Q.sub(f.ratio, k)));
  // main: how far the steeper line is from a whole number of times as steep as the other (closer is better)
  if (tie === "ratio-gap") return [main, f.ygap === null ? null : common(k, whole(f.ygap))];   // that number sharing a big factor with the y-intercepts' gap is better
  if (tie === "ratio-prime") return [main, spf(k)];   // that number with a big smallest prime factor is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["tilt","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter

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
