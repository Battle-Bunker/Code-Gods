// Treasure (tuple) · Example: how close to that target
// Main part: the nearest target's size, the bigger the better. Secondary preference: how close to that target.
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 3 to 5: a target a few units away comes within one step.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p) {
  const x = Q.abs(Q.add(Q.mul(m, p.k), c));       // y at x = k, ignoring a minus sign
  const w = Q.cmp(x, 0) <= 0 ? 0n : BigInt(whole(Q.sub(x, Q.div(1, 2)))), r0 = w < 1n ? 1n : (BigInt(root(Q.add(Q.mul(8, Q.of(w)), 1))) - 1n) / 2n;   // w: x rounded down
  const pile = r => (r * (r + 1n)) / 2n;          // the triangle number with r rows: 1 + 2 + ... + r
  const rows = Q.cmp(Q.abs(Q.sub(x, Q.of(pile(r0 + 1n)))), Q.abs(Q.sub(x, Q.of(pile(r0))))) < 0 ? r0 + 1n : r0;   // the nearer (the fewer rows on a tie)
  const n = pile(rows), main = n;                  // the triangle number nearest y: bigger is better
  return [main, Q.neg(Q.abs(Q.sub(x, n)))];   // main: the triangle number (1, 3, 6, 10, ...) nearest y at x = k, the bigger the better; secondary: how close the reading is to that target: nearer is better
}

const FAR = 3;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines your agent skips, e.g. [19] or [4, 9]: others may still move them
const PROTECT = [];    // lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this line alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the line)
  // A tug-of-war (another player taking back your gains on this line, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the line instead gives it away: try it and compare.)
  contested(offer, 3);
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params;
  // A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
  if (!Q.isQ(m)) return climb(offer, tips(offer).filter(([plan]) => !PROTECT.includes(offer.object) || fair(offer, plan)).map(([plan, m2, c2]) => [plan, score(m2, c2, p)]), null, QUOTES);
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
  }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p), QUOTES);
}
