// Forty-Five · Example: that distance shares a factor with the y-intercepts' gap
// Main part: the lines cross at 45° at a grid point, |x| + |y| on the dealt ladder. Tie-breaker: that distance shares a factor with the y-intercepts' gap.
// What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
// that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
// it finds one it leaves you a note, so you can make a deal with that player.
// Try this: add "shift" to KINDS: it changes the gap directly.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  if (Q.isZero(f.D)) return null;   // parallel lines never cross: no score
  const { score: main, n: S } = ladder(Q.add(Q.abs(f.x), Q.abs(f.y)), p.q, p.r, Q.add(f.off45, dist(f.x)));   // 45 degrees at a grid point, |x| + |y| on your ladder
  return [main, f.ygap === null ? null : common(S, whole(f.ygap))];   // main: the corner's level: 45 degrees at a grid point, |x| + |y| on your ladder (higher is better); tie-breaker: a corner whose |x| + |y| shares a big factor with the y-intercepts' gap is better
}

const FAR = 4;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["turn","slide","translate"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate
const LEAVE = [];      // pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the pair)
  // A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
  contested(offer, 3);
  const L = pairOf(offer);          // the two lines, a·x + b·y + c = 0 each
  const { params: p } = goal(offer);   // your rule (free)
  const tries = pairSteps(L, FAR, KINDS);   // [plan, lines after]: moves tried in the agent's own head
  let options = tries.map(([plan, L2]) => [plan, score(L2, p)]);   // each move and the score it reaches
  // A promise: on these pairs, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(L, p), QUOTES);
}
