// Strangers · Example: the board's four corners
// Main part: touching strangers in the corner boxes. Tie-breaker: the board's four corners.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
// (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
// a note, so you can make a deal with that player. Where another player keeps lowering your points, it only makes
// changes that keep them.
// Try this: remove the "swap" line: can single steps raise the corners?

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);   // the greatest common divisor
  let main = 0, ones = 0;
  for (const x of BOXES) for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {   // each box's four touching pairs
    const u = b[x[i]], w = b[x[j]];
    if (u > 1 && w > 1 && gcd(u, w) === 1 && Math.abs(u - w) >= 2) main++;   // strangers: like 2 and 5
    if ((u === 1 && w > 1) || (w === 1 && u > 1)) ones++;                    // a 1 touching a bigger number
  }
  return [main, b[0] + b[3] + b[12] + b[15]];   // main: how many touching pairs in the corner boxes are strangers (more is better); tie-breaker: bigger corners of the board are better
}

const FAR = 2;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
const BOXES = [0, 2, 8, 10].map(r => [r, r + 1, r + 4, r + 5]);   // the corner boxes' cells: top-left, top-right, bottom-left, bottom-right

// The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
// (such a move is not allowed, and an unchanged board is never better).
function edit(b, cells, f) {
  const out = b.slice();
  for (let j = 0; j < cells.length; j++) out[cells[j]] += f(j);
  return out.every(x => x >= 0 && x <= 9) ? out : b;
}

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this board alone
  // A tug-of-war (another player taking back your gains on this board, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the board instead gives it away: try it and compare.)
  contested(offer, 3);
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
  // A promise: on these boards, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) plans = plans.slice(0, QUOTES).filter(plan => fair(offer, plan));
  // Contested (another player's move lowered your points here): only moves that keep your own points.
  if (hurt(offer)) plans = plans.slice(0, QUOTES).filter(plan => pays(offer, plan, top));
  if (!plans.length) return null;   // nothing better (or nothing that keeps your points): skip
  return cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
}
