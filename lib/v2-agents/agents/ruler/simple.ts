// Ruler · Simple
// Main part: distance² from (0, 0) on as big a product of two same-length primes as possible. Tie-breaker: whichever you were dealt (the smaller prime times the gradient squared close to the bigger prime).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

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
    return [main, null];
  }
  const d2 = Q.div(Q.mul(c, c), Q.add(Q.mul(m, m), 1));   // the distance from (0, 0), squared: c² / (m² + 1)
  const [rung, two, main] = rungOf(d2, p.ends);   // the product it rounds down to (or the nearest one's window), its two primes
  // main: the product of two different same-length primes ending in the rule's digit that the distance from (0, 0), squared, rounds down to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far it is from rounding down to one
  if (tie === "closeness") return [main, two === null ? null : Q.neg(Q.abs(Q.sub(Q.mul(Q.of(two[0]), Q.mul(m, m)), Q.of(two[1]))))];   // the smaller prime times the gradient squared, as close as possible to the bigger prime (never equal: the closer the better, without end)
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
      const [t0, u, r] = [[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13]][(Math.abs(k) - 1) % 4], t = k > 0 ? t0 : -t0, du = Q.sub(u, Q.mul(m, t));
      if (!Q.isZero(du)) tries.push([move("rot.turn", { centre: "origin", turn: Q.of(t, u) }), Q.div(Q.add(Q.mul(m, u), t), du), Q.div(Q.mul(c, r), du)]);   // turn the line about (0, 0) by the angle whose tangent is t/u (its distance from (0, 0) stays)
    }
    // The next rung up (the ladder has no top): the next product of two same-length primes ending in p.ends above the
    // distance², aiming at the middle of its window (t + 1/2), by a shift that keeps the gradient (c² = (m² + 1)·d², to the
    // nearest half) or a tilt that keeps the y-intercept (m² = c²/d² − 1, to the nearest half, third or quarter).
    {
      const m1 = Q.add(Q.mul(m, m), 1), f = BigInt(whole(Q.sub(Q.div(Q.mul(c, c), m1), Q.div(1, 2))));   // the distance², rounded down
      let t = f + 1n; while (t % 10n !== BigInt(p.ends)) t++;
      for (let i = 0; i < 300 && String(t).length <= 14; i++, t += 10n) if (pq(t)) {
        const mid = Q.add(Q.of(t), Q.div(1, 2));        // the middle of its window
        const h0 = root(whole(Q.mul(4, Q.mul(m1, mid))));   // 2·√((m² + 1)·mid), rounded down: c to the nearest half
        for (const h of [h0, Q.add(h0, 1)]) {
          const c2 = Q.mul(Q.cmp(c, 0) < 0 ? -1 : 1, Q.div(h, 2));
          tries.push([move("si.shift", { k: Q.sub(c2, c) }), m, c2]);
        }
        const s2 = Q.sub(Q.div(Q.mul(c, c), mid), 1);   // the gradient squared that puts the line there, keeping c
        if (Q.cmp(s2, 0) > 0) for (const d of [2, 3, 4]) {
          const m2 = Q.mul(Q.cmp(m, 0) < 0 ? -1 : 1, Q.div(root(whole(Q.mul(d * d, s2))), d));
          if (!Q.eq(m2, m)) tries.push([move("si.tilt", { k: Q.sub(m2, m) }), m2, c]);
        }
        break;
      }
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
