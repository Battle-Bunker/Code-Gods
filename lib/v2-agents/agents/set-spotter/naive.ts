// Set Spotter · Naive (for learning)
// Your rule: SETs of three in a row.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p, tie) {
  let main = 0;
  for (let r = 0; r < B.n; r++) for (let c = 0; c < B.n; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const r2 = r + 2 * dr, c2 = c + 2 * dc;
    if (r2 < 0 || r2 >= B.n || c2 < 0 || c2 >= B.n) continue;
    const a = r * B.n + c, b = (r + dr) * B.n + c + dc, d = r2 * B.n + c2;
    if (new Set([B.c[a], B.c[b], B.c[d]]).size !== 2 && B.v[b] - B.v[a] === B.v[d] - B.v[b]) main++;
  }
  // main: SETs of three in a row
  return [main];
}

const FAR = 1;      // how far one change of a number may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "cells");   // the board
  const { params: p, tieBreaker: tie } = goal(offer);   // your rule (free)
  const NAME = Object.keys(v).filter(k => /^r\d+c\d+$/.test(k));   // the cells' names, r0c0 ..., row by row
  const B = { n: Math.round(Math.sqrt(NAME.length)), v: NAME.map(k => Q.toNumber(v[k])), c: NAME.map(k => v[k + ".colour"]),
    s: (NAME[0] + ".suit") in v ? NAME.map(k => v[k + ".suit"]) : null };
  const tries = [];   // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) for (let i = 0; k && i < NAME.length; i++) {   // add k to one cell
    tries.push([move("cells.add", { cell: NAME[i], k }), { ...B, v: B.v.map((x, j) => (j === i ? x + k : x)) }]);
  }
  for (let i = 0; i < NAME.length; i++) for (let j = i + 1; j < NAME.length; j++) {   // swap two cells' colours
    if (B.c[i] === B.c[j]) continue;
    const c = B.c.slice(); c[i] = B.c[j]; c[j] = B.c[i];
    tries.push([move("cells.swap", { a: NAME[i], b: NAME[j], what: "colours" }), { ...B, c }]);
  }
  let top = score(B, p, tie), plans = [];
  for (const [plan, B2] of tries) {
    const s = score(B2, p, tie);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
