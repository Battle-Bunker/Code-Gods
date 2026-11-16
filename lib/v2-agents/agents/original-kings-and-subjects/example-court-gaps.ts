// Kings and Subjects · Example: how far the kings are from their subjects added up
// Main part: boxes whose king equals his subjects added up. Secondary preference: how far the kings are from their subjects added up.
// What it does: reads the board once (a small read), tries changes in its own head, and takes the one that raises your
// points most (your rarity times the other players'), working on your secondary preference once the main part is set.
// Try this: change FAR = 1 to 3: one move can then close a bigger gap between a king and his subjects, at a higher price.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p) {
  const step = p.squares === "corners" ? 2 : 1;
  let main = 0, gap = 0;
  for (let r = 0; r + 1 < B.n; r += step) for (let c = 0; c + 1 < B.n; c += step) {
    const i = r * B.n + c, box = [B.v[i], B.v[i + 1], B.v[i + B.n], B.v[i + B.n + 1]];
    const king = Math.max(...box), total = box[0] + box[1] + box[2] + box[3];
    if (box.filter(x => x === king).length > 1) { gap += p.noKing; continue; }   // the biggest number twice: no king
    const away = Math.abs(2 * king - total);   // the king against his three subjects added up
    gap += away;
    if (away === 0) main++;
  }
  return [main, -gap];   // main: 2×2 boxes whose king equals his subjects added up; secondary: how far the kings are from their subjects added up (less is better)
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
