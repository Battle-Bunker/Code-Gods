// High Start · Example: the gentler line high and rising
// Main part: the gentler line crosses the y-axis at a whole number on the dealt ladder. Tie-breaker: the gentler line high and rising.
// What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
// that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
// it finds one it leaves you a note, so you can make a deal with that player.
// Try this: add "stretch" to KINDS: it raises both, but a steeper gentler line can stop being the gentler one.

// How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(L, p) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const floor = v => whole(Q.sub(v, Q.of(1, 2)));   // rounded down
  if (f.cg === null || f.mg === null) return null;   // the gentler line is upright: no score
  const { score: main, n: H } = ladder(f.cg, p.q, p.r);   // the y-intercept on your ladder
  return [main, Q.cmp(H, floor(f.mg)) < 0 ? H : floor(f.mg)];   // main: the level of the gentler line's y-intercept on your ladder (higher is better); tie-breaker: the smaller of the gentler line's y-intercept and its gradient's whole part big is better
}

const FAR = 3;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["shift","tilt"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter
const LEAVE = [];      // pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone
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
