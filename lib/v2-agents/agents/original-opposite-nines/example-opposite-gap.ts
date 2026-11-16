// Opposite Nines · Example: how far the opposite pairs are from the biggest digit
// Main part: opposite pairs that make the biggest digit. Secondary preference: how far the opposite pairs are from the biggest digit.
// What it does: reads the board once (a small read), tries changes in its own head, and takes the one that raises your
// points most (your rarity times the other players'), working on your secondary preference once the main part is set.
// Try this: change QUOTES = 8 to 3: fewer prices asked, but it may miss a cheaper plan.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p) {
  let main = 0, gap = 0;
  for (let i = 0; i < (B.n * B.n) >> 1; i++) {
    const total = B.v[i] + B.v[B.n * B.n - 1 - i];   // a cell and where a half turn takes it
    if (total === p.target) main++;
    gap += Math.abs(total - p.target);
  }
  return [main, -gap];   // main: opposite pairs that make the biggest digit; secondary: how far the opposite pairs are from the biggest digit (less is better)
}

const FAR = 1;      // how far one change of a number may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)
const LEAVE = [];      // boards you agreed to leave alone, e.g. [19] or [4, 9]: your agent will not touch them
const PROTECT = [];    // boards where you promised not to lower the others, e.g. [7]: only moves that keep them as well off

function agent(offer) {
  if (LEAVE.includes(offer.object)) return null;   // a deal: leave this board alone
  if (saving(offer)) return null;   // under 10 s of your income in hand: save up for a move
  contested(offer, 3);   // a tug-of-war burns energy on both sides: tell your owner, who can make a deal
  const v = look(offer, "cells");   // the board
  const { params: p } = goal(offer);   // your rule (free)
  const NAME = Object.keys(v).filter(k => /^r\d+c\d+$/.test(k));   // the cells' names, r0c0 ..., row by row
  const B = { n: Math.round(Math.sqrt(NAME.length)), v: NAME.map(k => Q.toNumber(v[k])), c: NAME.map(k => v[k + ".colour"]),
    s: (NAME[0] + ".suit") in v ? NAME.map(k => v[k + ".suit"]) : null };
  const tries = [];   // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) for (let i = 0; k && i < NAME.length; i++) {   // add k to one cell
    tries.push([move("cells.add", { cell: NAME[i], k }), { ...B, v: B.v.map((x, j) => (j === i ? x + k : x)) }]);
  }
  const ON = [...new Set(B.c)];   // the colours on the board: trade two of them everywhere
  for (const x of ON) for (const y of ON) if (x < y) tries.push([move("colours.trade", { a: x, b: y }), { ...B, c: B.c.map(z => (z === x ? y : z === y ? x : z)) }]);
  let options = tries.map(([plan, B2]) => [plan, score(B2, p)]);   // each change and the score it reaches
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));   // a promise kept
  // The change that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(B, p), QUOTES);
}
