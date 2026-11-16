// Square Area · Example: the factor that square's root plus 1 shares with the x-crossing's whole part
// Main part: the triangle's area on as big a square ending in d as possible. Secondary preference: the factor that square's root plus 1 shares with the x-crossing's whole part.
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 3 to 2: a smaller tilt keeps the area on its square more often, and still moves the crossing.

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p) {
  if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score
  const legX = Q.abs(Q.div(c, m)), area = Q.div(Q.mul(legX, Q.abs(c)), 2);   // the triangle's base, and its area
  const a = p.round ? Q.div(-1, 2) : 0;            // the window of r² is [r² + a, r² + a + 1)
  const fl = BigInt(whole(Q.sub(area, Q.add(a, Q.div(1, 2)))));   // the area, rounded down (or off)
  const s = BigInt(root(fl));                      // its whole square root
  const r = BigInt(near(s, n => n > 1 && String(BigInt(n) ** 2n).endsWith(p.ends)));   // the nearest root above 1 whose square ends in p.ends
  const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const w = Q.add(Q.of(r * r), a);                 // its window [w, w + 1)
  const main = r === s && s * s === fl ? level(Q.of(fl)) : Q.neg(Q.cmp(area, w) < 0 ? Q.sub(w, area) : Q.sub(area, Q.add(w, 1)));
  const wx = whole(Q.div(Q.sub(Q.mul(2, legX), 1), 2));   // the x-crossing's whole part, ignoring its sign
  return [main, common(Q.of(r + 1n), wx)];   // main: the square above 1 ending in the rule's digit that the triangle's area rounds down (or off) to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from the window of the nearest such square's root; secondary: that square's root plus 1 and the x-crossing's whole part: a bigger factor shared is better
}

const FAR = 3;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
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
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("cart.pivot", { x0: -1, k }), Q.add(m, k), Q.add(c, k)]);   // turn the line about its point at x = -1 (m and c both change by k)
  }
  // The next rung up (the ladder has no top): the next root above √area whose square ends in p.ends, by a shift that
  // keeps the gradient and puts the area in the middle of its window (c² = 2|m|·area, to the nearest half).
  if (!Q.isZero(m) && !Q.isZero(c)) {
    let r = BigInt(root(whole(Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m)))))) + 1n;
    while (!String(r * r).endsWith(p.ends)) r++;
    const c2 = Q.mul(Q.cmp(c, 0) < 0 ? -1 : 1, Q.div(root(whole(Q.mul(8, Q.mul(Q.abs(m), Q.add(Q.of(r * r), p.round ? 0 : Q.div(1, 2)))))), 2));
    tries.push([move("si.shift", { k: Q.sub(c2, c) }), m, c2]);
  }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p), QUOTES);
}
