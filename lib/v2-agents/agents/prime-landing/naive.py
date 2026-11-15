# Prime Landing · Naive (for learning)
# Main part: the y-intercept close to the dealt prime. Tie-breaker: whichever you were dealt (that prime; the gradient close to such a prime too; y(1) close to such a prime too; the gradient's smallest prime factor; the gradient's largest prime factor).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        landing = near(c, prime, p["ends"])             # it lands on the x-axis: the prime ending in p["ends"] nearest
        main = -abs(c - landing)
        return [main, None]
    landing = near(c, prime, p["ends"])             # the prime ending in p["ends"] nearest the y-intercept
    main = -abs(c - landing)
    # main: how far the y-intercept is from the nearest prime ending in the rule's digit (closer is better)
    if tie == "big-prime":   # a bigger prime is better
        return [main, landing]
    if tie == "prime-gradient":   # a gradient close to such a prime too is better
        mp = near(m, prime, p["ends"])             # the prime ending in p["ends"] nearest the gradient
        return [main, -abs(m - mp)]
    if tie == "next-prime":   # y(1) (ignoring sign) close to such a prime too is better
        y1 = abs(m + c)                            # y(1) = m + c, ignoring its sign
        return [main, -abs(y1 - near(y1, prime, p["ends"]))]
    if tie == "m-spf":   # the gradient's smallest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[0] if fm else 1]
    if tie == "m-gpf":   # the gradient's largest prime factor big is better
        fm = factors(m) or []               # prime factors, smallest first ([] for 0, 1, -1 and fractions)
        return [main, fm[-1] if fm else 1]
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
