// Two Pair · Naive (for learning)
// Main part: boxes with two different pairs. Secondary preference: boxes with one pair or three of a kind.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p) {
  let main = 0, onePair = 0;
  for (let r = 0; r + 1 < B.n; r += 2) for (let c = 0; c + 1 < B.n; c += 2) {
    const counts = new Map();
    for (const i of [r * B.n + c, r * B.n + c + 1, (r + 1) * B.n + c, (r + 1) * B.n + c + 1]) counts.set(B.v[i], (counts.get(B.v[i]) ?? 0) + 1);
    const sizes = [...counts.values()].sort().join(" ");
    if (sizes === "2 2") main++;
    else if (sizes === "1 1 2" || sizes === "1 3") onePair++;
  }
  return [main, onePair];   // main: 2×2 boxes with two different pairs; secondary: boxes with one pair or three of a kind
}

const FAR = 1;      // how far one change of a number may go
const QUOTES = 8;  // at most this many plans are priced (each price is a host call)

function agent(offer) {
  const v = look(offer, "cells");   // the board
  const { params: p } = goal(offer);   // your rule (free)
  const NAME = Object.keys(v).filter(k => /^r\d+c\d+$/.test(k));   // the cells' names, r0c0 ..., row by row
  const B = { n: Math.round(Math.sqrt(NAME.length)), v: NAME.map(k => Q.toNumber(v[k])), c: NAME.map(k => v[k + ".colour"]),
    s: (NAME[0] + ".suit") in v ? NAME.map(k => v[k + ".suit"]) : null };
  const tries = [];   // [plan, board after]: changes tried in the agent's own head
  for (let k = -FAR; k <= FAR; k++) for (let i = 0; k && i < NAME.length; i++) {   // add k to one cell
    tries.push([move("cells.add", { cell: NAME[i], k }), { ...B, v: B.v.map((x, j) => (j === i ? x + k : x)) }]);
  }
  let top = score(B, p), plans = [];
  for (const [plan, B2] of tries) {
    const s = score(B2, p);
    if (better(s, top)) { top = s; plans = [plan]; }               // a new best
    else if (plans.length && !better(top, s)) plans.push(plan);   // as good as the best: the price decides
  }
  return plans.length ? cheapest(offer, plans.slice(0, QUOTES)) : null;   // the cheapest of the best, or skip
}
