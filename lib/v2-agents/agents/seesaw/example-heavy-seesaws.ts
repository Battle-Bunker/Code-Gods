// Seesaw · Example: the balanced seesaws' numbers, added up
// Main part: how far each row (or column) is from balancing, added up. Secondary preference: the balanced seesaws' numbers, added up.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
// (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
// a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that
// raises your points most (your rarity times the other players').
// Try this: remove the "twin" line: can single steps make a seesaw heavier and keep it balanced?

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const L = [0, 1, 2, 3].map(k => [0, 1, 2, 3].map(j => (p.axis === "rows" ? 4 * k + j : 4 * j + k)));   // each seesaw: a row (or column), its cells in order
  const O = [0, 1, 2, 3].map(k => [0, 1, 2, 3].map(j => (p.axis === "rows" ? 4 * j + k : 4 * k + j)));   // the other way
  const lean = l => Math.abs(b[l[0]] + b[l[1]] - b[l[2]] - b[l[3]]);   // how far its two halves are from balancing
  let main = -L.reduce((t, l) => t + lean(l), 0);
  return [main, L.filter(l => lean(l) === 0).reduce((t, l) => t + b[l[0]] + b[l[1]] + b[l[2]] + b[l[3]], 0)];   // main: how far each row's (or column's) two halves are from balancing, added up (closer is better); secondary: balanced seesaws holding bigger numbers are better
}

const FAR = 2;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards your agent skips, e.g. [19] or [4, 9]: others may still move them
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
  const add = (i, k) => move("cells.add", { cell: NAME[i], k });   // the move that adds k to cell i
  const tries = [];                 // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    for (let i = 0; i < 16; i++) tries.push([add(i, k), edit(b, [i], j => k)]);   // add k to one cell
    for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[add(i, k), add(i2, k)], edit(b, [i, i2], j => k)]);   // add k to two cells at once
  }
  let options = scoreEach(tries, ([plan, b2]) => [plan, score(b2, p)]);   // each step and the score it reaches (fewer on a big board)
  // A promise: on these boards, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(b, p), QUOTES);
}
