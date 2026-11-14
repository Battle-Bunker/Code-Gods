// Example 2 (spec §6.6): m Meets c, switching lens. Quote the plans that close the gap c − m and make the cheapest.
function agent(offer: Offer): Call[] | null {
  const v = offer.view("si"); const g = Q.sub(v.c as Q, v.m as Q);        // c − m
  if (Q.isZero(g)) return null;
  const plans: Call[][] = [[call("si.shift", { k: Q.neg(g) })], [call("si.tilt", { k: g })]];
  const half = Q.div(g, Q.of(2));
  if (Q.isInteger(half)) plans.push([call("seq.step", { k: half })]);
  let best: Call[] | null = null, bestBits = Infinity;
  for (const p of plans) { const q = offer.quote(p); if (q.valid && q.total < bestBits) { best = p; bestBits = q.total; } }
  return best;
}
