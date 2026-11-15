// Ruler · Naive (for learning)
// Main part: distance² from (0, 0) on as big a product of two same-length primes as possible. Tie-breaker: whichever you were dealt (the smaller prime times the gradient squared close to the bigger prime).
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

// Two different primes with the same number of digits whose product is n (143 = 11 × 13): [p, q], else null. Exact up
// to 20 digits (Pollard's rho finds a factor); past that rho gives up after 16384 steps, as the game's does.
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
function pq(n) {
  n = BigInt(n);
  if (n < 6n) return null;
  const len = v => String(v).length, x = Number(n), small = n <= 9007199254740991n;
  const pair = a => { const b = n / a, [s, t] = a < b ? [a, b] : [b, a]; return s !== t && len(s) === len(t) && prime(s) && prime(t) ? [s, t] : null; };
  for (let d = 2; d < 2000; d++) if (small ? x % d === 0 : n % BigInt(d) === 0n) return pair(BigInt(d));   // its smallest prime factor
  if (n < 4000000n || prime(n)) return null;
  if (n < 10000000000n) { for (let d = 2001; d * d <= x; d += 2) if (x % d === 0) return pair(BigInt(d)); return null; }
  for (let c = 1n, exact = len(n) <= 20; c <= (exact ? 64n : 1n); c++) { const g = rho(n, c, exact ? Infinity : 16384); if (g !== null) return pair(g); }
  return null;
}
// The rung: the product ending in `ends` that d2 rounds down to, else the nearest one's window (the lower on a tie; past
// 14 digits the nearest other number ending in `ends`, as the game grades it). [that number, its primes or null, main]
function rungOf(d2, ends) {
  const x = Q.sub(d2, Q.div(1, 2)), n0 = BigInt(whole(x)), k = BigInt(ends);   // n0: d2 rounded down
  const level = n => { const D = String(n).length; let L = 0; while (((L + 1) * (L + 2)) / 2 <= D) L++; return Q.add(L, Q.div(Q.add(D - (L * (L + 1)) / 2, Q.div(Q.of(n), Q.of(10n ** BigInt(D)))), L + 1)); };   // levels of digits: level L needs L(L + 1)/2
  if (n0 > 0n && n0 % 10n === k) { const two = pq(n0); if (two) return [n0, two, level(n0)]; }
  const f = BigInt(whole(Q.sub(x, Q.div(1, 2))));   // x rounded down
  const nearer = (a, b) => Q.cmp(Q.sub(x, Q.of(a)), Q.sub(Q.of(b), x)) <= 0;   // a (below x) at least as near as b (above)
  let lo = f - (((f - k) % 10n) + 10n) % 10n, hi = lo + 10n, n;
  if (String(n0).length > 14) { if (lo === n0) lo -= 10n; if (hi === n0) hi += 10n; n = nearer(lo, hi) ? lo : hi; }
  else for (;;) { const below = lo >= 6n && nearer(lo, hi); n = below ? lo : hi; if (pq(n)) break; if (below) lo -= 10n; else hi += 10n; }
  return [n, pq(n), Q.neg(Q.sub(Q.abs(Q.sub(x, Q.of(n))), Q.div(1, 2)))];
}

// How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(m, c, p, tie) {
  if (m === null) {               // the vertical line x = c
    const [rung, two, main] = rungOf(Q.mul(c, c), p.ends);   // its distance from (0, 0) is |c|
    return [main, ...(tie ? tie.split(">") : []).map(t => null)];
  }
  const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared: c² / (m² + 1)
  const [rung, two, main] = rungOf(d2, p.ends);   // the product it rounds down to (or the nearest one's window), its two primes
  // main: the product of two different same-length primes ending in the rule's digit that the distance from (0, 0), squared, rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far it is from rounding down to one
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each tie-breaker, in order
    if (t === "closeness") return two === null ? null : Q.neg(Q.abs(Q.sub(Q.mul(Q.of(two[0]), Q.mul(m, m)), Q.of(two[1]))));   // the smaller prime times the gradient squared, as close as possible to the bigger prime (never equal: the closer the better, without end)
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
