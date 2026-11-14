# Exact Change · Thorough
# Main part: ways to pay close to the target. Tie-breaker: whichever you were dealt (the smaller pile in every way; the bill; both coins close to primes).
# What it does: reads the line once as y = mx + c (a small read), tries changes in its own head (thinking costs
# no energy, only time), keeps the plans that make the line best for your rule, and pays for the cheapest of them.
# Try this: change QUOTES = 20 to 6: fewer prices asked, but it may miss a cheaper plan.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    a, N = -m, c                                    # y = mx + c read as a*x + 1*y = N
    if a <= 0:                                      # coins must be worth more than 0
        return None
    if m.denominator != 1 or c.denominator != 1:    # this agent reads whole-number lines only
        return None
    if N >= 0 and N // a > 100000:                  # too many ways to count
        return None
    ways = 0 if N < 0 else N // a + 1               # x = 0, 1, ... while a*x <= N
    main = -abs(ways - p["ways"])
    # main: how far the number of ways to pay N with coins a and 1 is from the target (closer is better)
    if tie == "big-piles":   # with a coin worth 1, paying all in ones always has an empty pile
        return [main, 0 if ways > 0 else None]
    if tie == "big-bill":   # a bigger bill is better
        return [main, N]
    if tie == "prime-coins":   # coins close to primes are better (the 1 is always 1 from 2)
        return [main, -abs(a - near(a, prime)) - 1]
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
