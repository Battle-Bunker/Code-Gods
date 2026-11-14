// Two Pair · Simple
// Main part: every corner box holds two different pairs. Tie-breaker: how far apart each box's pairs are.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and pays for the cheapest change to the best board for your rule. Your points on a board are your rarity
// there times the other players' rarity there added up, so where another player's move lowered your points it only
// makes changes that keep them (a tug-of-war burns energy on both sides). It notes a tug-of-war for you, so you can
// make a deal: LEAVE, PROTECT and TARGET below are how you keep one.
// Try this: add the "trade" line from the Thorough starter: moving an amount from one cell to another keeps their total.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p) {
  let main = 0;
  for (const x of BOXES) {
    const [w, y, z, u] = x.map(i => b[i]).sort((s, t) => s - t);   // the box's four numbers, smallest first
    main -= y - w + u - z + (w === u ? 2 : 0);   // pair the two smallest and the two biggest; four of a kind: two cells must move by 1
  }
  let apart = 0;
  for (const x of BOXES) { const v = x.map(i => b[i]); apart += Math.max(...v) - Math.min(...v); }   // each box: biggest minus smallest
  return [main, apart];   // main: how far each corner box is from holding two different pairs, added up (closer is better); tie-breaker: pairs further apart in each box are better
}

const FAR = 2;      // how far one change may go
const QUOTES = 4;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off
const TARGET = null;   // a board every player agreed on, its 16 digits row by row, e.g. "9779855879979779": boards go there and stay
const SETTLE = [];     // the boards to settle at TARGET, e.g. [2, 5]; [] means every board
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
  if (TARGET && (!SETTLE.length || SETTLE.includes(offer.object))) return settle(offer, TARGET);   // a deal: bring the board to TARGET, then hold it
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
  let top = score(b, p), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  // A promise: on these boards, only moves that leave the other players at least as well off.
  if (PROTECT.includes(offer.object)) plans = plans.slice(0, QUOTES).filter(plan => fair(offer, plan));
  // Contested (another player's move lowered your points here): only moves that keep your own points.
  if (hurt(offer)) plans = plans.slice(0, QUOTES).filter(plan => pays(offer, plan, top));
  if (!plans.length) return null;   // nothing better (or nothing that keeps your points): skip
  return cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
}
