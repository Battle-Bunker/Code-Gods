# Right Angle · Naive (for learning)
# Main part: a right angle at whole x and y, y on your pattern. Tie-breaker: whichever you were dealt (the corner's x near a multiple of its y; the corner's y shares a factor with the steeper gradient; the corner's |x| + |y| has a big smallest prime factor).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it
    floor = lambda v: v // 1   # rounded down
    if f.off_right is None or f.x is None:   # parallel lines never cross: no score
        return None
    main, Yc = ladder(f.y, p["q"], p["r"], f.off_right + dist(f.x))   # a right angle at a grid point, y on your ladder
    mod1 = lambda n: abs(int(n)) or 1   # |n|, at least 1
    # main: the corner's level: a right angle at a grid point, y on your ladder (higher is better)
    if tie == "corner-multiple":   # a corner whose x is near a multiple of its y (not 0) is better
        return [main, -off_multiple(f.x, mod1(Yc))]
    if tie == "corner-steep":   # a corner whose y shares a big factor with the steeper gradient is better
        return [main, 0 if f.ms is None else common(Yc, abs(f.ms) // 1)]
    if tie == "corner-prime":   # a corner whose |x| + |y| has a big smallest prime factor is better
        return [main, spf(abs(f.X) + abs(Yc))]
    return [main]


FAR = 4      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["turn","slide","translate"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom


def agent(offer):
    L = pair_of(offer)          # the two lines, a*x + b*y + c = 0 each
    rule = goal(offer)          # your rule (free)
    p, tie = rule.params, rule.tie_breaker
    tries = pair_steps(L, FAR, KINDS)   # (plan, lines after): moves tried in the agent's own head
    top, plans = score(L, p, tie), []
    for plan, L2 in tries:
        s = score(L2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
