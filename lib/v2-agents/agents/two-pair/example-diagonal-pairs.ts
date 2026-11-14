// Two Pair · Example: boxes with each pair on a diagonal
// Main part: every corner box holds two different pairs. Tie-breaker: boxes with each pair on a diagonal.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
// (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
// a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that
// raises your points most (your rarity times the other players').
// Try this: remove the "swap" line: can single steps move a pair onto a diagonal?

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  let main = 0;
  for (const x of BOXES) {
    const [w, y, z, u] = x.map(i => b[i]).sort((s, t) => s - t);   // the box's four numbers, smallest first
    main -= y - w + u - z + (w === u ? 2 : 0);   // pair the two smallest and the two biggest; four of a kind: two cells must move by 1
  }
  return [main, BOXES.filter(([s, t, u, w]) => b[s] === b[w] && b[t] === b[u] && b[s] !== b[t]).length];   // main: how far each corner box is from holding two different pairs, added up (closer is better); tie-breaker: more boxes with each pair on a diagonal of the box is better
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
  let options = tries.map(([plan, b2]) => [plan, score(b2, p)]);   // each step and the score it reaches
  // A promise: on these boards, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(b, p), QUOTES);
}
