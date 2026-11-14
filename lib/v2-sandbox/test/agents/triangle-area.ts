// Example 3 (spec §6.6): Triangle Area, ported from triangle-area.py call for call (same candidate order, same
// quotes in the same order, exact gaps, the first best on a tie, as Python's min does). null is an infinite gap.
function agent(offer: Offer): Call[] | null {
  const v = offer.view("si"); const m = v.m as Q, c = v.c as Q;
  const A = Q.of(offer.myRule().params.A as number);
  const area = (m: Q, c: Q): Q | null => Q.isZero(m) || Q.isZero(c) ? null : Q.div(Q.mul(c, c), Q.mul(Q.of(2), Q.abs(m)));
  const gap = (m: Q, c: Q): Q | null => { const a = area(m, c); return a === null ? null : Q.abs(Q.sub(a, A)); };
  const less = (a: Q | null, b: Q | null) => a !== null && (b === null || Q.cmp(a, b) < 0);
  const here = gap(m, c);
  const cands: [string, Record<string, number>, Q, Q][] = [];
  for (let k = -6; k <= 6; k++) if (k) cands.push(["si.shift", { k }, m, Q.add(c, Q.of(k))]);
  for (let k = -4; k <= 4; k++) if (k) cands.push(["si.tilt", { k }, Q.add(m, Q.of(k)), c]);
  for (let k = -4; k <= 4; k++) if (k) cands.push(["seq.step", { k }, Q.add(m, Q.of(k)), Q.sub(c, Q.of(k))]);
  for (let u = -3; u <= 3; u++) if (u) cands.push(["cart.slide", { u, v: 0 }, m, Q.sub(c, Q.mul(m, Q.of(u)))]);
  const better = cands.filter(([, , m2, c2]) => less(gap(m2, c2), here)).map(([name, a, m2, c2]) => [gap(m2, c2) as Q, name, a] as const);
  if (!better.length) return null;
  let best = better[0], bestTotal = Infinity, first = true;
  for (const b of better) {
    const total = offer.quote([call(b[1], b[2])]).total;
    const order = first ? -1 : Q.cmp(b[0], best[0]);
    if (order < 0 || (order === 0 && total < bestTotal)) { best = b; bestTotal = total; }
    first = false;
  }
  return [call(best[1], best[2])];
}
