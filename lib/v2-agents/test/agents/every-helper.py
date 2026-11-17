# Uses every helper once, so the two languages can be compared call by call. Reports what it saw as the
# argument of a last, made-up move "probe", which the test reads from the returned calls.
def agent(offer):
    g = goal(offer)
    before = progress(offer)
    t3 = peek(offer, "seq", "term", {"n": 3})
    area = peek(offer, "tri", "area")
    def w(x):
        return str(x.numerator) if x.denominator == 1 else f"{x.numerator}/{x.denominator}"
    seen = [
        g.family, "card" if len(g.card) > 0 else "", "no bits" if before.bits is None else "bits", str(len(before.layers)), w(before.main), "none" if before.tiebreak is None else "some",
        w(t3), "no triangle" if isinstance(area, Undefined) else w(area),
        str(energy(offer)), str(price(offer, move("add", lens="mc", at=3, k=0)) is None).lower(),
        str(prime(7)).lower(), str(prime(Fraction(9, 1))).lower(), str(prime(Fraction(1, 2))).lower(),
        str(square(49)).lower(), str(square(50)).lower(),
        str(near(Fraction(-7, 2), prime)), str(near(Fraction(10), square)),
        str(prime(2 ** 61 - 1)).lower(), str(prime(2 ** 61 + 1)).lower(), str(prime("7")).lower(), str(prime(True)).lower(),
        str(near(3.5, prime)), str(near(10, lambda n: n % 2 == 1)),
        str(near(-20000, prime)), str(near(200000000, square)), str(near(Fraction(-3, 2), square)),
        str(near(25, prime, 3)), str(near(8, prime, 3)), str(near(Fraction(-40), prime, 1)), str(near(Fraction(39, 2), prime, 9)), str(near(10, lambda n: n % 2 == 1, 7)),
    ]
    plan = cheapest(offer, [[move("add", lens="mc", at=3, k=2), move("add", lens="mc", at=3, k=-1)], move("add", lens="mc", at=3, k=1), move("nope")])
    return (plan or []) + [move("probe", r="|".join(str(s) for s in seen))]
