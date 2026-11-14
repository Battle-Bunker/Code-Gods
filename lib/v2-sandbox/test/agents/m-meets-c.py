# Example 2 (spec §6.6): m Meets c, ported from m-meets-c.ts call for call.
def agent(offer):
    v = offer.view("si")
    g = v.c - v.m                                   # c - m
    if g == 0:
        return None
    plans = [[call("si.shift", k=-g)], [call("si.tilt", k=g)]]
    half = g / 2
    if half.denominator == 1:
        plans.append([call("seq.step", k=half)])
    best, best_bits = None, float("inf")
    for p in plans:
        q = offer.quote(p)
        if q.valid and q.total < best_bits:
            best, best_bits = p, q.total
    return best
