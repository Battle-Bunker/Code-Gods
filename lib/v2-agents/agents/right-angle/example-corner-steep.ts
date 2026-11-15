// Right Angle · Example: the corner's distance shares a factor with the steeper gradient
// Main part: the lines cross at a right angle at a grid point, y on the dealt ladder. Tie-breaker: the corner's distance shares a factor with the steeper gradient.
// What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
// that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
// it finds one it leaves you a note, so you can make a deal with that player.
// Try this: add "tilt" to KINDS: it changes a gradient directly.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  const floor = v => whole(Q.sub(v, Q.of(1, 2)));   // rounded down
  if (f.offRight === null || f.x === null) return null;   // parallel lines never cross: no score
  const { score: main, n: Yc } = ladder(f.y, p.q, p.r, Q.add(f.offRight, dist(f.x)));   // a right angle at a grid point, y on your ladder
  const t = Q.add(Q.abs(f.X), Q.abs(Yc));   // the corner's |x| + |y|
  return [main, f.ms === null ? 0 : common(t, floor(Q.abs(f.ms)))];   // main: the corner's level: a right angle at a grid point, y on your ladder (higher is better); tie-breaker: a corner whose |x| + |y| shares a big factor with the steeper gradient is better
}

const FAR = 3;      // how far one move may go
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
  // Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
  const tries = pairSteps(L, FAR, KINDS, [p.q ?? p.k].filter(Boolean));   // [plan, lines after]: moves tried in the agent's own head
  let options = tries.map(([plan, L2]) => [plan, score(L2, p)]);   // each move and the score it reaches
  // A promise: on these pairs, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The move that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(L, p), QUOTES);
}
