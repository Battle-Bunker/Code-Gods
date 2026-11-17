// Ring · Naive (for learning)
// Main part: the line just touching the dealt circle. Secondary preference: whichever you were dealt ().
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
  const ab = x => (x < 0n ? -x : x), L = m.d * c.d / gcdB(m.d, c.d);   // a, b, c in lowest whole numbers
  let a = -m.n * (L / m.d), b = L, cc = -c.n * (L / c.d);
  const g = gcdB(gcdB(ab(a), b), ab(cc));
  a /= g; b /= g; cc /= g;
  // distance N/√M from the centre against √ρ, exactly: |N/√M − √ρ| = |N² − ρM| / ((N + √(ρM))·√M)
  const N = ab(a * BigInt(p.u) + b * BigInt(p.v) + cc), M = a * a + b * b, R = BigInt(p.rho), gap = ab(N * N - R * M);
  const lg = n => { const L = Math.max(0, n.toString(2).length - 53); return Math.log2(Number(n >> BigInt(L))) + L; };
  const main = 0.5 * lg(M) + lg(N + BigInt(root(R * M)) + 1n) - lg(gap || 1n);
  // main: one point per binary digit to which the line's distance from the centre matches the radius
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
  // [plan, m after, c after]: whole-number steps on one lens, tried in the agent's own head
  const tries = lensSteps(m, c, FAR);
  let options = tries.map(([plan, m2, c2]) => [plan, score(m2, c2, p, tie)]);   // each step and the score it reaches
  // The step that raises your points most for its price, weighing the QUOTES best; or null.
  return climb(offer, options, score(m, c, p, tie), QUOTES);
}
