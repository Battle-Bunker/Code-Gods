// Same on Both Rulers · Simple
// Main part: the unchanged number on as big a palindrome as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both the palindrome's digit sum and the gradient's whole part).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

// Palindromes (1, 2 ... 9, 11, 22 ... 99, 101, 111 ...) with an odd, or an even, number of digits: those nearest y, the nearest, and its level.
function pals(y, odd) {
  const w = Q.cmp(y, 0) <= 0 ? "0" : String(whole(Q.sub(y, Q.div(1, 2)))), L = w.length, out = [];   // w: y rounded down
  const pal = (h, n) => { const t = String(h); return BigInt(t + t.slice(0, n >> 1).split("").reverse().join("")); };   // n digits from the first (n + 1)/2, h
  const k = n => BigInt((n + 1) >> 1), lo = n => 10n ** (k(n) - 1n), hi = n => 10n ** k(n) - 1n, h0 = BigInt(w.slice(0, (L + 1) >> 1));
  for (let n = Math.max(1, L - 2); n <= L + 2; n++) if (n % 2 === (odd ? 1 : 0))   // the longest shorter one, the shortest longer one, and those around y
    out.push(...(n < L ? [pal(hi(n), n)] : n > L ? [pal(lo(n), n)] : [h0 - 1n, h0, h0 + 1n].map(h => pal(h < lo(n) ? lo(n) : h > hi(n) ? hi(n) : h, n))));
  return out;
}
function rungOf(y, odd) {   // the nearest (the bigger on a tie, as y rounds)
  const w = Q.cmp(y, 0) <= 0 ? -1n : BigInt(whole(Q.sub(y, Q.div(1, 2))));   // whole numbers at or below y are those at or below w
  let a = null, b = null; for (const t of pals(y, odd)) { if (t <= w) { if (a === null || t > a) a = t; } else if (b === null || t < b) b = t; }
  return a === null || Q.cmp(Q.sub(Q.of(b), y), Q.sub(y, Q.of(a))) <= 0 ? b : a;
}
function onRung(y, r) {   // on the rung when y rounds to it: its levels of digits (level L needs L(L + 1)/2); else how far from rounding to it
  if (BigInt(whole(y)) !== r) return Q.neg(Q.sub(Q.abs(Q.sub(y, Q.of(r))), Q.div(1, 2)));
  const D = String(r).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++;
  return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(Q.of(r), Q.of(10n ** BigInt(D)))), L + 1));
}

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const y = Q.mul(p.side ?? 1, c), main = onRung(y, rungOf(y, p.digits === "odd"));   // x = c meets y = x at c
    return [main, null];
  }
  if (Q.eq(m, 1)) return null;                    // parallel to y = x: no number stays unchanged
  const y = Q.mul(p.side ?? 1, Q.div(c, Q.sub(1, m)));   // the unchanged number c/(1 - m), where the line meets y = x (minus it on the mirror)
  const rung = rungOf(y, p.digits === "odd"), main = onRung(y, rung);
  // main: the palindrome with an odd (or even) number of digits that the number the machine leaves unchanged rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
  if (tie === "shared-factor") {   // a bigger number dividing both the palindrome's digit sum and the gradient's whole part is better
    const sum = [...rung.toString()].reduce((a, ch) => a + Number(ch), 0), wm = whole(Q.sub(Q.abs(m), Q.div(1, 2)));   // the palindrome's digits added up; the whole part of |m|
    return [main, common(sum, wm)];
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
  let m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  if (!Q.isQ(m)) {                  // a vertical line (x = k): tip it into y = mx + c, or slide it sideways
    m = null, c = look(offer, "crossing").x0;   // where it stands: score(null, k) reads the line x = k
    tries.push(...vertical(offer, FAR));   // its tips into y = mx + c and its slides sideways
  } else {
    for (let k = -FAR; k <= FAR; k++) {
      if (k === 0) continue;
      tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
      tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
      const den = Q.sub(1, Q.mul(m, k));
      if (!Q.isZero(den)) tries.push([move("rot.turn", { centre: 0, turn: k }), Q.div(Q.add(m, k), den), c]);   // turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
    }
    // The next palindrome up (the ladder has no top): the smallest one above the unchanged number, by a shift or by a tilt.
    if (!Q.eq(m, 1)) {
      const s = p.side ?? 1, y = Q.mul(s, Q.div(c, Q.sub(1, m)));   // the unchanged number (minus it on the mirror)
      const to = Q.mul(s, Q.of(pals(y, p.digits === "odd").filter(t => Q.cmp(Q.of(t), y) > 0).reduce((a, b) => (b < a ? b : a))));
      tries.push([move("si.shift", { k: Q.sub(Q.mul(to, Q.sub(1, m)), c) }), m, Q.mul(to, Q.sub(1, m))]);   // keep m, move c
      if (!Q.isZero(c)) tries.push([move("si.tilt", { k: Q.sub(Q.sub(1, Q.div(c, to)), m) }), Q.sub(1, Q.div(c, to)), c]);   // keep c, move m
    }
    tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  }
  tries.push(...shortcuts(m, c, rule.mutators));   // other views the game offers: mirrors, a slide, turns, one intercept moved
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
