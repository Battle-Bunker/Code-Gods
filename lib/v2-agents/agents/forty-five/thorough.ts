// Forty-Five · Thorough
// Main part: 45° at whole x and y, |x| + |y| on your pattern. Secondary preference: whichever you were dealt (that |x| + |y| shares a factor with the number you divide by; the y-intercepts' gap near a multiple of that |x| + |y|; that |x| + |y| has many prime factors).
// What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs
// no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there
// times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others
// can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change QUOTES = 16 to 6: fewer prices asked, but it may miss a cheaper plan.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  const mod1 = n => { const b = BigInt(n), zero = BigInt(0); return b < zero ? -b : b === zero ? BigInt(1) : b; };   // |n|, at least 1
  if (Q.isZero(f.D)) return null;   // parallel lines never cross: no score
  const { score: main, n: S } = ladder(Q.add(Q.abs(f.x), Q.abs(f.y)), p.q, p.r, Q.add(f.off45, dist(f.x)));   // 45 degrees at a grid point, |x| + |y| on your ladder
  // main: the corner's level: 45 degrees at a grid point, |x| + |y| on your ladder (higher is better)
  if (tie === "corner-divisor") return [main, common(S, f.D)];   // a corner whose |x| + |y| shares a big factor with the number you divide by is better
  if (tie === "corner-gap") return [main, f.ygap === null ? null : Q.neg(offMultiple(f.ygap, mod1(S)))];   // a y-intercepts' gap near a multiple of the corner's |x| + |y| (not 0) is better
  if (tie === "corner-smooth") return [main, omega(S)];   // a corner whose |x| + |y| has many prime factors is better
  return [main];
}

const FAR = 2;      // how far one move may go
const QUOTES = 16;  // at most this many plans are priced (each price is a host call)
const KINDS = ["shift","tilt","stretch","turn","slide","combine","reflect","quarter","translate","zoom"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
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
  const tries = pairSteps(L, FAR, KINDS);   // [plan, lines after]: moves tried in the agent's own head
  let options = tries.map(([plan, L2]) => [plan, score(L2, p, tie)]);   // each move and the score it reaches
  // A promise: on these pairs, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(L, p, tie), QUOTES);
}
