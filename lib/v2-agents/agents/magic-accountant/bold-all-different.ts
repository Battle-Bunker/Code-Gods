// Magic Accountant · Bold
// Main part: every row (or column) adds up to the magic number. Secondary preference: rows (or columns) of four different numbers.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change FAR = 2 to 1: single steps, the same price per step, but more turns to get there.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  let main = 0;
  for (let k = 0; k < 4; k++) { let t = 0; for (let j = 0; j < 4; j++) t += p.axis === "rows" ? b[4 * k + j] : b[4 * j + k]; main -= Math.abs(t - p.T); }   // each line: how far its total is from T
  return [main, [0, 1, 2, 3].filter(k => new Set([0, 1, 2, 3].map(j => (p.axis === "rows" ? b[4 * k + j] : b[4 * j + k]))).size === 4).length];   // main: how far each row's (or column's) total is from T, added up (closer is better); secondary: more rows (or columns, the dealt way) of four different numbers is better
}

const FAR = 2;      // how far one change may go
const QUOTES = 6;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards your agent skips, e.g. [19] or [4, 9]: it does not act on them (others still may)
const PROTECT = [];    // boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
const LINE = [], LINES = [];   // the rows and columns: their names, and their cells
for (let i = 0; i < 4; i++) { LINE.push("row" + i, "col" + i); LINES.push([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3], [i, i + 4, i + 8, i + 12]); }

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
    if (k * k < 4) continue;   // only steps of 2 (each costs two single steps)
    for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[move("cells.add", { cell: NAME[i], k }), move("cells.add", { cell: NAME[i2], k: -k })], edit(b, [i, i2], j => (j ? -k : k))]);   // move k from one cell to another (their total is kept)
    for (let i = 0; i < 8; i++) tries.push([move("tally.add", { line: LINE[i], k }), edit(b, LINES[i], j => k)]);   // add k to every cell of a row or column
  }
  let options = scoreEach(tries, ([plan, b2]) => [plan, score(b2, p)]);   // each step and the score it reaches (fewer on a big board)
  // A promise: on these boards, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(b, p), QUOTES);
}
