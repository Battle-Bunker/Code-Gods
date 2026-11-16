// Divisibility · Simple
// Main part: the powers counted. Secondary preference: the digits of what is left, added up.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: add the "trade" line from the Thorough starter: moving an amount from one cell to another keeps their total.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const R = p.layout === "halves" ? [0, 1, 2, 3] : [0, 2, 1, 3];   // the rows (and columns) in reading order: the first two, then the other two
  const read = (k, byRow) => [R[2 * k], R[2 * k + 1]].flatMap(r => [0, 1, 2, 3].map(j => (byRow ? b[4 * r + j] : b[4 * j + r]))).reduce((t, x) => t * 10 + x, 0);   // two rows (or two columns) as one number
  const x = [read(0, true), read(1, true), read(0, false), read(1, false)];   // the four readings
  const nums = p.lens === "powers" ? x : [x[0] - x[1], x[2] - x[3]];   // the numbers counted: the readings, or the rows' and the columns' differences
  let main = 0, leftover = 0;
  for (let y of nums) { if (!y) continue; let v = 0; while (y % p.q === 0) { y /= p.q; v++; } main += v; for (const d of String(Math.abs(y))) leftover += +d; }   // count the q's dividing it; what is left: its digits
  const seen = new Set();
  for (let i = 0; i < 8; i++) { const k = (i < 4 ? "r" : "c") + [0, 1, 2, 3].map(j => (i < 4 ? b[4 * i + j] : b[4 * j + i - 4])).sort(); if (seen.has(k)) main--; else seen.add(k); }   // a row (or column) holding the same numbers as an earlier one: one off
  return [main, leftover];   // main: the q's dividing the four readings (or the two differences), added up, less the repeated rows and columns (more is better); secondary: what is left after dividing out the q's, its digits added up, bigger is better
}

const FAR = 1;      // how far one change may go
const QUOTES = 4;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

// The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
// (such a move is not allowed, and an unchanged board is never better).
function edit(b, cells, f) {
  const out = b.slice();
  for (let j = 0; j < cells.length; j++) out[cells[j]] += f(j);
  return out.every(x => x >= 0 && x <= 9) ? out : b;
}

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this board alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the board)
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
  let options = tries.map(([plan, b2]) => [plan, score(b2, p)]);   // each step and the score it reaches
  // A promise: on these boards, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(b, p), QUOTES);
}
