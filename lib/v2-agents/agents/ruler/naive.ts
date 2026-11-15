// Ruler · Naive (for learning)
// Main part: distance² from (0, 0) on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the first non-prime stepping from that prime by the y-intercept's whole part, as nearly prime as possible; the gradient squared close to that prime; the height at x = that prime, rounded down, ending in that prime repeated; the factor that prime minus 1 shares with the y-intercept's whole part).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// Pollard's rho (x -> x² + c mod n, from 2), batches of 32 steps between gcds: a proper factor of n, or null, as the game's.
function rho(n, c, budget) {
  const f = v => (v * v + c) % n, gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  let x = 2n, y = 2n;
  for (let done = 0; done < budget; done += 32) {
    const x0 = x, y0 = y; let prod = 1n;
    for (let i = 0; i < 32; i++) { x = f(x); y = f(f(y)); prod = prod * (x > y ? x - y : y - x) % n; }
    let g = gcd(prod, n);
    if (g === 1n) continue;
    if (g === n) { x = x0; y = y0; for (let i = 0; i < 32; i++) { x = f(x); y = f(f(y)); g = gcd(x > y ? x - y : y - x, n); if (g !== 1n) break; } }
    return g === n || g === 1n ? null : g;
  }
  return null;
}
// The smallest prime factor of n (n itself when prime), as the game finds it: rho splits n until every part is prime.
function smallest(n) {
  for (let d = 2n; d < 2000n; d++) if (n % d === 0n) return d;
  if (prime(n)) return n;
  for (let c = 1n, exact = String(n).length <= 20; c <= (exact ? 64n : 1n); c++) {
    const g = rho(n, c, exact ? Infinity : 16384);
    if (g !== null) { const a = smallest(g), b = smallest(n / g); return a < b ? a : b; }
  }
  return n;
}
// p, p + w, p + 2w, … (p the prime, w the y-intercept's whole part): the first that is not prime, its smallest prime
// factor (0 when w is 0 or 256 steps stay prime).
function nearMiss(p, c) {
  p = BigInt(p);
  const w = BigInt(whole(Q.sub(Q.abs(c), Q.div(1, 2))));   // |c| rounded down
  if (w > 0n) for (let j = 1n; j <= 256n; j++) if (!prime(p + j * w)) return Q.of(smallest(p + j * w));
  return 0;
}
// The height at x = p, rounded down (its size): how many of its last digits follow p written again and again.
function atIndex(p, m, c) {
  const h = String(whole(Q.sub(Q.abs(Q.add(Q.mul(m, p), c)), Q.div(1, 2)))), ps = String(p);
  let j = 0;
  if (h !== "0") while (j < h.length && h[h.length - 1 - j] === ps[ps.length - 1 - (j % ps.length)]) j++;
  return j;
}

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const d2 = Q.mul(c, c);                         // its distance from (0, 0), squared
    const x = Q.sub(d2, Q.div(1, 2));
    const rung = near(x, prime, p.ends);
    const gap = Q.abs(Q.sub(x, rung));
    const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
    const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, x), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));
    return [main, ...(tie ? tie.split(">") : []).map(t => null)];
  }
  const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared: c² / (m² + 1)
  const x = Q.sub(d2, Q.div(1, 2));               // d2 rounds down to n when x rounds to n (ties up)
  const rung = near(x, prime, p.ends);            // the prime ending in p.ends nearest there: the rung
  const gap = Q.abs(Q.sub(x, rung));              // on the rung when d2 rounds down to it
  const level = p => { const D = Q.toString(p).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(p, Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  const main = Q.cmp(Q.mul(2, gap), 1) < 0 || Q.eq(Q.sub(rung, x), Q.div(1, 2)) ? level(rung) : Q.neg(Q.sub(gap, Q.div(1, 2)));
  // main: the prime ending in the rule's digit that the distance from (0, 0), squared, rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far it is from rounding down to one
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each tie-breaker, in order
    if (t === "near-miss") return nearMiss(rung, c);   // from that prime, keep adding the y-intercept's whole part: the first number that is not prime should have as big a smallest prime factor as possible
    if (t === "closeness") return Q.neg(Q.abs(Q.sub(Q.mul(m, m), rung)));   // the gradient squared, as close as possible to that prime (never equal: the closer the better, without end)
    if (t === "reading-at-index") return atIndex(rung, m, c);   // the height at x = that prime, rounded down, should end in that prime written again and again, as many digits as possible
    if (t === "shared-factor") {   // that prime minus 1 and the y-intercept's whole part: a bigger factor shared is better
      const wc = whole(Q.div(Q.sub(Q.mul(2, Q.abs(c)), 1), 2));   // the y-intercept's whole part, ignoring its sign
      return common(Q.sub(rung, 1), wc);
    }
    return null;
  })];
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
    const [t0, u, r] = [[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13]][(Math.abs(k) - 1) % 4], t = k > 0 ? t0 : -t0, du = Q.sub(u, Q.mul(m, t));
    if (!Q.isZero(du)) tries.push([move("rot.turn", { centre: "origin", turn: Q.of(t, u) }), Q.div(Q.add(Q.mul(m, u), t), du), Q.div(Q.mul(c, r), du)]);   // turn the line about (0, 0) by the angle whose tangent is t/u (its distance from (0, 0) stays)
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
