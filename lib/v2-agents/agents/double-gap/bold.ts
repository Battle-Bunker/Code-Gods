// Double Gap · Bold
// Main part: the gap on the y-axis is a whole number, twice the gap on the x-axis. Tie-breaker: whichever you were dealt (the gap shares a factor with the number you divide by; the gap is a big prime).
// What it does: reads the two lines once (a small read), tries moves of either line in its own head (thinking costs
// no energy, only time) and takes the move that raises your points most. Your points on a pair are your rarity there
// times the other players' rarity there added up, so a move that suits your rule but spoils the pair for the others
// can lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change FAR = 4 to 2: shorter steps, cheaper moves.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p, tie) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  if (f.ygap === null || f.xgap === null || f.origin) return null;   // no gaps, or a line through (0, 0): no score
  const main = Q.neg(Q.add(Q.abs(Q.sub(f.ygap, Q.mul(2, f.xgap))), dist(f.ygap)));
  // main: how far the y-intercepts' gap is from a whole number twice the x-intercepts' gap (closer is better)
  if (tie === "gap-divisor") return [main, common(whole(f.ygap), f.D)];   // the gap sharing a big factor with the number you divide by is better
  if (tie === "gap-prime") return [main, spf(whole(f.ygap))];   // a gap with a big smallest prime factor is better
  return [main];
}

const FAR = 4;      // how far one move may go
const QUOTES = 12;  // at most this many plans are priced (each price is a host call)
const KINDS = ["shift","tilt"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter
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
  const tries = pairSteps(L, FAR, KINDS);   // [plan, lines after]: moves tried in the agent's own head
  let options = tries.map(([plan, L2]) => [plan, score(L2, p, tie)]);   // each move and the score it reaches
  // A promise: on these pairs, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(L, p, tie), QUOTES);
}
