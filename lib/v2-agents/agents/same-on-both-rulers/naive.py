# Same on Both Rulers · Naive (for learning)
# Main part: the unchanged number on as big a palindrome as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both the palindrome's digit sum and the gradient's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


# Palindromes (1, 2 ... 9, 11, 22 ... 99, 101, 111 ...) with an odd, or an even, number of digits: those nearest y, the nearest, and its level.
def pals(y, odd):
    w = str(0 if y <= 0 else whole(y - Fraction(1, 2)))   # y rounded down
    L, h0, out = len(w), int(w[:(len(w) + 1) // 2]), []
    pal = lambda h, n: int(str(h) + str(h)[:n // 2][::-1])   # n digits from the first (n + 1) // 2, h
    lo = lambda n: 10 ** ((n + 1) // 2 - 1)
    hi = lambda n: 10 ** ((n + 1) // 2) - 1
    for n in range(max(1, L - 2), L + 3):   # the longest shorter one, the shortest longer one, and those around y
        if n % 2 == (1 if odd else 0):
            out += [pal(hi(n), n)] if n < L else [pal(lo(n), n)] if n > L else [pal(min(max(h, lo(n)), hi(n)), n) for h in (h0 - 1, h0, h0 + 1)]
    return out

def rung_of(y, odd):   # the nearest (the bigger on a tie, as y rounds)
    w = -1 if y <= 0 else whole(y - Fraction(1, 2))   # whole numbers at or below y are those at or below w
    a = max((t for t in pals(y, odd) if t <= w), default=None)
    b = min((t for t in pals(y, odd) if t > w), default=None)
    return b if a is None or b - y <= y - a else a

def on_rung(y, r):   # on the rung when y rounds to it: its levels of digits (level L needs L(L + 1)/2); else how far from rounding to it
    if whole(y) != r:
        return -(abs(y - r) - Fraction(1, 2))
    D = len(str(r))
    L = next(L for L in range(99) if (L + 1) * (L + 2) // 2 > D)
    return L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1)

def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        y = p.get("side", 1) * c                        # x = c meets y = x at c
        main = on_rung(y, rung_of(y, p["digits"] == "odd"))
        return [main, None]
    if m == 1:                                      # parallel to y = x: no number stays unchanged
        return None
    y = p.get("side", 1) * c / (1 - m)              # the unchanged number c/(1 - m), where the line meets y = x (minus it on the mirror)
    rung = rung_of(y, p["digits"] == "odd")
    main = on_rung(y, rung)
    # main: the palindrome with an odd (or even) number of digits that the number the machine leaves unchanged rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    if tie == "shared-factor":   # a bigger number dividing both the palindrome's digit sum and the gradient's whole part is better
        total, wm = sum(int(ch) for ch in str(rung)), whole(abs(m) - Fraction(1, 2))   # the palindrome's digits added up; the whole part of |m|
        return [main, common(total, wm)]
    return [main]


FAR = 3      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)


def agent(offer):
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p, tie = v.m, v.c, rule.params, rule.tie_breaker
    if m == None:              # a vertical line has no y = mx + c: skip
        return None
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
        den = 1 - m * k
        if den != 0: tries.append((move("rot.turn", centre=0, turn=k), (m + k) / den, c))   # turn the line about its y-intercept by the angle of a gradient k (the y-intercept stays put)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
