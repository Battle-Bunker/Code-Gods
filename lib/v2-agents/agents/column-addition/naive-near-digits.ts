// Column Addition · Naive (for learning)
// Main part: right columns in the run from the right-hand end. Secondary preference: how far each answer digit is from the right digit, added up.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const A = 4 * p.top, B = A + 4, S = A + 8;   // the first cells of the two rows added, and of the answer row
  const right = [0, 0, 0, 0], ok = [false, false, false, false];   // each column's right digit, and whether the answer shows it
  for (let j = 3, carry = 0; j >= 0; j--) { const t = b[A + j] + b[B + j] + carry; right[j] = t % 10; ok[j] = right[j] === b[S + j]; carry = Math.floor(t / 10); }   // the written sum, from the right-hand end
  const blank = [0, 1, 2, 3].every(j => b[A + j] === 0);   // a top row of 0s: nothing counts
  let main = 0;
  if (!blank) for (let j = 3; j >= 0 && ok[j]; j--) main++;   // right columns in a run from the right-hand end
  return [main, blank ? -36 : -[0, 1, 2, 3].reduce((t, j) => t + Math.abs(b[S + j] - right[j]), 0)];   // main: the right columns of the written sum in a run from the right-hand end (more is better); secondary: answer digits closer to the right digits is better
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
