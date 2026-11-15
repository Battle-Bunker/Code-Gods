# Exact Change · Naive (for learning)
# Main part: ways to pay close to the target. Secondary preference: whichever you were dealt (the smaller pile in every way; the bill; both coins close to primes).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, secondary]: bigger is better, None is no score.
    if m >= 0:                                      # a coin worth -m*b: the line must go downhill
        return None
    X = -c / m                                      # where the line meets y = 0: x goes no further
    if X >= 100001:                                 # too many ways to count: no score
        return None
    b = m.denominator * Fraction(m.denominator, c.denominator).denominator   # the coin b: b*m and b*c whole
    ways = [x for x in range(X // 1 + 1) if (m * x + c).denominator == 1]   # the line's whole points with x, y >= 0
    main = -abs(len(ways) - p["ways"])
    # main: how far the number of ways to pay is from the target (closer is better)
    def tier(t):   # each secondary, in order (None: ranks last)
        if t == "big-piles":   # a bigger smaller pile, in every way to pay, is better
            if not ways:                               # no way to pay: no piles
                return None
            y = m * ways[-1] + c                       # the fewest coins of b
            return min(ways[0], y)
        if t == "big-bill":   # a bigger bill N = b·c is better
            return c * b
        if t == "prime-coins":   # both coins (a = -b·m and b) close to primes is better
            off = lambda x: abs(x - near(x, prime))    # how far x is from the nearest prime
            return -(off(-m * b) + off(b))
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
