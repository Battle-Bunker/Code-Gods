// Opposite Nines · Example: different ways the pairs split the target
// Main part: every cell and its opposite add up to the target. Tie-breaker: different ways the pairs split the target.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
// (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
// a note, so you can make a deal with that player. Of the changes that are best for your rule, it takes the one that
// raises your points most (your rarity times the other players').
// Try this: change FAR = 2 to 1: does moving 1 across a pair still find new splits?

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  let main = 0;
  for (let i = 0; i < 8; i++) main -= Math.abs(b[i] + b[15 - i] - p.T);   // cell i and its opposite, 15 - i
  const splits = new Set();   // how each pair adding up to T splits it (its smaller number)
  for (let i = 0; i < 8; i++) if (b[i] + b[15 - i] === p.T) splits.add(Math.min(b[i], b[15 - i]));
  return [main, splits.size];   // main: how far each cell and its opposite are from adding up to T, added up (closer is better); tie-breaker: pairs splitting T in more different ways is better
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
    for (let i = 0; i < 8; i++) tries.push([move("turn.balance", { pair: "pair" + i, k }), edit(b, [i, 15 - i], j => (j ? -k : k))]);   // move k from a cell to its opposite, a half turn away (their total is kept)
  }
  let options = tries.map(([plan, b2]) => [plan, score(b2, p)]);   // each step and the score it reaches
  // A promise: on these boards, only steps that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));
  // The step that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(b, p), QUOTES);
}
