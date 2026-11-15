# Divisibility Ladder · Naive (for learning)
# Main part: a run of y-values each divisible by its position: y(1) by 1, y(2) by 2, …. Tie-breaker: whichever you were dealt (the gradient's smallest prime factor; the gradient's largest prime factor; how steep the line is; the gradient close to a prime).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if c == 0:                                      # through (0, 0): the rule wants a line that is not
        return None
    main = 0
    for n in range(1, 13):                          # the run of n dividing y(n)
        y = m * n + c
        if y.denominator != 1 or y.numerator % n != 0:
            break
        main += 1
    fm = factors(m) or []                           # the gradient's prime factors ([] for 0, 1, -1)
    # main: how many of y(1), y(2), y(3), ... in a row are multiples of 1, 2, 3, ... (more is better)
    if tie == "m-spf":   # the gradient's smallest prime factor big is better
        return [main, fm[0] if fm else 1]
    if tie == "m-gpf":   # the gradient's largest prime factor big is better
        return [main, fm[-1] if fm else 1]
    if tie == "steep":   # a steeper gradient is better
        return [main, abs(m)]
    if tie == "m-prime":   # a gradient close to a prime is better
        mp = near(m, prime)
        return [main, -abs(m - mp)]
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
