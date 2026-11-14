// Leapfrog · Example: the first column's total
// Main part: each number one apart from the number two cells along. Tie-breaker: the first column's total.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
// (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
// a note, so you can make a deal with that player. It never spends more than a quarter of its energy on one move.
// Try this: remove the "line" line: adding to a whole row keeps its leaps, can single cells do as well?

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  let main = 0;
  for (const i of [0, 1, 4, 5, 8, 9, 12, 13]) main -= Math.abs(Math.abs(b[i] - b[i + 2]) - 1);   // cell i and the cell two along
  return [main, b[0] + b[4] + b[8] + b[12]];   // main: how far each number and the number two cells along its row are from one apart, added up (closer is better); tie-breaker: a bigger first column is better
}

const FAR = 3;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LINE = [], LINES = [];   // rows then columns: their names, and their cells
for (let i = 0; i < 4; i++) { LINE.push("row" + i); LINES.push([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3]); }
for (let i = 0; i < 4; i++) { LINE.push("col" + i); LINES.push([i, i + 4, i + 8, i + 12]); }

// The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
// (such a move is not allowed, and an unchanged board is never better).
function edit(b, cells, f) {
  const out = b.slice();
  for (let j = 0; j < cells.length; j++) out[cells[j]] += f(j);
  return out.every(x => x >= 0 && x <= 9) ? out : b;
}

function agent(offer) {
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
    for (let i = 0; i < 8; i++) tries.push([move("tally.add", { line: LINE[i], k }), edit(b, LINES[i], j => k)]);   // add k to every cell of a row or column
  }
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
  if (!plan) return null;           // nothing better (or nothing allowed): skip
  const cost = price(offer, plan), e = energy(offer);
  if (cost > e / 4) return null;   // too dear (more than a quarter of its energy on one move): keep the energy for more turns
  return plan;
}
