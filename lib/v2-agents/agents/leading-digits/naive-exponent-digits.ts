// Leading Digits · Naive (for learning)
// Main part: the leading digits matched. Tie-breaker: the digits of the powers' exponents, added up.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  const R = p.layout === "halves" ? [0, 1, 2, 3] : [0, 2, 1, 3];   // the rows (and columns) in reading order: the first two, then the other two
  const read = (k, byRow) => [R[2 * k], R[2 * k + 1]].flatMap(r => [0, 1, 2, 3].map(j => (byRow ? b[4 * r + j] : b[4 * j + r]))).reduce((t, x) => t * 10 + x, 0);   // two rows (or two columns) as one number
  const x = [read(0, true), read(1, true), read(0, false), read(1, false)];   // the four readings
  const t = lead(p.b);   // the starts of b's powers, each to its smallest exponent
  let main = 0, exponents = 0;
  for (const y of x) { const s = String(y); let n = 0; while (n < s.length && t.has(s.slice(0, n + 1))) n++; main += n; if (n) for (const d of String(t.get(s.slice(0, n)))) exponents += +d; }   // its digits matched, and that power's exponent's digits
  const seen = new Set();
  for (let i = 0; i < 8; i++) { const k = (i < 4 ? "r" : "c") + [0, 1, 2, 3].map(j => (i < 4 ? b[4 * i + j] : b[4 * j + i - 4])).sort(); if (seen.has(k)) main--; else seen.add(k); }   // a row (or column) holding the same numbers as an earlier one: one off
  return [main, exponents];   // main: the leading digits each reading shares with a power of b, added up, less the repeated rows and columns (more is better); tie-breaker: the matched powers' exponents, their digits added up, bigger is better
}

const FAR = 1;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

// For each base: every start (its first 1 to 8 digits) of its powers up to the 1000th, to the smallest exponent with it.
const LEAD = {};
function lead(base) {
  if (!LEAD[base]) {
    const t = LEAD[base] = new Map();
    let x = 1n;   // base to the k: exact while short, then its first 40 digits (the first 8 stay exact)
    for (let k = 0; k <= 1000; k++) {
      const s = String(x).slice(0, 8);
      for (let n = 1; n <= s.length; n++) if (!t.has(s.slice(0, n))) t.set(s.slice(0, n), k);
      x *= BigInt(base);
      if (x >= 10n ** 40n) x /= 10n;
    }
  }
  return LEAD[base];
}

// The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
// (such a move is not allowed, and an unchanged board is never better).
function edit(b, cells, f) {
  const out = b.slice();
  for (let j = 0; j < cells.length; j++) out[cells[j]] += f(j);
  return out.every(x => x >= 0 && x <= 9) ? out : b;
}

function agent(offer) {
  const v = look(offer, "cells");   // the board
  const { params: p } = goal(offer);   // your rule's numbers (free)
  const NAME = Object.keys(v).slice(0, 16);   // the cells' names, r0c0 ... r3c3, row by row
  const b = NAME.map(n => Q.toNumber(v[n]));   // their 16 numbers
  const tries = [];                 // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    for (let i = 0; i < 16; i++) tries.push([move("cells.add", { cell: NAME[i], k }), edit(b, [i], j => k)]);   // add k to one cell
  }
  for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) { const d = b[i2] - b[i]; tries.push([move("cells.swap", { a: NAME[i], b: NAME[i2] }), edit(b, [i, i2], j => (j ? -d : d))]); }   // swap two cells (the same as moving their difference from one to the other)
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
