// Gap Ratio · Example: the number you divide by shares a factor with your next power
// Main part: the y-intercepts' gap whole and your power times the x-intercepts' gap. Secondary preference: the number you divide by shares a factor with your next power.
// What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
// that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
// it finds one it leaves you a note, so you can make a deal with that player.
// Try this: add "tilt" to KINDS: a new gradient changes the number you divide by.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const dist = v => Q.abs(Q.sub(v, whole(v)));   // how far a number is from the whole number nearest it
  if (f.ygap === null || f.xgap === null || f.origin) return null;   // no gaps, or a line through (0, 0): no score
  const main = powerLadder(p.k, t => Q.add(dist(f.ygap), Q.abs(Q.sub(f.ygap, Q.mul(t, f.xgap)))));
  const lv = levelOf(main, p.k), N = BigInt(p.k) ** BigInt((lv * (lv + 1)) / 2 + 1);   // your power reached, times k
  return [main, common(f.D, N)];   // main: the gaps' level: the y-intercepts' gap whole and k, k³, k⁶, … times the x-intercepts' gap (higher is better); secondary: the number you divide by sharing a big factor with k times your power reached is better
}

const FAR = 3;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["shift","tilt","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
const LEAVE = [];      // pairs your agent skips, e.g. [19] or [4, 9]: others may still move them
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
