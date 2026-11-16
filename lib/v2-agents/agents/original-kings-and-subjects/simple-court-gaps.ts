// Kings and Subjects · Simple
// Main part: boxes whose king equals his subjects added up. Secondary preference: how far the kings are from their subjects added up.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change QUOTES = 4 to 8: more prices compared before it pays.

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
const QUOTES = 4;  // at most this many plans are priced (each price is a host call)
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
