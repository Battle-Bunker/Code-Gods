// Spread of Three · Naive (for learning)
// Main part: every 2×2 square spreads by 3. Tie-breaker: squares with their biggest and smallest on a diagonal.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  let main = 0;
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {    // each 2×2 square, by its top-left cell (they overlap)
    const v = [b[i], b[i + 1], b[i + 4], b[i + 5]];
    main -= Math.abs(Math.max(...v) - Math.min(...v) - 3);   // its spread: biggest minus smallest
  }
  let diag = 0;
  for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {   // each 2×2 square: its biggest and smallest, each alone, on a diagonal
    const v = [b[i], b[i + 1], b[i + 4], b[i + 5]], hi = Math.max(...v), lo = Math.min(...v);
    if (v.filter(x => x === hi).length === 1 && v.filter(x => x === lo).length === 1 && v.indexOf(hi) + v.indexOf(lo) === 3) diag++;
  }
  return [main, diag];   // main: how far each 2×2 square's spread is from 3, added up (closer is better); tie-breaker: more squares with their biggest and smallest on a diagonal is better
}

const FAR = 1;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

// The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
// (such a move is not allowed, and an unchanged board is never better).
function edit(b, cells, f) {
  const out = b.slice();
  for (let j = 0; j < cells.length; j++) out[cells[j]] += f(j);
  return out.every(x => x >= 0 && x <= 9) ? out : b;
}

function agent(offer) {
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
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
