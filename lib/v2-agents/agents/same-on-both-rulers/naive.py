# Same on Both Rulers · Naive (for learning)
# Main part: the unchanged number on as big a palindrome as possible. Tie-breaker: whichever you were dealt (the biggest number dividing both the palindrome's digit sum and the y-intercept's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        level = lambda r: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1))(len(str(r)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(r))))   # levels of digits: level L needs L(L + 1)/2
        def pals(y):   # the palindromes starting and ending in p["d"] nearest y: below and above it at its length, and one digit either side
            w = str(0 if y <= 0 else whole(y - Fraction(1, 2)))   # y rounded down
            L, d = len(w), p["d"]
            pal = lambda h, n: int(str(h) + str(h)[:n // 2][::-1])   # n digits from the first (n + 1) // 2, h
            lo = lambda n: d * 10 ** ((n - 1) // 2)
            hi = lambda n: lo(n) + 10 ** ((n - 1) // 2) - 1
            h0 = int(w[:(L + 1) // 2])
            out = [pal(lo(L + 1), L + 1)] + [pal(min(max(h, lo(L)), hi(L)), L) for h in (h0 - 1, h0, h0 + 1)]
            return out + ([pal(hi(L - 1), L - 1)] if L > 1 else [])
        rung_of = lambda y: min(pals(y), key=lambda t: (abs(y - t), t))   # the nearest (the smaller on a tie)
        on_rung = lambda y, r: level(r) if whole(y) == r else -(abs(y - r) - Fraction(1, 2))   # on the rung when y rounds to it
        y = p.get("side", 1) * c                        # x = c meets y = x at c
        main = on_rung(y, rung_of(y))
        return [main, None]
    if m == 1:                                      # parallel to y = x: no number stays unchanged
        return None
    level = lambda r: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(r, 10 ** D)) / (L + 1))(len(str(r)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(r))))   # levels of digits: level L needs L(L + 1)/2
    def pals(y):   # the palindromes starting and ending in p["d"] nearest y: below and above it at its length, and one digit either side
        w = str(0 if y <= 0 else whole(y - Fraction(1, 2)))   # y rounded down
        L, d = len(w), p["d"]
        pal = lambda h, n: int(str(h) + str(h)[:n // 2][::-1])   # n digits from the first (n + 1) // 2, h
        lo = lambda n: d * 10 ** ((n - 1) // 2)
        hi = lambda n: lo(n) + 10 ** ((n - 1) // 2) - 1
        h0 = int(w[:(L + 1) // 2])
        out = [pal(lo(L + 1), L + 1)] + [pal(min(max(h, lo(L)), hi(L)), L) for h in (h0 - 1, h0, h0 + 1)]
        return out + ([pal(hi(L - 1), L - 1)] if L > 1 else [])
    rung_of = lambda y: min(pals(y), key=lambda t: (abs(y - t), t))   # the nearest (the smaller on a tie)
    on_rung = lambda y, r: level(r) if whole(y) == r else -(abs(y - r) - Fraction(1, 2))   # on the rung when y rounds to it
    y = p.get("side", 1) * c / (1 - m)              # the unchanged number c/(1 - m), where the line meets y = x (minus it on the mirror)
    rung = rung_of(y)
    main = on_rung(y, rung)
    # main: the palindrome starting and ending in d (d, dd, d0d, ...) that the number the machine leaves unchanged rounds to, in levels of digits (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    if tie == "shared-factor":   # a bigger number dividing both the palindrome's digit sum and the y-intercept's whole part is better
        total, wc = sum(int(ch) for ch in str(rung)), whole(abs(c) - Fraction(1, 2))   # the palindrome's digits added up; the whole part of |c|
        return [main, common(total, wc)]
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
