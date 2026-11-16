// Prime Columns · Naive (for learning)
// Your rule: every column plus t a big prime.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It keeps fighting over a
// board another player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn
// from; the other starters fix this.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board b (its 16 numbers, row by row) for your rule? [its score]: bigger is better.
function score(b, p) {
  const isPrime = n => { if (n < 2) return false; for (let d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; };
  let main = 0;
  for (let c = 0; c < 4; c++) {
    const x = b[c] * 1000 + b[c + 4] * 100 + b[c + 8] * 10 + b[c + 12] + p.t;   // the column as one number, plus t
    let P = x <= 2 ? 2 : null;   // the prime nearest it (the lower one on a tie)
    for (let d = 0; P === null; d++) P = isPrime(x - d) ? x - d : isPrime(x + d) ? x + d : null;
    main += Math.log2(P) - 4 * Math.log2(1 + Math.abs(x - P));
  }
  return [main];   // each column plus t near a big prime (bigger is better)
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
    for (let i = 0; i < 8; i++) tries.push([move("tally.add", { line: LINE[i], k }), edit(b, LINES[i], j => k)]);   // add k to every cell of a row or column
  }
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
