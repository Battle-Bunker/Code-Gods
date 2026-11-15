# High Start · Naive (for learning)
# Main part: the gentler line crosses the y-axis on your pattern. Tie-breaker: whichever you were dealt (the y-intercepts' gap near a multiple of your number; the crossing's x near a multiple of your number; that y-intercept plus the crossing's x has a big smallest prime factor; that y-intercept shares a factor with the steeper gradient).
# What it does: reads the two lines once, tries moves in its own head, and pays for the best one for your rule on every
# pair it is offered, whatever it costs and whatever the other players think. It keeps fighting over a pair another
# player keeps pulling back, which burns energy on both sides and scores nothing. It is here to learn from.
# Try this: summon it beside a friend's agent on the same pairs and watch your points: then switch to Simple.


def score(L, p, tie):
    # How good are the two lines L for your rule? [main part, tie-breaker]: bigger is better, None is no score.
    f = solved(L)   # what the two lines give together (the answer, the number you divide by, ...)
    floor = lambda v: v // 1   # rounded down
    if f.cg is None or f.mg is None:   # the gentler line is upright: no score
        return None
    main, H = valuation_ladder(f.cg, p["q"], p["r"])   # the y-intercept on your ladder
    # main: the level of the gentler line's y-intercept on your ladder (higher is better)
    if tie == "start-echo":   # the gap between the y-intercepts near a multiple of q to the power one above your level is better
        return [main, None if f.ygap is None else -off_multiple(f.ygap, p["q"] ** (level_of(main, p["q"]) + 1))]
    if tie == "start-crossing":   # a crossing whose x is near a multiple of q to the power one above your level is better
        return [main, None if f.x is None else -off_multiple(f.x, p["q"] ** (level_of(main, p["q"]) + 1))]
    if tie == "start-prime":   # that y-intercept plus the crossing's x with a big smallest prime factor is better
        return [main, None if f.x is None else spf(abs(H) + abs(whole(f.x)))]
    if tie == "start-steep":   # that y-intercept sharing a big factor with the steeper gradient is better
        return [main, 0 if f.ms is None else common(H, abs(f.ms) // 1)]
    return [main]


FAR = 2      # how far one move may go
QUOTES = 8  # at most this many plans are priced (each price is a host call)
KINDS = ["shift","tilt","stretch"]   # the moves it tries: shift, tilt, stretch, turn, slide, combine, reflect, quarter, translate, zoom


def agent(offer):
    L = pair_of(offer)          # the two lines, a*x + b*y + c = 0 each
    rule = goal(offer)          # your rule (free)
    p, tie = rule.params, rule.tie_breaker
    # Your rule's shortcut: a stretch by its dealt number (q or k) climbs its ladder in one move.
    tries = pair_steps(L, FAR, KINDS, [f for f in (p.get("q"), p.get("k")) if f])   # (plan, lines after): moves tried in the agent's own head
    top, plans = score(L, p, tie), []
    for plan, L2 in tries:
        s = score(L2, p, tie)
        if better(s, top):
            top, plans = s, [plan]         # a new best
        elif plans and not better(top, s):
            plans.append(plan)             # as good as the best: the price decides
    return cheapest(offer, plans[:QUOTES]) if plans else None   # the cheapest of the best, or skip
