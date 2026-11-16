// Seesaw · Naive (for learning)
// Main part: how far each row (or column) is from balancing, added up. Secondary preference: how far each seesaw's two ends are from its middle two, added up.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const L = [0, 1, 2, 3].map(k => [0, 1, 2, 3].map(j => (p.axis === "rows" ? 4 * k + j : 4 * j + k)));   // each seesaw: a row (or column), its cells in order
  const O = [0, 1, 2, 3].map(k => [0, 1, 2, 3].map(j => (p.axis === "rows" ? 4 * j + k : 4 * k + j)));   // the other way
  const lean = l => Math.abs(b[l[0]] + b[l[1]] - b[l[2]] - b[l[3]]);   // how far its two halves are from balancing
  let main = -L.reduce((t, l) => t + lean(l), 0);
  return [main, -L.reduce((t, l) => t + Math.abs(b[l[0]] + b[l[3]] - b[l[1]] - b[l[2]]), 0)];   // main: how far each row's (or column's) two halves are from balancing, added up (closer is better); secondary: each seesaw's two ends closer to its middle two (added up) is better
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
  const add = (i, k) => move("cells.add", { cell: NAME[i], k });   // the move that adds k to cell i
  const tries = [];                 // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    for (let i = 0; i < 16; i++) tries.push([add(i, k), edit(b, [i], j => k)]);   // add k to one cell
    for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[add(i, k), add(i2, -k)], edit(b, [i, i2], j => (j ? -k : k))]);   // move k from one cell to another (their total is kept)
  }
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
