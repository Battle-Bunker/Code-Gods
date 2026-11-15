// Gap Ratio · Naive (for learning)
// Main part: the y-intercepts' gap whole and your power times the x-intercepts' gap. Secondary preference: whichever you were dealt (the number you divide by shares a factor with your next power; the y-intercepts' gap near a multiple of your next power; the gap plus your next power has a big smallest prime factor).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  if (f.ygap === null || f.xgap === null || f.origin) return null;   // no gaps, or a line through (0, 0): no score
  const main = powerLadder(p.k, t => Q.add(dist(f.ygap), Q.abs(Q.sub(f.ygap, Q.mul(t, f.xgap)))));
  const lv = levelOf(main, p.k), N = BigInt(p.k) ** BigInt((lv * (lv + 1)) / 2 + 1);   // your power reached, times k
  // main: the gaps' level: the y-intercepts' gap whole and k, k³, k⁶, … times the x-intercepts' gap (higher is better)
  if (tie === "gap-divisor") return [main, common(f.D, N)];   // the number you divide by sharing a big factor with k times your power reached is better
  if (tie === "gap-step") return [main, Q.neg(offMultiple(f.ygap, N))];   // a y-intercepts' gap near a multiple of k times your power reached (not 0) is better
  if (tie === "gap-prime") return [main, spf(Q.add(Q.abs(whole(f.ygap)), Q.of(N)))];   // the gap plus k times your power reached with a big smallest prime factor is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["shift","tilt","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom

function agent(offer) {
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule and secondary preference (free)
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
