// Divide By · Thorough
// Main part: the number you divide by on your powers. Tie-breaker: whichever you were dealt (x times the number you divide by near a multiple of your next power; y times the number you divide by near a multiple of your next power).
// What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs
// no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there
// times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others
// can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change QUOTES = 16 to 6: fewer prices asked, but it may miss a cheaper plan.

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
const QUOTES = 16;  // at most this many plans are priced (each price is a host call)
const KINDS = ["shift","tilt","stretch","turn","slide","combine","reflect","quarter","translate","zoom"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
const LEAVE = [];      // pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the pair)
  // A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
  contested(offer, 3);
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule and tie-breaker (free)
  // Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
  const tries = pairSteps(L, FAR, KINDS, [p.q ?? p.k].filter(Boolean));   // [plan, lines after]: moves tried in the agent's own head
  let options = tries.map(([plan, L2]) => [plan, score(L2, p, tie)]);   // each move and the score it reaches
  // A promise: on these pairs, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(L, p, tie), QUOTES);
}
