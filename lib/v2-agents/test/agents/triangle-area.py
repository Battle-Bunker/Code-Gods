# Triangle Area: one look, then try small changes in my own head, and price only the best ones.
def agent(offer):
    v = look(offer, "si")
    A = Fraction(goal(offer).params["A"])
    def gap(m, c):
        return None if m == 0 or c == 0 else abs(c * c / (2 * abs(m)) - A)
    def worse(a, b):
        return a is None or (b is not None and a > b)
    best, plans = gap(v.m, v.c), []
    for k in range(-4, 5):
        if k == 0:
            continue
        tries = [
            (move("si.shift", k=k), gap(v.m, v.c + k)),
            (move("si.tilt", k=k), gap(v.m + k, v.c)),
            (move("seq.step", k=k), gap(v.m + k, v.c - k)),
        ]
        for plan, g in tries:
            if g is None or worse(g, best):
                continue
            if best is None or g < best:
                best, plans = g, []
            plans.append(plan)
    return cheapest(offer, plans) if plans else None
