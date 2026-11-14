# Ruler · Naive (for learning)
# Main part: distance² from (0, 0) close to a square. Tie-breaker: whichever you were dealt (that whole distance; the gradient close to a prime; the triangle's area close to a square).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 0:                                      # a flat line: the rule wants a sloping one
        return None
    d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared
    sq = near(d2, square) or 1                      # the square number nearest it (1 at the least)
    main = -abs(d2 - sq)
    far = root(sq)                                  # that square's root: a whole distance
    # main: how far the distance from (0, 0), squared, is from a square number (closer is better)
    if tie == "far":   # a bigger whole distance is better
        return [main, far]
    if tie == "prime-gradient":   # a gradient close to a prime is better
        mp = near(m, prime)                        # the prime nearest the gradient
        return [main, -abs(m - mp)]
    if tie == "square-area":   # a triangle whose area is close to a square number is better
        area = c * c / (2 * abs(m))                # the triangle cut off the axes (none when c = 0)
        return [main, None if c == 0 else -abs(area - near(area, square))]
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
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
