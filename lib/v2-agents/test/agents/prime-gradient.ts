// Prime Gradient: look at y = mx + c, find the nearest prime to the gradient, tilt to it.
function agent(offer: Offer) {
  const m = look(offer, "si").m;
  if (m.undefined) return null;                // a vertical line has no gradient
  const p = near(m, prime);
  if (Q.eq(p, m)) return null;                 // already prime: nothing to do
  return [move("si.tilt", { k: Q.sub(p, m) })];
}
