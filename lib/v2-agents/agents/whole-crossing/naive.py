# Whole Crossing · Naive (for learning)
# Main part: the x-axis crossing close to the dealt whole numbers. Tie-breaker: whichever you were dealt (that whole number's smallest prime factor; that whole number's largest prime factor; the gradient's smallest prime factor).
# What it does: reads the line once as y = mx + c, tries changes in its own head, and pays for the best one for your
# rule on every line it is offered, whatever it costs. It never asks what the line is worth to you and keeps
# fighting over a line another player keeps pulling back, which burns energy on both sides and scores nothing.
# It is here to learn from; the other starters fix this.
# Try this: summon it beside a friend's agent on the same lines and watch your points: then switch to Simple.


def score(m, c, p, tie):
    # How good is the line y = mx + c for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    if m is None:              # the vertical line x = c
        t = (c - p["r"]) / p["q"]
        j = whole(t)
        k = p["r"] + p["q"] * j   # the dealt number nearest
        if 2 * (j - t) == 1 and abs(k - p["q"]) <= abs(k):
            k = k - p["q"]
        main = -abs(c - k)
        fk = factors(k)                                 # its prime factors, smallest first
        return [main, (fk[0] if fk else 1) if tie == "k-spf" else (fk[-1] if fk else 1) if tie == "k-gpf" else None]
    if m == 0:                                      # a flat line never crosses: the worst score
        return None
    x = -c / m                                      # where y = mx + c crosses the x-axis
    t = (x - p["r"]) / p["q"]
    j = whole(t)
    k = p["r"] + p["q"] * j   # the dealt number nearest
    if 2 * (j - t) == 1 and abs(k - p["q"]) <= abs(k):
        k = k - p["q"]
    main = -abs(x - k)
    fk, fm = factors(k), factors(m) or []           # prime factors, smallest first ([] for 0, 1, -1)
    # main: how far the line's x-axis crossing is from a whole number leaving r when divided by q (closer is better)
    if tie == "k-spf":   # that whole number's smallest prime factor big is better
        return [main, fk[0] if fk else 1]
    if tie == "k-gpf":   # that whole number's largest prime factor big is better
        return [main, fk[-1] if fk else 1]
    if tie == "m-spf":   # the gradient's smallest prime factor big is better
        return [main, fm[0] if fm else 1]
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
