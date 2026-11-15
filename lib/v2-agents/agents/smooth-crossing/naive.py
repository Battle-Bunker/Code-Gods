# Smooth Crossing · Naive (for learning)
# Main part: the x-axis crossing close to a 7-smooth number. Tie-breaker: whichever you were dealt (prime factors shared with the y-intercept's nearest whole number).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m == 0:                                      # a flat line never crosses: the worst score
        return None
    x = -c / m                                      # where y = mx + c crosses the x-axis
    s0 = 1 if x == 0 else near(abs(x), smooth)   # the 7-smooth number nearest its size (1 for 0)
    if s0 is None:                              # none within 10,000: hopeless
        return None
    s = -s0 if x < 0 else s0                # the sign kept
    main = -abs(x - s)
    # main: how far the x-axis crossing is from a 7-smooth number (closer is better)
    if tie == "shared":   # that smooth number sharing many prime factors with the whole number nearest the y-intercept is better
        return [main, shared(s, whole(c))]
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
