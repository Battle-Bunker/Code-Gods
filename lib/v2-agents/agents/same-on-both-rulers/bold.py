# Same on Both Rulers · Bold
# Main part: the unchanged number close to T. Tie-breaker: whichever you were dealt (the gradient far from 1; |c| close to a prime; different whole numbers among y(−5) … y(5); the lamp's height close to whole).
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Try this: change FAR = 6 to 3: smaller jumps, cheaper moves.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 1:                                      # x 1: no number stays unchanged
        return None
    fixed = c / (1 - m)                             # where y = mx + c meets y = x
    main = -abs(fixed - p["T"])
    # main: how far the number the machine leaves unchanged is from T (closer is better)
    if tie == "steep":   # a gradient far from 1 is better
        return [main, abs(m - 1)]
    if tie == "prime-start":   # |c| close to a prime is better
        start = abs(c)
        return [main, -abs(start - near(start, prime))]
    if tie == "whole-values":   # more different whole numbers among y(-5) ... y(5) is better
        values = {m * x + c for x in range(-5, 6) if (m * x + c).denominator == 1}   # y(-5) ... y(5)
        return [main, len(values)]
    if tie == "whole-lamp":   # a lamp at a whole height is better
        lamp = m / (m - 1)                              # the lamp's height m/(m - 1)
        return [main, -abs(lamp - whole(lamp))]
    return [main]


FAR = 6      # how far one change may go
QUOTES = 20  # at most this many plans are priced (each price is a host call)


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
        tries.append((move("si.shift", k=k), m, c + k))     # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))      # make it steeper or flatter
        for j in range(-FAR, FAR + 1):                         # both at once
            if j != 0:
                tries.append(([move("si.shift", k=k), move("si.tilt", k=j)], m + j, c + k))
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
