// Ruler · Simple
// Main part: distance² from (0, 0) on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the first non-prime stepping from that prime by the y-intercept's whole part, as nearly prime as possible; the gradient squared close to that prime; the height at x = that prime, rounded down, ending in that prime repeated; the factor that prime minus 1 shares with the y-intercept's whole part).
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

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
    // The next rung up (the ladder has no top): the next prime ending in p.ends above the distance², aiming at the middle
    // of its window (t + 1/2), by a shift that keeps the gradient (c² = (m² + 1)·d², to the nearest half) or a tilt that
    // keeps the y-intercept (m² = c²/d² − 1, to the nearest half, third or quarter): the climb keeps whichever lands.
    {
      const m1 = Q.add(Q.mul(m, m), 1), d2 = Q.div(Q.mul(c, c), m1);
      for (let t = Q.add(near(d2, prime, p.ends), 10), i = 0; i < 100; t = Q.add(t, 10), i++) if (prime(t)) {
        const mid = Q.add(t, Q.div(1, 2));             // the middle of its window
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
