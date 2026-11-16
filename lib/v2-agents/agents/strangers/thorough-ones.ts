// Strangers · Thorough
// Main part: touching strangers in the corner boxes. Secondary preference: 1s beside a bigger number in their box.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change QUOTES = 6 to 2: fewer prices asked, but it may miss a cheaper plan.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);   // the greatest common divisor
  let main = 0, ones = 0;
  for (const x of BOXES) for (const [i, j] of [[0, 1], [2, 3], [0, 2], [1, 3]]) {   // each box's four touching pairs
    const u = b[x[i]], w = b[x[j]];
    if (u > 1 && w > 1 && gcd(u, w) === 1 && Math.abs(u - w) >= 2) main++;   // strangers: like 2 and 5
    if ((u === 1 && w > 1) || (w === 1 && u > 1)) ones++;                    // a 1 touching a bigger number
  }
  return [main, ones];   // main: how many touching pairs in the corner boxes are strangers (more is better); secondary: more 1s touching a bigger number in their box is better
}

const FAR = 1;      // how far one change may go
const QUOTES = 6;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards your agent skips, e.g. [19] or [4, 9]: others may still move them
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
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move (the game still tells you the board)
  // A tug-of-war (another player taking back your gains on this board, 3 times lately) burns energy on both
  // sides: tell your owner, who can make a deal. (Leaving the board instead gives it away: try it and compare.)
  contested(offer, 3);
  const v = look(offer, "cells");   // the board
  const { params: p } = goal(offer);   // your rule's numbers (free)
  const NAME = Object.keys(v).slice(0, 16);   // the cells' names, r0c0 ... r3c3, row by row
  const b = NAME.map(n => Q.toNumber(v[n]));   // their 16 numbers
  const add = (i, k) => move("cells.add", { cell: NAME[i], k });   // the move that adds k to cell i
  const tries = [];                 // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    for (let i = 0; i < 16; i++) tries.push([add(i, k), edit(b, [i], j => k)]);   // add k to one cell
    for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[add(i, k), add(i2, -k)], edit(b, [i, i2], j => (j ? -k : k))]);   // move k from one cell to another (their total is kept)
  }
  let options = scoreEach(tries, ([plan, b2]) => [plan, score(b2, p)]);   // each step and the score it reaches (fewer on a big board)
  // A promise: on these boards, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(b, p), QUOTES);
}
