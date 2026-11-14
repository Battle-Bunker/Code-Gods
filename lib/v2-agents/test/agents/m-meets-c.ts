// m Meets c: the gap c − m closes three ways; price each route and make the cheapest.
function agent(offer: Offer) {
  const v = look(offer, "si");
  const gap = Q.sub(v.c, v.m);
  if (Q.isZero(gap)) return null;
  const routes = [
    move("si.shift", { k: Q.neg(gap) }),       // move c down to m
    move("si.tilt", { k: gap }),               // move m up to c
  ];
  const half = Q.div(gap, 2);
  if (Q.isInteger(half)) routes.push(move("seq.step", { k: half }));   // both meet half way
  return cheapest(offer, routes);
}
