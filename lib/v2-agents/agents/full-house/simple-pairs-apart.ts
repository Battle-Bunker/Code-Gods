// Full House · Simple
// Main part: pairs of equal numbers in a row (or column). Secondary preference: how far apart the paired cells sit, added up.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: add the "trade" line from the Thorough starter: moving an amount from one cell to another keeps their total.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const hands = [0, 1, 2, 3].map(k => [0, 1, 2, 3].map(j => (p.axis === "rows" ? 4 * k + j : 4 * j + k)));   // each hand: a row (or column), its cells in order
  const found = [];   // every pair of equal numbers in a hand: [its number, the steps between its cells]
  for (const h of hands) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (b[h[i]] === b[h[j]]) found.push([b[h[i]], j - i]);
  let main = found.length;
  return [main, found.reduce((t, x) => t + x[1], 0)];   // main: the pairs of equal numbers in each row (or column): three of a kind makes 3, four of a kind 6 (more is better); secondary: pairs whose cells sit further apart are better (the steps between them, added up)
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
