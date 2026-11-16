// Stepping Stones · Bold
// Your rule: cells in your biggest group of stepping stones.
// What it does: reads the board once (a small read), tries changes in its own head (thinking costs no energy, only
// time) and takes the change that raises your points most. Your points on a board are your rarity there times the
// other players' rarity there added up, so a change that suits your rule but spoils the board for the others can
// lower them. It notes a tug-of-war for you, so you can make a deal: LEAVE and PROTECT below are how you keep one.
// Try this: change FAR = 3 to 1: single steps, the same price per step, but more turns to get there.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p, tie) {
  const seen = new Set();
  let main = 0;
  for (let s = 0; s < B.n * B.n; s++) {
    if (seen.has(s)) continue;
    const g = [s];
    seen.add(s);
    for (let k = 0; k < g.length; k++) {
      const i = g[k], r = Math.floor(i / B.n), c = i % B.n;
      for (const o of [r > 0 ? i - B.n : -1, r < B.n - 1 ? i + B.n : -1, c > 0 ? i - 1 : -1, c < B.n - 1 ? i + 1 : -1]) {
        if (o >= 0 && !seen.has(o) && Math.abs(B.v[i] - B.v[o]) === p.hop) { seen.add(o); g.push(o); }
      }
    }
    main = Math.max(main, g.length);
  }
  // main: cells in your biggest group of stepping stones
  return [main];
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
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule (free)
  const NAME = Object.keys(v).filter(k => /^r\d+c\d+$/.test(k));   // the cells' names, r0c0 ..., row by row
  const B = { n: Math.round(Math.sqrt(NAME.length)), v: NAME.map(k => Q.toNumber(v[k])), c: NAME.map(k => v[k + ".colour"]),
    s: (NAME[0] + ".suit") in v ? NAME.map(k => v[k + ".suit"]) : null };
  const tries = [];   // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) for (let i = 0; k && i < NAME.length; i++) {   // add k to one cell
    tries.push([move("cells.add", { cell: NAME[i], k }), { ...B, v: B.v.map((x, j) => (j === i ? x + k : x)) }]);
  }
  let options = tries.map(([plan, B2]) => [plan, score(B2, p, tie)]);   // each change and the score it reaches
  if (PROTECT.includes(offer.object)) options = options.filter(([plan]) => fair(offer, plan));   // a promise kept
  // The change that raises your points most (your rarity times the others'), weighing your rule's QUOTES best; or null.
  return climb(offer, options, score(B, p, tie), QUOTES);
}
