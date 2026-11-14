// Uses every helper once, so the two languages can be compared call by call. Reports what it saw as the
// argument of a last, made-up move "probe", which the test reads from the returned calls.
function agent(offer: Offer) {
  const g = goal(offer);
  const before = progress(offer);
  const t3 = peek(offer, "seq", "term", { n: 3 });
  const area = peek(offer, "tri", "area");
  const seen = [
    g.family, g.card, before.level, before.top, Q.toString(before.main), before.tiebreak === null ? "none" : "some",
    Q.toString(t3), area.undefined ? "no triangle" : Q.toString(area),
    String(energy(offer)), String(price(offer, move("si.shift", { k: 0 })) === null),
    String(prime(7)), String(prime(Q.of(9, 1))), String(prime(Q.of(1, 2))), String(square(49)), String(square(50)),
    String(near(Q.of(-7, 2), prime)), String(near(Q.of(10), square)),
    String(prime(2n ** 61n - 1n)), String(prime(2n ** 61n + 1n)), String(prime("7")), String(prime(true)),
    String(near(3.5, prime)), String(near(10, n => n % 2 === 1)),
    String(near(-20000, prime)), String(near(200000000, square)), String(near(Q.of(-3, 2), square)),
  ];
  const plan = cheapest(offer, [[move("si.shift", { k: 2 }), move("si.shift", { k: -1 })], move("si.shift", { k: 1 }), move("nope", {})]);
  return [...(plan ?? []), move("probe", { r: seen.join("|") })];
}
