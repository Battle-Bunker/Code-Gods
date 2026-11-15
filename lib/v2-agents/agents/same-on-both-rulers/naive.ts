// Same on Both Rulers · Naive (for learning)
// Main part: the unchanged number on as big a palindrome as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both the palindrome's digit sum and the y-intercept's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const level = r => { const D = r.toString().length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(Q.of(r), Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
    const pals = y => {   // the palindromes starting and ending in p.d nearest y: below and above it at its length, and one digit either side
      const d = BigInt(p.d), w = Q.cmp(y, 0) <= 0 ? "0" : String(whole(Q.sub(y, Q.div(1, 2)))), L = w.length;   // w: y rounded down
      const pal = (h, n) => { const t = String(h); return BigInt(t + t.slice(0, n >> 1).split("").reverse().join("")); };   // n digits from the first (n + 1)/2, h
      const lo = n => d * 10n ** BigInt((n - 1) >> 1), hi = n => lo(n) + 10n ** BigInt((n - 1) >> 1) - 1n, h0 = BigInt(w.slice(0, (L + 1) >> 1));
      const out = [pal(lo(L + 1), L + 1), ...[h0 - 1n, h0, h0 + 1n].map(h => pal(h < lo(L) ? lo(L) : h > hi(L) ? hi(L) : h, L))];
      if (L > 1) out.push(pal(hi(L - 1), L - 1));
      return out;
    };
    const rungOf = y => {   // the nearest (the smaller on a tie): the nearest at or below y, or the nearest above
      const w = Q.cmp(y, 0) <= 0 ? -1n : BigInt(whole(Q.sub(y, Q.div(1, 2)))), ps = pals(y);   // whole numbers at or below y are those at or below w
      let a = null, b = null; for (const t of ps) { if (t <= w) { if (a === null || t > a) a = t; } else if (b === null || t < b) b = t; }
      return a === null || Q.cmp(Q.sub(Q.of(b), y), Q.sub(y, Q.of(a))) < 0 ? b : a;
    };
    const onRung = (y, r) => (BigInt(whole(y)) === r ? level(r) : Q.neg(Q.sub(Q.abs(Q.sub(y, Q.of(r))), Q.div(1, 2))));   // on the rung when y rounds to it, else how far from rounding to it
    const y = Q.mul(p.side ?? 1, c), main = onRung(y, rungOf(y));   // x = c meets y = x at c
    return [main, null];
  }
  if (Q.eq(m, 1)) return null;                    // parallel to y = x: no number stays unchanged
  const level = r => { const D = r.toString().length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(Q.of(r), Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const pals = y => {   // the palindromes starting and ending in p.d nearest y: below and above it at its length, and one digit either side
    const d = BigInt(p.d), w = Q.cmp(y, 0) <= 0 ? "0" : String(whole(Q.sub(y, Q.div(1, 2)))), L = w.length;   // w: y rounded down
    const pal = (h, n) => { const t = String(h); return BigInt(t + t.slice(0, n >> 1).split("").reverse().join("")); };   // n digits from the first (n + 1)/2, h
    const lo = n => d * 10n ** BigInt((n - 1) >> 1), hi = n => lo(n) + 10n ** BigInt((n - 1) >> 1) - 1n, h0 = BigInt(w.slice(0, (L + 1) >> 1));
    const out = [pal(lo(L + 1), L + 1), ...[h0 - 1n, h0, h0 + 1n].map(h => pal(h < lo(L) ? lo(L) : h > hi(L) ? hi(L) : h, L))];
    if (L > 1) out.push(pal(hi(L - 1), L - 1));
    return out;
  };
  const rungOf = y => {   // the nearest (the smaller on a tie): the nearest at or below y, or the nearest above
    const w = Q.cmp(y, 0) <= 0 ? -1n : BigInt(whole(Q.sub(y, Q.div(1, 2)))), ps = pals(y);   // whole numbers at or below y are those at or below w
    let a = null, b = null; for (const t of ps) { if (t <= w) { if (a === null || t > a) a = t; } else if (b === null || t < b) b = t; }
    return a === null || Q.cmp(Q.sub(Q.of(b), y), Q.sub(y, Q.of(a))) < 0 ? b : a;
  };
  const onRung = (y, r) => (BigInt(whole(y)) === r ? level(r) : Q.neg(Q.sub(Q.abs(Q.sub(y, Q.of(r))), Q.div(1, 2))));   // on the rung when y rounds to it, else how far from rounding to it
  const s = p.side ?? 1, y = Q.mul(s, Q.div(c, Q.sub(1, m)));   // the unchanged number c/(1 - m), where the line meets y = x (minus it on the mirror)
  const rung = rungOf(y), main = onRung(y, rung);
  // main: the palindrome starting and ending in d (d, dd, d0d, ...) that the number the machine leaves unchanged rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
  if (tie === "shared-factor") {   // a bigger number dividing both the palindrome's digit sum and the y-intercept's whole part is better
    const sum = [...rung.toString()].reduce((a, ch) => a + Number(ch), 0), wc = whole(Q.sub(Q.abs(c), Q.div(1, 2)));   // the palindrome's digits added up; the whole part of |c|
    return [main, common(sum, wc)];
  }
  return [main];
}

const FAR = 3;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  if (!Q.isQ(m)) return null;       // a vertical line has no y = mx + c: skip
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);   // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);   // make it steeper or flatter
    const den = Q.sub(1, Q.mul(m, k));
    if (!Q.isZero(den)) tries.push([move("rot.turn", { centre: 0, turn: k }), Q.div(Q.add(m, k), den), c]);   // turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
