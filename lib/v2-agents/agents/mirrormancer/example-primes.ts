// Mirrormancer · Example: prime numbers on the board
// Main part: every row reads the same backwards. Tie-breaker: prime numbers on the board.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time), keeps the ones that make the board best for your rule, and pays for the cheapest of them. A tug-of-war
// (another player pulling the board back again and again) burns energy on both sides: when it finds one it leaves you
// a note, so you can make a deal with that player. It never spends more than a quarter of its energy on one move.
// Try this: change FAR = 2 to 3 so two cells can jump to a prime together (it thinks longer: mind the step limit).

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  let main = 0;
  for (let r = 0; r < 16; r += 4) main -= Math.abs(b[r] - b[r + 3]) + Math.abs(b[r + 1] - b[r + 2]);   // each row: its ends' gap and its middle's gap
  return [main, b.filter(x => [2, 3, 5, 7].includes(x)).length];   // main: how far each row is from reading the same backwards, added up (closer is better); tie-breaker: more cells holding 2, 3, 5 or 7 is better
}

const FAR = 2;      // how far one change may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them

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
  const add = (i, k) => move("cells.add", { cell: NAME[i], k });   // the move that adds k to cell i
  const tries = [];                 // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k === 0) continue;
    for (let i = 0; i < 16; i++) tries.push([add(i, k), edit(b, [i], j => k)]);   // add k to one cell
    for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[add(i, k), add(i2, k)], edit(b, [i, i2], j => k)]);   // add k to two cells at once
  }
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
  if (!plan) return null;           // nothing better (or nothing allowed): skip
  const cost = price(offer, plan), e = energy(offer);
  if (cost > e / 4) return null;   // too dear (more than a quarter of its energy on one move): keep the energy for more turns
  return plan;
}
