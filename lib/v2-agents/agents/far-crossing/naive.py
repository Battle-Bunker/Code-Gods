# Far Crossing · Naive (for learning)
# Main part: the steeper line crosses the x-axis on your pattern. Secondary preference: whichever you were dealt (the x-intercepts' gap near a multiple of your number; the crossing's height near a multiple of your number; that x-intercept plus the crossing's height has a big smallest prime factor; that x-intercept has many prime factors; that x-intercept shares a factor with the steeper gradient).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, secondary]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    floor = lambda v: v // 1   # rounded down
    if f.rs is None:   # the steeper line is flat: no score
        return None
    main, R = ladder(f.rs, p["q"], p["r"])   # the x-intercept on your ladder
    # main: the level of the steeper line's x-intercept on your ladder (higher is better)
    if tie == "far-gap":   # the gap between the x-intercepts near a multiple of q to the power one above your level is better
        return [main, None if f.xgap is None else -off_multiple(f.xgap, p["q"] ** (level_of(main, p["q"]) + 1))]
    if tie == "far-height":   # a crossing height near a multiple of q to the power one above your level is better
        return [main, None if f.y is None else -off_multiple(f.y, p["q"] ** (level_of(main, p["q"]) + 1))]
    if tie == "far-prime":   # that x-intercept plus the crossing's height with a big smallest prime factor is better
        return [main, None if f.y is None else spf(abs(R) + abs(whole(f.y)))]
    if tie == "far-smooth":   # that x-intercept with many prime factors is better
        return [main, omega(R)]
    if tie == "far-steep":   # that x-intercept sharing a big factor with the steeper gradient is better
        return [main, 0 if f.ms is None else common(R, abs(f.ms) // 1)]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["shift","tilt"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom


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
