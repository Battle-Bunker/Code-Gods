// Constellation · Naive (for learning)
// Main part: stars in the biggest cluster. Secondary preference: rows and columns the biggest cluster reaches.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, secondary]: bigger is better.
function score(b, p) {
  const near = i => [-5, -4, -3, -1, 1, 3, 4, 5].map(d => i + d).filter(j => j >= 0 && j < 16 && Math.abs((j % 4) - (i % 4)) <= 1);   // the cells touching cell i, at a side or a corner
  const reach = g => new Set(g.map(i => Math.floor(i / 4))).size + new Set(g.map(i => i % 4)).size;   // the rows and columns a cluster reaches
  let best = [];   // the biggest cluster (on a tie, the one reaching furthest)
  const seen = new Set();
  for (let s = 0; s < 16; s++) {
    if (b[s] !== p.star || seen.has(s)) continue;
    const g = [s];
    seen.add(s);
    for (const i of g) for (const j of near(i)) if (!seen.has(j) && b[j] === p.star) { seen.add(j); g.push(j); }   // stars touching the cluster join it
    if (g.length > best.length || (g.length === best.length && reach(g) > reach(best))) best = g;
  }
  const main = best.length;
  return [main, reach(best)];   // main: the stars (cells holding your number) in the biggest cluster, touching even at a corner (more is better); secondary: a biggest cluster reaching into more rows and columns is better
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
