# Example 3 (spec §6.6): Triangle Area, search across lenses. One read, then a local search in the agent's own
# time; quotes break ties between equally good candidates.
def agent(offer):
    v = offer.view("si"); m, c = v.m, v.c
    A = offer.my_rule().params["A"]
    def area(m, c): return None if m == 0 or c == 0 else c * c / (2 * abs(m))
    def gap(m, c): a = area(m, c); return float("inf") if a is None else abs(a - A)
    here = gap(m, c)
    cands = [("si.shift", {"k": k}, m, c + k) for k in range(-6, 7) if k] \
          + [("si.tilt", {"k": k}, m + k, c) for k in range(-4, 5) if k] \
          + [("seq.step", {"k": k}, m + k, c - k) for k in range(-4, 5) if k] \
          + [("cart.slide", {"u": u, "v": 0}, m, c - m * u) for u in range(-3, 4) if u]
    better = [(gap(m2, c2), name, a) for name, a, m2, c2 in cands if gap(m2, c2) < here]
    if not better: return None
    best = min(better, key=lambda b: (b[0], offer.quote([call(b[1], **b[2])]).total))
    return [call(best[1], **best[2])]
