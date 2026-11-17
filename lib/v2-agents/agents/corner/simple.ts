// Corner · Simple
// Main part: 2n × top × bottom of the gradient a square. Secondary preference: whichever you were dealt ().
// What it does: reads the line once as y = mx + c (a small read), tries small steps in its own head (thinking costs
// no energy, only time) and takes the one that raises your points most. Your points on a line are your rarity times
// the others' rarity, so a step good for several rules beats one good only for yours, and a tug-of-war (another player pulling the line
// back again and again) burns energy on both sides: when it finds one it leaves you a note, so you can make a deal
// with that player and put the line in LEAVE to keep it.
// Changing it later costs only what you change. To summon another agent, first move power from your agents to your
// own store (energy moves with it), pay, then share the power out again.
// Try this: add the seq.step line from the Thorough starter: a third way to change the line.

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
  const lg = n => { const L = n.toString(2).length; return L <= 52 ? Math.log2(Number(n)) : Math.log2(Number(n >> BigInt(L - 52))) + (L - 52); };   // log2 of a whole number, any size
  const isq = n => { if (n < 2n) return n; let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2)); for (;;) { const y = (x + n / x) >> 1n; if (y >= x) break; x = y; } while (x * x > n) x--; return x; };   // the whole square root
  const A = 2n * BigInt(p.k) * (m.n < 0n ? -m.n : m.n) * m.d;   // 2n × top × bottom
  if (A === 0n) return null;
  const s = isq(A), d0 = A - s * s, d1 = (s + 1n) * (s + 1n) - A;   // the squares either side
  const main = 0.5 * lg(A) - lg(1n + (d0 < d1 ? d0 : d1));
  // main: half the binary digits of 2n × top × bottom, less those of its distance from a square
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
    return null;
  })];
}

const FAR = 2;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // lines your agent skips, e.g. [19] or [4, 9]: others may still move them
const PROTECT = [];    // lines where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this line alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move
  // A tug-of-war (another player taking back your gains on this line, 3 times lately): tell your owner.
  contested(offer, 3);
  const v = look(offer, "si");      // the line as y = mx + c
  const rule = goal(offer);         // your rule (free)
  const m = v.m, c = v.c, p = rule.params, tie = rule.tieBreaker;
  // [plan, m after, c after]: whole-number steps on one lens, tried in the agent's own head
  const tries = lensSteps(m, c, FAR);
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // A promise: on these lines, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most for its price, weighing the QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
