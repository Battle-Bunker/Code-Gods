# Prime Landing · Naive (for learning)
# Main part: where the line lands on the x-axis, on as big a dealt prime as possible. Secondary preference: whichever you were dealt (the factor that prime minus 1 shares with the y-intercept's whole part).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
        x = p.get("side", 1) * c                      # it stands on the x-axis at x = c (minus that, on the mirror)
        landing = near(x, prime, p["ends"])             # the rung nearest there
        gap = abs(x - landing)
        main = level(landing) if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
        return [main] + [None for t in (tie.split(">") if tie else [])]
    level = lambda p: (lambda D, L: L + (D - L * (L + 1) // 2 + Fraction(p, 10 ** D)) / (L + 1))(len(str(p)), next(L for L in range(99) if (L + 1) * (L + 2) // 2 > len(str(p))))   # levels of digits: level L needs L(L + 1)/2
    if m == 0:                                      # a flat line never lands: the worst score
        return None
    x = p.get("side", 1) * (-c / m)                # where y = mx + c lands on the x-axis (minus that, on the mirror)
    landing = near(x, prime, p["ends"])             # the prime ending in p["ends"] nearest there: the rung
    gap = abs(x - landing)                          # on the rung when it rounds there (within 1/2, ties up)
    main = level(landing) if 2 * gap < 1 or landing - x == Fraction(1, 2) else -(gap - Fraction(1, 2))
    # main: the prime ending in the rule's digit that where the line lands on the x-axis rounds to (bigger is better: a ladder with no top), else minus how far it is from rounding to one
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "shared-factor":   # take the number just before that prime: a bigger number dividing both it and the y-intercept's whole part is better
            wc = whole((2 * c - 1) / 2)                # the y-intercept's whole part (rounded down)
            return common(landing - 1, wc)
    return [main] + [tier(t) for t in (tie.split(">") if tie else [])]


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
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
