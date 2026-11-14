// Triangle Area: one look, then try small changes in my own head, and price only the best ones.
function agent(offer: Offer) {
  const v = look(offer, "si");
  const A = Q.from(goal(offer).params.A);
  const gap = (m: Q, c: Q) => (Q.isZero(m) || Q.isZero(c) ? null : Q.abs(Q.sub(Q.div(Q.mul(c, c), Q.mul(2, Q.abs(m))), A)));
  const worse = (a: Q | null, b: Q | null) => a === null || (b !== null && Q.cmp(a, b) > 0);
  let best = gap(v.m, v.c), plans: Call[] = [];
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const tries: [Call, Q | null][] = [
      [move("si.shift", { k }), gap(v.m, Q.add(v.c, k))],
      [move("si.tilt", { k }), gap(Q.add(v.m, k), v.c)],
      [move("seq.step", { k }), gap(Q.add(v.m, k), Q.sub(v.c, k))],
    ];
    for (const [plan, g] of tries) {
      if (g === null || worse(g, best)) continue;
      if (best === null || Q.cmp(g, best) < 0) { best = g; plans = []; }
      plans.push(plan);
    }
  }
  return plans.length ? cheapest(offer, plans) : null;
}
