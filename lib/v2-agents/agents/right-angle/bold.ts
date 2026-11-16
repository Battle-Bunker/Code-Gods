// Right Angle · Bold
// Main part: a right angle at whole x and y, y on your pattern. Secondary preference: whichever you were dealt (the corner's x near a multiple of its y; the corner's y shares a factor with the steeper gradient; the corner's |x| + |y| has a big smallest prime factor).
// What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs
// no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there
// times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others
// can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change FAR = 4 to 2: shorter steps, cheaper moves.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  const floor = v => whole(Q.sub(v, Q.of(1, 2)));   // rounded down
  if (f.offRight === null || f.x === null) return null;   // parallel lines never cross: no score
  const { score: main, n: Yc } = ladder(f.y, p.q, p.r, Q.add(f.offRight, dist(f.x)));   // a right angle at a grid point, y on your ladder
  const mod1 = n => { const b = BigInt(n), zero = BigInt(0); return b < zero ? -b : b === zero ? BigInt(1) : b; };   // |n|, at least 1
  // main: the corner's level: a right angle at a grid point, y on your ladder (higher is better)
  if (tie === "corner-multiple") return [main, Q.neg(offMultiple(f.x, mod1(Yc)))];   // a corner whose x is near a multiple of its y (not 0) is better
  if (tie === "corner-steep") return [main, f.ms === null ? 0 : common(Yc, floor(Q.abs(f.ms)))];   // a corner whose y shares a big factor with the steeper gradient is better
  if (tie === "corner-prime") return [main, spf(Q.add(Q.abs(f.X), Q.abs(Yc)))];   // a corner whose |x| + |y| has a big smallest prime factor is better
  return [main];
}

const FAR = 4;      // how far one move may go
const QUOTES = 12;  // at most this many plans are priced (each price is a host call)
const KINDS = ["turn","slide","translate"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
const LEAVE = [];      // pairs your agent skips, e.g. [19] or [4, 9]: others may still move them
const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the pair)
  // A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
  contested(offer, 3);
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule and secondary preference (free)
  const tries = pairSteps(L, FAR, KINDS);   // [plan, lines after]: moves tried in the agent's own head
  let options = tries.map(([plan, L2]) => [plan, score(L2, p, tie)]);   // each move and the score it reaches
  // A promise: on these pairs, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(L, p, tie), QUOTES);
}
