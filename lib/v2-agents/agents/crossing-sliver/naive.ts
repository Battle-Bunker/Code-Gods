// Crossing Sliver · Naive (for learning)
// Main part: the line crossing the x-axis at one over a big whole number. Secondary preference: whichever you were dealt ().
// What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
// rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
// fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
// It is here to learn from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.

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
  if (m.n === 0n) return null;                      // a flat line never crosses the x-axis
  const x = Math.abs(num(c) / num(m));               // where it crosses, ignoring the sign
  if (x === 0 || x < 1 / LIMIT) return null;
  const step = 10 ** p.suffix.length, n = nearestN(1 / x, t => t % step === Number(p.suffix) % step, suffixFloor(p.suffix, 1 / x), step, 4);
  if (n === null) return null;
  const main = Math.log2(n) - 4 * Math.abs(n * x - 1);
  // main: binary digits of the whole number n with 1/n nearest the x-crossing, less four times how far n × crossing is from 1
  return [main, ...(tie ? tie.split(">") : []).map(t => {   // each secondary, in order
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
  }
  let top = score(m, c, p, tie), plans = [];
  for (const [plan, m2, c2] of tries) {
    const s = score(m2, c2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
