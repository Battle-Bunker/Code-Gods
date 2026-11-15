// Treasure · Simple
// Main part: y(k) on as big a coin pile as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both the pile's height and the gradient's whole part).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const level = r => { const D = Q.toString(r).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(r, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const s = p.side ?? 1, y = Q.mul(s, Q.add(Q.mul(m, p.k), c));   // y(k) = m·k + c, or minus it on the mirror
  const T = h => Q.div(Q.mul(h, Q.add(h, 1)), 2);   // the coin pile h coins high: h(h + 1)/2
  const hf = Q.cmp(y, 1) < 0 ? 1 : whole(Q.sub(Q.div(Q.sub(root(Q.add(Q.mul(8, whole(Q.sub(y, Q.div(1, 2)))), 1)), 1), 2), Q.div(1, 2)));   // the biggest pile's height up to y(k)
  const lo = T(hf), hi = T(Q.add(hf, 1)), up = Q.cmp(Q.sub(hi, y), Q.sub(y, lo)) < 0;
  const rung = up ? hi : lo, height = up ? Q.add(hf, 1) : hf;   // the coin pile nearest y(k) (the smaller on a tie): the rung
  const gap = Q.abs(Q.sub(y, rung));               // on the rung when it rounds there (within 1/2, ties up)
  const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, y), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));
  // main: the coin pile (1, 3, 6, 10, ...) y(k) rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
  if (tie === "shared-factor") {   // the pile is n coins high: a bigger number dividing both n and the gradient's whole part is better
    const wm = whole(Q.sub(Q.abs(m), Q.div(1, 2)));   // the whole part of the gradient's size
    return [main, common(height, wm)];
  }
  return [main];
}

const FAR = 2;      // how far one change may go
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
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  // A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
  if (!Q.isQ(m)) return climb(offer, tips(offer).filter(([plan]) => !PROTECT.includes(offer.object) || fair(offer, plan)).map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]), null, QUOTES);
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
  }
  // The next pile up (the ladder has no top): the coin pile just above y(k), by a shift or by a tilt.
  { const s = p.side ?? 1, yk = Q.add(Q.mul(m, p.k), c), w = Q.mul(s, yk);
    const h = Q.cmp(w, 1) < 0 ? 0 : whole(Q.sub(Q.div(Q.sub(root(Q.add(Q.mul(8, whole(w)), 1)), 1), 2), Q.div(1, 2)));   // the biggest pile's height up to y(k)
    const d = Q.sub(Q.mul(s, Q.div(Q.mul(Q.add(h, 1), Q.add(h, 2)), 2)), yk);   // how far y(k) must move to the next pile
    tries.push([move("si.shift", { k: d }), m, Q.add(c, d)], [move("si.tilt", { k: Q.div(d, p.k) }), Q.add(m, Q.div(d, p.k)), c]); }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
