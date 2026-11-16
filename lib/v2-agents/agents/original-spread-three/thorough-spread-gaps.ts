// Spread of Three · Thorough
// Main part: 2×2 squares that spread exactly 3. Secondary preference: steps the squares' spreads are away from 3.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change QUOTES = 8 to 3: fewer prices asked, but it may miss a cheaper plan.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p) {
  let main = 0, gaps = 0;
  for (let r = 0; r + 1 < B.n; r++) for (let c = 0; c + 1 < B.n; c++) {
    const sq = [B.v[r * B.n + c], B.v[r * B.n + c + 1], B.v[(r + 1) * B.n + c], B.v[(r + 1) * B.n + c + 1]];
    const spread = Math.max(...sq) - Math.min(...sq);   // biggest minus smallest
    if (spread === 3) main++;
    gaps += Math.abs(spread - 3);
  }
  return [main, -gaps];   // main: 2×2 squares that spread exactly 3; secondary: fewest steps between the squares' spreads and 3
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
