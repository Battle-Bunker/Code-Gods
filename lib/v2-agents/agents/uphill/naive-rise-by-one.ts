// Uphill · Naive (for learning)
// Main part: rising steps toward the corner. Secondary preference: rising steps that rise by exactly 1.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const right = p.corner[1] === "R", down = p.corner[0] === "B";   // which way to walk
  const rises = [];   // each step toward the corner, along the rows and down the columns: how much it rises
  for (let i = 0; i < 16; i++) { if (i % 4 < 3) rises.push(right ? b[i + 1] - b[i] : b[i] - b[i + 1]); if (i < 12) rises.push(down ? b[i + 4] - b[i] : b[i] - b[i + 4]); }
  let main = rises.filter(d => d > 0).length;
  return [main, rises.filter(d => d === 1).length];   // main: the steps along every row and column toward the corner that reach a bigger number (more is better); secondary: more rising steps that rise by exactly 1 is better
}

const FAR = 1;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LINE = [], LINES = [];   // the rows and columns: their names, and their cells
for (let i = 0; i < 4; i++) { LINE.push("row" + i, "col" + i); LINES.push([4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3], [i, i + 4, i + 8, i + 12]); }

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
    for (let i = 0; i < 8; i++) tries.push([move("steps.tilt", { line: LINE[i], k }), edit(b, LINES[i], j => j * k)]);   // make every step along a row or column bigger by k
  }
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
