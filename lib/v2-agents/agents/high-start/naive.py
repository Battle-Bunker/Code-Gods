# High Start · Naive (for learning)
# Main part: the steeper line crosses the y-axis at a whole number. Tie-breaker: whichever you were dealt (the steeper line high and steep; that y-intercept shares many prime factors with the number you divide by).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    dist = lambda v: abs(v - whole(v))   # how far a number is from the whole number nearest it
    floor = lambda v: v // 1   # rounded down
    if f.cs is None or f.ms is None:   # the steeper line is upright: no score
        return None
    main = -dist(f.cs)
    # main: how far the steeper line's y-intercept is from a whole number (closer is better)
    if tie == "steep-and-high":   # the smaller of the y-intercept and the gradient's whole part big is better
        return [main, min(whole(f.cs), floor(f.ms))]
    if tie == "start-factors":   # a y-intercept sharing many prime factors with the number you divide by is better
        return [main, omega(common(whole(f.cs), f.D))]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["shift","tilt"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter


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
