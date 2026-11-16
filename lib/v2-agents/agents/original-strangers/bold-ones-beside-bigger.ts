// Strangers · Bold
// Main part: touching strangers in a box, both bigger than 1. Secondary preference: 1s touching a bigger number in their box.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change FAR = 3 to 1: single steps, the same price per step, but more turns to get there.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));   // the biggest number that divides both
  let main = 0, ones = 0;
  for (let k = 0; k < B.n; k++) for (let j = 0; j + 1 < B.n; j += 2) {   // the touching pairs inside the boxes
    for (const [i, o] of [[k * B.n + j, k * B.n + j + 1], [j * B.n + k, (j + 1) * B.n + k]]) {
      const a = B.v[i], b = B.v[o];
      if (a * b < 2 || gcd(a, b) > 1) continue;   // a 0, two 1s, or a shared divisor
      if (a === 1 || b === 1) ones++;
      else if (Math.abs(a - b) > 1) main++;
    }
  }
  return [main, ones];   // main: touching strangers in a 2×2 box, both bigger than 1; secondary: 1s touching a bigger number in their box
}

const FAR = 3;      // how far one change of a number may go
const QUOTES = 6;  // at most this many plans are priced (each price is a host call)
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
  let options = tries.map(([plan, B2]) => [plan, score(B2, p)]);   // each change and the score it reaches
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));   // a promise kept
  // The change that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(B, p), QUOTES);
}
