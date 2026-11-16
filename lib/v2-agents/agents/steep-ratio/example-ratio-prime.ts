// Steep Ratio · Example: that number has a big smallest prime factor
// Main part: one line a whole number of times as steep, on your pattern. Secondary preference: that number has a big smallest prime factor.
// What it does: reads the two lines once (a small read), tries moves of either line in its own head, and takes the one
// that raises your points most (your rarity times the other players'). A tug-of-war burns energy on both sides: when
// it finds one it leaves you a note, so you can make a deal with that player.
// Try this: change FAR = 3 to 5 so the ratio can jump to a bigger prime.

// How good are the two lines L for your rule? [main part, secondary]: bigger is better, null is no score.
function score(L, p) {
  const f = solved(L);   // what the two lines give together (the answer, the number you divide by, ...)
  const mod1 = n => { const b = BigInt(n), zero = BigInt(0); return b < zero ? -b : b === zero ? BigInt(1) : b; };   // |n|, at least 1
  const core = n => { const Qb = BigInt(p.q), zero = BigInt(0); let m = BigInt(n); if (m < zero) m = -m; while (m > zero && m % Qb === zero) m /= Qb; return m; };   // without its factors of q
  if (f.ratio === null) return null;   // no ratio of gradients: no score
  const { score: main, n: k } = valuationLadder(f.ratio, p.q, p.r, 0, 2);   // the whole number of times (at least 2 either way) on your ladder
  return [main, spf(k)];   // main: the level of the whole number of times as steep on your ladder (higher is better); secondary: that number with a big smallest prime factor is better
}

const FAR = 3;      // how far one move may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const KINDS = ["tilt","stretch"];   // the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom
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
