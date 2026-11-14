# Ruler · Example: the triangle's area close to a square
# Main part: distance² from (0, 0) close to a square. Tie-breaker: the triangle's area close to a square.
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Try this: change FAR = 4 to 2 and compare the energy it spends.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 0:                                      # a flat line: the rule wants a sloping one
        return None
    d2 = c * c / (m * m + 1)                        # the distance from (0, 0), squared
    k = max(root(near(d2, square)), 1)              # the nearest whole distance, at least 1
    main = -abs(d2 - k * k)
    if c == 0:                                      # no triangle: the worst tie-breaker
        return [main, None]
    area = c * c / (2 * abs(m))
    return [main, -abs(area - near(area, square))]   # main: how far the distance from (0, 0), squared, is from a square number (closer is better); tie-breaker: a triangle area close to a square number is better


FAR = 4      # how far one change may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)


def agent(offer):
    v = look(offer, "si")      # the line as y = mx + c
    rule = goal(offer)         # your rule (free)
    m, c, p = v.m, v.c, rule.params
    if m == None:              # a vertical line has no y = mx + c: skip
        return None
    tries = []                 # (plan, m after, c after): changes tried in the agent's own head
    for k in range(-FAR, FAR + 1):
        if k == 0:
            continue
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
        tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
    top, plans = score(m, c, p), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
