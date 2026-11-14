// Box Totals · Bold
// Main part: every corner box adds up to the target. Tie-breaker: whichever you were dealt (the board's four corners; prime numbers on the board; 0s on the board).
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and finds the cheapest change to the best board for your rule. Your points on a board are your rarity there
// times the other players' rarity there added up, so once its energy is below RESERVE it only pays for a change worth
// a point per ⚡ (the bits it gains you times the others' bits), keeping the rest for boards where points count. It
// walks away from a tug-of-war (leaving you a note) and never spends more than a quarter of its energy on one move.
// Try this: change FAR = 3 to 2: jumps of 2 only, cheaper moves.

// How good is the board b (its 16 numbers, row by row) for your rule? [main part, tie-breaker]: bigger is better.
function score(b, p, tie) {
  let main = 0;
  for (const x of BOXES) main -= Math.abs(x.reduce((t, i) => t + b[i], 0) - p.T);   // each box: how far its total is from T
  // main: how far the corner boxes' totals are from T, added up (closer is better)
  if (tie === "corners") return [main, b[0] + b[3] + b[12] + b[15]];   // bigger corners of the board are better
  if (tie === "primes") return [main, b.filter(x => [2, 3, 5, 7].includes(x)).length];   // more cells holding 2, 3, 5 or 7 is better
  if (tie === "zeros") return [main, b.filter(x => x === 0).length];   // more 0s is better
  return [main];
}

const FAR = 3;      // how far one change may go
const QUOTES = 6;  // at most this many plans are priced (each price is a host call)
const RESERVE = 300;  // below this much ⚡, only pay for changes that add points (see the end)
const SPEND = 0.25;    // never spend more than a quarter of your energy on one move
const BOXES = [0, 2, 8, 10].map(r => [r, r + 1, r + 4, r + 5]);   // the corner boxes' cells: top-left, top-right, bottom-left, bottom-right

// The board after adding f(0), f(1), ... to the cells listed; the board unchanged if a number would leave 0 ... 9
// (such a move is not allowed, and an unchanged board is never better).
function edit(b, cells, f) {
  const out = b.slice();
  for (let j = 0; j < cells.length; j++) out[cells[j]] += f(j);
  return out.every(x => x >= 0 && x <= 9) ? out : b;
}

function agent(offer) {
  // A tug-of-war (another player taking back your gains on this board, 3 times lately) only burns energy on
  // both sides: leave the board, with a note telling your owner to talk to that player.
  if (contested(offer, 3)) return null;
  const v = look(offer, "cells");   // the board
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule's numbers and tie-breaker (free)
  const NAME = Object.keys(v).slice(0, 16);   // the cells' names, r0c0 ... r3c3, row by row
  const b = NAME.map(n => Q.toNumber(v[n]));   // their 16 numbers
  const tries = [];                 // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) {
    if (k > -2 && k < 2) continue;   // only jumps of 2 or more
    for (let i = 0; i < 16; i++) for (let i2 = i + 1; i2 < 16; i2++) tries.push([[move("cells.add", { cell: NAME[i], k }), move("cells.add", { cell: NAME[i2], k: -k })], edit(b, [i, i2], j => (j ? -k : k))]);   // move k from one cell to another (their total is kept)
    for (let i = 0; i < 4; i++) tries.push([move("boxes.add", { box: "box" + i, k }), edit(b, BOXES[i], j => k)]);   // add k to every cell of a corner box
  }
  let top = score(b, p, tie), plans = [];
  for (const [plan, b2] of tries) {
    const s = score(b2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  const plan = cheapest(offer, plans.slice(0, QUOTES));   // the cheapest of the best
  if (!plan) return null;           // nothing better (or nothing allowed): skip
  const cost = price(offer, plan), e = energy(offer);
  if (cost > e * SPEND) return null;   // too dear: keep the energy for more turns
  // Your points on a board are your rarity there times the other players' rarity there, added up. So what this
  // change is worth is the bits it gains you (+1: a better board is a step towards the next rung) times the
  // others' bits (+1: a board nobody else wants yet is worth a little). Below RESERVE ⚡ it only pays for a change
  // worth at least 1 point per ⚡ (when the game does not say what boards are worth, worth is null: it pays).
  const w = worth(offer);
  if (w && e < RESERVE && (rarity(offer, top) - w.mine + 1) * (w.others + 1) < cost) return null;
  return plan;
}
