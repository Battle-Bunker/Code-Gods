// Square Area · Example: the factor that square's root plus 1 shares with the x-crossing's whole part
// Main part: the triangle's area on as big a square ending in d as possible. Tie-breaker: the factor that square's root plus 1 shares with the x-crossing's whole part.
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 3 to 2: a smaller tilt keeps the area on its square more often, and still moves the crossing.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p) {
  if (Q.isZero(m) || Q.isZero(c)) return null;    // no triangle: the worst score
  const legX = Q.abs(Q.div(c, m)), legY = Q.abs(c); // the triangle's base and height
  const area = Q.div(Q.mul(legX, legY), 2);
  const fl = BigInt(p.round ? whole(area) : whole(Q.div(Q.sub(Q.mul(2, area), 1), 2)));   // the area rounded down (to the nearest, for near)
  const s = BigInt(root(fl)), K = BigInt(p.ends);   // its whole square root, rounded down
  let lo = s, hi = s + 1n;                         // the nearest roots at or below s, and above, whose squares end in p.ends
  while (lo >= 1n && (lo * lo) % 10n !== K) lo--;
  while ((hi * hi) % 10n !== K) hi++;
  const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const a = p.round ? Q.div(-1, 2) : 0;               // the window of r² is [r² + a, r² + a + 1)
  const below = Q.sub(area, Q.add(Q.of(lo * lo + 1n), a)), above = Q.sub(Q.add(Q.of(hi * hi), a), area);   // past the window below, up to the one above
  const on = lo === s && s >= 1n && s * s === fl;  // the area rounds to s², a square ending in p.ends: a rung
  const r = on || (lo >= 1n && Q.cmp(below, above) <= 0) ? lo : hi;   // that number (on a rung), else the nearest window's
  const main = on ? level(Q.of(fl)) : Q.neg(r === lo ? below : above);
  const wx = whole(Q.div(Q.sub(Q.mul(2, legX), 1), 2));   // the x-crossing's whole part, ignoring its sign
  return [main, common(Q.of(r + 1n), wx)];   // main: the square ending in the rule's digit that the triangle's area rounds down (or to the nearest) to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from rounding to one; tie-breaker: that square's root plus 1 and the x-crossing's whole part: a bigger factor shared is better
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
  // The next rung up (the ladder has no top): the next square ending in p.ends above the area, aiming
  // at the middle of its window (r² ± 1/2), by a shift that keeps the gradient (c² = 2|m|·area, to the nearest half) or
  // a tilt that keeps the y-intercept (|m| = c²/(2·area), to the nearest half, third or quarter).
  if (!Q.isZero(m) && !Q.isZero(c)) {
    const s0 = BigInt(root(whole(Q.div(Q.sub(Q.div(Q.mul(c, c), Q.abs(m)), 1), 2))));   // √(the area rounded down), rounded down
    let r = s0 + 1n;                                 // the next root above it whose square ends in p.ends
    while ((r * r) % 10n !== BigInt(p.ends)) r++;
    const mid = p.round ? Q.of(r * r) : Q.add(Q.of(r * r), Q.div(1, 2));   // the middle of its window
    const h0 = root(whole(Q.mul(8, Q.mul(Q.abs(m), mid))));   // 2·√(2|m|·mid), rounded down: c to the nearest half
    for (const h of [h0, Q.add(h0, 1)]) {
      const c2 = Q.mul(Q.cmp(c, 0) < 0 ? -1 : 1, Q.div(h, 2));
      tries.push([move("si.shift", { k: Q.sub(c2, c) }), m, c2]);
    }
    for (const d of [2, 3, 4]) {
      const m2 = Q.mul(Q.cmp(m, 0) < 0 ? -1 : 1, Q.div(whole(Q.mul(d, Q.div(Q.mul(c, c), Q.mul(2, mid)))), d));
      if (!Q.isZero(m2)) tries.push([move("si.tilt", { k: Q.sub(m2, m) }), m2, c]);
    }
  }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p), QUOTES);
}
