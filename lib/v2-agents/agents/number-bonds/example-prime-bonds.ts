// Number Bonds · Example: bonds made of two prime numbers (3 and 7, or 5 and 5)
// Main part: bonds: touching cells adding up to 10. Secondary preference: bonds made of two prime numbers (3 and 7, or 5 and 5).
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
// (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
// a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that
// raises your points most (your rarity times the other players').
// Try this: remove the "trade" line: can single steps turn a 1 and 9 bond into a 3 and 7?

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const pairs = [];   // every touching pair: each cell with the cell to its right and the cell below it
  for (let i = 0; i < 16; i++) { if (i % 4 < 3) pairs.push([i, i + 1]); if (i < 12) pairs.push([i, i + 4]); }
  const bonds = pairs.filter(([x, y]) => b[x] + b[y] === 10);   // a bond: two touching numbers adding up to 10
  let main = bonds.length;
  return [main, bonds.filter(([x, y]) => [2, 3, 5, 7].includes(b[x]) && [2, 3, 5, 7].includes(b[y])).length];   // main: the bonds: touching cells whose numbers add up to 10 (more is better); secondary: more bonds made of two primes (3 and 7, or 5 and 5) is better
}

const FAR = 2;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
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
  const add = (i, k) => move("cells.add", { cell: NAME[i], k });   // the move that adds k to cell i
  const tries = [];                 // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    for (let i = 0; i < 16; i++) tries.push([add(i, k), edit(b, [i], j => k)]);   // add k to one cell
    for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[add(i, k), add(i2, -k)], edit(b, [i, i2], j => (j ? -k : k))]);   // move k from one cell to another (their total is kept)
  }
  let options = tries.map(([plan, b2]) => [plan, score(b2, p)]);   // each step and the score it reaches
  // A promise: on these boards, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(b, p), QUOTES);
}
