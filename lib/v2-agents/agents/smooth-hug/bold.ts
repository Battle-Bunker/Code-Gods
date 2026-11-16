// Smooth Hug · Bold
// Main part: the y-intercept right on a number made only of the dealt primes. Secondary preference: whichever you were dealt ().
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: change FAR = 4 to 2: shorter steps, cheaper moves.

// Number helpers for the rule's utility (decimal numbers; past 10^10 the rule gives no score).
const LIMIT = 1e10, num = v => Number(v.n) / Number(v.d), cube = d => Math.abs(d) * Math.abs(d) * Math.abs(d);
function isPrimeN(n) {
  if (n < 2 || !Number.isInteger(n)) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return false;
  return true;
}
// The nearest whole n >= 1 to x passing ok, stepping by `step` from f (ties: the lower).
function nearestN(x, ok, f, step, reach) {
  while (f < 1) f += step;
  let lo = null, hi = null;
  for (let n = f, i = 0; n >= 1 && i < reach; n -= step, i++) if (ok(n)) { lo = n; break; }
  for (let n = f + step, i = 0; i < reach; n += step, i++) if (ok(n)) { hi = n; break; }
  if (lo === null) return hi;
  if (hi === null) return lo;
  return x - lo <= hi - x ? lo : hi;
}
const suffixFloor = (s, x) => { const mod = 10 ** s.length, e = Number(s); return Math.floor((x - e) / mod) * mod + e; };
const primeWith = s => n => n < LIMIT && n % 10 ** s.length === Number(s) && isPrimeN(n);
function factorsN(n) { const out = []; let x = Math.abs(Math.round(n)); for (let p = 2; p * p <= x; p++) while (x % p === 0) { out.push(p); x /= p; } if (x > 1) out.push(x); return out; }
function gcdB(a, b) { while (b !== 0n) [a, b] = [b, a % b]; return a; }

// How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, null is no score.
function score(m, c, p, tie) {
  const x = Math.abs(num(c));                      // the y-intercept's size
  if (x >= LIMIT) return null;
  const list = [], top = 2 * x + 64;               // the numbers made only of the dealt primes, up to top
  const walk = (n, i) => { if (i === p.primes.length) { if (n > 1) list.push(n); return; } for (let t = n; t <= top; t *= p.primes[i]) walk(t, i + 1); };
  walk(1, 0);
  const s = list.reduce((b, t) => (Math.abs(t - x) < Math.abs(b - x) ? t : b));
  const main = Math.sqrt(factorsN(s).length) - cube(x - s);
  // main: the square root of the nearest smooth number's prime factors, less the distance to it cubed (bigger is better)
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    return null;
  })];
}

const FAR = 4;      // how far one change may go
const QUOTES = 20;  // at most this many plans are priced (each price is a host call)
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
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  // A vertical line (x = k) has no y = mx + c: the step that tips it into one, if that raises your points.
  if (!Q.isQ(m)) return climb(offer, tips(offer).filter(([plan]) => !PROTECT.includes(offer.object) || fair(offer, plan)).map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]), null, QUOTES);
  const tries = [];                 // [plan, m after, c after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    tries.push([move("si.shift", { k }), m, Q.add(c, k)]);     // move the line up or down
    tries.push([move("si.tilt", { k }), Q.add(m, k), c]);      // make it steeper or flatter
    for (let j = -FAR; j <= FAR; j++) {                          // both at once
      if (j !== 0) tries.push([[move("si.shift", { k }), move("si.tilt", { k: j })], Q.add(m, j), Q.add(c, k)]);
    }
  }
  tries.push(...rounding(m, c), ...fractions(m, c));   // fractions: to a whole number and back into halves and thirds
  let options = scoreEach(tries, ([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches (fewer on a big line)
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
