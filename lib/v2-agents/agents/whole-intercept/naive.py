# Whole Intercept · Naive (for learning)
# Main part: y-intercept close to a whole number. Tie-breaker: whichever you were dealt (smallest prime factor of that whole number; prime factors of that whole number).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    up = whole(c)                                   # the whole number nearest the y-intercept (a half rounds up)
    spf = lambda k: 2 if k == 0 else (factors(k) or [1])[0]   # smallest prime factor: 2 for 0, 1 for 1 and -1
    half = up - c == Fraction(1, 2)                 # exactly halfway between two whole numbers?
    n = up - 1 if half and spf(up - 1) > spf(up) else up   # halfway: the one with the bigger smallest prime factor
    main = -abs(c - n)
    f = factors(n)                                  # its prime factors, smallest first
    # main: how far the y-intercept is from a whole number (closer is better)
    def tier(t):   # each tie-breaker, in order (None: ranks last)
        if t == "spf":   # a bigger smallest prime factor is better (a big prime is best)
            return spf(n)
        if t == "omega":   # more prime factors are better
            return len(f)
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
