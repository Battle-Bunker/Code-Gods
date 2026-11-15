# Square Area · Naive (for learning)
# Main part: the triangle's area on as big a square ending in d as possible. Tie-breaker: whichever you were dealt (the factor that square's root plus 1 shares with the x-crossing's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 0 or c == 0:                            # no triangle: the worst score
        return None
    legX, legY = abs(c / m), abs(c)                 # the triangle's base and height
    area = legX * legY / 2
    fl = whole(area) if p.get("round") else whole((2 * area - 1) / 2)   # the area rounded down (to the nearest, for near)
    s, K = root(fl), p["ends"]                      # its whole square root, rounded down
    lo, hi = s, s + 1                               # the nearest roots at or below s, and above, whose squares end in p["ends"]
    while lo >= 1 and lo * lo % 10 != K:
        lo -= 1
    while hi * hi % 10 != K:
        hi += 1
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    a = Fraction(-1, 2) if p.get("round") else 0   # the window of r² is [r² + a, r² + a + 1)
    below, above = area - (lo * lo + 1 + a), hi * hi + a - area   # past the window below, up to the one above
    on = lo == s and s >= 1 and s * s == fl          # the area rounds to s², a square ending in p["ends"]: a rung
    r = lo if on or (lo >= 1 and below <= above) else hi   # that number (on a rung), else the nearest window's
    main = level(fl) if on else -(below if r == lo else above)
    # main: the square ending in the rule's digit that the triangle's area rounds down (or to the nearest) to, each extra digit counting for less (bigger is better: a ladder with no top), else minus how far the area is from rounding to one
    if tie == "shared-factor":   # that square's root plus 1 and the x-crossing's whole part: a bigger factor shared is better
        wx = whole((2 * legX - 1) / 2)               # the x-crossing's whole part, ignoring its sign
        return [main, common(r + 1, wx)]
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
        tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
