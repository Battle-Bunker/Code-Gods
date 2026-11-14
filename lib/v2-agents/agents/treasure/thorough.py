# Treasure · Thorough
# Main part: y(k) close to T. Tie-breaker: whichever you were dealt (different primes among y(1) … y(8); the gradient close to a prime; the y-intercept close to a square).
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    main = -abs(m * p["k"] + c - p["T"])           # y(k) = m*k + c
    # main: how far y(k) is from T (closer is better)
    if tie == "prime-terms":   # more different primes among y(1) ... y(8) is better
        primes = {m * x + c for x in range(1, 9) if prime(m * x + c)}   # y(1) ... y(8)
        return [main, len(primes)]
    if tie == "prime-gradient":   # a gradient close to a prime is better
        return [main, -abs(m - near(m, prime))]
    if tie == "square-start":   # a y-intercept close to a square number is better
        return [main, -abs(c - near(c, square))]
    return [main]


FAR = 5      # how far one change may go
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
        tries.append((move("si.shift", k=k), m, c + k))   # move the line up or down
        tries.append((move("si.tilt", k=k), m + k, c))   # make it steeper or flatter
        tries.append((move("seq.step", k=k), m + k, c - k))   # change the pattern's step, keeping y(1)
        tries.append((move("cart.pivot", x0=-1, k=k), m + k, c + k))   # turn the line about its point at x = -1 (m and c both change by k)
        tries.append((move("cart.pivot", x0=p["k"], k=k), m + k, c - k * p["k"]))   # turn the line about its point at x = k of the rule (y(k) stays put)
        f = k + 1 if k > 0 else k - 1
        tries.append((move("mach.stretch", f=f), m * f, c * f))   # multiply every output by f (m and c both)
    top, plans = score(m, c, p, tie), []
    for plan, m2, c2 in tries:
        s = score(m2, c2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
