// Square Boxes · Naive (for learning)
// Your rule: every corner box a big square plus j.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [its score]: bigger is better.
function score(b, p) {
  let main = 0;
  for (const [w, x, y, z] of [[0, 1, 5, 4], [2, 3, 7, 6], [8, 9, 13, 12], [10, 11, 15, 14]]) {   // each corner box, clockwise from its top-left
    const B = b[w] * 1000 + b[x] * 100 + b[y] * 10 + b[z], n = Math.floor(Math.sqrt(Math.max(0, B - p.j)) + 0.5);   // n × n + j nearest it
    main += Math.log2(1 + n) - 4 * Math.log2(1 + Math.abs(B - p.j - n * n));
  }
  return [main];   // each corner box, read clockwise, near a big square plus j (bigger is better)
}

const FAR = 1;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const BOXES = [0, 2, 8, 10].map(r => [r, r + 1, r + 4, r + 5]);   // the corner boxes' cells: top-left, top-right, bottom-left, bottom-right

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
    for (let i = 0; i < 4; i++) tries.push([move("boxes.add", { box: "box" + i, k }), edit(b, BOXES[i], j => k)]);   // add k to every cell of a corner box
  }
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
