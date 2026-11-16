// Whole Answer · Simple
// Main part: the answer's y on your pattern. Secondary preference: whichever you were dealt (the answer's x near a multiple of its y; the answer's |x| + |y| has a big smallest prime factor; the answer's y, without its factors of your number, shares a factor with the steeper gradient).
// What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs
// no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there
// times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others
// can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: add a move from the Thorough starter's KINDS and compare.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  const floor = v => whole(Q.sub(v, Q.of(1, 2)));   // rounded down
  const mod1 = n => { const b = BigInt(n), zero = BigInt(0); return b < zero ? -b : b === zero ? BigInt(1) : b; };   // |n|, at least 1
  const core = n => { const Qb = BigInt(p.q), zero = BigInt(0); let m = BigInt(n); if (m < zero) m = -m; while (m > zero && m % Qb === zero) m /= Qb; return m; };   // without its factors of q
  if (f.x === null) return null;   // parallel lines never cross: no score
  const { score: main, n: Yv } = valuationLadder(f.y, p.q, p.r, dist(f.x));   // y on your ladder, x near a whole number
  // main: the answer's level: whole numbers, y on your ladder (higher is better)
  if (tie === "x-multiple") return [main, Q.neg(offMultiple(f.x, mod1(Yv)))];   // an answer whose x is near a multiple of its y (not 0) is better
  if (tie === "sum-prime") return [main, spf(Q.add(Q.abs(f.X), Q.abs(Yv)))];   // an answer whose |x| + |y| has a big smallest prime factor is better
  if (tie === "y-steep") return [main, f.ms === null ? 0 : common(core(Yv), floor(Q.abs(f.ms)))];   // y's number (without its factors of q) sharing a big factor with the steeper gradient is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["slide","turn","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
const LEAVE = [];      // pairs your agent skips, e.g. [19] or [4, 9]: it does not act on them (others still may)
const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the pair)
  // A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
  contested(offer, 3);
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule and secondary preference (free)
  // Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
  const tries = pairSteps(L, FAR, KINDS, [p.q ?? p.k].filter(Boolean));   // [plan, lines after]: moves tried in the agent's own head
  let options = tries.map(([plan, L2]) => [plan, score(L2, p, tie)]);   // each move and the score it reaches
  // A promise: on these pairs, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(L, p, tie), QUOTES);
}
