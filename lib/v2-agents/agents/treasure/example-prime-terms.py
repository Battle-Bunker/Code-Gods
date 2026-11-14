# Treasure · Example: different primes among y(1) … y(8)
# Main part: y(k) close to T. Tie-breaker: different primes among y(1) … y(8).
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Try this: change FAR = 6 to 30: a step of 30 through (2, 37) gives many primes.


def score(m, c, p):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    main = -abs(m * p["k"] + c - p["T"])           # y(k) = m*k + c
    primes = {m * x + c for x in range(1, 9) if prime(m * x + c)}   # y(1) ... y(8)
    return [main, len(primes)]   # main: how far y(k) is from T (closer is better); tie-breaker: more different primes among y(1) ... y(8) is better


FAR = 6      # how far one change may go
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
        tries.append((move("cart.pivot", x0=p["k"], k=k), m + k, c - k * p["k"]))   # turn the line about its point at x = k of the rule (y(k) stays put)
    top, plans = score(m, c, p), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
