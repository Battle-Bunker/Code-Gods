// Forty-Five · Bold
// Main part: the lines cross at 45°. Tie-breaker: the number you divide by shares a factor with the y-intercepts' gap.
// What it does: reads the pair once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a pair are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the pair for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change FAR = 2 to 1: single steps, the same price per step, but more turns to get there.

// Exact helpers. A line is [a, b, c] (whole numbers) for a·x + b·y + c = 0; a pair is two lines, sorted.
const ab = x => (x < 0n ? -x : x);
function gcd(x, y) { x = ab(x); y = ab(y); while (y) [x, y] = [y, x % y]; return x; }
function line(a, b, c) {   // the line in its standard form, or null for no line
  if (a === 0n && b === 0n) return null;
  const g = gcd(gcd(a, b), c);
  [a, b, c] = [a / g, b / g, c / g];
  return b < 0n || (b === 0n && a < 0n) ? [-a, -b, -c] : [a, b, c];
}
function pair(L, M) {      // the pair sorted, or null when a line is missing or the two are the same
  if (!L || !M) return null;
  for (const i of [0, 1, 2]) if (L[i] !== M[i]) return L[i] < M[i] ? [L, M] : [M, L];
  return null;
}
const q = (n, d) => Q.of(n, d);
const floor = x => (x.n - ((x.n % x.d) + x.d) % x.d) / x.d;
const nearest = x => floor(Q.add(x, q(1, 2)));   // the whole number nearest x (a half rounds up)
const off = x => Q.abs(Q.sub(x, q(nearest(x))));   // how far x is from a whole number
function spf(n) {          // the smallest prime factor (1 for 0 and ±1)
  n = ab(n); if (n < 2n) return 1n; if (n % 2n === 0n) return 2n;
  for (let d = 3n; d * d <= n && d <= 100000n; d += 2n) if (n % d === 0n) return d;
  return n;
}
function omega(n) {        // how many prime factors, counting repeats
  n = ab(n); if (n < 2n) return 0n; let k = 0n;
  for (let d = 2n; d * d <= n && d <= 100000n; d += d === 2n ? 1n : 2n) while (n % d === 0n) { n /= d; k++; }
  return n > 1n ? k + 1n : k;
}
const common = (x, y) => (x === 0n || y === 0n ? 0n : gcd(x, y));   // their greatest common factor (0 if either is 0)
function facts(S) {        // what the two equations give together
  const [[a1, b1, c1], [a2, b2, c2]] = S;
  const D = a1 * b2 - a2 * b1, dot = a1 * a2 + b1 * b2, nx = b1 * c2 - b2 * c1, ny = c1 * a2 - c2 * a1;
  const s = (b2 === 0n ? b1 !== 0n : b1 !== 0n && ab(a2) * b1 > ab(a1) * b2) ? 1 : 0;   // the steeper line
  return { D, dot, nx, ny, s, o: 1 - s, x: D ? q(nx, D) : null, y: D ? q(ny, D) : null };
}
const yint = L => (L[1] === 0n ? null : q(-L[2], L[1]));
const xint = L => (L[0] === 0n ? null : q(-L[2], L[0]));
const ygap = S => (S[0][1] && S[1][1] ? Q.abs(Q.sub(yint(S[0]), yint(S[1]))) : null);

// How good is the pair S for your rule? [main part, tie-breaker]: bigger is better, null is no score.
function score(S, tie) {
  const f = facts(S);
  if (!f.D) return null;
  const d = ab(f.D), t = ab(f.dot), main = Q.neg(q(ab(d - t), d + t)), g = ygap(S);
  if (tie === "smooth-divisor") return [main, q(omega(f.D))];
  return [main, g === null ? null : q(common(f.D, nearest(g)))];
}   // main: how far from 45 degrees (closer is better); tie-breaker: the number you divide by shares a factor with the y-intercepts' gap

const FAR = 2;      // how far one change may go
const QUOTES = 6;  // at most this many plans are priced (each price is a host call)
const TIE = "divisor-gap";   // your rule's tie-breaker
const LEAVE = [];      // pairs you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // pairs where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
const line_ = line;    // (the moves below build lines with it)

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this pair alone
  // A tug-of-war (another player taking back your gains on this pair, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the pair instead gives it away: try it and compare.)
  contested(offer, 3);
  const v = look(offer, "eqs");   // the two equations: a1·x + b1·y = e1 and a2·x + b2·y = e2
  const S = [[v.a1.n, v.b1.n, -v.e1.n], [v.a2.n, v.b2.n, -v.e2.n]];   // as lines a·x + b·y + c = 0
  const f = facts(S), tries = [];   // [plan, pair after]: changes tried in the agent's own head
  for (const i of [0, 1]) {
    const L = S[i], M = S[1 - i], line = String(i + 1);
    for (let k = -FAR; k <= FAR; k++) {
      if (k * k < 4) continue;   // only steps of 2 (each costs two single steps)
      const K = BigInt(k);
      if (L[1]) tries.push([move("si.shift", { line, k }), pair(line_(L[0], L[1], L[2] - K * L[1]), M)]);   // move a line up or down
      if (L[1]) tries.push([move("si.tilt", { line, k }), pair(line_(L[0] - K * L[1], L[1], L[2]), M)]);   // make a line steeper or flatter
    }
    { const n2 = M[0] * M[0] + M[1] * M[1], d = L[0] * M[0] + L[1] * M[1]; tries.push([move("pair.reflect", { line }), pair(line_(n2 * L[0] - 2n * d * M[0], n2 * L[1] - 2n * d * M[1], n2 * L[2] - 2n * d * M[2]), M)]); }   // reflect a line in the other line (the answer stays)
    if (f.D) tries.push([move("pair.quarter", { line }), pair(line_(-L[1] * f.D, L[0] * f.D, L[1] * f.nx - L[0] * f.ny), M)]);   // turn a line a quarter turn about the crossing
  }
  let options = tries.filter(([, S2]) => S2).map(([plan, S2]) => [plan, score(S2, TIE)]);   // each step and the score it reaches
  // A promise: on these pairs, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(S, TIE), QUOTES);
}
