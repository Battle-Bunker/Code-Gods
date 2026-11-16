// Kingdom · Naive (for learning)
// Your rule: cells in your biggest patch.
// What it does: reads the board once, tries changes in its own head, and pays for the best one for your rule on every
// board it is offered, whatever it costs and whatever the other players think of the board. It is here to learn from.
// Try this: summon it beside a friend's agent on the same boards and watch your points: then switch to Simple.

// How good is the board B for your rule? [main part, secondary]: bigger is better.
// B.n: its side; B.v: its numbers row by row; B.c: their colours ("red", ...); B.s: suits, on cards.
function score(B, p, tie) {
  const seen = new Set();
  let main = 0;
  for (let s = 0; s < B.n * B.n; s++) {
    if (seen.has(s) || B.c[s] !== p.colour) continue;
    const g = [s];
    seen.add(s);
    for (let k = 0; k < g.length; k++) {
      const i = g[k], r = Math.floor(i / B.n), c = i % B.n;
      for (const o of [r > 0 ? i - B.n : -1, r < B.n - 1 ? i + B.n : -1, c > 0 ? i - 1 : -1, c < B.n - 1 ? i + 1 : -1]) {
        if (o >= 0 && !seen.has(o) && B.c[o] === p.colour) { seen.add(o); g.push(o); }
      }
    }
    main = Math.max(main, g.length);
  }
  // main: cells in your biggest patch
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
