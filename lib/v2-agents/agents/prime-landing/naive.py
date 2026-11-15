# Prime Landing · Naive (for learning)
# Main part: the y-intercept on as big a dealt prime as possible. Tie-breaker: whichever you were dealt (the factor that prime minus 1 shares with the gradient's whole part; how long y(1), y(2), … go on being such primes).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        landing = near(c, prime, p["ends"])             # it lands on the x-axis: the rung nearest there
        main = landing if c == landing else -abs(c - landing)
        return [main, None]
    landing = near(c, prime, p["ends"])             # the prime ending in p["ends"] nearest the y-intercept: the rung
    main = landing if c == landing else -abs(c - landing)   # on a rung: the rung; else below every rung
    # main: the y-intercept itself when it is a prime ending in the rule's digit (bigger is better: a ladder with no top), else minus how far it is from the nearest one
    if tie == "shared-factor":   # that prime minus 1 sharing a bigger factor with the gradient's whole part is better
        wm = whole((2 * m - 1) / 2)                # the gradient's whole part (rounded down)
        return [main, common(landing - 1, wm)]
    if tie == "climb-on":   # y(1), y(2), ... going on longer as primes ending in the rule's digit is better
        on = 0                                          # y(1), y(2), ... new primes ending in p["ends"], in a row
        for n in range(1, 13):
            t = m * n + c
            if m == 0 or t == landing or not prime(t) or t % 10 != p["ends"]:
                break
            on += 1
        return [main, on]
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
