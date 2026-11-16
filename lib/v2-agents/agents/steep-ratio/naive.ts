// Steep Ratio · Naive (for learning)
// Main part: one line a whole number of times as steep, on your pattern. Secondary preference: whichever you were dealt (the y-intercepts' gap near a multiple of that number; that number has a big smallest prime factor; that number, without its factors of your number, has many prime factors).
// What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
// pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
// player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
// Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const mod1 = n => { const b = BigInt(n), zero = BigInt(0); return b < zero ? -b : b === zero ? BigInt(1) : b; };   // |n|, at least 1
  const core = n => { const Qb = BigInt(p.q), zero = BigInt(0); let m = BigInt(n); if (m < zero) m = -m; while (m > zero && m % Qb === zero) m /= Qb; return m; };   // without its factors of q
  if (f.ratio === null) return null;   // no ratio of gradients: no score
  const { score: main, n: k } = valuationLadder(f.ratio, p.q, p.r, 0, 2);   // the whole number of times (at least 2 either way) on your ladder
  // main: the level of the whole number of times as steep on your ladder (higher is better)
  if (tie === "ratio-gap") return [main, f.ygap === null ? null : Q.neg(offMultiple(f.ygap, mod1(k)))];   // a y-intercepts' gap near a multiple of that number (not 0) is better
  if (tie === "ratio-prime") return [main, spf(k)];   // that number with a big smallest prime factor is better
  if (tie === "ratio-smooth") return [main, omega(core(k))];   // that number (without its factors of q) with many prime factors is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["tilt","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom

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
